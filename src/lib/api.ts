import 'server-only';
import { ApiError, ProblemDetails } from './errors';

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORTANT — READ BEFORE ADDING OR MODIFYING ANY FUNCTION
//
// 1. VERIFY EVERY INTERFACE AGAINST THE ACTUAL API SOURCE.
//    Types here are hand-maintained — there is no code generation. Before adding
//    or changing any function:
//      a. Confirm the route in  ../comprobify/src/routes/
//      b. Read the controller's res.json() call in ../comprobify/src/controllers/
//      c. Follow every service/presenter function it calls and trace each field
//         back to what is literally returned — do not infer from function names.
//    Past bugs were 100% caused by interfaces written against assumed shapes.
//
// 2. ID FIELDS ARE ALWAYS JSON STRINGS (bigint-as-string trap).
//    PostgreSQL BIGSERIAL/BIGINT columns are serialized as JS strings by pg,
//    then sent as JSON strings by Express. Every `id` from the API arrives as
//    the string "42", not the number 42. Consequences:
//      • Type id fields as `string` in interfaces (e.g. `id: string`).
//      • Apply Number(record.id) at every Prisma Int write site.
//    Forgetting this produces a Prisma type error or a silent NaN in the DB.
//
// 3. POST RESPONSES OFTEN OMIT THE RECORD ID.
//    Several endpoints return only a token or minimal payload on creation. If
//    you need the id for later operations, make a follow-up GET with the new
//    token and read the id from the list result (see createTenantApiKey below).
//
// 4. ADD A VERIFICATION COMMENT TO EVERY FUNCTION.
//    Format: // Verified against: ../comprobify/src/controllers/X.controller.js → method()
//
// Full step-by-step guide: docs/guides/coding-guidelines.md → "Adding a new API endpoint call"
// ═══════════════════════════════════════════════════════════════════════════════

// ── Context ───────────────────────────────────────────────────────────────────

export interface ApiCtx {
  apiKey: string;
  issuerId?: number; // API-side issuer id; added as X-Issuer-Id when present
}

// ── Document types ────────────────────────────────────────────────────────────

export type DocumentStatus =
  | 'SIGNED'
  | 'RECEIVED'
  | 'AUTHORIZED'
  | 'RETURNED'
  | 'NOT_AUTHORIZED';

export type EmailStatus =
  | 'PENDING'
  | 'SENT'
  | 'FAILED'
  | 'SKIPPED'
  | 'DELIVERED'
  | 'COMPLAINED';

export interface Document {
  accessKey: string;
  documentType: string;
  sequential: string;
  status: DocumentStatus;
  issueDate: string;
  total: string;
  buyer: {
    id: string;
    idType: string;
    name: string;
    email: string;
  };
  authorizationNumber?: string;
  authorizationDate?: string;
  email: {
    status: EmailStatus;
    sentAt?: string;
    error?: string;
  };
}

export interface DocumentEvent {
  id: number;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListDocumentsResult {
  data: Document[];
  pagination: Pagination;
}

export interface ListDocumentsParams {
  status?: DocumentStatus;
  from?: string;
  to?: string;
  documentType?: string;
  page?: number;
  limit?: number;
}

// ── Catalog types ─────────────────────────────────────────────────────────────

export interface CatalogIdType {
  code: string;
  description: string;
}

export interface CatalogPaymentMethod {
  code: string;
  description: string;
}

export interface CatalogTaxRate {
  taxCode: string;
  rateCode: string;
  description: string;
  rate: string | number;
}

export interface CatalogTermUnit {
  code: string;
  description: string;
}

export interface InvoiceTax {
  code: string;
  rateCode: string;
  rate: string;
}

export interface InvoiceItem {
  mainCode: string;
  auxCode?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount?: string;
  taxes: InvoiceTax[];
}

export interface InvoicePayment {
  method: string;
  total: string;
  term?: number;
  termUnit?: string;
}

export interface CreateDocumentPayload {
  documentType: '01';
  issueDate?: string;
  guiaRemision?: string;
  buyer: {
    idType: string;
    id: string;
    name: string;
    email: string;
    address?: string;
  };
  items: InvoiceItem[];
  payments: InvoicePayment[];
  additionalInfo?: Array<{ name: string; value: string }>;
}

// ── Issuer types ──────────────────────────────────────────────────────────────

// Verified against: ../comprobify/src/services/issuer.service.js → listIssuers()
export interface ApiIssuer {
  id: string;           // bigint → serialized as string by pg/JSON
  ruc: string;
  businessName: string;
  tradeName: string | null;
  branchCode: string;
  issuePointCode: string;
  branchAddress: string | null;
  certFingerprint: string | null;
  certExpiry: string | null;
}

export interface CreateIssuerFields {
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
}

// ── API key types ─────────────────────────────────────────────────────────────

// Shape returned by GET /v1/keys (the API serializes bigint id as a JSON string).
export interface ApiKeyInfo {
  id: string;           // bigint → serialized as string by pg/JSON
  label: string | null;
  environment: string;
  active: boolean;      // field is 'active', not 'isActive'
  createdAt: string;
  revokedAt: string | null;
}

// Normalized shape returned by createTenantApiKey (id already coerced to number).
export interface CreatedApiKey {
  id: number;
  label: string;
  environment: string;
  key: string;
}

// ── HTTP client ───────────────────────────────────────────────────────────────

function getApiUrl(): string {
  const apiUrl = process.env.COMPROBIFY_API_URL;
  if (!apiUrl) throw new Error('COMPROBIFY_API_URL is not set');
  return apiUrl;
}

async function request<T>(
  path: string,
  ctx: ApiCtx,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ctx.apiKey}`,
  };
  if (ctx.issuerId !== undefined) {
    headers['X-Issuer-Id'] = String(ctx.issuerId);
  }

  const res = await fetch(`${getApiUrl()}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  });

  if (!res.ok) {
    const problem: ProblemDetails = await res.json();
    throw new ApiError(problem);
  }

  return res.json() as Promise<T>;
}

// ── Document functions ────────────────────────────────────────────────────────

export async function listDocuments(
  ctx: ApiCtx,
  params: ListDocumentsParams = {}
): Promise<ListDocumentsResult> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.documentType) qs.set('documentType', params.documentType);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));

  const query = qs.toString();
  return request<ListDocumentsResult>(`/v1/documents${query ? `?${query}` : ''}`, ctx);
}

export async function getDocument(ctx: ApiCtx, accessKey: string): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/v1/documents/${accessKey}`,
    ctx,
  );
  return result.document;
}

export async function createDocument(
  ctx: ApiCtx,
  payload: CreateDocumentPayload,
  idempotencyKey?: string
): Promise<{ document: Document; created: boolean }> {
  const extraHeaders: Record<string, string> = {};
  if (idempotencyKey) extraHeaders['Idempotency-Key'] = idempotencyKey;

  const result = await request<{ ok: true; document: Document }>(
    '/v1/documents',
    ctx,
    { method: 'POST', body: JSON.stringify(payload), headers: extraHeaders }
  );
  return { document: result.document, created: true };
}

export async function sendToSri(ctx: ApiCtx, accessKey: string): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/v1/documents/${accessKey}/send`,
    ctx,
    { method: 'POST' }
  );
  return result.document;
}

export async function checkAuthorization(ctx: ApiCtx, accessKey: string): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/v1/documents/${accessKey}/authorize`,
    ctx,
  );
  return result.document;
}

export async function rebuildDocument(
  ctx: ApiCtx,
  accessKey: string,
  payload: CreateDocumentPayload
): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/v1/documents/${accessKey}/rebuild`,
    ctx,
    { method: 'POST', body: JSON.stringify(payload) }
  );
  return result.document;
}

export async function getDocumentEvents(
  ctx: ApiCtx,
  accessKey: string
): Promise<DocumentEvent[]> {
  const result = await request<{ ok: true; events: DocumentEvent[] }>(
    `/v1/documents/${accessKey}/events`,
    ctx,
  );
  return result.events;
}

export async function retrySingleEmail(
  ctx: ApiCtx,
  accessKey: string,
  force = false
): Promise<void> {
  await request(
    `/v1/documents/${accessKey}/email-retry${force ? '?force=true' : ''}`,
    ctx,
    { method: 'POST' },
  );
}

// ── Catalog functions ─────────────────────────────────────────────────────────

export async function listCatalogIdTypes(ctx: ApiCtx): Promise<CatalogIdType[]> {
  const result = await request<{ ok: true; idTypes: CatalogIdType[] }>(
    '/v1/catalogs/id-types',
    ctx,
  );
  return result.idTypes;
}

export async function listCatalogPaymentMethods(ctx: ApiCtx): Promise<CatalogPaymentMethod[]> {
  const result = await request<{ ok: true; paymentMethods: CatalogPaymentMethod[] }>(
    '/v1/catalogs/payment-methods',
    ctx,
  );
  return result.paymentMethods;
}

export async function listCatalogTaxRates(ctx: ApiCtx): Promise<CatalogTaxRate[]> {
  const result = await request<{ ok: true; taxRates: CatalogTaxRate[] }>(
    '/v1/catalogs/tax-rates',
    ctx,
  );
  return result.taxRates;
}

export async function listCatalogTermUnits(ctx: ApiCtx): Promise<CatalogTermUnit[]> {
  const result = await request<{ ok: true; termUnits: CatalogTermUnit[] }>(
    '/v1/catalogs/term-units',
    ctx,
  );
  return result.termUnits;
}

// ── Issuer functions ──────────────────────────────────────────────────────────

export async function listTenantIssuers(ctx: ApiCtx): Promise<ApiIssuer[]> {
  const result = await request<{ ok: true; issuers: ApiIssuer[] }>(
    '/v1/issuers',
    { apiKey: ctx.apiKey },
  );
  return result.issuers;
}

export async function createIssuer(
  ctx: ApiCtx,
  fields: CreateIssuerFields,
  p12?: Buffer,
  p12Password?: string,
): Promise<ApiIssuer> {
  const form = new FormData();
  form.append('ruc', fields.ruc);
  form.append('businessName', fields.businessName);
  if (fields.tradeName) form.append('tradeName', fields.tradeName);
  if (fields.mainAddress) form.append('mainAddress', fields.mainAddress);
  form.append('branchCode', fields.branchCode);
  form.append('issuePointCode', fields.issuePointCode);
  form.append('emissionType', fields.emissionType);
  form.append('requiredAccounting', fields.requiredAccounting ? 'true' : 'false');
  if (fields.documentTypes?.length) {
    form.append('documentTypes', JSON.stringify(fields.documentTypes));
  }
  if (fields.initialSequentials?.length) {
    form.append('initialSequentials', JSON.stringify(fields.initialSequentials));
  }
  if (p12 && p12Password) {
    form.append('certPassword', p12Password);
    const buf = p12.buffer.slice(p12.byteOffset, p12.byteOffset + p12.byteLength) as ArrayBuffer;
    form.append('cert', new Blob([buf], { type: 'application/x-pkcs12' }), 'cert.p12');
  }

  const res = await fetch(`${getApiUrl()}/v1/issuers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ctx.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const problem: ProblemDetails = await res.json();
    throw new ApiError(problem);
  }
  const data = await res.json() as { ok: true; issuer: ApiIssuer };
  return data.issuer;
}

export async function listIssuerDocumentTypes(ctx: ApiCtx, issuerId: number): Promise<string[]> {
  const result = await request<{ ok: true; documentTypes: string[] }>(
    `/v1/issuers/${issuerId}/document-types`,
    { apiKey: ctx.apiKey },
  );
  return result.documentTypes;
}

export async function addIssuerDocumentType(
  ctx: ApiCtx,
  issuerId: number,
  code: string,
): Promise<void> {
  await request(
    `/v1/issuers/${issuerId}/document-types`,
    { apiKey: ctx.apiKey },
    { method: 'POST', body: JSON.stringify({ code }) },
  );
}

export async function removeIssuerDocumentType(
  ctx: ApiCtx,
  issuerId: number,
  code: string,
): Promise<void> {
  await request(
    `/v1/issuers/${issuerId}/document-types/${code}`,
    { apiKey: ctx.apiKey },
    { method: 'DELETE' },
  );
}

// Verified against: ../comprobify/src/controllers/issuer.controller.js → uploadLogo()
// and ../comprobify/src/routes/issuers.routes.js → PATCH /:id/logo (multer 'logo' field,
// 500KB limit, PNG/JPEG/GIF only). Returns { ok: true } with no body data.
export async function uploadIssuerLogo(
  ctx: ApiCtx,
  issuerId: number,
  logo: Buffer,
  mimeType: string,
): Promise<void> {
  const form = new FormData();
  const buf = logo.buffer.slice(logo.byteOffset, logo.byteOffset + logo.byteLength) as ArrayBuffer;
  form.append('logo', new Blob([buf], { type: mimeType }), 'logo');

  const res = await fetch(`${getApiUrl()}/v1/issuers/${issuerId}/logo`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${ctx.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const problem: ProblemDetails = await res.json();
    throw new ApiError(problem);
  }
}

// ── Current tenant identity ────────────────────────────────────────────────────

// Verified against: ../comprobify/src/controllers/tenant.controller.js → getMe()
// and ../comprobify/src/middleware/authenticate.js (sets req.tenant from the key).
export interface ApiTenantInfo {
  id: string;              // bigint (api_keys.tenant_id) → serialized as string by pg/JSON
  email: string;
  subscriptionTier: string;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';
  documentCount: string;   // bigint → serialized as string by pg/JSON
  documentQuota: number;   // regular int column
  sandbox: boolean;
}

// Verified against: ../comprobify/src/routes/tenants.routes.js → GET /v1/tenants/me
export async function getCurrentTenant(ctx: ApiCtx): Promise<ApiTenantInfo> {
  const result = await request<{ ok: true; tenant: ApiTenantInfo }>(
    '/v1/tenants/me',
    { apiKey: ctx.apiKey },
  );
  return result.tenant;
}

// ── Tenant promotion ──────────────────────────────────────────────────────────

export interface PromoteTenantResult {
  ok: true;
  // The API returns { label, apiKey } per key — no id, no environment.
  // Callers must fetch GET /v1/keys with one of these tokens to obtain the
  // API-side key IDs needed for future revocation.
  apiKeys: Array<{ label: string; apiKey: string }>;
}

export async function promoteTenant(
  ctx: ApiCtx,
  initialSequentials?: Array<{ issuerId: number; documentType: string; sequential: number }>,
): Promise<PromoteTenantResult> {
  return request<PromoteTenantResult>(
    '/v1/tenants/promote',
    { apiKey: ctx.apiKey },
    { method: 'POST', body: JSON.stringify({ initialSequentials: initialSequentials ?? [] }) },
  );
}

// Verified against: src/routes/tenants.routes.js → PATCH /v1/tenants/language
export async function updateTenantLanguage(ctx: ApiCtx, language: string): Promise<void> {
  await request<{ ok: true }>(
    '/v1/tenants/language',
    { apiKey: ctx.apiKey },
    { method: 'PATCH', body: JSON.stringify({ language }) },
  );
}

// ── API key management ────────────────────────────────────────────────────────

export async function listTenantApiKeys(ctx: ApiCtx): Promise<ApiKeyInfo[]> {
  const result = await request<{ ok: true; keys: ApiKeyInfo[] }>(
    '/v1/keys',
    { apiKey: ctx.apiKey },
  );
  return result.keys;
}

export async function createTenantApiKey(
  ctx: ApiCtx,
  label: string,
  environment?: 'sandbox' | 'production',
): Promise<CreatedApiKey> {
  // POST /v1/keys returns only the plain token string, not the key's id/label.
  const createResult = await request<{ ok: true; apiKey: string }>(
    '/v1/keys',
    ctx,
    { method: 'POST', body: JSON.stringify({ label, environment }) },
  );
  const plainKey = createResult.apiKey;

  // Authenticate with the new token to fetch its metadata (id, label, environment).
  // Keys are ordered newest-first so [0] is the one we just created.
  const listResult = await request<{ ok: true; keys: ApiKeyInfo[] }>(
    '/v1/keys',
    { apiKey: plainKey },
  );
  const keyRecord = listResult.keys[0];
  if (!keyRecord) throw new Error('KEY_METADATA_MISSING');

  return {
    id: Number(keyRecord.id),
    label: keyRecord.label ?? label,
    environment: keyRecord.environment,
    key: plainKey,
  };
}

export async function revokeTenantApiKey(ctx: ApiCtx, id: number): Promise<void> {
  await request(
    `/v1/keys/${id}`,
    { apiKey: ctx.apiKey },
    { method: 'DELETE' },
  );
}

// ── Notification types ────────────────────────────────────────────────────────

// Verified against: ../comprobify/src/models/notification.model.js + docs/site/endpoints/notifications.md
export interface ApiNotification {
  id: string;           // BIGSERIAL → JSON string
  type: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  issuerId: string | null;  // BIGSERIAL → JSON string or null
  readAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface NotificationPreference {
  type: string;
  enabled: boolean;
}

// ── Notification functions ────────────────────────────────────────────────────

// Verified against: docs/site/endpoints/notifications.md → GET /v1/notifications
export async function listNotifications(
  ctx: ApiCtx,
  sinceId?: string,
): Promise<{ notifications: ApiNotification[]; unreadCount: number }> {
  const qs = sinceId ? `?sinceId=${sinceId}` : '';
  return request<{ notifications: ApiNotification[]; unreadCount: number }>(
    `/v1/notifications${qs}`,
    { apiKey: ctx.apiKey },
  );
}

// Verified against: docs/site/endpoints/notifications.md → POST /v1/notifications/:id/read
export async function markNotificationRead(ctx: ApiCtx, id: string): Promise<ApiNotification> {
  const result = await request<{ notification: ApiNotification }>(
    `/v1/notifications/${id}/read`,
    { apiKey: ctx.apiKey },
    { method: 'POST' },
  );
  return result.notification;
}

// Verified against: docs/site/endpoints/notifications.md → GET /v1/notifications/preferences
export async function getNotificationPreferences(ctx: ApiCtx): Promise<NotificationPreference[]> {
  const result = await request<{ preferences: NotificationPreference[] }>(
    '/v1/notifications/preferences',
    { apiKey: ctx.apiKey },
  );
  return result.preferences;
}

// Verified against: docs/site/endpoints/notifications.md → PATCH /v1/notifications/preferences
export async function updateNotificationPreferences(
  ctx: ApiCtx,
  prefs: NotificationPreference[],
): Promise<NotificationPreference[]> {
  const result = await request<{ preferences: NotificationPreference[] }>(
    '/v1/notifications/preferences',
    { apiKey: ctx.apiKey },
    { method: 'PATCH', body: JSON.stringify(prefs) },
  );
  return result.preferences;
}

// ── Webhook endpoint types ────────────────────────────────────────────────────

// Verified against: docs/site/endpoints/webhooks.md → Webhook endpoint object
export interface ApiWebhookEndpoint {
  id: string;           // BIGSERIAL → JSON string
  url: string;
  eventTypes: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Webhook endpoint functions ────────────────────────────────────────────────

// Verified against: docs/site/endpoints/webhooks.md → POST /v1/webhooks
export async function registerWebhookEndpoint(
  ctx: ApiCtx,
  url: string,
  eventTypes?: string[],
): Promise<{ endpoint: ApiWebhookEndpoint; secret: string }> {
  const result = await request<{ ok: true; endpoint: ApiWebhookEndpoint; secret: string }>(
    '/v1/webhooks',
    { apiKey: ctx.apiKey },
    { method: 'POST', body: JSON.stringify({ url, eventTypes }) },
  );
  return { endpoint: result.endpoint, secret: result.secret };
}

// Verified against: docs/site/endpoints/webhooks.md → GET /v1/webhooks
export async function listWebhookEndpoints(ctx: ApiCtx): Promise<ApiWebhookEndpoint[]> {
  const result = await request<{ ok: true; endpoints: ApiWebhookEndpoint[] }>(
    '/v1/webhooks',
    { apiKey: ctx.apiKey },
  );
  return result.endpoints;
}

// Verified against: docs/site/endpoints/webhooks.md → PATCH /v1/webhooks/:id
export async function updateWebhookEndpoint(
  ctx: ApiCtx,
  id: string,
  data: { url?: string; eventTypes?: string[]; active?: boolean },
): Promise<ApiWebhookEndpoint> {
  const result = await request<{ ok: true; endpoint: ApiWebhookEndpoint }>(
    `/v1/webhooks/${id}`,
    { apiKey: ctx.apiKey },
    { method: 'PATCH', body: JSON.stringify(data) },
  );
  return result.endpoint;
}

// Verified against: docs/site/endpoints/webhooks.md → DELETE /v1/webhooks/:id
export async function deleteWebhookEndpoint(ctx: ApiCtx, id: string): Promise<void> {
  await request(
    `/v1/webhooks/${id}`,
    { apiKey: ctx.apiKey },
    { method: 'DELETE' },
  );
}
