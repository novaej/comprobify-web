import { ApiError, ProblemDetails } from './errors';
import { buildClientForwardingHeaders, type ClientForwardingInfo } from './client-forwarding';

// Public (unauthenticated) Comprobify API calls.
// Safe to import in Server Components and Server Actions that don't need an API key.

function getApiUrl(): string {
  const apiUrl = process.env.COMPROBIFY_API_URL;
  if (!apiUrl) throw new Error('COMPROBIFY_API_URL is not set');
  return apiUrl;
}

async function publicRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, options);

  if (!res.ok) {
    const problem: ProblemDetails = await res.json().catch(() => ({
      type: 'about:blank',
      title: `HTTP ${res.status}`,
      status: res.status,
      code: 'UNEXPECTED_ERROR',
      detail: `HTTP ${res.status}`,
      instance: path,
    }));
    throw new ApiError(problem);
  }

  return res.json() as Promise<T>;
}

export interface IssuerRegistrationFields {
  ruc: string;
  businessName: string;
  tradeName?: string;
  mainAddress?: string;
  branchCode: string;
  issuePointCode: string;
  emissionType: string;
  requiredAccounting: boolean;
  documentTypes?: string[];
  initialSequentials?: { documentType: string; sequential: number }[];
  language?: string;
}

export interface RegisterTenantResult {
  tenantId: string;
  issuerId: string;
  apiKey: string;
  isEmailVerified: boolean;
}

export async function registerTenant(
  email: string,
  fields: IssuerRegistrationFields,
  p12Buffer: Buffer,
  p12Password: string,
  verificationRedirectUrl?: string,
  logoBuffer?: Buffer,
  logoType?: string,
  clientHeaders?: ClientForwardingInfo,
): Promise<RegisterTenantResult> {
  const form = new FormData();
  form.append('email', email);
  form.append('ruc', fields.ruc);
  form.append('businessName', fields.businessName);
  if (fields.tradeName) form.append('tradeName', fields.tradeName);
  if (fields.mainAddress) form.append('mainAddress', fields.mainAddress);
  form.append('branchCode', fields.branchCode);
  form.append('issuePointCode', fields.issuePointCode);
  form.append('environment', '1');
  form.append('emissionType', fields.emissionType);
  form.append('requiredAccounting', fields.requiredAccounting ? 'true' : 'false');
  if (fields.documentTypes?.length) {
    form.append('documentTypes', JSON.stringify(fields.documentTypes));
  }
  if (fields.initialSequentials?.length) {
    form.append('initialSequentials', JSON.stringify(fields.initialSequentials));
  }
  form.append('certPassword', p12Password);
  if (fields.language) form.append('language', fields.language);
  if (verificationRedirectUrl) form.append('verificationRedirectUrl', verificationRedirectUrl);

  const buf = p12Buffer.buffer.slice(
    p12Buffer.byteOffset,
    p12Buffer.byteOffset + p12Buffer.byteLength,
  ) as ArrayBuffer;
  form.append('cert', new Blob([buf], { type: 'application/x-pkcs12' }), 'cert.p12');

  if (logoBuffer) {
    const logoBuf = logoBuffer.buffer.slice(
      logoBuffer.byteOffset,
      logoBuffer.byteOffset + logoBuffer.byteLength,
    ) as ArrayBuffer;
    form.append('logo', new Blob([logoBuf], { type: logoType || 'image/png' }), 'logo');
  }

  const result = await publicRequest<{
    ok: true;
    tenant: { id: string; email: string; status: string };
    issuer: { id: string; ruc: string };
    apiKey: string;
  }>('/v1/register', {
    method: 'POST',
    body: form,
    headers: buildClientForwardingHeaders(clientHeaders ?? {}),
  });

  return {
    tenantId: result.tenant.id,
    issuerId: result.issuer.id,
    apiKey: result.apiKey,
    isEmailVerified: result.tenant.status === 'ACTIVE',
  };
}

// Verified against: ../comprobify/src/controllers/registration.controller.js → recover()
// and ../comprobify/src/services/registration.service.js → recover(). Deliberately
// anti-enumeration: an unregistered email, an account with no issuer, and a mismatched
// certificate all return { ok: true, message } with no tenant/issuer/apiKey/environment —
// the presence of `apiKey` is what distinguishes a real match, never the HTTP status
// (both cases are 200).
export type RecoverAccountResult =
  | { matched: false }
  | {
      matched: true;
      tenant: { id: string; email: string; status: string };
      issuer: {
        id: string;
        ruc: string;
        businessName: string;
        tradeName: string | null;
        branchCode: string;
        issuePointCode: string;
      };
      apiKey: string;
      environment: 'sandbox' | 'production';
    };

export async function recoverAccount(
  email: string,
  p12Buffer: Buffer,
  p12Password: string,
  clientHeaders?: ClientForwardingInfo,
): Promise<RecoverAccountResult> {
  const form = new FormData();
  form.append('email', email);
  form.append('certPassword', p12Password);

  const buf = p12Buffer.buffer.slice(
    p12Buffer.byteOffset,
    p12Buffer.byteOffset + p12Buffer.byteLength,
  ) as ArrayBuffer;
  form.append('cert', new Blob([buf], { type: 'application/x-pkcs12' }), 'cert.p12');

  const result = await publicRequest<{
    ok: true;
    message?: string;
    tenant?: { id: string; email: string; status: string };
    issuer?: {
      id: string;
      ruc: string;
      businessName: string;
      tradeName: string | null;
      branchCode: string;
      issuePointCode: string;
    };
    apiKey?: string;
    environment?: 'sandbox' | 'production';
  }>('/v1/recover', {
    method: 'POST',
    body: form,
    headers: buildClientForwardingHeaders(clientHeaders ?? {}),
  });

  if (!result.apiKey || !result.tenant || !result.issuer || !result.environment) {
    return { matched: false };
  }

  return {
    matched: true,
    tenant: result.tenant,
    issuer: result.issuer,
    apiKey: result.apiKey,
    environment: result.environment,
  };
}

// Read-only, non-consuming check — safe for an email link-scanner (Microsoft
// Defender/Safe Links etc.) to prefetch without burning the token. Call this
// on page load; only confirmEmailVerification() (an explicit user action)
// should actually consume the token.
export async function checkEmailVerificationToken(
  token: string,
): Promise<{ valid: boolean; email?: string }> {
  return publicRequest<{ valid: boolean; email?: string }>(
    `/v1/verify-email/check?token=${encodeURIComponent(token)}`,
  );
}

// The actual consuming action — POST-only so an automated GET prefetch can
// never trigger it. Call this only from an explicit user click.
export async function confirmEmailVerification(token: string): Promise<{ email: string }> {
  const data = await publicRequest<{ ok: true; email: string }>('/v1/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return { email: data.email };
}

export async function resendVerificationEmail(
  email: string,
  verificationRedirectUrl?: string,
  clientHeaders?: ClientForwardingInfo,
): Promise<void> {
  await publicRequest('/v1/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildClientForwardingHeaders(clientHeaders ?? {}) },
    body: JSON.stringify({ email, ...(verificationRedirectUrl && { verificationRedirectUrl }) }),
  });
}

// Verified against: ../comprobify/src/controllers/agreement.controller.js → list()
// and ../comprobify/src/routes/agreements.routes.js → GET /v1/agreements (public, no auth)
export interface ApiAgreementInfo {
  documentType: 'TERMS' | 'PRIVACY' | 'DPA';
  version: string;
  url: string;
}

export async function listAgreements(): Promise<ApiAgreementInfo[]> {
  const result = await publicRequest<{ ok: true; documents: ApiAgreementInfo[] }>('/v1/agreements');
  return result.documents;
}

// Verified against: ../comprobify/src/controllers/tiers.controller.js → list()
// priceMonthlyUsd/priceYearlyUsd are the advertised, tax-EXCLUSIVE sticker
// price — matches how every local competitor publishes theirs (IVA added at
// checkout, not baked into the listed number). *Iva is the IVA portion on
// top; *Total is what a tenant actually pays/is charged — use *Total for
// any "you will be charged" display. Either price can be null when the tier
// doesn't sell that interval (e.g. SOLO is yearly-only — see
// billingIntervals). This flipped from an IVA-inclusive convention in API
// commit f3d2e83 — see CLAUDE.md Common Mistake #59 for the full history.
export interface ApiTierInfo {
  name: 'FREE' | 'SOLO' | 'LITE' | 'STARTER' | 'GROWTH' | 'BUSINESS' | 'ENTERPRISE';
  documentQuota: number;
  maxBranches: number | null;
  maxIssuePointsPerBranch: number | null;
  maxWebhookEndpoints: number;
  writeRateLimit: number;
  readRateLimit: number;
  billingIntervals: ('MONTHLY' | 'YEARLY')[];
  allowedDocumentTypes: string[];
  ivaRate: number;
  priceMonthlyUsd: number | null;       // tax-exclusive base
  priceMonthlyUsdIva: number | null;
  priceMonthlyUsdTotal: number | null;  // what a tenant actually pays
  priceYearlyUsd: number | null;        // tax-exclusive base
  priceYearlyUsdIva: number | null;
  priceYearlyUsdTotal: number | null;   // what a tenant actually pays
  // A published-but-not-yet-effective price change (ADR-023's 30-day notice
  // window), null when nothing is pending. Visible here so prospective
  // tenants see it too, not just existing ones who got the notification.
  // Also tax-exclusive, same convention as priceMonthlyUsd/priceYearlyUsd.
  upcomingPriceMonthlyUsd: number | null;
  monthlyPriceEffectiveAt: string | null;
  upcomingPriceYearlyUsd: number | null;
  yearlyPriceEffectiveAt: string | null;
  overagePerDocumentUsd: number | null;
}

// Verified against: ../comprobify/src/routes/tiers.routes.js → GET /v1/tiers (public, no auth, no rate limit)
export async function listTiers(): Promise<ApiTierInfo[]> {
  const result = await publicRequest<{ ok: true; tiers: ApiTierInfo[] }>('/v1/tiers');
  return result.tiers;
}
