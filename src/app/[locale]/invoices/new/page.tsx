import { setRequestLocale, getTranslations } from 'next-intl/server';
import { InvoiceForm } from '@/components/invoice-form';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import {
  listCatalogIdTypes,
  listCatalogPaymentMethods,
  listCatalogTaxRates,
  listCatalogTermUnits,
  getDocument,
  type CatalogIdType,
  type CatalogPaymentMethod,
  type CatalogTaxRate,
  type CatalogTermUnit,
  type CreateInvoicePayload,
} from '@/lib/api';
import type { CatalogProduct } from '@/app/actions/catalog';
import type { SavedClient } from '@/app/actions/clients';
import { listInvoiceTemplatesAction, type SavedDocumentTemplate } from '@/app/actions/templates';
import { BACK_TARGETS, isBackTargetKey, type BackTargetKey } from '@/lib/back-targets';

export interface InvoiceCatalogs {
  idTypes: CatalogIdType[];
  paymentMethods: CatalogPaymentMethod[];
  taxRates: CatalogTaxRate[];
  termUnits: CatalogTermUnit[];
  products: CatalogProduct[];
  clients: SavedClient[];
  templates: SavedDocumentTemplate[];
}

const REBUILDABLE_STATUSES = ['RETURNED', 'NOT_AUTHORIZED'];

export default async function NewInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; rebuild?: string }>;
}) {
  const { locale } = await params;
  const { from, rebuild } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('invoiceForm');
  const tCommon = await getTranslations('common');
  const tDashboard = await getTranslations('dashboard');
  const tDocuments = await getTranslations('documents');

  const ctx = await requirePermission('documents.create');
  const { apiKey, tenant } = ctx;

  const apiCtx = { apiKey, issuerId: ctx.issuer.apiIssuerId };

  // Rebuild mode: pre-fill the form from an existing RETURNED/NOT_AUTHORIZED document's
  // requestPayload. Any failure (not found, wrong status, no requestPayload) silently
  // falls back to a normal blank create form rather than erroring the whole page.
  let rebuildFrom: { accessKey: string; payload: CreateInvoicePayload; issueDate: string } | undefined;
  if (rebuild) {
    try {
      const document = await getDocument(apiCtx, rebuild);
      if (
        REBUILDABLE_STATUSES.includes(document.status) &&
        document.requestPayload &&
        document.requestPayload.documentType === '01'
      ) {
        rebuildFrom = {
          accessKey: document.accessKey,
          payload: document.requestPayload,
          issueDate: document.issueDate,
        };
      }
    } catch {
      // fall through to blank create form
    }
  }

  const backTargetKey: BackTargetKey = isBackTargetKey(from) ? from : 'dashboard';
  const backTarget = BACK_TARGETS[backTargetKey];
  const tBack = backTarget.namespace === 'documents' ? tDocuments : tDashboard;
  const backHref = rebuildFrom ? `/invoices/${rebuildFrom.accessKey}` : backTarget.href;
  const backLabel = rebuildFrom ? tCommon('back') : tBack(backTarget.key as Parameters<typeof tBack>[0]);

  const [idTypes, paymentMethods, taxRates, termUnits, productRows, clientRows, templates] = await Promise.all([
    listCatalogIdTypes(apiCtx),
    listCatalogPaymentMethods(apiCtx),
    listCatalogTaxRates(apiCtx),
    listCatalogTermUnits(apiCtx),
    db.product.findMany({
      where: { tenantId: tenant.id },
      orderBy: { mainCode: 'asc' },
      select: { id: true, mainCode: true, auxCode: true, description: true, unitPrice: true, taxOption: true },
    }),
    db.client.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: 'asc' },
      select: { id: true, idType: true, idNumber: true, name: true, email: true, address: true },
    }),
    listInvoiceTemplatesAction(),
  ]);

  const products: CatalogProduct[] = productRows.map((r) => ({
    ...r,
    unitPrice: r.unitPrice.toString(),
  }));

  const catalogs: InvoiceCatalogs = { idTypes, paymentMethods, taxRates, termUnits, products, clients: clientRows, templates };

  return (
    <div>
      <PageHeader
        title={rebuildFrom ? t('rebuildTitle') : t('title')}
        backHref={backHref}
        backLabel={backLabel}
      />
      <InvoiceForm catalogs={catalogs} rebuildFrom={rebuildFrom} backHref={backHref} from={backTargetKey} issuer={ctx.issuer} />
    </div>
  );
}
