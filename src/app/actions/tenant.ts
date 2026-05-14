'use server';

import { db } from '@/lib/db';
import { requirePermission, requireContext } from '@/lib/context';
import { promoteTenant } from '@/lib/api';
import { resendVerificationEmail as publicResendVerificationEmail } from '@/lib/public-api';
import { encrypt, lastFour } from '@/lib/crypto';
import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/errors';

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
): Promise<TenantResult> {
  await requirePermission('tenant.promote', { skipIssuer: true });
  const ctx = await requireContext({ skipIssuer: true });

  if (!ctx.user.emailVerified) return { error: 'EMAIL_NOT_VERIFIED' };
  if (ctx.tenant.environment === 'production') return { error: 'ALREADY_PRODUCTION' };

  // Map sequentials to include apiIssuerId — use first/default issuer
  const issuers = await db.issuer.findMany({ where: { tenantId: ctx.tenant.id } });
  const apiSequentials = issuers.flatMap((issuer) =>
    initialSequentials.map((s) => ({
      issuerId: issuer.apiIssuerId,
      documentType: s.documentType,
      sequential: s.sequential,
    }))
  );

  let result: Awaited<ReturnType<typeof promoteTenant>>;
  try {
    result = await promoteTenant({ apiKey: ctx.apiKey }, apiSequentials);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  await db.$transaction(async (tx) => {
    // Revoke all existing sandbox keys
    await tx.tenantApiKey.updateMany({
      where: { tenantId: ctx.tenant.id, isActive: true },
      data: { isActive: false, revokedAt: new Date() },
    });

    // Insert new production keys
    for (const key of result.apiKeys) {
      await tx.tenantApiKey.create({
        data: {
          tenantId: ctx.tenant.id,
          apiKeyId: key.id,
          label: key.label,
          environment: 'production',
          encryptedKey: encrypt(key.key),
          lastFour: lastFour(key.key),
          isActive: true,
        },
      });
    }

    await tx.tenant.update({
      where: { id: ctx.tenant.id },
      data: { environment: 'production' },
    });
  });

  revalidatePath('/', 'layout');
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
