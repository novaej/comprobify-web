'use server';

import { db } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/admin-context';
import {
  updateTenantTier,
  updateTenantStatus,
  verifyTenant,
  reviewPayment,
  linkInvoice,
  refundPayment,
  publishAgreement,
  activateAgreement,
  createTierPrice,
  updateTierPrice,
  publishTierPrice,
  createSeatPrice,
  updateSeatPrice,
  publishSeatPrice,
  createReservedApiKey,
  listAdminApiKeys,
  type AdminTenant,
  type AdminPayment,
  type AdminAgreementVersion,
  type AgreementDocumentType,
  type AdminTierPrice,
  type AdminSeatPrice,
  type TierName,
  type BillingInterval,
  type AdminTenantStatus,
  type AdminSuspensionReason,
} from '@/lib/admin-api';
import { encrypt, lastFour } from '@/lib/crypto';
import { ApiError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';

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
  suspensionReasonCode?: AdminSuspensionReason,
): Promise<AdminTenantResult> {
  await requireSuperAdmin();
  try {
    const tenant = await updateTenantStatus(id, status, suspensionReasonCode);
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
    revalidatePath('/admin/invoicing/pending');
    // The nav badge count is read in admin/layout.tsx on every render, so it
    // needs the same layout-wide invalidation rule-12 requires elsewhere.
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function refundPaymentAction(
  id: string,
  reason?: string,
): Promise<AdminPaymentResult> {
  await requireSuperAdmin();
  try {
    const { payment } = await refundPayment(id, reason);
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

// ── Seat prices (ADR-032) ────────────────────────────────────────────────────

export type AdminSeatPriceResult = { error: string } | { price: AdminSeatPrice };

export async function createSeatPriceAction(
  billingInterval: BillingInterval,
  priceUsd: number,
): Promise<AdminSeatPriceResult> {
  await requireSuperAdmin();
  try {
    const price = await createSeatPrice(billingInterval, priceUsd);
    revalidatePath('/admin/seat-prices');
    return { price };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function updateSeatPriceAction(id: string, priceUsd: number): Promise<AdminSeatPriceResult> {
  await requireSuperAdmin();
  try {
    const price = await updateSeatPrice(id, priceUsd);
    revalidatePath('/admin/seat-prices');
    return { price };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function publishSeatPriceAction(id: string, noticeDays?: number): Promise<AdminSeatPriceResult> {
  await requireSuperAdmin();
  try {
    const price = await publishSeatPrice(id, noticeDays);
    revalidatePath('/admin/seat-prices');
    return { price };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

// ── Reserved API key rotation (per tenant) ───────────────────────────────────
// Force-replaces one of comprobify-web's own reserved keys (master or
// per-role) for a tenant — e.g. if a key is suspected compromised. Scoped to
// keys with a local `TenantApiKey` row (isManaged: true) — a reserved key
// with no local mirror isn't something comprobify-web's own app copy is
// actually using, so there's nothing here to fix for it. See CLAUDE.md's
// "Per-role API key scopes" and tenant-api-key.ts.

export interface AdminReservedApiKeyRow {
  apiKeyId: string;
  label: string;
  environment: 'sandbox' | 'production';
  // managedRole; null = the tenant's full-access master key.
  role: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
}

export async function listReservedApiKeysAction(apiTenantId: string): Promise<{ keys: AdminReservedApiKeyRow[] }> {
  await requireSuperAdmin();

  const localRows = await db.tenantApiKey.findMany({
    where: { tenant: { apiTenantId }, isActive: true, isManaged: true },
    orderBy: { createdAt: 'asc' },
  });
  if (localRows.length === 0) return { keys: [] };
  // Master key (managedRole: null) first, then per-role keys — sorted in JS
  // since Prisma's null-ordering for an orderBy field isn't consistent
  // across versions, and this list is never more than a handful of rows.
  localRows.sort((a, b) => (a.managedRole === b.managedRole ? 0 : a.managedRole === null ? -1 : b.managedRole === null ? 1 : 0));

  // Lifetime lastUsedAt/requestCount live only on the API side — best-effort,
  // since this is a secondary enrichment, not the source of truth for which
  // keys are rotatable (that's the local rows above).
  const adminKeys = await listAdminApiKeys(apiTenantId).catch(() => []);
  const infoByApiKeyId = new Map(adminKeys.map((k) => [k.id, k]));

  return {
    keys: localRows.map((row) => ({
      apiKeyId: row.apiKeyId,
      label: row.label,
      environment: row.environment as 'sandbox' | 'production',
      role: row.managedRole,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: infoByApiKeyId.get(row.apiKeyId)?.lastUsedAt ?? null,
      requestCount: infoByApiKeyId.get(row.apiKeyId)?.requestCount ?? 0,
    })),
  };
}

export async function rotateReservedApiKeyAction(
  apiTenantId: string,
  apiKeyId: string,
): Promise<{ error: string } | { ok: true }> {
  await requireSuperAdmin();

  // isManaged: true is the local proxy for "this is one of comprobify-web's
  // own reserved keys" — a self-service tenant key is never isManaged, so
  // this also doubles as the safety check the admin replace endpoint itself
  // doesn't perform (it'll happily "rotate" any active key it's given,
  // reserved or not).
  const localRow = await db.tenantApiKey.findFirst({
    where: { apiKeyId, isActive: true, isManaged: true, tenant: { apiTenantId } },
  });
  if (!localRow) return { error: 'RESERVED_KEY_NOT_FOUND' };

  let plainKey: string;
  try {
    // label/environment/scopes are echoed back explicitly from the row being
    // replaced — the admin endpoint defaults scopes to ALL_SCOPES when
    // omitted, which would silently escalate a narrower per-role key to
    // full access if left out.
    plainKey = await createReservedApiKey(apiTenantId, {
      replaceKeyId: apiKeyId,
      label: localRow.label,
      environment: localRow.environment as 'sandbox' | 'production',
      scopes: localRow.scopes,
    });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  // POST .../api-keys returns only the plaintext token (Common Mistake #18) —
  // resolve the new id via a follow-up admin listing, same pattern as
  // mintManagedKey()/recoverAccountAction(). The just-replaced row is already
  // inactive by the time this runs (the admin endpoint revokes-then-creates
  // atomically), so matching on label+environment alone is unambiguous.
  const adminKeys = await listAdminApiKeys(apiTenantId).catch(() => []);
  const rotated = adminKeys.find((k) => k.isReserved && k.label === localRow.label && k.environment === localRow.environment);
  if (!rotated) {
    console.error('[admin] rotated key metadata did not resolve', { apiTenantId, apiKeyId });
    Sentry.captureException(new Error('Rotated key missing from listAdminApiKeys'), { extra: { apiTenantId, apiKeyId } });
    return { error: 'DB_WRITE_FAILED' };
  }

  try {
    await db.$transaction([
      db.tenantApiKey.update({
        where: { id: localRow.id },
        data: { isActive: false, revokedAt: new Date() },
      }),
      db.tenantApiKey.create({
        data: {
          tenantId: localRow.tenantId,
          apiKeyId: rotated.id,
          label: rotated.label ?? localRow.label,
          environment: rotated.environment,
          encryptedKey: encrypt(plainKey),
          lastFour: lastFour(plainKey),
          isActive: true,
          isManaged: true,
          managedRole: localRow.managedRole,
          scopes: rotated.scopes,
        },
      }),
    ]);
  } catch (err) {
    console.error('[admin] failed to persist rotated key', err);
    Sentry.captureException(err, { extra: { apiTenantId, apiKeyId } });
    return { error: 'DB_WRITE_FAILED' };
  }

  revalidatePath('/admin/tenants');
  return { ok: true };
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
