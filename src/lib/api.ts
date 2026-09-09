import 'server-only';
import { ApiError, ProblemDetails } from './errors';
import { buildClientForwardingHeaders, type ClientForwardingInfo } from './client-forwarding';
import type { ApiKeyScope } from './role-api-scopes';
import type { PaidTier } from './subscription-tiers';

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
// 2. EVERY API ID IS A UUID STRING.
//    The Comprobify API is UUID-keyed throughout — every table is
//    `id UUID PRIMARY KEY DEFAULT uuid_generate_v7()` (see its
//    db/migrations/001_create_issuers.sql, 023_create_api_keys.sql,
//    035_tenants.sql, 052_subscriptions_and_payments.sql). Consequences:
//      • Type every id field and id parameter as `string`.
//      • NEVER apply Number() to an API id — it yields NaN, which Prisma
//        rejects and which surfaces as an opaque "internal error" to the user.
//    The local mirror columns (Tenant.apiTenantId, TenantApiKey.apiKeyId,
//    Issuer.apiIssuerId, Notification.issuerId) are @db.Uuid for this reason.
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
  issuerId?: string; // API-side issuer id (UUID); added as X-Issuer-Id when present
}

// ── Document types ────────────────────────────────────────────────────────────

export const DOCUMENT_STATUSES = [
  'SIGNED',
  'PENDING_SEND',
  'RECEIVED',
  'AUTHORIZED',
  'RETURNED',
  'NOT_AUTHORIZED',
  'VOIDED',
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export type EmailStatus =
  | 'PENDING'
  | 'SENT'
  | 'FAILED'
  | 'SKIPPED'
  | 'DELIVERED'
  | 'COMPLAINED';

// Only present when status is PENDING_SEND/RECEIVED (an SRI_SEND/SRI_AUTHORIZE
// effect is actively in flight); entirely absent once the document settles.
// Lets a polling client tell "still auto-retrying" (PENDING/DISPATCHED) apart
// from "exhausted all 5 automatic attempts" (FAILED — the only case where
// POST /:accessKey/send/retry will succeed instead of 409 NOTHING_TO_RETRY).
export interface DocumentDispatchStatus {
  status: 'PENDING' | 'DISPATCHED' | 'FAILED';
  attemptCount: number;
  lastError: string | null;
}

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
  // Manual void (a second terminal state alongside AUTHORIZED, reachable only
  // from it) — SRI has no SOAP service to cancel an already-authorized
  // document, so the tenant cancels it on SRI's own portal first and this
  // just syncs the local record. Both present only once voided.
  voidReason?: string;
  voidedAt?: string;
  // Present whenever the document has one (every document created since request_payload was
  // added) — the exact original create/rebuild body, used to pre-fill the rebuild form.
  requestPayload?: CreateDocumentPayload;
  email: {
    status: EmailStatus;
    sentAt?: string;
    error?: string;
  };
  dispatch?: DocumentDispatchStatus;
}

export interface DocumentEvent {
  id: string;
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
  // SRI detallesAdicionales/detAdicional — up to 3 free-form name/value pairs per
  // line item (comprobify-web CLAUDE.md rule 15: verified against
  // ../comprobify/src/validators/invoice.validator.js and credit-note.validator.js).
  additionalDetails?: Array<{ name: string; value: string }>;
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
  id: string;           // uuid
  ruc: string;
  businessName: string;
  tradeName: string | null;
  branchCode: string;
  issuePointCode: string;
  branchAddress: string | null;
  certFingerprint: string | null;
  certExpiry: string | null;
}

// GET /v1/issuers's issuer.service.js → listIssuers() also includes canIssue —
// createIssuer()/updateIssuer()'s controller responses below do not, so this is
// kept as its own type rather than widening ApiIssuer for every call site.
export interface ApiTenantIssuer extends ApiIssuer {
  canIssue: boolean;
}

// Verified against: ../comprobify/src/validators/issuer.validator.js → createBranch
export interface CreateIssuerFields {
  sourceIssuerId?: string;
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

// Shape returned by GET /v1/keys.
// Verified against: ../comprobify/src/services/api-key.service.js → formatKey()
export interface ApiKeyInfo {
  id: string;            // api_keys.id is UUID
  label: string | null;
  environment: string;
  scopes: string[];       // 9-value vocabulary, see src/lib/role-api-scopes.ts
  active: boolean;       // field is 'active', not 'isActive'
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null; // null if the key has never authenticated a request
  requestCount: number;      // lifetime total, not windowed
}

// Verified against: ../comprobify/src/services/api-key.service.js → getDailyUsage()
export interface ApiKeyDailyUsage {
  date: string;          // YYYY-MM-DD
  requestCount: number;
}

// Normalized shape returned by createTenantApiKey.
export interface CreatedApiKey {
  id: string;
  label: string;
  environment: string;
  scopes: string[];
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
    // Guard against proxy/gateway error pages (e.g. Cloudflare 522) that return HTML instead of JSON.
    // Checks for 'json' generically (not 'application/json' specifically) because the API's own error
    // responses use RFC 7807's 'application/problem+json' (see error-handler.js), which doesn't contain
    // 'application/json' as a substring — a stricter check here silently misreports every real API error
    // as API_UNREACHABLE, discarding its actual code/detail.
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      const body = await res.text().catch(() => '');
      throw new ApiError({
        type: 'about:blank',
        title: `API error ${res.status}`,
        detail: body.slice(0, 200),
        status: res.status,
        code: 'API_UNREACHABLE',
        instance: '',
      });
    }
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

// Verified against: ../comprobify/src/services/document-query.service.js → getByAccessKey()
// `dispatch` is attached only while status is PENDING_SEND/RECEIVED — see DocumentDispatchStatus.
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

// Recovers a document whose SRI send/authorize dispatch exhausted its 5 automatic
// attempts and got stuck (still PENDING_SEND or RECEIVED long after sendToSri()/
// checkAuthorization() were queued) — resets the failed attempt and re-dispatches
// immediately. 409 NOTHING_TO_RETRY (via ApiError) if nothing is actually FAILED
// for this document, e.g. it's still in progress or already resolved.
// Verified against: ../comprobify/src/controllers/documents.controller.js → retrySend()
export async function retrySend(ctx: ApiCtx, accessKey: string): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/v1/documents/${accessKey}/send/retry`,
    ctx,
    { method: 'POST' }
  );
  return result.document;
}

// Manual void — only valid on an AUTHORIZED document (400 DOCUMENT_NOT_AUTHORIZED
// otherwise, which also covers "already voided"). confirmedSriVoid must be true —
// the API has no way to verify the tenant actually cancelled it in SRI's own
// portal first, so this is an explicit attestation, not a real check.
// Verified against: ../comprobify/src/controllers/documents.controller.js → voidDocument()
// and ../comprobify/src/validators/document-void.validator.js.
export async function voidDocument(
  ctx: ApiCtx,
  accessKey: string,
  reason: string,
  confirmedSriVoid: true,
): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/v1/documents/${accessKey}/void`,
    ctx,
    { method: 'POST', body: JSON.stringify({ reason, confirmedSriVoid }) }
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

export async function listTenantIssuers(ctx: ApiCtx): Promise<ApiTenantIssuer[]> {
  const result = await request<{ ok: true; issuers: ApiTenantIssuer[] }>(
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
  issuerId: string,
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
export async function removeIssuer(ctx: ApiCtx, issuerId: string): Promise<void> {
  await request(`/v1/issuers/${issuerId}`, { apiKey: ctx.apiKey }, { method: 'DELETE' });
}

// Verified against: ../comprobify/src/controllers/issuer.controller.js → activateIssuer
export async function activateIssuer(ctx: ApiCtx, issuerId: string): Promise<void> {
  await request(`/v1/issuers/${issuerId}/activate`, { apiKey: ctx.apiKey }, { method: 'PATCH' });
}

// Verified against: ../comprobify/src/controllers/issuer.controller.js → setCanIssue
export async function setIssuerCanIssue(ctx: ApiCtx, issuerId: string, canIssue: boolean): Promise<boolean> {
  const result = await request<{ ok: true; canIssue: boolean }>(
    `/v1/issuers/${issuerId}/can-issue`,
    { apiKey: ctx.apiKey },
    { method: 'PATCH', body: JSON.stringify({ canIssue }) },
  );
  return result.canIssue;
}

// Verified against: ../comprobify/src/services/sequential.service.js → getCounters()
export async function getIssuerSequentials(ctx: ApiCtx, issuerId: string): Promise<ApiIssuerSequential[]> {
  const result = await request<{ ok: true; sequentials: ApiIssuerSequential[] }>(
    `/v1/issuers/${issuerId}/sequentials`,
    { apiKey: ctx.apiKey },
  );
  return result.sequentials;
}

// Verified against: ../comprobify/src/services/sequential.service.js → setNext()
export async function setIssuerSequential(
  ctx: ApiCtx,
  issuerId: string,
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

export async function listIssuerDocumentTypes(ctx: ApiCtx, issuerId: string): Promise<string[]> {
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
  issuerId: string,
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
  issuerId: string,
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
  issuerId: string,
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
  issuerId: string,
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
  // PAST_DUE (ADR-025 on the API side): a self-resolving billing state, distinct
  // from the admin-only SUSPENDED — assigned when a renewal grace period lapses
  // unpaid, cleared automatically once a fresh subscription's payment is verified
  // (ADR-027 moved this trigger off invoice authorization).
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'PAST_DUE';
  // Only meaningful alongside SUSPENDED — cleared server-side on any other
  // transition (ADR-027). Mirrors ../comprobify/src/constants/suspension-reasons.js.
  suspensionReasonCode:
    | 'PAYMENT_REVERSED'
    | 'FRAUD_SUSPECTED'
    | 'TERMS_VIOLATION'
    | 'VOLUNTARY_CLOSURE'
    | 'UNPAID_BALANCE'
    | 'OTHER'
    | null;
  documentCount: string;   // bigint → serialized as string by pg/JSON
  // null means genuinely unlimited (ENTERPRISE — comprobify migration 094).
  documentQuota: number | null;
  sandbox: boolean;
  agreementAcceptedAt: string | null;
  agreementVersion: string | null;
  // Extra user seats add-on (ADR-032) — set via authenticate.js's join onto
  // req.tenant (tenant_extra_seats/tenant_pending_extra_seats), echoed
  // verbatim by getMe(). extraSeats is the currently-effective count;
  // pendingExtraSeats is a scheduled-but-not-yet-applied decrease (null when
  // nothing is scheduled) — see src/lib/tenant-limits.ts for how this
  // combines with a tier's maxUsers.
  extraSeats: number;
  pendingExtraSeats: number | null;
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
  // Distinct from needsAcceptance: false, which is also true once every
  // published template has been accepted — this is what tells "nothing
  // published yet" (hide the legal docs section) apart from "all caught up"
  // (show it, links work). See comprobify/tenant-agreement.service.js#getStatus.
  hasPublishedAgreements: boolean;
  // false when the operator has switched legal documents off entirely for this
  // deployment (comprobify's AGREEMENTS_ENABLED=false — API-side only, nothing
  // to configure in this repo). hasPublishedAgreements is then also false and
  // needsAcceptance is always false, so the existing gates on those two fields
  // already hide the "Documentos legales" card and skip /agreements correctly
  // with no code change — kept here purely so this interface matches the API
  // response (rule 15/25), not because anything currently branches on it.
  agreementsEnabled: boolean;
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
// clientHeaders: forwarded from the incoming browser request so the API records the real
// browser UA / visitor IP (once it trusts the latter, see client-forwarding.ts) rather than
// the Node fetch default / this app's own droplet egress IP. The BFF pattern means the actual
// outbound request originates from our server, not the browser, so we have to pass these explicitly.
export async function acceptAgreements(
  ctx: ApiCtx,
  termsVersion: string,
  clientHeaders?: ClientForwardingInfo,
): Promise<void> {
  await request<{ ok: true }>(
    '/v1/tenants/agreements',
    { apiKey: ctx.apiKey },
    { method: 'POST', body: JSON.stringify({ termsVersion }), headers: buildClientForwardingHeaders(clientHeaders ?? {}) },
  );
}

// Bulk variant of retrySend() — recovers every stuck document (failed SRI send/
// authorize) across all of the tenant's issuers/branches in one call, no
// X-Issuer-Id needed. Best-effort per document; `retried` is how many actually
// had a failed attempt and got re-queued — 0 is a valid response, not an error.
// Verified against: ../comprobify/src/controllers/tenant.controller.js → retryFailedDocuments()
export async function retryAllFailedDocuments(ctx: ApiCtx): Promise<number> {
  const result = await request<{ ok: true; retried: number }>(
    '/v1/tenants/retry-failed-documents',
    { apiKey: ctx.apiKey },
    { method: 'POST' },
  );
  return result.retried;
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
    id: string;
    tier: PaidTier;
    status: string;
    billing_interval: 'MONTHLY' | 'YEARLY';
  };
  payment?: {
    id: string;
    status: string;
    amount: string; // numeric column → serialized as string by pg/JSON
  };
  bankTransfer?: ApiBankTransferInfo;
}

export async function promoteTenant(
  ctx: ApiCtx,
  initialSequentials?: Array<{ issuerId: string; documentType: string; sequential: number }>,
  tier?: PaidTier,
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
  id: string;
  // Migration 097 — short, hand-typable identifier (e.g. "CB-4K7N9QRT") the
  // tenant writes into the SPI transfer's description/glosa field instead of
  // the UUID id, which is impractical to hand-copy. DB-generated, always
  // present (NOT NULL DEFAULT) on every payment, old or new.
  payment_code: string;
  subscription_id?: string;
  // 'CANCELLED' (migration 098) — the tenant backed out of a still-PENDING
  // payment themselves (wrong tier/seats), distinct from REJECTED (operator
  // reviewed submitted proof) and REFUNDED (money already moved). See
  // cancelPayment() below.
  status: 'PENDING' | 'REPORTED' | 'VERIFIED' | 'REJECTED' | 'REFUNDED' | 'CANCELLED';
  amount: string;            // base imponible; numeric → string by pg/JSON
  iva_rate?: number | null;
  iva_amount?: string | null;
  total_amount?: string | null;  // IVA-inclusive total; use this for display
  method: 'SPI_TRANSFER' | 'PAYPHONE_CARD';
  // 'SEAT_CHANGE' added by migration 095 (ADR-032) — only ever set on an
  // increase (a decrease never opens a payment, see requestSeatChange).
  purpose?: 'INITIAL' | 'TIER_CHANGE' | 'RENEWAL' | 'SEAT_CHANGE';
  target_tier?: PaidTier | null;
  target_billing_interval?: 'MONTHLY' | 'YEARLY' | null;
  // Migration 099 (ADR-033) — only ever true for the MONTHLY -> YEARLY
  // genuine-upgrade path requestTierChange takes; every other TIER_CHANGE
  // with target_billing_interval set still defers to current_period_end.
  interval_change_immediate?: boolean;
  // target_extra_seats: the new total seat count being purchased (mirrors
  // target_tier, SEAT_CHANGE only). seats_charged: audit snapshot of how many
  // seats' cost is baked into this payment (a delta on SEAT_CHANGE, the
  // effective total on a RENEWAL/interval-change TIER_CHANGE, 0 otherwise).
  target_extra_seats?: number | null;
  seats_charged?: number | null;
  // Migration 101 — the same object requestTierChange/requestSeatChange
  // return synchronously as `breakdown` (see PricingBreakdown below),
  // persisted here so it survives past the original response. null for
  // INITIAL/RENEWAL and any sandbox-path payment.
  pricing_breakdown?: PricingBreakdown | null;
  rejection_reason_code?: 'AMOUNT_MISMATCH' | 'TRANSFER_NOT_FOUND' | 'WRONG_ACCOUNT' | 'ILLEGIBLE_PROOF' | 'DUPLICATE_SUBMISSION' | 'OTHER' | null;
  reported_at?: string | null;
  verified_at?: string | null;
  cancelled_at?: string | null;
  created_at: string;  // NOT NULL DEFAULT NOW() (migration 052) — every payment has one
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
  id: string;
  tenant_id: string;
  tier: PaidTier;
  billing_interval: 'MONTHLY' | 'YEARLY';
  status: 'PENDING_PAYMENT' | 'PAYMENT_RECEIVED' | 'INVOICE_PROCESSING' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED';
  // 'FREE' means a cancellation is scheduled (applyScheduledTierChanges drops the tenant
  // to FREE and closes the subscription at period end) — added in API commit 161803a.
  pending_tier?: 'FREE' | PaidTier | null;
  invoice_document_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  canceled_at: string | null;
  // Extra user seats add-on (ADR-032, migration 095) — raw columns, spread
  // through getStatusForTenant() same as every other field here.
  // pending_extra_seats is a scheduled decrease taking effect at
  // current_period_end (null when nothing is scheduled).
  extra_seats: number;
  pending_extra_seats: number | null;
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

// Verified against: ../comprobify/src/services/subscription.service.js — every
// proration-capable path in requestTierChange/requestSeatChange builds one of
// these (migration 101, payments.pricing_breakdown JSONB). All money fields
// are pre-tax base amounts — payment.amount/iva_amount/total_amount carry the
// tax breakdown on top separately. null for INITIAL/RENEWAL payments and for
// any sandbox path (sandbox never builds one at all).
export type PricingBreakdown =
  | {
      model: 'SAME_INTERVAL_UPGRADE';
      currentTierPrice: number;
      newTierPrice: number;
      priceDifference: number;
      remainingFraction: number;
      proratedBase: number;
    }
  | {
      model: 'CROSS_INTERVAL_UPGRADE';
      newTierPrice: number;
      seatsCount: number;
      seatPrice: number;
      seatsCost: number;
      fullPrice: number;
      previousPlanPrice: number;
      remainingFraction: number;
      credit: number;
      proratedBase: number;
    }
  | {
      model: 'DEFERRED_FULL_PRICE';
      newTierPrice: number;
      seatsCount: number;
      seatPrice: number;
      seatsCost: number;
      fullPrice: number;
      proratedBase: null;
      credit: 0;
    }
  | {
      model: 'SEAT_INCREASE';
      seatDelta: number;
      seatPrice: number;
      remainingFraction: number;
      proratedBase: number;
    };

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
    id: string;
    tier: PaidTier;
    status?: string;
    billing_interval?: 'MONTHLY' | 'YEARLY';
    pending_tier?: PaidTier | null;
    current_period_start?: string | null;
    current_period_end?: string | null;
  };
  payment?: ApiPaymentInfo | null;
  bankTransfer?: ApiBankTransferInfo;
  amount?: number;
  effectiveAt?: string;
  breakdown?: PricingBreakdown;
}

// Verified against: ../comprobify/src/routes/subscriptions.routes.js → POST /v1/subscriptions/change-tier
// billingInterval is optional — omit to keep the current subscription interval.
export async function changeTier(
  ctx: ApiCtx,
  tier: PaidTier,
  billingInterval?: 'MONTHLY' | 'YEARLY',
): Promise<ChangeTierResult> {
  return request<ChangeTierResult>(
    '/v1/subscriptions/change-tier',
    { apiKey: ctx.apiKey },
    { method: 'POST', body: JSON.stringify({ tier, ...(billingInterval && { billingInterval }) }) },
  );
}

// Verified against: ../comprobify/src/controllers/subscription.controller.js → changeSeats()
// and ../comprobify/src/services/subscription.service.js → requestSeatChange() (ADR-032).
// Same response shape as ChangeTierResult, minus the interval-change scenario — seats
// always follow the subscription's own billing_interval, there is no third scenario.
export interface ChangeSeatsResult {
  ok: true;
  subscription: {
    id: string;
    tier: PaidTier;
    status?: string;
    billing_interval?: 'MONTHLY' | 'YEARLY';
    extra_seats?: number;
    pending_extra_seats?: number | null;
    current_period_start?: string | null;
    current_period_end?: string | null;
  };
  payment?: ApiPaymentInfo | null;
  bankTransfer?: ApiBankTransferInfo;
  amount?: number;
  effectiveAt?: string;
  breakdown?: PricingBreakdown;
}

// Verified against: ../comprobify/src/routes/subscriptions.routes.js → POST /v1/subscriptions/seats
// extraSeats is the ABSOLUTE target count (0-100), not a delta — mirrors requestSeatChange's
// own doc comment on the API side.
export async function changeSeats(ctx: ApiCtx, extraSeats: number): Promise<ChangeSeatsResult> {
  return request<ChangeSeatsResult>(
    '/v1/subscriptions/seats',
    { apiKey: ctx.apiKey },
    { method: 'POST', body: JSON.stringify({ extraSeats }) },
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
  subscription: { id: string; tier: PaidTier; status: string; billing_interval: 'MONTHLY' | 'YEARLY' };
  payment: ApiPaymentInfo;
  bankTransfer: ApiBankTransferInfo;
}

// Verified against: ../comprobify/src/routes/subscriptions.routes.js → POST /v1/subscriptions
export async function createSubscription(
  ctx: ApiCtx,
  tier: PaidTier,
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
  paymentId: string,
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
export async function listPaymentProofs(ctx: ApiCtx, paymentId: string): Promise<ApiPaymentProof[]> {
  const result = await request<{ ok: true; proofs: ApiPaymentProof[] }>(
    `/v1/payments/${paymentId}/proofs`,
    { apiKey: ctx.apiKey },
  );
  return result.proofs;
}

// Verified against: ../comprobify/src/controllers/payment.controller.js → deleteProof()
// Soft-delete — admin can still see the file; blocked once payment is VERIFIED.
export async function deletePaymentProof(ctx: ApiCtx, paymentId: string, proofId: string): Promise<void> {
  const res = await fetch(`${getApiUrl()}/v1/payments/${paymentId}/proofs/${proofId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ctx.apiKey}` },
  });
  if (!res.ok) {
    const problem: ProblemDetails = await res.json();
    throw new ApiError(problem);
  }
}

// Verified against: ../comprobify/src/controllers/payment.controller.js → cancelPayment()
// and ../comprobify/src/services/subscription.service.js → cancelPayment() (migration 098).
// Tenant-initiated: only a still-PENDING, non-RENEWAL payment qualifies (409
// PAYMENT_NOT_CANCELLABLE otherwise). Cancelling an INITIAL payment also
// cancels its still-PENDING_PAYMENT subscription — subscription is non-null
// only in that case, and is the raw subscriptionModel.updateStatus() row
// (no nested payments array, unlike ApiSubscriptionInfo).
export interface CancelPaymentResult {
  ok: true;
  payment: ApiPaymentInfo;
  subscription: { id: string; status: string } | null;
}

export async function cancelPayment(ctx: ApiCtx, paymentId: string): Promise<CancelPaymentResult> {
  return request<CancelPaymentResult>(
    `/v1/payments/${paymentId}`,
    { apiKey: ctx.apiKey },
    { method: 'DELETE' },
  );
}

// Verified against: ../comprobify/src/controllers/payment.controller.js → createPayphoneSession()
// and ../comprobify/src/services/payphone-payment.service.js → createSession() (ADR-028).
// Fed straight into Payphone's browser widget (PPaymentButtonBox) as init config — do not
// recompute or round any of these; the API already satisfies Payphone's required identity
// amount = amountWithoutTax + amountWithTax + tax + service + tip. All amounts are integer cents.
export interface ApiPayphoneSession {
  clientTransactionId: string;
  attemptId: string;
  token: string;
  storeId: string;
  currency: string;
  reference: string;
  amount: number;
  amountWithoutTax: number;
  amountWithTax: number;
  tax: number;
  service: number;
  tip: number;
}

// Verified against: ../comprobify/src/routes/payments.routes.js → POST /v1/payments/:id/payphone-session
// 503 PAYMENT_GATEWAY_NOT_CONFIGURED when PAYPHONE_TOKEN/PAYPHONE_STORE_ID are unset — the
// caller must fall back to the bank-transfer flow, never treat it as a hard failure.
// 409 PAYMENT_ALREADY_VERIFIED if the payment is already settled or refunded.
export async function createPayphoneSession(ctx: ApiCtx, paymentId: string): Promise<ApiPayphoneSession> {
  const result = await request<{ ok: true; session: ApiPayphoneSession }>(
    `/v1/payments/${paymentId}/payphone-session`,
    { apiKey: ctx.apiKey },
    { method: 'POST' },
  );
  return result.session;
}

// Verified against: ../comprobify/src/controllers/payment.controller.js → confirmPayphone()
// and ../comprobify/src/services/payphone-payment.service.js → confirmTransaction() (ADR-028).
// Called by the return page Payphone redirects to — must run immediately on load, never
// behind a click, or Payphone auto-reverses the charge at the 5-minute mark. Safe to call
// twice with the same body: a replayed return page gets back the stored outcome with no
// second vendor call. 502 PAYPHONE_CONFIRM_FAILED means the charge is UNRESOLVED (not
// declined) — it will be reconciled automatically; never prompt an immediate retry for it.
export interface ApiPayphoneConfirmResult {
  status: 'APPROVED' | 'CANCELLED' | 'DUPLICATE' | 'ERROR';
  clientTransactionId: string;
}

export async function confirmPayphonePayment(
  ctx: ApiCtx,
  payphoneId: string,
  clientTransactionId: string,
): Promise<ApiPayphoneConfirmResult> {
  return request<{ ok: true } & ApiPayphoneConfirmResult>(
    '/v1/payments/payphone/confirm',
    { apiKey: ctx.apiKey },
    { method: 'POST', body: JSON.stringify({ id: payphoneId, clientTransactionId }) },
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

// Verified against: ../comprobify/src/controllers/api-key.controller.js → list()
// Also returns the tenant's self-service pool usage (max already includes
// comprobify-web's own reserved per-role-key allowance — see
// reservedForFrontend on GET /v1/tiers and ADR-034), the same ceiling
// createKey() enforces, so callers needing the cap (resolveTenantLimits())
// don't have to reimplement that arithmetic.
export async function listTenantApiKeys(
  ctx: ApiCtx,
): Promise<{ keys: ApiKeyInfo[]; limit: { max: number | null; used: number } }> {
  const result = await request<{
    ok: true;
    keys: ApiKeyInfo[];
    limit: { max: number | null; used: number };
  }>('/v1/keys', { apiKey: ctx.apiKey });
  return { keys: result.keys, limit: result.limit };
}

export async function createTenantApiKey(
  ctx: ApiCtx,
  label: string,
  environment?: 'sandbox' | 'production',
  scopes?: ApiKeyScope[],
): Promise<CreatedApiKey> {
  // ctx's own scopes must be a superset of `scopes` or the API 403s
  // (SCOPE_ESCALATION_FORBIDDEN). Omitting `scopes` clones ctx's own.
  const createResult = await request<{ ok: true; apiKey: string; scopes: string[] }>(
    '/v1/keys',
    ctx,
    { method: 'POST', body: JSON.stringify({ label, environment, scopes }) },
  );
  const plainKey = createResult.apiKey;

  // GET (not POST) returns the id — auth with ctx, not the new token, since
  // a per-role key may lack keys:manage itself (confirmed failing in practice).
  const listResult = await request<{ ok: true; keys: ApiKeyInfo[] }>(
    '/v1/keys',
    ctx,
  );
  const keyRecord = listResult.keys[0]; // newest-first, so [0] is the one we just created
  if (!keyRecord) throw new Error('KEY_METADATA_MISSING');

  return {
    id: keyRecord.id,
    label: keyRecord.label ?? label,
    environment: keyRecord.environment,
    scopes: createResult.scopes,
    key: plainKey,
  };
}

export async function revokeTenantApiKey(ctx: ApiCtx, id: string): Promise<void> {
  await request(
    `/v1/keys/${id}`,
    { apiKey: ctx.apiKey },
    { method: 'DELETE' },
  );
}

// Verified against: ../comprobify/src/controllers/api-key.controller.js → usage()
// Zero-filled daily series (always exactly `days` entries, oldest first, inclusive of
// today). `id` can belong to an already-revoked key — ownership, not `active` state,
// grants access, so a revoked key's history stays queryable.
export async function getTenantApiKeyUsage(
  ctx: ApiCtx,
  id: string,
  days: number = 30,
): Promise<ApiKeyDailyUsage[]> {
  const result = await request<{ ok: true; usage: ApiKeyDailyUsage[] }>(
    `/v1/keys/${id}/usage?days=${days}`,
    { apiKey: ctx.apiKey },
  );
  return result.usage;
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

export type NotificationChannel = 'IN_APP' | 'EMAIL';

// Breaking change (comprobify PR #132, ADR-024): a preference is now keyed by
// (type, channel), not just type — a type supporting both channels (e.g.
// PAYMENT_VERIFIED) returns two rows. Mandatory types (PRICE_CHANGE_ANNOUNCED)
// never appear here and are rejected by PATCH.
export interface NotificationPreference {
  type: string;
  channel: NotificationChannel;
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
