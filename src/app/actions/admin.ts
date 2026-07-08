'use server';

import { requireSuperAdmin } from '@/lib/admin-context';
import {
  updateTenantTier,
  updateTenantStatus,
  verifyTenant,
  reviewPayment,
  publishAgreement,
  activateAgreement,
  type AdminTenant,
  type AdminPayment,
  type AdminAgreementVersion,
  type AgreementDocumentType,
} from '@/lib/admin-api';
import { ApiError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';

export type AdminTenantResult = { error: string } | { tenant: AdminTenant };
export type AdminPaymentResult = { error: string } | { payment: AdminPayment };

export async function updateTenantTierAction(id: number, tier: string): Promise<AdminTenantResult> {
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
  id: number,
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED',
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

export async function verifyTenantAction(id: number): Promise<AdminTenantResult> {
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
  id: number,
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

export async function activateAgreementAction(id: number): Promise<AdminAgreementResult> {
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
