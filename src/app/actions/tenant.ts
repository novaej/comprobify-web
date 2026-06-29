'use server';

import { db } from '@/lib/db';
import { requirePermission, requireContext, type MinimalContext } from '@/lib/context';
import { promoteTenant, listTenantApiKeys, updateTenantLanguage } from '@/lib/api';
import { resendVerificationEmail as publicResendVerificationEmail } from '@/lib/public-api';
import { encrypt, lastFour } from '@/lib/crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { ApiError } from '@/lib/errors';
import type { PaidTier, BillingInterval } from '@/lib/subscription-tiers';
import type { Prisma } from '@prisma/client';

export type TenantResult = { error: string } | null;
export type VerificationResult = { error: string } | { verified: true } | null;

export async function updateTenantAction(data: {
  tradeName?: string;
  contactEmail?: string;
}): Promise<TenantResult> {
  await requirePermission('tenant.manage', { skipIssuer: true });
  const ctx = await requireContext({ skipIssuer: true });
  await db.tenant.update({
    where: { id: ctx.tenant.id },
    data: {
      tradeName: data.tradeName?.trim() || null,
      contactEmail: data.contactEmail?.trim() || null,
    },
  });
  revalidatePath('/', 'layout');
  return null;
}

export async function promoteTenantAction(
  initialSequentials: { documentType: string; sequential: number }[] = [],
  tier?: PaidTier,
  billingInterval?: BillingInterval,
): Promise<TenantResult> {
  await requirePermission('tenant.promote', { skipIssuer: true });
  const ctx = await requireContext({ skipIssuer: true });

  if (!ctx.user.emailVerified) return { error: 'EMAIL_NOT_VERIFIED' };
  if (ctx.tenant.environment === 'production') return { error: 'ALREADY_PRODUCTION' };

  // Map sequentials to include apiIssuerId — use first/default issuer
  const issuers = await db.issuer.findMany({ where: { tenantId: ctx.tenant.id, active: true } });
  const apiSequentials = issuers.flatMap((issuer) =>
    initialSequentials.map((s) => ({
      issuerId: issuer.apiIssuerId,
      documentType: s.documentType,
      sequential: s.sequential,
    }))
  );

  let result: Awaited<ReturnType<typeof promoteTenant>>;
  try {
    result = await promoteTenant({ apiKey: ctx.apiKey }, apiSequentials, tier, billingInterval);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  // The promote endpoint returns { label, apiKey } but no key ID.
  // Fetch all active keys using one of the new production tokens to get the IDs.
  let keyIdByLabel: Record<string, number> = {};
  if (result.apiKeys.length > 0) {
    const listedKeys = await listTenantApiKeys({ apiKey: result.apiKeys[0].apiKey }).catch(() => []);
    for (const k of listedKeys) {
      if (k.label) keyIdByLabel[k.label] = Number(k.id);
    }
  }

  await db.$transaction(async (tx) => {
    // Revoke all existing sandbox keys
    await tx.tenantApiKey.updateMany({
      where: { tenantId: ctx.tenant.id, isActive: true },
      data: { isActive: false, revokedAt: new Date() },
    });

    // Insert new production keys
    for (const key of result.apiKeys) {
      const apiKeyId = keyIdByLabel[key.label];
      if (!apiKeyId) continue; // skip if we couldn't resolve the ID
      await tx.tenantApiKey.create({
        data: {
          tenantId: ctx.tenant.id,
          apiKeyId,
          label: key.label ?? 'production',
          environment: 'production',
          encryptedKey: encrypt(key.apiKey),
          lastFour: lastFour(key.apiKey),
          isActive: true,
        },
      });
    }

    await tx.tenant.update({
      where: { id: ctx.tenant.id },
      data: {
        environment: 'production',
        // The requested tier is now a real subscription via the API — the
        // "intended" fields have served their purpose. bankTransfer is cached
        // here because the promote response is the only place the API ever
        // returns it (see api.ts's PromoteTenantResult).
        intendedTier: null,
        intendedBillingInterval: null,
        pendingBankTransfer: result.bankTransfer
          ? (result.bankTransfer as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });
  });

  revalidatePath('/', 'layout');
  if (result.subscription) {
    const locale = await getLocale();
    redirect({ href: '/settings/billing', locale });
  }
  return null;
}

export async function updateLanguageAction(language: string): Promise<TenantResult> {
  // Intentionally catch all context errors including NEXT_REDIRECT — this action is
  // called fire-and-forget from the nav and must never cause unexpected redirects.
  let ctx: MinimalContext;
  try {
    ctx = await requireContext({ skipIssuer: true });
  } catch {
    return null;
  }
  // Only Owners can set the org-wide language preference; others switch UI locale only.
  if (!ctx.permissions.has('tenant.manage')) return null;
  try {
    await updateTenantLanguage({ apiKey: ctx.apiKey }, language);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
  return null;
}

export async function resendVerificationAction(): Promise<VerificationResult> {
  const ctx = await requireContext({ skipIssuer: true });
  if (ctx.user.emailVerified) return { verified: true };
  try {
    await publicResendVerificationEmail(ctx.user.email);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
  return null;
}
