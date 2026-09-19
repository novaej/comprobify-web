'use server';

import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { requirePermission, requireContext, type MinimalContext } from '@/lib/context';
import { promoteTenant, updateTenantLanguage } from '@/lib/api';
import { listAdminApiKeys } from '@/lib/admin-api';
import { resendVerificationEmail as publicResendVerificationEmail } from '@/lib/public-api';
import { extractForwardedIp } from '@/lib/client-forwarding';
import { encrypt, lastFour } from '@/lib/crypto';
import { isValidIdleTimeoutMinutes } from '@/lib/session-timeout';
import { revalidatePath } from 'next/cache';
import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { ApiError } from '@/lib/errors';
import type { PaidTier, BillingInterval } from '@/lib/subscription-tiers';
import type { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nextjs';

export type TenantResult = { error: string } | null;
export type VerificationResult = { error: string } | null;

// Each field is only written when the caller actually passed it — omitting a
// key must leave that column untouched, not null it out. `sessionIdleTimeoutMinutes:
// null` is a deliberate, meaningful value ("reset to the system default"),
// distinct from omitting the key entirely.
export async function updateTenantAction(data: {
  tradeName?: string;
  contactEmail?: string;
  sessionIdleTimeoutMinutes?: number | null;
}): Promise<TenantResult> {
  await requirePermission('tenant.manage', { skipIssuer: true });
  const ctx = await requireContext({ skipIssuer: true });

  if (
    data.sessionIdleTimeoutMinutes !== undefined &&
    data.sessionIdleTimeoutMinutes !== null &&
    !isValidIdleTimeoutMinutes(data.sessionIdleTimeoutMinutes)
  ) {
    return { error: 'INVALID_SESSION_TIMEOUT' };
  }

  const updateData: Prisma.TenantUpdateInput = {};
  if (data.tradeName !== undefined) updateData.tradeName = data.tradeName.trim() || null;
  if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail.trim() || null;
  if (data.sessionIdleTimeoutMinutes !== undefined) {
    updateData.sessionIdleTimeoutMinutes = data.sessionIdleTimeoutMinutes;
  }

  await db.tenant.update({ where: { id: ctx.tenant.id }, data: updateData });
  revalidatePath('/', 'layout');
  return null;
}

export async function promoteTenantAction(
  initialSequentials: { issuerId: string; documentType: string; sequential: number }[] = [],
  tier?: PaidTier,
  billingInterval?: BillingInterval,
): Promise<TenantResult> {
  await requirePermission('tenant.promote', { skipIssuer: true });
  const ctx = await requireContext({ skipIssuer: true });

  if (ctx.tenant.environment === 'production') return { error: 'ALREADY_PRODUCTION' };

  let result: Awaited<ReturnType<typeof promoteTenant>>;
  try {
    // No local email-verified pre-check — comprobify's own promote() already
    // enforces tenant.status === ACTIVE and throws EMAIL_VERIFICATION_REQUIRED,
    // the actual source of truth (see confirmEmailVerificationAction).
    result = await promoteTenant({ apiKey: ctx.apiKey }, initialSequentials, tier, billingInterval);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  // comprobify mirrors each sandbox key's scopes into its production equivalent
  // by label; carry isManaged/managedRole over the same way so per-role keys
  // keep their self-revocation protection after promotion.
  const existingSandboxKeys = await db.tenantApiKey.findMany({
    where: { tenantId: ctx.tenant.id, isActive: true },
  });
  const managedByLabel: Record<string, { isManaged: boolean; managedRole: string | null }> = {};
  for (const row of existingSandboxKeys) {
    managedByLabel[row.label] = { isManaged: row.isManaged, managedRole: row.managedRole };
  }

  // The promote endpoint returns { label, apiKey } but no key ID or scopes.
  // Every one of comprobify-web's own keys (master + per-role) is minted
  // `is_reserved` (comprobify migration 102) and is therefore invisible to
  // the tenant-facing GET /v1/keys regardless of which token authenticates
  // it — including a brand-new production one — so resolve metadata via the
  // admin-gated listing instead. This also sidesteps Common Mistake #48's
  // "which returned key has keys:manage" concern entirely, since admin auth
  // doesn't depend on any particular key's scopes.
  const masterLabel = existingSandboxKeys.find((row) => row.isManaged && !row.managedRole)?.label;
  const adminKeys = await listAdminApiKeys(ctx.tenant.apiTenantId).catch(() => []);
  const keyInfoByLabel: Record<string, { id: string; scopes: string[] }> = {};
  for (const k of adminKeys) {
    if (k.environment === 'production' && k.label) keyInfoByLabel[k.label] = { id: k.id, scopes: k.scopes };
  }

  // The API has already promoted the tenant and revoked its sandbox keys by
  // this point — that can't be undone from here. But if we couldn't resolve
  // even the master key's id (e.g. a transient failure on the listAdminApiKeys
  // follow-up call), inserting zero usable production rows while still
  // locally revoking the sandbox rows and flipping environment would leave
  // the tenant with no working key at all, and every subsequent requireContext()
  // call would loop trying to redirect to /settings/api-keys to fix it — see
  // the incident this guard was added for. Bail out instead: leave the local
  // sandbox rows and environment untouched, so a retry (or /recover-account)
  // has something to work from, and surface a real error instead of a loop.
  const masterKeyInfo = masterLabel ? keyInfoByLabel[masterLabel] : undefined;
  if (!masterKeyInfo) {
    const err = new Error('Promotion could not resolve the new production master key');
    console.error('[promotion] key resolution failed after promote()', {
      tenantId: ctx.tenant.id,
      apiTenantId: ctx.tenant.apiTenantId,
      labels: result.apiKeys.map((k) => k.label),
    });
    Sentry.captureException(err, {
      extra: { tenantId: ctx.tenant.id, apiTenantId: ctx.tenant.apiTenantId },
    });
    return { error: 'PROMOTION_KEY_SYNC_FAILED' };
  }

  await db.$transaction(async (tx) => {
    // Revoke all existing sandbox keys
    await tx.tenantApiKey.updateMany({
      where: { tenantId: ctx.tenant.id, isActive: true },
      data: { isActive: false, revokedAt: new Date() },
    });

    // Insert new production keys
    for (const key of result.apiKeys) {
      const keyInfo = keyInfoByLabel[key.label];
      if (!keyInfo) continue; // skip if we couldn't resolve the ID
      const managed = managedByLabel[key.label] ?? { isManaged: false, managedRole: null };
      await tx.tenantApiKey.create({
        data: {
          tenantId: ctx.tenant.id,
          apiKeyId: keyInfo.id,
          label: key.label ?? 'production',
          environment: 'production',
          encryptedKey: encrypt(key.apiKey),
          lastFour: lastFour(key.apiKey),
          isActive: true,
          isManaged: managed.isManaged,
          managedRole: managed.managedRole,
          scopes: keyInfo.scopes,
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
  // No local pre-check — the API's own resend endpoint already returns
  // ALREADY_VERIFIED for a tenant that's already ACTIVE (see
  // email-verification-notice.tsx, which treats that code as success).
  try {
    const reqHeaders = await headers();
    await publicResendVerificationEmail(ctx.user.email, undefined, {
      forwardedIp: extractForwardedIp(reqHeaders),
    });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
  return null;
}
