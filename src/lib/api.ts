// Server-only module — never import this in client components.
// All calls to the Comprobify API happen server-side so the API key
// is never exposed to the browser (BFF pattern — see docs/adr/002-bff-pattern.md).

import { ApiError, ProblemDetails } from './errors';

// ── Types ─────────────────────────────────────────────────────────────────────

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
  sequential: string; // Zero-padded, e.g. "000000001"
  status: DocumentStatus;
  issueDate: string; // DD/MM/YYYY
  total: string; // Decimal string, e.g. "115.00"
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
  from?: string; // DD/MM/YYYY
  to?: string; // DD/MM/YYYY
  documentType?: string;
  page?: number;
  limit?: number;
}

export interface InvoiceTax {
  code: string; // e.g. "2" for IVA
  rateCode: string; // e.g. "4" for 15%
  rate: string; // e.g. "15"
}

export interface InvoiceItem {
  mainCode: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount?: string;
  taxes: InvoiceTax[];
}

export interface InvoicePayment {
  method: string; // 2-digit SRI payment method code
  total: string;
  term?: number;
}

export interface CreateDocumentPayload {
  documentType: '01';
  issueDate?: string; // DD/MM/YYYY — defaults to today on the API side
  buyer: {
    idType: string;
    id: string;
    name: string;
    email: string;
    address?: string;
  };
  items: InvoiceItem[];
  payments: InvoicePayment[];
}

// ── HTTP client ───────────────────────────────────────────────────────────────

function getApiUrl(): string {
  const apiUrl = process.env.COMPROBIFY_API_URL;
  if (!apiUrl) throw new Error('COMPROBIFY_API_URL is not set');
  return apiUrl;
}

async function request<T>(
  path: string,
  apiKey: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const problem: ProblemDetails = await res.json();
    throw new ApiError(problem);
  }

  return res.json() as Promise<T>;
}

// For public endpoints that require no API key (e.g. self-service registration)
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

// ── Types for self-service registration ──────────────────────────────────────

export interface IssuerRegistrationFields {
  ruc: string;
  businessName: string;
  tradeName?: string;
  mainAddress?: string;
  branchCode: string;
  issuePointCode: string;
  emissionType: string;
  requiredAccounting: boolean;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function listDocuments(
  apiKey: string,
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
  return request<ListDocumentsResult>(`/api/documents${query ? `?${query}` : ''}`, apiKey);
}

export async function getDocument(apiKey: string, accessKey: string): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/api/documents/${accessKey}`,
    apiKey,
  );
  return result.document;
}

export async function createDocument(
  apiKey: string,
  payload: CreateDocumentPayload,
  idempotencyKey?: string
): Promise<{ document: Document; created: boolean }> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const result = await request<{ ok: true; document: Document }>(
    '/api/documents',
    apiKey,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers,
    }
  );
  return { document: result.document, created: true };
}

export async function sendToSri(apiKey: string, accessKey: string): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/api/documents/${accessKey}/send`,
    apiKey,
    { method: 'POST' }
  );
  return result.document;
}

export async function checkAuthorization(apiKey: string, accessKey: string): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/api/documents/${accessKey}/authorize`,
    apiKey,
  );
  return result.document;
}

export async function rebuildDocument(
  apiKey: string,
  accessKey: string,
  payload: CreateDocumentPayload
): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/api/documents/${accessKey}/rebuild`,
    apiKey,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return result.document;
}

export async function getDocumentEvents(
  apiKey: string,
  accessKey: string
): Promise<DocumentEvent[]> {
  const result = await request<{ ok: true; events: DocumentEvent[] }>(
    `/api/documents/${accessKey}/events`,
    apiKey,
  );
  return result.events;
}

export async function retrySingleEmail(
  apiKey: string,
  accessKey: string,
  force = false
): Promise<void> {
  await request(
    `/api/documents/${accessKey}/email-retry${force ? '?force=true' : ''}`,
    apiKey,
    { method: 'POST' },
  );
}

// ── Self-service issuer provisioning ──────────────────────────────────────────

export async function registerIssuer(
  email: string,
  fields: IssuerRegistrationFields,
  p12Buffer: Buffer,
  p12Password: string,
): Promise<{ issuerId: number; apiKey: string }> {
  const form = new FormData();
  form.append('email', email);
  form.append('ruc', fields.ruc);
  form.append('businessName', fields.businessName);
  if (fields.tradeName) form.append('tradeName', fields.tradeName);
  if (fields.mainAddress) form.append('mainAddress', fields.mainAddress);
  form.append('branchCode', fields.branchCode);
  form.append('issuePointCode', fields.issuePointCode);
  form.append('environment', '1'); // SRI sandbox environment code
  form.append('emissionType', fields.emissionType);
  form.append('requiredAccounting', fields.requiredAccounting ? 'true' : 'false');
  form.append('certPassword', p12Password);

  const certArrayBuffer = p12Buffer.buffer.slice(
    p12Buffer.byteOffset,
    p12Buffer.byteOffset + p12Buffer.byteLength,
  ) as ArrayBuffer;
  form.append('cert', new Blob([certArrayBuffer], { type: 'application/x-pkcs12' }), 'cert.p12');

  const result = await publicRequest<{
    ok: true;
    tenant: { id: number; email: string; status: string };
    issuer: { id: number; ruc: string; sandbox: boolean };
    apiKey: string;
  }>('/api/register', { method: 'POST', body: form });

  return { issuerId: result.issuer.id, apiKey: result.apiKey };
}

export async function resendVerificationEmail(email: string): Promise<void> {
  await publicRequest('/api/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function promoteToProduction(apiKey: string): Promise<string> {
  const result = await request<{ ok: true; issuer: object; apiKey: string }>(
    '/api/issuers/promote',
    apiKey,
    { method: 'POST' },
  );
  return result.apiKey;
}
