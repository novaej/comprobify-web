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

export interface AdminTenant {
  id: string;
  email: string;
  subscriptionTier: string;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';
  documentQuota: number;
  documentCount: number;
  createdAt: string;
}

export interface AdminPayment {
  id: string;
  subscription_id: string;
  amount: string;
  method: string;
  purpose: string;
  target_tier: string | null;
  status: string;
  reported_at: string | null;
  verified_at: string | null;
  proof_filename: string | null;
  proof_mime_type: string | null;
  rejection_reason: string | null;
  tenant_id: string;
  tier: string;
  billing_interval: string;
  tenant: { id: string; email: string } | null;
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
  id: number;
  document_type: AgreementDocumentType;
  version: string;
  is_current: boolean;
  created_at: string;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → getAgreementVersion()
export interface AdminAgreementDetail extends AdminAgreementVersion {
  contentMarkdown: string;
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
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
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
  const { tenants } = await request<{ ok: true; tenants: AdminTenant[] }>('/admin/tenants');
  return tenants;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → updateTenantTier()
export async function updateTenantTier(id: number, tier: string): Promise<AdminTenant> {
  const { tenant } = await request<{ ok: true; tenant: AdminTenant }>(`/admin/tenants/${id}/tier`, {
    method: 'PATCH',
    body: JSON.stringify({ subscriptionTier: tier }),
  });
  return tenant;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → updateTenantStatus()
export async function updateTenantStatus(
  id: number,
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED',
): Promise<AdminTenant> {
  const { tenant } = await request<{ ok: true; tenant: AdminTenant }>(`/admin/tenants/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return tenant;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → verifyTenant()
export async function verifyTenant(id: number): Promise<AdminTenant> {
  const { tenant } = await request<{ ok: true; tenant: AdminTenant }>(`/admin/tenants/${id}/verify`, {
    method: 'POST',
  });
  return tenant;
}

// ── Payments ──────────────────────────────────────────────────────────────────

// Verified against: ../comprobify/src/controllers/admin.controller.js → listPayments()
export async function listPendingPayments(status: string = 'REPORTED'): Promise<AdminPayment[]> {
  const { payments } = await request<{ ok: true; payments: AdminPayment[] }>(
    `/admin/payments?status=${encodeURIComponent(status)}`,
  );
  return payments;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → reviewPayment()
export async function reviewPayment(
  id: number,
  decision: 'VERIFIED' | 'REJECTED',
  rejectionReasonCode?: string,
): Promise<{ payment: AdminPayment; subscription: unknown }> {
  return request(`/admin/payments/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ decision, rejectionReasonCode }),
  });
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → listPaymentProofs()
// Returns all proofs (active and soft-deleted) for full audit visibility.
export async function listAdminPaymentProofs(paymentId: number): Promise<AdminPaymentProof[]> {
  const { proofs } = await request<{ ok: true; proofs: AdminPaymentProof[] }>(
    `/admin/payments/${paymentId}/proofs`,
  );
  return proofs;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → getPaymentProof()
// Streams the raw file. Returns the raw Response so the proxy route can stream it.
export async function getAdminPaymentProofFile(
  paymentId: number,
  proofId: number,
): Promise<{ buffer: ArrayBuffer; filename: string; mimeType: string }> {
  const res = await fetch(`${getApiUrl()}/admin/payments/${paymentId}/proofs/${proofId}`, {
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
    `/admin/agreements/${type}/versions`,
  );
  return versions;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → getAgreementVersion()
// Returns full content including contentMarkdown for the editor.
export async function getAgreementVersion(id: number): Promise<AdminAgreementDetail> {
  const { document } = await request<{ ok: true; document: AdminAgreementDetail }>(
    `/admin/agreements/versions/${id}`,
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
    '/admin/agreements',
    { method: 'POST', body: JSON.stringify({ documentType, version, contentMarkdown }) },
  );
  return document;
}

// Verified against: ../comprobify/src/controllers/admin.controller.js → activateAgreement()
export async function activateAgreement(id: number): Promise<AdminAgreementVersion> {
  const { document } = await request<{ ok: true; document: AdminAgreementVersion }>(
    `/admin/agreements/${id}/activate`,
    { method: 'PATCH' },
  );
  return document;
}
