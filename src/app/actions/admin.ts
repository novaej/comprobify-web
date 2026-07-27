'use server';

import { db } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/admin-context';
import {
  updateTenantTier,
  updateTenantStatus,
  verifyTenant,
  reviewPayment,
  linkInvoice,
  publishAgreement,
  activateAgreement,
  createTierPrice,
  updateTierPrice,
  publishTierPrice,
  type AdminTenant,
  type AdminPayment,
  type AdminAgreementVersion,
  type AgreementDocumentType,
  type AdminTierPrice,
  type TierName,
  type BillingInterval,
  type AdminTenantStatus,
} from '@/lib/admin-api';
import { ApiError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';

export type AdminTenantResult = { error: string } | { tenant: AdminTenant };
export type AdminPaymentResult = { error: string } | { payment: AdminPayment };

export async function updateTenantTierAction(id: string, tier: string): Promise<AdminTenantResult> {
  await requireSuperAdmin();
  try {
    const tenant = await updateTenantTier(id, tier);
    revalidatePath('/admin/tenants');
    return { tenant };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function updateTenantStatusAction(
  id: string,
  status: AdminTenantStatus,
): Promise<AdminTenantResult> {
  await requireSuperAdmin();
  try {
    const tenant = await updateTenantStatus(id, status);
    revalidatePath('/admin/tenants');
    return { tenant };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function verifyTenantAction(id: string): Promise<AdminTenantResult> {
  await requireSuperAdmin();
  try {
    const tenant = await verifyTenant(id);
    revalidatePath('/admin/tenants');
    return { tenant };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function reviewPaymentAction(
  id: string,
  decision: 'VERIFIED' | 'REJECTED',
  rejectionReasonCode?: string,
): Promise<AdminPaymentResult> {
  await requireSuperAdmin();
  try {
    const { payment } = await reviewPayment(id, decision, rejectionReasonCode);
    revalidatePath('/admin/payments');
    return { payment };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function linkInvoiceAction(
  subscriptionId: string,
  accessKey: string,
): Promise<{ error: string } | { ok: true }> {
  await requireSuperAdmin();
  try {
    await linkInvoice(subscriptionId, accessKey);
    revalidatePath('/admin/payments');
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export type AdminAgreementResult = { error: string } | { document: AdminAgreementVersion };

export async function publishAgreementAction(
  documentType: AgreementDocumentType,
  version: string,
  contentMarkdown: string,
): Promise<AdminAgreementResult> {
  await requireSuperAdmin();
  try {
    const document = await publishAgreement(documentType, version, contentMarkdown);
    revalidatePath('/admin/agreements');
    return { document };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function activateAgreementAction(id: string): Promise<AdminAgreementResult> {
  await requireSuperAdmin();
  try {
    const document = await activateAgreement(id);
    revalidatePath('/admin/agreements');
    return { document };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

// ── Tier prices ───────────────────────────────────────────────────────────────

export type AdminTierPriceResult = { error: string } | { price: AdminTierPrice };

export async function createTierPriceAction(
  tier: TierName,
  billingInterval: BillingInterval,
  priceUsd: number,
): Promise<AdminTierPriceResult> {
  await requireSuperAdmin();
  try {
    const price = await createTierPrice(tier, billingInterval, priceUsd);
    revalidatePath('/admin/prices');
    return { price };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function updateTierPriceAction(id: string, priceUsd: number): Promise<AdminTierPriceResult> {
  await requireSuperAdmin();
  try {
    const price = await updateTierPrice(id, priceUsd);
    revalidatePath('/admin/prices');
    return { price };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function publishTierPriceAction(id: string, noticeDays?: number): Promise<AdminTierPriceResult> {
  await requireSuperAdmin();
  try {
    const price = await publishTierPrice(id, noticeDays);
    revalidatePath('/admin/prices');
    return { price };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

// ── Agreement drafts (stored in the app's own DB, not the Comprobify API) ────

export interface AgreementDraftData {
  documentType: string;
  version: string;
  content: string;
  updatedAt: string;
}

export async function saveAgreementDraftAction(
  documentType: string,
  version: string,
  content: string,
): Promise<{ error: string } | { draft: AgreementDraftData }> {
  await requireSuperAdmin();
  try {
    const draft = await db.agreementDraft.upsert({
      where: { documentType },
      create: { documentType, version, content },
      update: { version, content },
    });
    return { draft: { documentType: draft.documentType, version: draft.version, content: draft.content, updatedAt: draft.updatedAt.toISOString() } };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function deleteAgreementDraftAction(
  documentType: string,
): Promise<{ error: string } | { ok: true }> {
  await requireSuperAdmin();
  try {
    await db.agreementDraft.deleteMany({ where: { documentType } });
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}
