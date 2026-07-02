'use server';

import { db } from '@/lib/db';
import { requirePermission } from '@/lib/context';
import {
  submitPaymentProof,
  changeTier,
  createSubscription,
  cancelSubscription,
  type ApiPaymentInfo,
  type ChangeTierResult,
  type CreateSubscriptionResult,
  type CancelSubscriptionResult,
} from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import type { PaidTier, BillingInterval } from '@/lib/subscription-tiers';

export type BillingResult = { error: string } | { payment: ApiPaymentInfo };
export type ChangeTierActionResult = { error: string } | ChangeTierResult;
export type CreateSubscriptionActionResult = { error: string } | CreateSubscriptionResult;
export type CancelSubscriptionActionResult = { error: string } | CancelSubscriptionResult;

const PROOF_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'application/pdf']);
const MAX_PROOF_BYTES = 2 * 1024 * 1024;

export async function submitPaymentProofAction(
  paymentId: number,
  formData: FormData,
): Promise<BillingResult> {
  const ctx = await requirePermission('billing.manage', { skipIssuer: true });

  const proofFile = formData.get('proof') as File | null;
  if (!proofFile || proofFile.size === 0) return { error: 'INVALID_FILE_UPLOAD' };
  if (proofFile.size > MAX_PROOF_BYTES || !PROOF_MIME_TYPES.has(proofFile.type)) {
    return { error: 'INVALID_FILE_UPLOAD' };
  }

  const buffer = Buffer.from(await proofFile.arrayBuffer());

  try {
    const payment = await submitPaymentProof({ apiKey: ctx.apiKey }, paymentId, {
      buffer,
      mimeType: proofFile.type,
      filename: proofFile.name,
    });
    revalidatePath('/settings/billing');
    return { payment };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function changeTierAction(tier: PaidTier): Promise<ChangeTierActionResult> {
  const ctx = await requirePermission('billing.manage', { skipIssuer: true });

  let result: ChangeTierResult;
  try {
    result = await changeTier({ apiKey: ctx.apiKey }, tier);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
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
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  await db.tenant.update({
    where: { id: ctx.tenant.id },
    data: { pendingBankTransfer: result.bankTransfer as unknown as Prisma.InputJsonValue },
  });

  revalidatePath('/settings/billing');
  return result;
}
