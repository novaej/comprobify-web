'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { createDocument, rebuildDocument, sendToSri, type CreateInvoicePayload } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { requirePermission } from '@/lib/context';
import { syncSuspensionStatus } from '@/lib/suspension-sync';
import type { BackTargetKey } from '@/lib/back-targets';

function invoiceHref(accessKey: string, from?: BackTargetKey): string {
  return from ? `/invoices/${accessKey}?from=${from}` : `/invoices/${accessKey}`;
}

type TaxOption = '2-4' | '2-0' | '2-5' | '2-6' | '2-7';

export interface InvoiceFormData {
  guiaRemision?: string;
  buyer: {
    idType: string;
    id: string;
    name: string;
    email: string;
    address?: string;
  };
  items: Array<{
    mainCode: string;
    auxCode?: string;
    description: string;
    quantity: string;
    unitPrice: string;
    discount?: string;
    taxOption: TaxOption;
  }>;
  payments: Array<{
    method: string;
    total: string;
    term?: string;
    termUnit?: string;
  }>;
  additionalInfo?: Array<{ name: string; value: string }>;
}

const TAX_MAP: Record<TaxOption, { code: string; rateCode: string; rate: string }> = {
  '2-4': { code: '2', rateCode: '4', rate: '15' },
  '2-0': { code: '2', rateCode: '0', rate: '0' },
  '2-5': { code: '2', rateCode: '5', rate: '5' },
  '2-6': { code: '2', rateCode: '6', rate: '0' },
  '2-7': { code: '2', rateCode: '7', rate: '0' },
};

export type CreateInvoiceResult = { error: string } | null;

function buildCreateDocumentPayload(data: InvoiceFormData): CreateInvoicePayload {
  return {
    documentType: '01',
    ...(data.guiaRemision ? { guiaRemision: data.guiaRemision } : {}),
    buyer: {
      idType: data.buyer.idType,
      id: data.buyer.id,
      name: data.buyer.name,
      email: data.buyer.email,
      ...(data.buyer.address ? { address: data.buyer.address } : {}),
    },
    items: data.items.map((item) => ({
      mainCode: item.mainCode,
      ...(item.auxCode ? { auxCode: item.auxCode } : {}),
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      ...(item.discount && item.discount !== '' && item.discount !== '0' ? { discount: item.discount } : {}),
      taxes: [TAX_MAP[item.taxOption]],
    })),
    payments: data.payments.map((p) => ({
      method: p.method,
      total: p.total,
      ...(p.term && p.term !== '' ? { term: Number(p.term) } : {}),
      ...(p.termUnit && p.termUnit !== '' ? { termUnit: p.termUnit } : {}),
    })),
    ...(data.additionalInfo && data.additionalInfo.length > 0
      ? { additionalInfo: data.additionalInfo }
      : {}),
  };
}

// Best-effort: queue the send to SRI immediately, unless the user chose "Firmar"
// (sign only). This only queues the async submission (see ADR-019) — the
// detail page's InvoiceActions auto-resumes polling for PENDING_SEND on mount,
// and falls back to a recovery Send button if queuing failed or was skipped.
async function sendAfterSigningIfRequested(
  apiCtx: { apiKey: string; issuerId: number },
  accessKey: string,
  sendAfterSigning: boolean
): Promise<void> {
  if (!sendAfterSigning) return;
  try {
    await sendToSri(apiCtx, accessKey);
  } catch { /* non-fatal */ }
}

export async function createInvoiceAction(
  data: InvoiceFormData,
  sendAfterSigning: boolean,
  from?: BackTargetKey
): Promise<CreateInvoiceResult> {
  const ctx = await requirePermission('documents.create');
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };
  const payload = buildCreateDocumentPayload(data);

  let accessKey: string;
  try {
    const { document } = await createDocument(apiCtx, payload);
    accessKey = document.accessKey;
  } catch (err) {
    if (err instanceof ApiError) {
      await syncSuspensionStatus(ctx.tenant.id, err);
      return { error: err.code };
    }
    throw err;
  }

  await sendAfterSigningIfRequested(apiCtx, accessKey, sendAfterSigning);

  const locale = await getLocale();
  redirect({ href: invoiceHref(accessKey, from), locale });
  return null;
}

export async function rebuildInvoiceAction(
  accessKey: string,
  data: InvoiceFormData,
  sendAfterSigning: boolean,
  from?: BackTargetKey
): Promise<CreateInvoiceResult> {
  const ctx = await requirePermission('documents.manage');
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };
  const payload = buildCreateDocumentPayload(data);

  try {
    await rebuildDocument(apiCtx, accessKey, payload);
  } catch (err) {
    if (err instanceof ApiError) {
      await syncSuspensionStatus(ctx.tenant.id, err);
      return { error: err.code };
    }
    throw err;
  }

  await sendAfterSigningIfRequested(apiCtx, accessKey, sendAfterSigning);

  const locale = await getLocale();
  redirect({ href: invoiceHref(accessKey, from), locale });
  return null;
}
