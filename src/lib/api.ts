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

export const DOCUMENT_STATUSES = [
  'SIGNED',
  'PENDING_SEND',
  'RECEIVED',
  'AUTHORIZED',
  'RETURNED',
  'NOT_AUTHORIZED',
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

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
  // Present whenever the document has one (every document created since request_payload was
  // added) — the exact original create/rebuild body, used to pre-fill the rebuild form.
  requestPayload?: CreateDocumentPayload;
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

// Verified against: ../comprobify/src/services/sri.service.js → parseMessages()
export interface SriResponseMessage {
  identifier: string | null;
  message: string | null;
  additionalInfo: string | null;
  type: string | null;
}

// Verified against: ../comprobify/src/controllers/documents.controller.js → getSriResponses()
// and ../comprobify/src/services/document-query.service.js → getSriResponses()
export interface SriResponse {
  operationType: string; // 'RECEPTION' | 'AUTHORIZATION'
  status: string;
  messages: SriResponseMessage[] | null;
  createdAt: string;
}

// Verified against: ../comprobify/src/models/document.model.js → findByIssuerId()
// The API returns only { total, page, limit } — no totalPages field. Derive it
// client-side (see DocumentPagination's getTotalPages) rather than re-adding it here.
export interface Pagination {
  page: number;
  limit: number;
  total: number;
}

export interface ListDocumentsResult {
  data: Document[];
  pagination: Pagination;
}

export const DOCUMENT_SORT_FIELDS = ['sequential', 'buyerName', 'issueDate', 'status'] as const;
export type DocumentSortField = (typeof DOCUMENT_SORT_FIELDS)[number];

export interface ListDocumentsParams {
  status?: DocumentStatus;
  from?: string;
  to?: string;
  documentType?: string;
  page?: number;
  limit?: number;
  sequential?: string; // contains-match
  buyerName?: string; // contains-match
  sortBy?: DocumentSortField;
  sortDir?: 'asc' | 'desc';
}

export interface DocumentTypeStat {
  type: string; // short label, e.g. 'FAC', 'CRE' — see cat_document_types.short_name
  issued: number;
  authorizedTotal: string; // decimal string, sum of `total` for AUTHORIZED documents
}

export interface DocumentStats {
  thisMonth: {
    byType: DocumentTypeStat[];
  };
  needsAttention: number; // all-time count of RETURNED + NOT_AUTHORIZED documents
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

export interface CreateInvoicePayload {
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

// Verified against: ../comprobify/src/validators/credit-note.validator.js and
// ../comprobify/src/builders/credit-note.builder.js. No `payments` block — credit
// notes instead require `originalDocument` (the document being credited) and `motivo`.
// Item/tax shape is identical to invoices (mainCode/auxCode naming confirmed in
// credit-note.builder.js's buildDetalles(), not `auxiliaryCode` as the docs site
// example shows — see CLAUDE.md Common Mistake #15/25 on trusting docs over source).
export interface CreateCreditNotePayload {
  documentType: '04';
  issueDate?: string;
  buyer: {
    idType: string;
    id: string;
    name: string;
    email: string;
    address?: string;
  };
  originalDocument: {
    documentType: string;
    number: string; // NNN-NNN-NNNNNNNNN
    issueDate: string; // DD/MM/YYYY
  };
  motivo: string;
  items: InvoiceItem[];
  additionalInfo?: Array<{ name: string; value: string }>;
}

export type CreateDocumentPayload = CreateInvoicePayload | CreateCreditNotePayload;

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

// Verified against: ../comprobify/src/validators/issuer.validator.js → createBranch
export interface CreateIssuerFields {
  sourceIssuerId?: number;
  branchCode: string;
  issuePointCode: string;
  branchAddress?: string;
  documentTypes?: string[];
  initialSequentials?: { documentType: string; sequential: number }[];
}

// Verified against: ../comprobify/src/services/sequential.service.js → getCounters()
export interface ApiIssuerSequential {
  documentType: string;
  sandbox: { current: number; next: number };
  production: { current: number; next: number };
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

// Verified against: ../comprobify/src/validators/common.validator.js → listDocumentsQuery
// and ../comprobify/src/models/document.model.js → findByIssuerId() (sortBy/sortDir/sequential/buyerName)
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
  if (params.sequential) qs.set('sequential', params.sequential);
  if (params.buyerName) qs.set('buyerName', params.buyerName);
  if (params.sortBy) qs.set('sortBy', params.sortBy);
  if (params.sortDir) qs.set('sortDir', params.sortDir);

  const query = qs.toString();
  return request<ListDocumentsResult>(`/v1/documents${query ? `?${query}` : ''}`, ctx);
}

// Verified against: ../comprobify/src/controllers/documents.controller.js → getStats()
export async function getDocumentStats(ctx: ApiCtx): Promise<DocumentStats> {
  const result = await request<{ ok: true; stats: DocumentStats }>('/v1/documents/stats', ctx);
  return result.stats;
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

// Async since ADR-019 (RabbitMQ worker) — this only queues the SRI submission and
// returns 202 with status PENDING_SEND. It never returns RECEIVED/RETURNED itself;
// poll getDocument() for the real outcome.
export async function sendToSri(ctx: ApiCtx, accessKey: string): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/v1/documents/${accessKey}/send`,
    ctx,
    { method: 'POST' }
  );
  return result.document;
}

// Async since ADR-019 (RabbitMQ worker) — this only queues the authorization check
// and returns 202 with status unchanged (still RECEIVED). It never returns
// AUTHORIZED/NOT_AUTHORIZED itself; poll getDocument() for the real outcome.
export async function checkAuthorization(ctx: ApiCtx, accessKey: string): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/v1/documents/${accessKey}/authorize`,
    ctx,
  );
  return result.document;
}

// Verified against: ../comprobify/src/controllers/documents.controller.js → rebuild()
// Only valid for RETURNED/NOT_AUTHORIZED documents (../comprobify/src/constants/document-state-machine.js);
// the access key and sequential are preserved, the document is re-signed back to SIGNED.
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

export async function getSriResponses(
  ctx: ApiCtx,
  accessKey: string
): Promise<SriResponse[]> {
  const result = await request<{ ok: true; sriResponses: SriResponse[] }>(
    `/v1/documents/${accessKey}/sri-responses`,
    ctx,
  );
  return result.sriResponses;
}

// Verified against: ../comprobify/src/controllers/documents.controller.js → getCreditNotes()
// and docs/site/endpoints/get-credit-notes.md. Only AUTHORIZED credit notes count toward
// creditedTotal — known limitation: no locking against concurrent credit note creation,
// so `remaining` is a UI guard, not a hard guarantee against over-crediting.
export interface CreditNoteAgainstDocument {
  accessKey: string;
  sequential: string;
  total: string;
  issueDate: string;
}

export interface CreditNotesBalance {
  originalDocument: { accessKey: string; total: string };
  creditedTotal: string;
  remaining: string;
  creditNotes: CreditNoteAgainstDocument[];
}

export async function getCreditNotesBalance(
  ctx: ApiCtx,
  accessKey: string
): Promise<CreditNotesBalance> {
  const result = await request<{ ok: true } & CreditNotesBalance>(
    `/v1/documents/${accessKey}/credit-notes`,
    ctx,
  );
  return result;
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
  if (fields.sourceIssuerId !== undefined) form.append('sourceIssuerId', String(fields.sourceIssuerId));
  form.append('branchCode', fields.branchCode);
  form.append('issuePointCode', fields.issuePointCode);
  if (fields.branchAddress) form.append('branchAddress', fields.branchAddress);
  if (fields.documentTypes?.length) {
    form.append('documentTypes', JSON.stringify(fields.documentTypes));
  }
  if (fields.initialSequentials?.length) {
    form.append('initialSequentials', JSON.stringify(fields.initialSequentials));
  }
  if (p12) {
    if (p12Password) form.append('certPassword', p12Password);
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

// Verified against: ../comprobify/src/controllers/issuer.controller.js → updateIssuer
export async function updateIssuer(
  ctx: ApiCtx,
  issuerId: number,
  fields: { tradeName?: string; branchAddress?: string },
): Promise<ApiIssuer> {
  const result = await request<{ ok: true; issuer: ApiIssuer }>(
    `/v1/issuers/${issuerId}`,
    { apiKey: ctx.apiKey },
    { method: 'PATCH', body: JSON.stringify(fields) },
  );
  return result.issuer;
}

// Verified against: ../comprobify/src/controllers/issuer.controller.js → removeIssuer
export async function removeIssuer(ctx: ApiCtx, issuerId: number): Promise<void> {
  await request(`/v1/issuers/${issuerId}`, { apiKey: ctx.apiKey }, { method: 'DELETE' });
}

// Verified against: ../comprobify/src/controllers/issuer.controller.js → activateIssuer
export async function activateIssuer(ctx: ApiCtx, issuerId: number): Promise<void> {
  await request(`/v1/issuers/${issuerId}/activate`, { apiKey: ctx.apiKey }, { method: 'PATCH' });
}

// Verified against: ../comprobify/src/services/sequential.service.js → getCounters()
export async function getIssuerSequentials(ctx: ApiCtx, issuerId: number): Promise<ApiIssuerSequential[]> {
  const result = await request<{ ok: true; sequentials: ApiIssuerSequential[] }>(
    `/v1/issuers/${issuerId}/sequentials`,
    { apiKey: ctx.apiKey },
  );
  return result.sequentials;
}

// Verified against: ../comprobify/src/services/sequential.service.js → setNext()
export async function setIssuerSequential(
  ctx: ApiCtx,
  issuerId: number,
  documentType: string,
  environment: 'sandbox' | 'production',
  nextSequential: number,
): Promise<void> {
  await request(
    `/v1/issuers/${issuerId}/sequentials/${documentType}`,
    { apiKey: ctx.apiKey },
    { method: 'PATCH', body: JSON.stringify({ environment, nextSequential }) },
  );
}

export async function listIssuerDocumentTypes(ctx: ApiCtx, issuerId: number): Promise<string[]> {
  const result = await request<{ ok: true; documentTypes: string[] }>(
    `/v1/issuers/${issuerId}/document-types`,
    { apiKey: ctx.apiKey },
  );
  return result.documentTypes;
}

// Verified against: ../comprobify/src/routes/issuers.routes.js → addDocumentTypeValidator
// (body field is `documentType`, not `code` — see CLAUDE.md Common Mistake #17).
export async function addIssuerDocumentType(
  ctx: ApiCtx,
  issuerId: number,
  code: string,
): Promise<void> {
  await request(
    `/v1/issuers/${issuerId}/document-types`,
    { apiKey: ctx.apiKey },
    { method: 'POST', body: JSON.stringify({ documentType: code }) },
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

// Verified against: ../comprobify/src/controllers/issuer.controller.js → renewCertificate()
// and ../comprobify/src/services/issuer.service.js → renewCertificate(). multer 'cert' field
// (see ../comprobify/src/routes/issuers.routes.js → PATCH /:id/certificate). Returns
// { ok: true, certFingerprint, certExpiry } — certExpiry is an ISO date string.
export async function renewIssuerCertificate(
  ctx: ApiCtx,
  issuerId: number,
  p12: Buffer,
  p12Password?: string,
): Promise<{ certFingerprint: string; certExpiry: string }> {
  const form = new FormData();
  const buf = p12.buffer.slice(p12.byteOffset, p12.byteOffset + p12.byteLength) as ArrayBuffer;
  form.append('cert', new Blob([buf], { type: 'application/x-pkcs12' }), 'cert.p12');
  if (p12Password) form.append('certPassword', p12Password);

  const res = await fetch(`${getApiUrl()}/v1/issuers/${issuerId}/certificate`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${ctx.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const problem: ProblemDetails = await res.json();
    throw new ApiError(problem);
  }
  const data = await res.json() as { ok: true; certFingerprint: string; certExpiry: string };
  return { certFingerprint: data.certFingerprint, certExpiry: data.certExpiry };
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
  agreementAcceptedAt: string | null;
  agreementVersion: string | null;
}

// Verified against: ../comprobify/src/routes/tenants.routes.js → GET /v1/tenants/me
export async function getCurrentTenant(ctx: ApiCtx): Promise<ApiTenantInfo> {
  const result = await request<{ ok: true; tenant: ApiTenantInfo }>(
    '/v1/tenants/me',
    { apiKey: ctx.apiKey },
  );
  return result.tenant;
}

// ── Tenant agreements ─────────────────────────────────────────────────────────

// Verified against: ../comprobify/src/controllers/tenant.controller.js → getAgreementStatus()
// and ../comprobify/src/services/tenant-agreement.service.js → getStatus()
export interface ApiOutdatedAgreement {
  documentType: 'TERMS' | 'PRIVACY' | 'DPA';
  currentVersion: string;
  acceptedVersion: string | null;
  status: 'PENDING' | 'NOT_GENERATED';
  url: string;
  acceptUrl: string;
}

export interface ApiAgreementStatus {
  needsAcceptance: boolean;
  outdated: ApiOutdatedAgreement[];
}

// Verified against: ../comprobify/src/routes/tenants.routes.js → GET /v1/tenants/agreements
export async function getAgreementStatus(ctx: ApiCtx): Promise<ApiAgreementStatus> {
  const result = await request<{ ok: true; agreements: ApiAgreementStatus }>(
    '/v1/tenants/agreements',
    { apiKey: ctx.apiKey },
  );
  return result.agreements;
}

// Verified against: ../comprobify/src/routes/tenants.routes.js → POST /v1/tenants/agreements
// clientHeaders.userAgent: forwarded from the incoming browser request so the API records
// the real browser UA rather than the Node fetch default. The BFF pattern means the actual
// outbound request originates from our server, not the browser, so we have to pass it explicitly.
export async function acceptAgreements(
  ctx: ApiCtx,
  termsVersion: string,
  clientHeaders?: { userAgent?: string },
): Promise<void> {
  const extraHeaders: Record<string, string> = {};
  if (clientHeaders?.userAgent) extraHeaders['User-Agent'] = clientHeaders.userAgent;
  await request<{ ok: true }>(
    '/v1/tenants/agreements',
    { apiKey: ctx.apiKey },
    { method: 'POST', body: JSON.stringify({ termsVersion }), headers: extraHeaders },
  );
}

// ── Tenant promotion ──────────────────────────────────────────────────────────

// The bank account a tenant wires their SPI transfer to. Static, env-configured
// on the API (src/config/index.js) — same for every tenant, never retrievable
// from any endpoint except this one-time promote response, so callers that need
// it later (e.g. the billing page) must cache it themselves.
export interface ApiBankTransferInfo {
  bankName: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
  identification: string;
}

// Verified against: ../comprobify/src/controllers/tenant.controller.js → promote()
// and ../comprobify/src/services/subscription.service.js → createSubscription() (subscription/payment/bankTransfer shape).
export interface PromoteTenantResult {
  ok: true;
  // The API returns { label, apiKey } per key — no id, no environment.
  // Callers must fetch GET /v1/keys with one of these tokens to obtain the
  // API-side key IDs needed for future revocation.
  apiKeys: Array<{ label: string; apiKey: string }>;
  // Only present when `tier` was supplied in the request.
  subscription?: {
    id: number;
    tier: 'STARTER' | 'GROWTH' | 'BUSINESS';
    status: string;
    billing_interval: 'MONTHLY' | 'YEARLY';
  };
  payment?: {
    id: number;
    status: string;
    amount: string; // numeric column → serialized as string by pg/JSON
  };
  bankTransfer?: ApiBankTransferInfo;
}

export async function promoteTenant(
  ctx: ApiCtx,
  initialSequentials?: Array<{ issuerId: number; documentType: string; sequential: number }>,
  tier?: 'STARTER' | 'GROWTH' | 'BUSINESS',
  billingInterval?: 'MONTHLY' | 'YEARLY',
): Promise<PromoteTenantResult> {
  return request<PromoteTenantResult>(
    '/v1/tenants/promote',
    { apiKey: ctx.apiKey },
    {
      method: 'POST',
      body: JSON.stringify({
        initialSequentials: initialSequentials ?? [],
        ...(tier && { tier }),
        ...(tier && billingInterval && { billingInterval }),
      }),
    },
  );
}

// ── Subscriptions & payments ──────────────────────────────────────────────────

// Verified against: ../comprobify/src/controllers/payment.controller.js → submitProof()
// and ../comprobify/src/models/payment.model.js (omitProofFile strips the raw bytes;
// purpose/target_tier added in migration 055, 'RENEWAL' purpose added in migration 056
// — SELECT * so they flow through as-is).
// Verified against: migration 065 (payments_iva) and ../comprobify/src/models/payment.model.js
// amount = base imponible (before IVA) for payments created after migration 065.
// total_amount = IVA-inclusive transfer amount (what the tenant actually wires).
// Old payments (before 065) have iva_rate/iva_amount/total_amount = null; in that
// case amount itself was the all-in total — use total_amount ?? amount for display.
export interface ApiPaymentInfo {
  id: number;
  subscription_id?: number;
  status: 'PENDING' | 'REPORTED' | 'VERIFIED' | 'REJECTED' | 'REFUNDED';
  amount: string;            // base imponible; numeric → string by pg/JSON
  iva_rate?: number | null;
  iva_amount?: string | null;
  total_amount?: string | null;  // IVA-inclusive total; use this for display
  method: 'SPI_TRANSFER';
  purpose?: 'INITIAL' | 'TIER_CHANGE' | 'RENEWAL';
  target_tier?: 'STARTER' | 'GROWTH' | 'BUSINESS' | null;
  target_billing_interval?: 'MONTHLY' | 'YEARLY' | null;
  rejection_reason_code?: 'AMOUNT_MISMATCH' | 'TRANSFER_NOT_FOUND' | 'WRONG_ACCOUNT' | 'ILLEGIBLE_PROOF' | 'DUPLICATE_SUBMISSION' | 'OTHER' | null;
  reported_at?: string | null;
  verified_at?: string | null;
}

// Verified against: ../comprobify/src/services/subscription.service.js → formatPaymentProof()
// id is BIGSERIAL → string per pg/JSON serialisation (Common Mistake #16).
export interface ApiPaymentProof {
  id: string;
  filename: string;
  mimeType: string;
  referenceNumber: string;
  active: boolean;
  createdAt: string;
}

// Verified against: ../comprobify/src/controllers/subscription.controller.js → getMyStatus()
// and ../comprobify/src/models/subscription.model.js (pending_tier added in migration 055).
// Full status set per migration 052's chk_subscriptions_status — PAYMENT_RECEIVED (between
// a verified payment and its self-billed invoice being linked) and EXPIRED (renewal grace
// period elapsed unpaid, tenant auto-downgraded to FREE — migration 056) both occur in
// practice; SUSPENDED is schema-allowed but not yet set by any service code.
export interface ApiSubscriptionInfo {
  id: number;
  tenant_id: number;
  tier: 'STARTER' | 'GROWTH' | 'BUSINESS';
  billing_interval: 'MONTHLY' | 'YEARLY';
  status: 'PENDING_PAYMENT' | 'PAYMENT_RECEIVED' | 'INVOICE_PROCESSING' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED';
  // 'FREE' means a cancellation is scheduled (applyScheduledTierChanges drops the tenant
  // to FREE and closes the subscription at period end) — added in API commit 161803a.
  pending_tier?: 'FREE' | 'STARTER' | 'GROWTH' | 'BUSINESS' | null;
  invoice_document_id: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  canceled_at: string | null;
  payments: ApiPaymentInfo[];
}

// Verified against: ../comprobify/src/routes/subscriptions.routes.js → GET /v1/subscriptions/me
export async function getMySubscriptions(ctx: ApiCtx): Promise<ApiSubscriptionInfo[]> {
  const result = await request<{ ok: true; subscriptions: ApiSubscriptionInfo[] }>(
    '/v1/subscriptions/me',
    { apiKey: ctx.apiKey },
  );
  return result.subscriptions;
}

// Verified against: ../comprobify/src/controllers/subscription.controller.js → changeTier()
// and ../comprobify/src/services/subscription.service.js → requestTierChange().
// Response shape varies by outcome — see docs/site/endpoints/change-tier.md:
//   upgrade, same interval (payment owed): subscription + payment + bankTransfer
//   upgrade, same interval (prorates to $0, applied immediately): subscription + payment: null + amount: 0
//   downgrade, same interval (scheduled, no payment): subscription (with pending_tier) + effectiveAt
//   any interval change (deferred, full price): subscription + payment + bankTransfer + effectiveAt
export interface ChangeTierResult {
  ok: true;
  subscription: {
    id: number;
    tier: 'STARTER' | 'GROWTH' | 'BUSINESS';
    status?: string;
    billing_interval?: 'MONTHLY' | 'YEARLY';
    pending_tier?: 'STARTER' | 'GROWTH' | 'BUSINESS' | null;
    current_period_start?: string | null;
    current_period_end?: string | null;
  };
  payment?: ApiPaymentInfo | null;
  bankTransfer?: ApiBankTransferInfo;
  amount?: number;
  effectiveAt?: string;
}

// Verified against: ../comprobify/src/routes/subscriptions.routes.js → POST /v1/subscriptions/change-tier
// billingInterval is optional — omit to keep the current subscription interval.
export async function changeTier(
  ctx: ApiCtx,
  tier: 'STARTER' | 'GROWTH' | 'BUSINESS',
  billingInterval?: 'MONTHLY' | 'YEARLY',
): Promise<ChangeTierResult> {
  return request<ChangeTierResult>(
    '/v1/subscriptions/change-tier',
    { apiKey: ctx.apiKey },
    { method: 'POST', body: JSON.stringify({ tier, ...(billingInterval && { billingInterval }) }) },
  );
}

// Verified against: ../comprobify/src/controllers/subscription.controller.js → cancelSubscription()
// and ../comprobify/src/services/subscription.service.js → scheduleCancellation().
// Sets pending_tier = 'FREE' on the active subscription. The tenant keeps their current
// tier until current_period_end; applyScheduledTierChanges() then drops them to FREE.
export interface CancelSubscriptionResult {
  ok: true;
  subscription: Pick<ApiSubscriptionInfo, 'id' | 'tier' | 'billing_interval' | 'status' | 'pending_tier' | 'current_period_end'>;
  effectiveAt: string;
}

export async function cancelSubscription(ctx: ApiCtx): Promise<CancelSubscriptionResult> {
  return request<CancelSubscriptionResult>(
    '/v1/subscriptions',
    { apiKey: ctx.apiKey },
    { method: 'DELETE' },
  );
}

// Verified against: ../comprobify/src/controllers/subscription.controller.js → createSubscription()
// and ../comprobify/src/services/subscription.service.js → createSubscriptionForTenant()/createSubscription().
// Unlike requesting a tier at promote(), this works while still in sandbox — see
// docs/site/endpoints/create-subscription.md. Always returns all three fields (no
// $0-immediate or scheduled-downgrade variant like changeTier — there's nothing to
// prorate against yet).
export interface CreateSubscriptionResult {
  ok: true;
  subscription: { id: number; tier: 'STARTER' | 'GROWTH' | 'BUSINESS'; status: string; billing_interval: 'MONTHLY' | 'YEARLY' };
  payment: ApiPaymentInfo;
  bankTransfer: ApiBankTransferInfo;
}

// Verified against: ../comprobify/src/routes/subscriptions.routes.js → POST /v1/subscriptions
export async function createSubscription(
  ctx: ApiCtx,
  tier: 'STARTER' | 'GROWTH' | 'BUSINESS',
  billingInterval?: 'MONTHLY' | 'YEARLY',
): Promise<CreateSubscriptionResult> {
  return request<CreateSubscriptionResult>(
    '/v1/subscriptions',
    { apiKey: ctx.apiKey },
    { method: 'POST', body: JSON.stringify({ tier, ...(billingInterval && { billingInterval }) }) },
  );
}

// Verified against: ../comprobify/src/routes/payments.routes.js → PATCH /v1/payments/:id/proof
// Field name "proof" repeated per file — multer.array('proof', 5); up to 5 per request,
// cumulative cap of 10 active per payment (PROOF_FILE_LIMIT_REACHED if exceeded).
// Returns only the proofs uploaded in this request; call listPaymentProofs for the full set.
export async function submitPaymentProof(
  ctx: ApiCtx,
  paymentId: number,
  files: Array<{ buffer: Buffer; mimeType: string; filename: string }>,
  referenceNumber: string,
): Promise<{ payment: ApiPaymentInfo; proofs: ApiPaymentProof[] }> {
  const form = new FormData();
  for (const file of files) {
    const buf = file.buffer.buffer.slice(
      file.buffer.byteOffset,
      file.buffer.byteOffset + file.buffer.byteLength,
    ) as ArrayBuffer;
    form.append('proof', new Blob([buf], { type: file.mimeType }), file.filename);
  }
  form.append('referenceNumber', referenceNumber);

  const res = await fetch(`${getApiUrl()}/v1/payments/${paymentId}/proof`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${ctx.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const problem: ProblemDetails = await res.json();
    throw new ApiError(problem);
  }
  const data = await res.json() as { ok: true; payment: ApiPaymentInfo; proofs: ApiPaymentProof[] };
  return { payment: data.payment, proofs: data.proofs };
}

// Verified against: ../comprobify/src/controllers/payment.controller.js → listProofs()
// Returns only active (non-deleted) proofs; call after upload/delete to refresh the list.
export async function listPaymentProofs(ctx: ApiCtx, paymentId: number): Promise<ApiPaymentProof[]> {
  const result = await request<{ ok: true; proofs: ApiPaymentProof[] }>(
    `/v1/payments/${paymentId}/proofs`,
    { apiKey: ctx.apiKey },
  );
  return result.proofs;
}

// Verified against: ../comprobify/src/controllers/payment.controller.js → deleteProof()
// Soft-delete — admin can still see the file; blocked once payment is VERIFIED.
export async function deletePaymentProof(ctx: ApiCtx, paymentId: number, proofId: string): Promise<void> {
  const res = await fetch(`${getApiUrl()}/v1/payments/${paymentId}/proofs/${proofId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ctx.apiKey}` },
  });
  if (!res.ok) {
    const problem: ProblemDetails = await res.json();
    throw new ApiError(problem);
  }
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
