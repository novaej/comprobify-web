'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import {
  createDocument,
  rebuildDocument,
  sendToSri,
  checkAuthorization,
  getDocument,
  listDocuments,
  type CreateCreditNotePayload,
} from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { requireContext } from '@/lib/context';
import type { BackTargetKey } from '@/lib/back-targets';

// Only invoices (type 01) can currently be credited from this UI — the search/prefill
// helpers below are scoped to that type. The API itself accepts any originalDocument.documentType.
const CREDITABLE_DOCUMENT_TYPE = '01';
const CREDITABLE_STATUS = 'AUTHORIZED';

function creditNoteHref(accessKey: string, from?: BackTargetKey): string {
  return from ? `/invoices/${accessKey}?from=${from}` : `/invoices/${accessKey}`;
}

export interface CreditNoteFormData {
  buyer: {
    idType: string;
    id: string;
    name: string;
    email: string;
    address?: string;
  };
  originalDocument: {
    documentType: string;
    number: string;
    issueDate: string;
  };
  motivo: string;
  items: Array<{
    mainCode: string;
    auxCode?: string;
    description: string;
    quantity: string;
    unitPrice: string;
    discount?: string;
    taxOption: '2-4' | '2-0' | '2-5' | '2-6' | '2-7';
  }>;
  additionalInfo?: Array<{ name: string; value: string }>;
}

const TAX_MAP: Record<CreditNoteFormData['items'][number]['taxOption'], { code: string; rateCode: string; rate: string }> = {
  '2-4': { code: '2', rateCode: '4', rate: '15' },
  '2-0': { code: '2', rateCode: '0', rate: '0' },
  '2-5': { code: '2', rateCode: '5', rate: '5' },
  '2-6': { code: '2', rateCode: '6', rate: '0' },
  '2-7': { code: '2', rateCode: '7', rate: '0' },
};

export type CreateCreditNoteResult = { error: string } | null;

function buildCreditNotePayload(data: CreditNoteFormData): CreateCreditNotePayload {
  return {
    documentType: '04',
    buyer: {
      idType: data.buyer.idType,
      id: data.buyer.id,
      name: data.buyer.name,
      email: data.buyer.email,
      ...(data.buyer.address ? { address: data.buyer.address } : {}),
    },
    originalDocument: {
      documentType: data.originalDocument.documentType,
      number: data.originalDocument.number,
      issueDate: data.originalDocument.issueDate,
    },
    motivo: data.motivo,
    items: data.items.map((item) => ({
      mainCode: item.mainCode,
      ...(item.auxCode ? { auxCode: item.auxCode } : {}),
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      ...(item.discount && item.discount !== '' && item.discount !== '0' ? { discount: item.discount } : {}),
      taxes: [TAX_MAP[item.taxOption]],
    })),
    ...(data.additionalInfo && data.additionalInfo.length > 0
      ? { additionalInfo: data.additionalInfo }
      : {}),
  };
}

// Same best-effort send pattern as src/app/actions/invoice.ts — duplicated rather than
// shared since each action file in this project is self-contained (see clients.ts/catalog.ts).
async function sendAfterSigningIfRequested(
  apiCtx: { apiKey: string; issuerId: number },
  accessKey: string,
  sendAfterSigning: boolean
): Promise<void> {
  if (!sendAfterSigning) return;
  try {
    const sent = await sendToSri(apiCtx, accessKey);
    if (sent.status === 'RECEIVED') {
      try { await checkAuthorization(apiCtx, accessKey); } catch { /* polling handles it */ }
    }
  } catch { /* non-fatal */ }
}

export async function createCreditNoteAction(
  data: CreditNoteFormData,
  sendAfterSigning: boolean,
  from?: BackTargetKey
): Promise<CreateCreditNoteResult> {
  const ctx = await requireContext();
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };
  const payload = buildCreditNotePayload(data);

  let accessKey: string;
  try {
    const { document } = await createDocument(apiCtx, payload);
    accessKey = document.accessKey;
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  await sendAfterSigningIfRequested(apiCtx, accessKey, sendAfterSigning);

  const locale = await getLocale();
  redirect({ href: creditNoteHref(accessKey, from), locale });
  return null;
}

export async function rebuildCreditNoteAction(
  accessKey: string,
  data: CreditNoteFormData,
  sendAfterSigning: boolean,
  from?: BackTargetKey
): Promise<CreateCreditNoteResult> {
  const ctx = await requireContext();
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };
  const payload = buildCreditNotePayload(data);

  try {
    await rebuildDocument(apiCtx, accessKey, payload);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  await sendAfterSigningIfRequested(apiCtx, accessKey, sendAfterSigning);

  const locale = await getLocale();
  redirect({ href: creditNoteHref(accessKey, from), locale });
  return null;
}

export interface CreditableInvoiceSummary {
  accessKey: string;
  sequential: string;
  buyerName: string;
  issueDate: string;
  total: string;
}

export type SearchCreditableInvoicesResult =
  | { results: CreditableInvoiceSummary[] }
  | { error: string };

// Search AUTHORIZED invoices by (partial) sequential, scoped to the active issuer —
// used by the "find the invoice to credit" picker when not arriving from an Invoice
// Detail page. Mirrors the contains-match semantics of listDocuments' `sequential` param.
export async function searchCreditableInvoicesAction(
  sequential: string
): Promise<SearchCreditableInvoicesResult> {
  const ctx = await requireContext();
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };

  try {
    const { data } = await listDocuments(apiCtx, {
      documentType: CREDITABLE_DOCUMENT_TYPE,
      status: CREDITABLE_STATUS,
      sequential: sequential.trim() || undefined,
      limit: 8,
    });
    return {
      results: data.map((doc) => ({
        accessKey: doc.accessKey,
        sequential: doc.sequential,
        buyerName: doc.buyer.name,
        issueDate: doc.issueDate,
        total: doc.total,
      })),
    };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export interface CreditNotePrefillData {
  originalDocument: { documentType: string; number: string; issueDate: string };
  buyer: { idType: string; id: string; name: string; email: string };
  items: CreditNoteFormData['items'];
}

export type GetInvoiceForCreditNoteResult = { data: CreditNotePrefillData } | { error: string };

// Resolves an AUTHORIZED invoice's accessKey into everything needed to pre-fill the
// credit note form: originalDocument (reconstructed from the issuer's own
// branchCode/issuePointCode + the document's sequential — the API never exposes the
// NNN-NNN-NNNNNNNNN format directly, see docs/site/endpoints/create-credit-note.md),
// buyer, and items (recovered from requestPayload, same as the invoice rebuild flow).
export async function getInvoiceForCreditNoteAction(
  accessKey: string
): Promise<GetInvoiceForCreditNoteResult> {
  const ctx = await requireContext();
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };

  let document;
  try {
    document = await getDocument(apiCtx, accessKey);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  if (document.documentType !== CREDITABLE_DOCUMENT_TYPE) {
    return { error: 'DOCUMENT_TYPE_NOT_SUPPORTED' };
  }
  if (document.status !== CREDITABLE_STATUS) {
    return { error: 'DOCUMENT_NOT_AUTHORIZED' };
  }

  const items: CreditNoteFormData['items'] =
    document.requestPayload && document.requestPayload.documentType === '01'
      ? document.requestPayload.items.map((item) => ({
          mainCode: item.mainCode,
          auxCode: item.auxCode,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          taxOption: `${item.taxes[0].code}-${item.taxes[0].rateCode}` as CreditNoteFormData['items'][number]['taxOption'],
        }))
      : [];

  return {
    data: {
      originalDocument: {
        documentType: document.documentType,
        number: `${ctx.issuer.branchCode}-${ctx.issuer.issuePointCode}-${document.sequential}`,
        issueDate: document.issueDate,
      },
      buyer: {
        idType: document.buyer.idType,
        id: document.buyer.id,
        name: document.buyer.name,
        email: document.buyer.email,
      },
      items,
    },
  };
}
