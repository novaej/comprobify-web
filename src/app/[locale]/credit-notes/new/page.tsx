import { setRequestLocale, getTranslations } from 'next-intl/server';
import { CreditNoteForm } from '@/components/credit-note-form';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import {
  listCatalogIdTypes,
  listCatalogTaxRates,
  listTenantIssuers,
  getDocument,
  type CatalogIdType,
  type CatalogTaxRate,
  type CreateCreditNotePayload,
} from '@/lib/api';
import type { CatalogProduct } from '@/app/actions/catalog';
import type { SavedClient } from '@/app/actions/clients';
import {
  getInvoiceForCreditNoteAction,
  resolveOriginalAccessKeyAction,
  getRemainingBalanceAction,
  type CreditNotePrefillData,
} from '@/app/actions/credit-note';
import { BACK_TARGETS, isBackTargetKey, type BackTargetKey } from '@/lib/back-targets';

export interface CreditNoteCatalogs {
  idTypes: CatalogIdType[];
  taxRates: CatalogTaxRate[];
  products: CatalogProduct[];
  clients: SavedClient[];
}

const REBUILDABLE_STATUSES = ['RETURNED', 'NOT_AUTHORIZED'];

export default async function NewCreditNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; fromInvoice?: string; rebuild?: string }>;
}) {
  const { locale } = await params;
  const { from, fromInvoice, rebuild } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('creditNoteForm');
  const tCommon = await getTranslations('common');
  const tDashboard = await getTranslations('dashboard');
  const tDocuments = await getTranslations('documents');

  const ctx = await requirePermission('documents.create');
  const { apiKey, tenant } = ctx;
  const apiCtx = { apiKey, issuerId: ctx.issuer.apiIssuerId };

  // Rebuild mode: pre-fill from an existing RETURNED/NOT_AUTHORIZED credit note's
  // requestPayload. Any failure silently falls back to a normal blank create form.
  let rebuildFrom: { accessKey: string; payload: CreateCreditNotePayload; issueDate: string } | undefined;
  if (rebuild) {
    try {
      const document = await getDocument(apiCtx, rebuild);
      if (
        REBUILDABLE_STATUSES.includes(document.status) &&
        document.requestPayload &&
        document.requestPayload.documentType === '04'
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

  // Entry from an Invoice Detail page: pre-fill originalDocument/buyer/items from
  // that AUTHORIZED invoice. Falls back to a blank form (with the search dialog) on
  // any failure — e.g. the invoice was found but isn't AUTHORIZED.
  let invoicePrefill: CreditNotePrefillData | undefined;
  if (!rebuildFrom && fromInvoice) {
    const result = await getInvoiceForCreditNoteAction(fromInvoice);
    if ('data' in result) invoicePrefill = result.data;
  }

  // Rebuild mode only has documentType/number/issueDate for the original (recovered from
  // the credit note's own requestPayload), not its accessKey — resolve it so the form can
  // still show/enforce the remaining balance. Best-effort: silently shows nothing if the
  // original can't be uniquely resolved (e.g. issuer/sequential changed since creation).
  let initialOriginalAccessKey: string | undefined;
  let initialOriginalTotal: string | undefined;
  let initialRemaining: string | undefined;
  if (rebuildFrom) {
    const resolved = await resolveOriginalAccessKeyAction(
      rebuildFrom.payload.originalDocument.documentType,
      rebuildFrom.payload.originalDocument.number
    );
    if (resolved) {
      const balanceResult = await getRemainingBalanceAction(resolved);
      if (!('error' in balanceResult)) {
        initialOriginalAccessKey = resolved;
        initialOriginalTotal = balanceResult.originalTotal;
        initialRemaining = balanceResult.remaining;
      }
    }
  } else if (invoicePrefill) {
    initialOriginalAccessKey = invoicePrefill.originalAccessKey;
    initialOriginalTotal = invoicePrefill.originalTotal;
    initialRemaining = invoicePrefill.remaining;
  }

  const backTargetKey: BackTargetKey = isBackTargetKey(from) ? from : 'dashboard';
  const backTarget = BACK_TARGETS[backTargetKey];
  const tBack = backTarget.namespace === 'documents' ? tDocuments : tDashboard;
  const backHref = rebuildFrom ? `/invoices/${rebuildFrom.accessKey}` : backTarget.href;
  const backLabel = rebuildFrom ? tCommon('back') : tBack(backTarget.key as Parameters<typeof tBack>[0]);

  const [idTypes, taxRates, productRows, clientRows, apiIssuers] = await Promise.all([
    listCatalogIdTypes(apiCtx),
    listCatalogTaxRates(apiCtx),
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
    listTenantIssuers({ apiKey }).catch(() => []),
  ]);

  const products: CatalogProduct[] = productRows.map((r) => ({ ...r, unitPrice: r.unitPrice.toString() }));
  const catalogs: CreditNoteCatalogs = { idTypes, taxRates, products, clients: clientRows };
  const canIssue = apiIssuers.find((a) => a.id === ctx.issuer.apiIssuerId)?.canIssue ?? true;

  return (
    <div>
      <PageHeader
        title={rebuildFrom ? t('rebuildTitle') : t('title')}
        backHref={backHref}
        backLabel={backLabel}
      />
      <CreditNoteForm
        catalogs={catalogs}
        defaultValues={invoicePrefill}
        initialOriginalAccessKey={initialOriginalAccessKey}
        initialOriginalTotal={initialOriginalTotal}
        initialRemaining={initialRemaining}
        rebuildFrom={rebuildFrom}
        backHref={backHref}
        from={backTargetKey}
        issuer={ctx.issuer}
        canIssue={canIssue}
      />
    </div>
  );
}
