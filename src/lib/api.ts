import 'server-only';
import { ApiError, ProblemDetails } from './errors';

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
  detail: string | null;
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

export interface ApiIssuer {
  id: number;
  ruc: string;
  businessName: string;
  tradeName?: string;
  branchCode: string;
  issuePointCode: string;
  branchAddress?: string;
  environment: string;
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

export interface ApiKeyInfo {
  id: number;
  label: string;
  environment: string;
  lastFour: string;
  isActive: boolean;
  createdAt: string;
}

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
  return request<ListDocumentsResult>(`/api/documents${query ? `?${query}` : ''}`, ctx);
}

export async function getDocument(ctx: ApiCtx, accessKey: string): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/api/documents/${accessKey}`,
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
    '/api/documents',
    ctx,
    { method: 'POST', body: JSON.stringify(payload), headers: extraHeaders }
  );
  return { document: result.document, created: true };
}

export async function sendToSri(ctx: ApiCtx, accessKey: string): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/api/documents/${accessKey}/send`,
    ctx,
    { method: 'POST' }
  );
  return result.document;
}

export async function checkAuthorization(ctx: ApiCtx, accessKey: string): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/api/documents/${accessKey}/authorize`,
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
    `/api/documents/${accessKey}/rebuild`,
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
    `/api/documents/${accessKey}/events`,
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
    `/api/documents/${accessKey}/email-retry${force ? '?force=true' : ''}`,
    ctx,
    { method: 'POST' },
  );
}

// ── Catalog functions ─────────────────────────────────────────────────────────

export async function listCatalogIdTypes(ctx: ApiCtx): Promise<CatalogIdType[]> {
  const result = await request<{ ok: true; idTypes: CatalogIdType[] }>(
    '/api/catalogs/id-types',
    ctx,
  );
  return result.idTypes;
}

export async function listCatalogPaymentMethods(ctx: ApiCtx): Promise<CatalogPaymentMethod[]> {
  const result = await request<{ ok: true; paymentMethods: CatalogPaymentMethod[] }>(
    '/api/catalogs/payment-methods',
    ctx,
  );
  return result.paymentMethods;
}

export async function listCatalogTaxRates(ctx: ApiCtx): Promise<CatalogTaxRate[]> {
  const result = await request<{ ok: true; taxRates: CatalogTaxRate[] }>(
    '/api/catalogs/tax-rates',
    ctx,
  );
  return result.taxRates;
}

// ── Issuer functions ──────────────────────────────────────────────────────────

export async function listTenantIssuers(ctx: ApiCtx): Promise<ApiIssuer[]> {
  const result = await request<{ ok: true; issuers: ApiIssuer[] }>(
    '/api/issuers',
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

  const res = await fetch(`${getApiUrl()}/api/issuers`, {
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
    `/api/issuers/${issuerId}/document-types`,
    { apiKey: ctx.apiKey },
  );
  return result.documentTypes;
}

export async function listDocumentTypes(ctx: ApiCtx): Promise<string[]> {
  const result = await request<{ ok: true; documentTypes: string[] }>(
    '/api/issuers/document-types',
    ctx,
  );
  return result.documentTypes;
}

export async function addIssuerDocumentType(
  ctx: ApiCtx,
  issuerId: number,
  code: string,
): Promise<void> {
  await request(
    `/api/issuers/${issuerId}/document-types`,
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
    `/api/issuers/${issuerId}/document-types/${code}`,
    { apiKey: ctx.apiKey },
    { method: 'DELETE' },
  );
}

// ── Tenant promotion ──────────────────────────────────────────────────────────

export interface PromoteTenantResult {
  ok: true;
  apiKeys: Array<{ id: number; label: string; environment: 'production'; key: string }>;
}

export async function promoteTenant(
  ctx: ApiCtx,
  initialSequentials?: Array<{ issuerId: number; documentType: string; sequential: number }>,
): Promise<PromoteTenantResult> {
  return request<PromoteTenantResult>(
    '/api/tenants/promote',
    { apiKey: ctx.apiKey },
    { method: 'POST', body: JSON.stringify({ initialSequentials: initialSequentials ?? [] }) },
  );
}

// ── API key management ────────────────────────────────────────────────────────

export async function listTenantApiKeys(ctx: ApiCtx): Promise<ApiKeyInfo[]> {
  const result = await request<{ ok: true; keys: ApiKeyInfo[] }>(
    '/api/keys',
    { apiKey: ctx.apiKey },
  );
  return result.keys;
}

export async function createTenantApiKey(ctx: ApiCtx, label: string): Promise<CreatedApiKey> {
  const result = await request<{ ok: true; key: CreatedApiKey }>(
    '/api/keys',
    { apiKey: ctx.apiKey },
    { method: 'POST', body: JSON.stringify({ label }) },
  );
  return result.key;
}

export async function revokeTenantApiKey(ctx: ApiCtx, id: number): Promise<void> {
  await request(
    `/api/keys/${id}`,
    { apiKey: ctx.apiKey },
    { method: 'DELETE' },
  );
}
