import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/page-header';
import { DocumentTable } from '@/components/document-table';
import { DocumentPagination, getTotalPages } from '@/components/document-pagination';
import { DocumentFilters } from '@/components/document-filters';
import { buttonVariants } from '@/components/ui/button';
import { listDocuments, listIssuerDocumentTypes, DOCUMENT_SORT_FIELDS, DOCUMENT_STATUSES } from '@/lib/api';
import { requirePermission } from '@/lib/context';
import { Plus } from 'lucide-react';
import type { Document, Pagination, DocumentSortField, DocumentStatus } from '@/lib/api';

const CREATE_HREFS: Record<string, string> = {
  '01': '/invoices/new',
  '04': '/credit-notes/new',
};

const PAGE_SIZE = 20;

type DocumentSearchParams = {
  page?: string;
  sortBy?: string;
  sortDir?: string;
  sequential?: string;
  buyerName?: string;
  date?: string; // YYYY-MM-DD, picked from the calendar
  status?: string;
};

function isSortField(value: string | undefined): value is DocumentSortField {
  return DOCUMENT_SORT_FIELDS.includes(value as DocumentSortField);
}

function isDocumentStatus(value: string | undefined): value is DocumentStatus {
  return DOCUMENT_STATUSES.includes(value as DocumentStatus);
}

// "YYYY-MM-DD" -> "DD/MM/YYYY" (pure string manipulation — avoids constructing a
// Date object and any timezone shift for what is meant to be a plain calendar day).
function toApiDate(isoDate: string): string | undefined {
  const [y, m, d] = isoDate.split('-');
  return y && m && d ? `${d}/${m}/${y}` : undefined;
}

function buildHref(
  basePath: string,
  current: DocumentSearchParams,
  overrides: Partial<Record<keyof DocumentSearchParams, string | undefined>>
): string {
  const merged: DocumentSearchParams = { ...current, ...overrides };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export default async function DocumentListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; type: string }>;
  searchParams: Promise<DocumentSearchParams>;
}) {
  const { locale, type } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('documents');

  const ctx = await requirePermission('documents.read');
  const canCreate = ctx.permissions.has('documents.create');
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };

  const page = Math.max(1, Number(sp.page) || 1);
  const sortBy = isSortField(sp.sortBy) ? sp.sortBy : undefined;
  const sortDir = sp.sortDir === 'asc' ? 'asc' : sp.sortDir === 'desc' ? 'desc' : undefined;
  const status = isDocumentStatus(sp.status) ? sp.status : undefined;
  const dayFilter = sp.date ? toApiDate(sp.date) : undefined;
  const hasActiveFilters = Boolean(sp.sequential || sp.buyerName || sp.date || status);

  let documents: Document[] = [];
  let pagination: Pagination | null = null;
  let fetchError = false;
  try {
    ({ data: documents, pagination } = await listDocuments(apiCtx, {
      documentType: type,
      limit: PAGE_SIZE,
      page,
      sortBy,
      sortDir,
      sequential: sp.sequential,
      buyerName: sp.buyerName,
      status,
      from: dayFilter,
      to: dayFilter,
    }));
  } catch {
    fetchError = true;
  }

  // Reachable by direct URL (e.g. a bookmark from before a tier downgrade) even
  // though the hub only ever links here for a type the issuer has enabled — so
  // this page needs its own check, same reasoning as InvoiceActions' credit-note
  // button: POST /v1/documents rejects a type the issuer hasn't enabled with
  // DOCUMENT_TYPE_NOT_ENABLED, itself capped by the tenant's tier.
  const issuerDocumentTypes = await listIssuerDocumentTypes(apiCtx, ctx.issuer.apiIssuerId).catch(() => ['01']);

  const nameKey = `types.${type}.name` as Parameters<typeof t>[0];
  const typeName = t.has(nameKey) ? t(nameKey) : type;
  const createHref = issuerDocumentTypes.includes(type) ? CREATE_HREFS[type] : undefined;
  const basePath = `/documents/${type}`;

  function sortHrefFor(field: DocumentSortField): string {
    const nextDir = sortBy === field && sortDir === 'asc' ? 'desc' : 'asc';
    return buildHref(basePath, sp, { sortBy: field, sortDir: nextDir, page: undefined });
  }

  return (
    <div>
      <PageHeader
        title={typeName}
        backHref="/documents"
        backLabel={t('title')}
        action={
          createHref && canCreate ? (
            <Link href={`${createHref}?from=documents-${type}`} className={buttonVariants({ size: 'sm' })}>
              <Plus className="h-4 w-4" />
              {t('createNew')}
            </Link>
          ) : undefined
        }
      />

      <DocumentFilters
        labels={{
          sequential: t('list.filters.sequential'),
          sequentialPlaceholder: t('list.filters.sequentialPlaceholder'),
          buyerName: t('list.filters.buyerName'),
          buyerNamePlaceholder: t('list.filters.buyerNamePlaceholder'),
          date: t('list.filters.date'),
          datePlaceholder: t('list.filters.datePlaceholder'),
          status: t('list.filters.status'),
          allStatuses: t('list.filters.allStatuses'),
          clear: t('list.filters.clear'),
        }}
      />

      <DocumentTable
        documents={documents}
        fetchError={fetchError}
        hasActiveFilters={hasActiveFilters}
        from={`documents-${type}`}
        sort={{ field: sortBy ?? null, dir: sortDir ?? 'desc', hrefFor: sortHrefFor }}
        labels={{
          sequential: t('list.table.sequential'),
          buyer: t('list.table.buyer'),
          date: t('list.table.date'),
          total: t('list.table.total'),
          status: t('list.table.status'),
          empty: t('list.empty'),
          emptyFiltered: t('list.emptyFiltered'),
          error: t('list.error'),
          actions: t('list.table.actions'),
          downloadPdf: t('list.table.downloadPdf'),
          downloadXml: t('list.table.downloadXml'),
        }}
      />

      {pagination && (
        <DocumentPagination
          pagination={pagination}
          hrefFor={(target) => buildHref(basePath, sp, { page: String(target) })}
          labels={{
            previous: t('list.pagination.previous'),
            next: t('list.pagination.next'),
            pageInfo: t('list.pagination.pageInfo', {
              page: pagination.page,
              totalPages: getTotalPages(pagination),
            }),
          }}
        />
      )}
    </div>
  );
}
