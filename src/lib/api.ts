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

function getConfig() {
  const apiKey = process.env.COMPROBIFY_API_KEY;
  const apiUrl = process.env.COMPROBIFY_API_URL;

  if (!apiKey) throw new Error('COMPROBIFY_API_KEY is not set');
  if (!apiUrl) throw new Error('COMPROBIFY_API_URL is not set');

  return { apiKey, apiUrl };
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { apiKey, apiUrl } = getConfig();

  const res = await fetch(`${apiUrl}${path}`, {
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

// ── API functions ─────────────────────────────────────────────────────────────

export async function listDocuments(
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
  return request<ListDocumentsResult>(`/api/documents${query ? `?${query}` : ''}`);
}

export async function getDocument(accessKey: string): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/api/documents/${accessKey}`
  );
  return result.document;
}

export async function createDocument(
  payload: CreateDocumentPayload,
  idempotencyKey?: string
): Promise<{ document: Document; created: boolean }> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const result = await request<{ ok: true; document: Document }>(
    '/api/documents',
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers,
    }
  );
  return { document: result.document, created: true };
}

export async function sendToSri(accessKey: string): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/api/documents/${accessKey}/send`,
    { method: 'POST' }
  );
  return result.document;
}

export async function checkAuthorization(accessKey: string): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/api/documents/${accessKey}/authorize`
  );
  return result.document;
}

export async function rebuildDocument(
  accessKey: string,
  payload: CreateDocumentPayload
): Promise<Document> {
  const result = await request<{ ok: true; document: Document }>(
    `/api/documents/${accessKey}/rebuild`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return result.document;
}

export async function getDocumentEvents(
  accessKey: string
): Promise<DocumentEvent[]> {
  const result = await request<{ ok: true; events: DocumentEvent[] }>(
    `/api/documents/${accessKey}/events`
  );
  return result.events;
}

export async function retrySingleEmail(
  accessKey: string,
  force = false
): Promise<void> {
  await request(`/api/documents/${accessKey}/email-retry${force ? '?force=true' : ''}`, {
    method: 'POST',
  });
}
