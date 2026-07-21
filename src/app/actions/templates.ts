'use server';

import { db } from '@/lib/db';
import { requireContext, requirePermission } from '@/lib/context';
import { revalidatePath } from 'next/cache';
import type { InvoiceFormData } from './invoice';
import type { Prisma } from '@prisma/client';

export type SavedDocumentTemplate = {
  id: string;
  name: string;
  data: InvoiceFormData;
};

export type TemplateResult = { error: string } | null;

async function requireTenantId(): Promise<string> {
  const ctx = await requireContext({ skipIssuer: true });
  return ctx.tenant.id;
}

async function requireTenantIdForCreate(): Promise<string> {
  const ctx = await requirePermission('documents.create', { skipIssuer: true });
  return ctx.tenant.id;
}

// documentType is hardcoded to '01' (invoices) until other document types get a create flow.
const INVOICE_DOCUMENT_TYPE = '01';

export async function listInvoiceTemplatesAction(): Promise<SavedDocumentTemplate[]> {
  const tenantId = await requireTenantId();
  const rows = await db.documentTemplate.findMany({
    where: { tenantId, documentType: INVOICE_DOCUMENT_TYPE },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, data: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, data: r.data as unknown as InvoiceFormData }));
}

export async function saveInvoiceTemplateAction(name: string, data: InvoiceFormData): Promise<TemplateResult> {
  const tenantId = await requireTenantIdForCreate();
  const trimmed = name.trim();
  if (!trimmed) return { error: 'REQUIRED_FIELDS' };

  await db.documentTemplate.upsert({
    where: { tenantId_documentType_name: { tenantId, documentType: INVOICE_DOCUMENT_TYPE, name: trimmed } },
    create: { tenantId, documentType: INVOICE_DOCUMENT_TYPE, name: trimmed, data: data as unknown as Prisma.InputJsonValue },
    update: { data: data as unknown as Prisma.InputJsonValue },
  });
  revalidatePath('/invoices/new');
  return null;
}

export async function deleteInvoiceTemplateAction(id: string): Promise<TemplateResult> {
  const tenantId = await requireTenantIdForCreate();
  await db.documentTemplate.deleteMany({ where: { id, tenantId, documentType: INVOICE_DOCUMENT_TYPE } });
  revalidatePath('/invoices/new');
  return null;
}
