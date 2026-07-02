import { ApiError, ProblemDetails } from './errors';

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
  tenantId: number;
  issuerId: number;
  apiKey: string;
  isEmailVerified: boolean;
}

export async function registerTenant(
  email: string,
  fields: IssuerRegistrationFields,
  p12Buffer: Buffer,
  p12Password: string,
  termsVersion: string,
  verificationRedirectUrl?: string,
  logoBuffer?: Buffer,
  logoType?: string,
): Promise<RegisterTenantResult> {
  const form = new FormData();
  form.append('email', email);
  form.append('termsVersion', termsVersion);
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
    tenant: { id: number; email: string; status: string };
    issuer: { id: number; ruc: string };
    apiKey: string;
  }>('/v1/register', { method: 'POST', body: form });

  return {
    tenantId: Number(result.tenant.id),
    issuerId: Number(result.issuer.id),
    apiKey: result.apiKey,
    isEmailVerified: result.tenant.status === 'ACTIVE',
  };
}

export async function verifyEmailToken(token: string): Promise<{ email: string }> {
  const data = await publicRequest<{ ok: true; email: string }>(
    `/v1/verify-email?token=${encodeURIComponent(token)}`,
  );
  return { email: data.email };
}

export async function resendVerificationEmail(
  email: string,
  verificationRedirectUrl?: string,
): Promise<void> {
  await publicRequest('/v1/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
export interface ApiTierInfo {
  name: 'FREE' | 'STARTER' | 'GROWTH' | 'BUSINESS';
  documentQuota: number;
  maxBranches: number | null;
  maxIssuePointsPerBranch: number | null;
  maxWebhookEndpoints: number;
  writeRateLimit: number;
  readRateLimit: number;
  allowedDocumentTypes: string[];
  priceMonthlyUsd: number;
  priceYearlyUsd: number;
  overagePerDocumentUsd: number | null;
}

// Verified against: ../comprobify/src/routes/tiers.routes.js → GET /v1/tiers (public, no auth, no rate limit)
export async function listTiers(): Promise<ApiTierInfo[]> {
  const result = await publicRequest<{ ok: true; tiers: ApiTierInfo[] }>('/v1/tiers');
  return result.tiers;
}
