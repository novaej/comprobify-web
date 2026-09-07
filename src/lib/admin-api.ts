import 'server-only';
import { ApiError, ProblemDetails } from './errors';

// ═══════════════════════════════════════════════════════════════════════════════
// Server-only client for the Comprobify API's /admin/* routes — used exclusively
// by the /admin super-admin panel (src/app/[locale]/admin/). Same verification
// rule as api.ts: every function here is checked against the actual controller's
// res.json() in ../comprobify/src/controllers/admin.controller.js.
//
// Auth is a static Bearer secret (COMPROBIFY_ADMIN_SECRET), not a per-tenant API
// key — there is no ApiCtx/issuer concept here.
// ═══════════════════════════════════════════════════════════════════════════════

// PAST_DUE (ADR-025 on the API side): a self-resolving billing state assigned
// when a renewal grace period lapses unpaid — distinct from the admin-only,
// manually-lifted SUSPENDED.
export type AdminTenantStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'PAST_DUE';

// Mirrors ../comprobify/src/constants/suspension-reasons.js (ADR-027). Only
// meaningful when status is SUSPENDED — cleared server-side on any other
// transition, same denormalized-cache pattern as agreementAcceptedAt.
export type AdminSuspensionReason =
  | 'PAYMENT_REVERSED'
  | 'FRAUD_SUSPECTED'
  | 'TERMS_VIOLATION'
  | 'VOLUNTARY_CLOSURE'
  | 'UNPAID_BALANCE'
  | 'OTHER';

export interface AdminTenant {
  id: string;
  email: string;
  subscriptionTier: string;
  status: AdminTenantStatus;
  suspensionReasonCode: AdminSuspensionReason | null;
  // null means genuinely unlimited (ENTERPRISE — comprobify migration 094).
  documentQuota: number | null;
  documentCount: number;
  createdAt: string;
}

export interface AdminPayment {
  id: string;
  subscription_id: string;
  amount: string;
  iva_rate: string;
  iva_amount: string;
  total_amount: string;
  method: 'SPI_TRANSFER' | 'PAYPHONE_CARD';
  purpose: string;
  target_tier: string | null;
  status: string;
  reported_at: string | null;
  verified_at: string | null;
  proof_filename: string | null;
  proof_mime_type: string | null;
  rejection_reason: string | null;
  invoice_access_key: string | null;
  period_start: string | null;
  tenant_id: string;
  tier: string;
  billing_interval: string;
  tenant: { id: string; email: string } | null;
  // ADR-027: invoiced_at (not invoice_access_key/period_start) is the real
  // "has an invoice been recorded" signal now — see listPendingInvoicing().
  invoiced_at: string | null;
  // Rollback snapshot captured immediately before a VERIFIED payment was
  // applied — see refundPayment(). Absent on payments applied before
  // migration 090; the API's refund endpoint refuses those.
  applied_from: {
    tier: string;
    billingInterval: string;
    periodStart: string | null;
    periodEnd: string | null;
    subscriptionStatus: string;
    tenantTier: string;
  } | null;
}

// Verified against: ../comprobify/src/services/subscription.service.js → formatPaymentProof()
// id is BIGSERIAL → string per pg/JSON serialisation (Common Mistake #16).
export interface AdminPaymentProof {
  id: string;
  filename: string;
  mimeType: string;
  referenceNumber: string;
  active: boolean;
  createdAt: string;
}

export type AgreementDocumentType = 'TERMS' | 'PRIVACY' | 'DPA';

// Verified against: ../comprobify/src/controllers/admin.controller.js → listAgreementVersions()
export interface AdminAgreementVersion {
  id: string;
  document_type: AgreementDocumentType;
  version: string;
  is_current: boolean;
  created_at: string;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → getAgreementVersion()
export interface AdminAgreementDetail extends AdminAgreementVersion {
  contentMarkdown: string;
}

export type TierName = 'FREE' | 'SOLO' | 'LITE' | 'STARTER' | 'GROWTH' | 'BUSINESS' | 'ENTERPRISE';
export type BillingInterval = 'MONTHLY' | 'YEARLY';

// Verified against: ../comprobify/src/controllers/admin.controller.js → formatTierPrice()
export interface AdminTierPrice {
  id: string;
  tier: TierName;
  billingInterval: BillingInterval;
  priceUsd: number;
  status: 'DRAFT' | 'PUBLISHED';
  effectiveAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → formatSeatPrice()
// Same DRAFT/PUBLISHED shape as AdminTierPrice, minus `tier` — the extra-seat
// add-on's price (ADR-032) is flat across every tier.
export interface AdminSeatPrice {
  id: string;
  billingInterval: BillingInterval;
  priceUsd: number;
  status: 'DRAFT' | 'PUBLISHED';
  effectiveAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

function getApiUrl(): string {
  const apiUrl = process.env.COMPROBIFY_API_URL;
  if (!apiUrl) throw new Error('COMPROBIFY_API_URL is not set');
  return apiUrl;
}

function getAdminSecret(): string {
  const secret = process.env.COMPROBIFY_ADMIN_SECRET;
  if (!secret) throw new Error('COMPROBIFY_ADMIN_SECRET is not set');
  return secret;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAdminSecret()}`,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    // Guard against proxy/gateway error pages that return HTML instead of JSON.
    // Checks for 'json' generically, not 'application/json' specifically — the API's own error
    // responses use RFC 7807's 'application/problem+json' (see error-handler.js), which doesn't
    // contain 'application/json' as a substring. See the matching fix in src/lib/api.ts.
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      const body = await res.text().catch(() => '');
      throw new ApiError({
        type: 'about:blank',
        title: `Admin API error ${res.status}`,
        detail: body.slice(0, 200),
        status: res.status,
        code: 'ADMIN_API_UNREACHABLE',
        instance: '',
      });
    }
    const problem: ProblemDetails = await res.json();
    throw new ApiError(problem);
  }

  return res.json() as Promise<T>;
}

// ── Tenants ───────────────────────────────────────────────────────────────────

// Verified against: ../comprobify/src/controllers/admin.controller.js → listTenants()
export async function listTenants(): Promise<AdminTenant[]> {
  const { tenants } = await request<{ ok: true; tenants: AdminTenant[] }>('/v1/admin/tenants');
  return tenants;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → updateTenantTier()
export async function updateTenantTier(id: string, tier: string): Promise<AdminTenant> {
  const { tenant } = await request<{ ok: true; tenant: AdminTenant }>(`/v1/admin/tenants/${id}/tier`, {
    method: 'PATCH',
    body: JSON.stringify({ subscriptionTier: tier }),
  });
  return tenant;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → updateTenantStatus()
// suspensionReasonCode is required by the API's validator whenever status is
// SUSPENDED (ADR-027) — omitting it 400s with VALIDATION_FAILED.
export async function updateTenantStatus(
  id: string,
  status: AdminTenantStatus,
  suspensionReasonCode?: AdminSuspensionReason,
): Promise<AdminTenant> {
  const { tenant } = await request<{ ok: true; tenant: AdminTenant }>(`/v1/admin/tenants/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, suspensionReasonCode }),
  });
  return tenant;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → verifyTenant()
export async function verifyTenant(id: string): Promise<AdminTenant> {
  const { tenant } = await request<{ ok: true; tenant: AdminTenant }>(`/v1/admin/tenants/${id}/verify`, {
    method: 'POST',
  });
  return tenant;
}

// ── Issuers ───────────────────────────────────────────────────────────────────

// Verified against: ../comprobify/src/services/admin.service.js → formatIssuer()
export interface AdminIssuer {
  id: string;
  tenantId: string;
  ruc: string;
  businessName: string;
  tradeName: string | null;
  branchCode: string;
  issuePointCode: string;
  active: boolean;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → listIssuers()
export async function listAdminIssuers(): Promise<AdminIssuer[]> {
  const { issuers } = await request<{ ok: true; issuers: AdminIssuer[] }>('/v1/admin/issuers');
  return issuers;
}

// ── Payments ──────────────────────────────────────────────────────────────────

// Verified against: ../comprobify/src/controllers/admin.controller.js → listPayments()
export async function listPendingPayments(status: string = 'REPORTED'): Promise<AdminPayment[]> {
  const { payments } = await request<{ ok: true; payments: AdminPayment[] }>(
    `/v1/admin/payments?status=${encodeURIComponent(status)}`,
  );
  return payments;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → reviewPayment()
export async function reviewPayment(
  id: string,
  decision: 'VERIFIED' | 'REJECTED',
  rejectionReasonCode?: string,
): Promise<{ payment: AdminPayment; subscription: unknown }> {
  return request(`/v1/admin/payments/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ decision, rejectionReasonCode }),
  });
}

// ── Invoicing queue (ADR-027) ────────────────────────────────────────────────
// Verified payments whose self-billed factura the operator still owes — see
// subscriptionService.listPendingInvoices() in
// ../comprobify/src/services/subscription.service.js. Activation no longer
// waits on this; it's purely a work queue.

export interface AdminPendingInvoiceItem {
  payment: {
    id: string;
    purpose: string;
    method: string;
    amount: string;
    ivaRate: string;
    ivaAmount: string;
    totalAmount: string;
    verifiedAt: string | null;
    // A SEAT_CHANGE payment has no target_tier at all — subscription.tier
    // below stays the tenant's unaffected current tier for this purpose, so
    // these are what actually say the invoice is for extra seats. Verified
    // against subscription.service.js's listPendingInvoices() — present on
    // every item already, just never typed (Common Mistake #58's "type it
    // even if unused" gap, except this one was actually needed).
    seatsCharged: number | null;
    targetExtraSeats: number | null;
  };
  subscription: {
    id: string;
    tier: string;
    billingInterval: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
  };
  buyer: {
    tenantId: string;
    email: string;
    businessName: string | null;
    ruc: string | null;
    address: string | null;
  };
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → listPendingInvoices()
export async function listPendingInvoicing(): Promise<{ count: number; items: AdminPendingInvoiceItem[] }> {
  return request<{ ok: true; count: number; items: AdminPendingInvoiceItem[] }>('/v1/admin/invoicing/pending');
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → refundPayment()
export async function refundPayment(
  id: string,
  reason?: string,
): Promise<{ payment: AdminPayment; subscription: unknown }> {
  return request(`/v1/admin/payments/${id}/refund`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → linkInvoice()
// Route: PATCH /v1/admin/subscriptions/:id/link-invoice
export async function linkInvoice(subscriptionId: string, accessKey: string): Promise<{ ok: true }> {
  return request(`/v1/admin/subscriptions/${subscriptionId}/link-invoice`, {
    method: 'PATCH',
    body: JSON.stringify({ accessKey }),
  });
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → listPaymentProofs()
// Returns all proofs (active and soft-deleted) for full audit visibility.
export async function listAdminPaymentProofs(paymentId: string): Promise<AdminPaymentProof[]> {
  const { proofs } = await request<{ ok: true; proofs: AdminPaymentProof[] }>(
    `/v1/admin/payments/${paymentId}/proofs`,
  );
  return proofs;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → getPaymentProof()
// Streams the raw file. Returns the raw Response so the proxy route can stream it.
export async function getAdminPaymentProofFile(
  paymentId: string,
  proofId: string,
): Promise<{ buffer: ArrayBuffer; filename: string; mimeType: string }> {
  const res = await fetch(`${getApiUrl()}/v1/admin/payments/${paymentId}/proofs/${proofId}`, {
    headers: { Authorization: `Bearer ${getAdminSecret()}` },
  });

  if (!res.ok) {
    const problem: ProblemDetails = await res.json();
    throw new ApiError(problem);
  }

  const disposition = res.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : `proof-${paymentId}-${proofId}`;
  const mimeType = res.headers.get('content-type') ?? 'application/octet-stream';

  return { buffer: await res.arrayBuffer(), filename, mimeType };
}

// ── Agreements ────────────────────────────────────────────────────────────────

// Verified against: ../comprobify/src/controllers/admin.controller.js → listAgreementVersions()
export async function listAgreementVersions(type: AgreementDocumentType): Promise<AdminAgreementVersion[]> {
  const { versions } = await request<{ ok: true; versions: AdminAgreementVersion[] }>(
    `/v1/admin/agreements/${type}/versions`,
  );
  return versions;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → getAgreementVersion()
// Returns full content including contentMarkdown for the editor.
export async function getAgreementVersion(id: string): Promise<AdminAgreementDetail> {
  const { document } = await request<{ ok: true; document: AdminAgreementDetail }>(
    `/v1/admin/agreements/versions/${id}`,
  );
  return document;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → publishAgreement()
// contentMarkdown is optional — if omitted the API reads from disk.
export async function publishAgreement(
  documentType: AgreementDocumentType,
  version: string,
  contentMarkdown: string,
): Promise<AdminAgreementVersion> {
  const { document } = await request<{ ok: true; document: AdminAgreementVersion }>(
    '/v1/admin/agreements',
    { method: 'POST', body: JSON.stringify({ documentType, version, contentMarkdown }) },
  );
  return document;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → activateAgreement()
export async function activateAgreement(id: string): Promise<AdminAgreementVersion> {
  const { document } = await request<{ ok: true; document: AdminAgreementVersion }>(
    `/v1/admin/agreements/${id}/activate`,
    { method: 'PATCH' },
  );
  return document;
}

// ── Tier prices ───────────────────────────────────────────────────────────────
// Draft → publish workflow (ADR-023): a price is created as a DRAFT (not
// visible to tenants, no notice clock running), then published, which sets
// effectiveAt/publishedAt, starts the (minimum 30-day) notice window, and
// notifies every ACTIVE tenant. Once PUBLISHED a row is immutable — there is
// no update/delete for it, only a new DRAFT superseding it later.

// Verified against: ../comprobify/src/controllers/admin.controller.js → listTierPrices()
export async function listTierPrices(tier?: TierName): Promise<AdminTierPrice[]> {
  const qs = tier ? `?tier=${encodeURIComponent(tier)}` : '';
  const { prices } = await request<{ ok: true; prices: AdminTierPrice[] }>(`/v1/admin/prices${qs}`);
  return prices;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → createTierPrice()
export async function createTierPrice(
  tier: TierName,
  billingInterval: BillingInterval,
  priceUsd: number,
): Promise<AdminTierPrice> {
  const { price } = await request<{ ok: true; price: AdminTierPrice }>('/v1/admin/prices', {
    method: 'POST',
    body: JSON.stringify({ tier, billingInterval, priceUsd }),
  });
  return price;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → updateTierPrice()
// Only a DRAFT price can be edited — the API rejects otherwise with PRICE_NOT_DRAFT.
export async function updateTierPrice(id: string, priceUsd: number): Promise<AdminTierPrice> {
  const { price } = await request<{ ok: true; price: AdminTierPrice }>(`/v1/admin/prices/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ priceUsd }),
  });
  return price;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → publishTierPrice()
// noticeDays defaults to the API's configured minimum (PRICE_CHANGE_MIN_NOTICE_DAYS,
// 30) when omitted; the API rejects anything shorter with PRICE_NOTICE_TOO_SHORT.
export async function publishTierPrice(id: string, noticeDays?: number): Promise<AdminTierPrice> {
  const { price } = await request<{ ok: true; price: AdminTierPrice }>(`/v1/admin/prices/${id}/publish`, {
    method: 'POST',
    body: JSON.stringify({ noticeDays }),
  });
  return price;
}

// ── Seat prices (ADR-032) ────────────────────────────────────────────────────
// Mirrors the tier-price functions above exactly, minus the `tier` param —
// same DRAFT → publish workflow, same PRICE_NOT_DRAFT/PRICE_NOTICE_TOO_SHORT
// error codes, no new error mapping needed anywhere that already handles those.

// Verified against: ../comprobify/src/controllers/admin.controller.js → listSeatPrices()
export async function listSeatPrices(): Promise<AdminSeatPrice[]> {
  const { prices } = await request<{ ok: true; prices: AdminSeatPrice[] }>('/v1/admin/seat-prices');
  return prices;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → createSeatPrice()
export async function createSeatPrice(
  billingInterval: BillingInterval,
  priceUsd: number,
): Promise<AdminSeatPrice> {
  const { price } = await request<{ ok: true; price: AdminSeatPrice }>('/v1/admin/seat-prices', {
    method: 'POST',
    body: JSON.stringify({ billingInterval, priceUsd }),
  });
  return price;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → updateSeatPrice()
// Only a DRAFT price can be edited — the API rejects otherwise with PRICE_NOT_DRAFT.
export async function updateSeatPrice(id: string, priceUsd: number): Promise<AdminSeatPrice> {
  const { price } = await request<{ ok: true; price: AdminSeatPrice }>(`/v1/admin/seat-prices/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ priceUsd }),
  });
  return price;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → publishSeatPrice()
export async function publishSeatPrice(id: string, noticeDays?: number): Promise<AdminSeatPrice> {
  const { price } = await request<{ ok: true; price: AdminSeatPrice }>(`/v1/admin/seat-prices/${id}/publish`, {
    method: 'POST',
    body: JSON.stringify({ noticeDays }),
  });
  return price;
}
