'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { createDocument, sendToSri, checkAuthorization, CreateDocumentPayload } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { requireContext } from '@/lib/context';

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

export async function createInvoiceAction(data: InvoiceFormData): Promise<CreateInvoiceResult> {
  const ctx = await requireContext();
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };

  const payload: CreateDocumentPayload = {
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

  let accessKey: string;
  try {
    const { document } = await createDocument(apiCtx, payload);
    accessKey = document.accessKey;
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  // Best-effort: send to SRI immediately. If it fails the detail page
  // shows SIGNED status with a recovery Send button.
  try {
    const sent = await sendToSri(apiCtx, accessKey);
    if (sent.status === 'RECEIVED') {
      try { await checkAuthorization(apiCtx, accessKey); } catch { /* polling handles it */ }
    }
  } catch { /* non-fatal */ }

  const locale = await getLocale();
  redirect({ href: `/invoices/${accessKey}`, locale });
  return null;
}
