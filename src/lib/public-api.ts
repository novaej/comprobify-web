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
  // Required, not optional — comprobify's ADR-035 made this a required field
  // on POST /v1/register (no more API-hosted verification page to fall back
  // to), and the endpoint itself is now only reachable via
  // X-Internal-Service-Secret (see buildClientForwardingHeaders), never a
  // direct third-party caller.
  verificationRedirectUrl: string,
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
  form.append('verificationRedirectUrl', verificationRedirectUrl);

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
// (both cases are 200). The `alreadyLinked` branch is a third, real-match outcome —
// see recoverAccount()'s `alreadyLinked` param below — that also carries no
// tenant/issuer/apiKey/environment, since the API deliberately did nothing to fetch.
export type RecoverAccountResult =
  | { matched: false }
  | { matched: true; alreadyLinked: true }
  | {
      matched: true;
      alreadyLinked: false;
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
  // Caller-computed hint (comprobify-web checks its own local User table
  // before ever calling this) — never a security boundary, since the API
  // only ever consults it *after* its own email+cert match succeeds (see
  // comprobify's registration.service.js). true tells the API this tenant is
  // already linked to a comprobify-web account locally, so there's nothing
  // to recover: it skips rotating the tenant's key and skips forcing
  // re-verification, both of which would otherwise be a disruptive,
  // unrequested side effect on an account that already works fine.
  alreadyLinked: boolean,
  clientHeaders?: ClientForwardingInfo,
): Promise<RecoverAccountResult> {
  const form = new FormData();
  form.append('email', email);
  form.append('certPassword', p12Password);
  // Only comprobify-web ever calls this endpoint — the recovered key always
  // becomes comprobify-web's own operational key (either replacing a stale
  // local master-key row, or seeding a brand-new tenant link), never a raw
  // credential handed to a human. `reserved` tells the API to mint it
  // excluded from the tenant's own self-service GET /v1/keys listing/budget,
  // same as every other key comprobify-web mints for itself. Sent as a
  // string since this is a multipart body (Common Mistake #25).
  form.append('reserved', 'true');
  form.append('alreadyLinked', alreadyLinked ? 'true' : 'false');

  const buf = p12Buffer.buffer.slice(
    p12Buffer.byteOffset,
    p12Buffer.byteOffset + p12Buffer.byteLength,
  ) as ArrayBuffer;
  form.append('cert', new Blob([buf], { type: 'application/x-pkcs12' }), 'cert.p12');

  const result = await publicRequest<{
    ok: true;
    message?: string;
    matched?: boolean;
    alreadyLinked?: boolean;
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

  if (result.alreadyLinked) {
    return { matched: true, alreadyLinked: true };
  }

  if (!result.apiKey || !result.tenant || !result.issuer || !result.environment) {
    return { matched: false };
  }

  return {
    matched: true,
    alreadyLinked: false,
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
// never trigger it. Call this only from an explicit user click. Gated behind
// X-Internal-Service-Secret on the API side (comprobify's ADR-035, same as
// register/recover/resend-verification) — a missing/wrong secret now fails
// with 403 INTERNAL_SERVICE_ONLY instead of activating the account.
export async function confirmEmailVerification(token: string): Promise<{ email: string }> {
  const data = await publicRequest<{ ok: true; email: string }>('/v1/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildClientForwardingHeaders({}) },
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
// and ../comprobify/src/routes/agreements.routes.js → GET /v1/agreements (no tenant auth,
// but frontend-only since comprobify 6f6e7df — requireInternalService, so the secret is required)
export interface ApiAgreementInfo {
  documentType: 'TERMS' | 'PRIVACY' | 'DPA';
  version: string;
  url: string;
}

export async function listAgreements(): Promise<ApiAgreementInfo[]> {
  const result = await publicRequest<{ ok: true; documents: ApiAgreementInfo[] }>('/v1/agreements', {
    headers: buildClientForwardingHeaders({}),
  });
  return result.documents;
}

// Verified against: ../comprobify/src/controllers/tiers.controller.js → list()
// priceMonthlyUsd/priceYearlyUsd are the advertised, tax-EXCLUSIVE sticker
// price — matches how every local competitor publishes theirs (IVA added at
// checkout, not baked into the listed number). *Iva is the IVA portion on
// top; *Total is the IVA-inclusive sum of the two. Every *advertised* price
// display on this site (tier cards, change-plan/subscribe confirm previews,
// the extra-seat price) shows priceMonthlyUsd/priceYearlyUsd (the base) with
// a "+ IVA"/"+ VAT" note — see resolveTierTotal()/resolveSeatBasePrice() in
// subscription-tiers.ts — never the *Total fields; *Total exists for
// completeness (it's what breakdownAmount() on the API side actually derives
// this same base into) but has no current display call site. A real, already-
// charged payment amount (ApiPaymentInfo.total_amount) is a different,
// legitimately-inclusive number and is unaffected by this. Either price can
// be null when the tier doesn't sell that interval (e.g. SOLO is yearly-only
// — see billingIntervals). This flipped from an IVA-inclusive convention in
// API commit f3d2e83 — see CLAUDE.md Common Mistake #59 for that history, and
// #62 for the later switch back to showing the base price on this side.
export interface ApiTierInfo {
  name: 'FREE' | 'SOLO' | 'LITE' | 'STARTER' | 'GROWTH' | 'BUSINESS' | 'ENTERPRISE';
  // null means genuinely unlimited (ENTERPRISE — comprobify migration 094).
  documentQuota: number | null;
  maxBranches: number | null;
  maxIssuePointsPerBranch: number | null;
  maxWebhookEndpoints: number;
  // API-enforced (comprobify checks this at key-creation time) — see
  // limitScopes/ADR-031 below.
  maxApiKeys: number | null;
  // WEB-enforced only — comprobify has no users/session concept at all, so
  // this cap exists purely for comprobify-web's own dashboard seat count.
  // See src/lib/tenant-limits.ts and CLAUDE.md's "Extra user seats" section.
  maxUsers: number | null;
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

// ADR-031 — classifies every TIERS[tier] key by who enforces it. Currently
// informational only on this side (nothing branches on it yet — the actual
// enforcement split is hardcoded independently: comprobify checks maxApiKeys
// server-side, comprobify-web checks maxUsers in src/lib/tenant-limits.ts),
// but typed so the response shape stays fully accounted for (see CLAUDE.md
// Common Mistake #58 — an unused field is still a rule-15 gap if untyped).
export type TierLimitScope = 'API' | 'WEB';
export type TierLimitScopes = Record<string, TierLimitScope>;

// The extra-seat add-on's price (ADR-032) — flat across every tier, so this
// is a single top-level block, not per-tier. Same shape/conventions as a
// tier's own price block above, minus billingIntervals (the add-on always
// sells both — see db/migrations/095_extra_user_seats.sql's seed).
export interface ApiExtraSeatPricing {
  priceMonthlyUsd: number | null;
  priceMonthlyUsdIva: number | null;
  priceMonthlyUsdTotal: number | null;
  priceYearlyUsd: number | null;
  priceYearlyUsdIva: number | null;
  priceYearlyUsdTotal: number | null;
  upcomingPriceMonthlyUsd: number | null;
  monthlyPriceEffectiveAt: string | null;
  upcomingPriceYearlyUsd: number | null;
  yearlyPriceEffectiveAt: string | null;
}

// Verified against: ../comprobify/src/controllers/tiers.controller.js → list()
// GET /v1/tiers (public, no auth, no rate limit). Returns
// { ok, ivaRate, limitScopes, tiers, extraSeat } — comprobify-web's own
// internal keys/webhook endpoint no longer add reserved headroom on top of
// maxApiKeys/maxWebhookEndpoints (comprobify migration 102: they're minted
// `is_reserved` through the admin-gated path instead and excluded from the
// tenant's own pool entirely), so there's no separate "reserved" allowance
// left to publish here — a tenant's own limit.max on GET /v1/keys or
// GET /v1/webhooks already equals maxApiKeys/maxWebhookEndpoints exactly.
export async function listTiers(): Promise<{
  tiers: ApiTierInfo[];
  extraSeat: ApiExtraSeatPricing;
  limitScopes: TierLimitScopes;
}> {
  const result = await publicRequest<{
    ok: true;
    ivaRate: number;
    limitScopes: TierLimitScopes;
    tiers: ApiTierInfo[];
    extraSeat: ApiExtraSeatPricing;
  }>('/v1/tiers');
  return {
    tiers: result.tiers,
    extraSeat: result.extraSeat,
    limitScopes: result.limitScopes,
  };
}
