'use server';

import { db } from '@/lib/db';
import { requirePermission } from '@/lib/context';
import {
  submitPaymentProof,
  listPaymentProofs,
  deletePaymentProof,
  changeTier,
  createSubscription,
  cancelSubscription,
  type ApiPaymentInfo,
  type ApiPaymentProof,
  type ChangeTierResult,
  type CreateSubscriptionResult,
  type CancelSubscriptionResult,
} from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { syncTenantStatusFromError } from '@/lib/tenant-status-sync';
import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import type { PaidTier, BillingInterval } from '@/lib/subscription-tiers';

export type BillingResult = { error: string } | { payment: ApiPaymentInfo; proofs: ApiPaymentProof[] };
export type ProofListResult = { error: string } | { proofs: ApiPaymentProof[] };
export type ChangeTierActionResult = { error: string } | ChangeTierResult;
export type CreateSubscriptionActionResult = { error: string } | CreateSubscriptionResult;
export type CancelSubscriptionActionResult = { error: string } | CancelSubscriptionResult;

const PROOF_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'application/pdf']);
const MAX_PROOF_BYTES = 2 * 1024 * 1024;

export async function submitPaymentProofAction(
  paymentId: string,
  formData: FormData,
): Promise<BillingResult> {
  const ctx = await requirePermission('billing.manage', { skipIssuer: true });

  const referenceNumber = (formData.get('referenceNumber') as string | null)?.trim() ?? '';
  if (!referenceNumber || referenceNumber.length > 50) {
    return { error: 'VALIDATION_FAILED' };
  }

  const proofEntries = formData.getAll('proof') as File[];
  if (proofEntries.length === 0 || proofEntries.every((f) => f.size === 0)) {
    return { error: 'INVALID_FILE_UPLOAD' };
  }
  const files = proofEntries.filter((f) => f.size > 0);
  for (const file of files) {
    if (file.size > MAX_PROOF_BYTES || !PROOF_MIME_TYPES.has(file.type)) {
      return { error: 'INVALID_FILE_UPLOAD' };
    }
  }

  const mapped = await Promise.all(
    files.map(async (f) => ({
      buffer: Buffer.from(await f.arrayBuffer()),
      mimeType: f.type,
      filename: f.name,
    })),
  );

  try {
    const result = await submitPaymentProof({ apiKey: ctx.apiKey }, paymentId, mapped, referenceNumber);
    revalidatePath('/settings/billing');
    return result;
  } catch (err) {
    if (err instanceof ApiError) {
      await syncTenantStatusFromError(ctx.tenant.id, err);
      return { error: err.code };
    }
    throw err;
  }
}

export async function listPaymentProofsAction(paymentId: string): Promise<ProofListResult> {
  const ctx = await requirePermission('billing.read', { skipIssuer: true });
  try {
    const proofs = await listPaymentProofs({ apiKey: ctx.apiKey }, paymentId);
    return { proofs };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function deletePaymentProofAction(
  paymentId: string,
  proofId: string,
): Promise<{ error: string } | { ok: true }> {
  const ctx = await requirePermission('billing.manage', { skipIssuer: true });
  try {
    await deletePaymentProof({ apiKey: ctx.apiKey }, paymentId, proofId);
    revalidatePath('/settings/billing');
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function changeTierAction(tier: PaidTier, billingInterval?: BillingInterval): Promise<ChangeTierActionResult> {
  const ctx = await requirePermission('billing.manage', { skipIssuer: true });

  let result: ChangeTierResult;
  try {
    result = await changeTier({ apiKey: ctx.apiKey }, tier, billingInterval);
  } catch (err) {
    if (err instanceof ApiError) {
      await syncTenantStatusFromError(ctx.tenant.id, err);
      return { error: err.code };
    }
    throw err;
  }

  // Same one-time-response caching as promoteTenantAction — bankTransfer is only
  // ever returned from this call, never retrievable again afterward.
  if (result.bankTransfer) {
    await db.tenant.update({
      where: { id: ctx.tenant.id },
      data: { pendingBankTransfer: result.bankTransfer as unknown as Prisma.InputJsonValue },
    });
  }

  revalidatePath('/settings/billing');
  return result;
}

export async function cancelSubscriptionAction(): Promise<CancelSubscriptionActionResult> {
  const ctx = await requirePermission('billing.manage', { skipIssuer: true });
  try {
    const result = await cancelSubscription({ apiKey: ctx.apiKey });
    revalidatePath('/settings/billing');
    return result;
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function createSubscriptionAction(
  tier: PaidTier,
  billingInterval: BillingInterval = 'MONTHLY',
): Promise<CreateSubscriptionActionResult> {
  const ctx = await requirePermission('billing.manage', { skipIssuer: true });

  let result: CreateSubscriptionResult;
  try {
    result = await createSubscription({ apiKey: ctx.apiKey }, tier, billingInterval);
  } catch (err) {
    if (err instanceof ApiError) {
      await syncTenantStatusFromError(ctx.tenant.id, err);
      return { error: err.code };
    }
    throw err;
  }

  await db.tenant.update({
    where: { id: ctx.tenant.id },
    data: { pendingBankTransfer: result.bankTransfer as unknown as Prisma.InputJsonValue },
  });

  revalidatePath('/settings/billing');
  return result;
}
