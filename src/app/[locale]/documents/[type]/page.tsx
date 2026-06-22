import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/page-header';
import { DocumentTable } from '@/components/document-table';
import { DocumentPagination, getTotalPages } from '@/components/document-pagination';
import { buttonVariants } from '@/components/ui/button';
import { listDocuments } from '@/lib/api';
import { requirePermission } from '@/lib/context';
import { Plus } from 'lucide-react';
import type { Document, Pagination } from '@/lib/api';

const CREATE_HREFS: Record<string, string> = {
  '01': '/invoices/new',
};

const PAGE_SIZE = 20;

export default async function DocumentListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; type: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, type } = await params;
  const { page: pageParam } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('documents');

  const ctx = await requirePermission('documents.read');
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };

  const page = Math.max(1, Number(pageParam) || 1);

  let documents: Document[] = [];
  let pagination: Pagination | null = null;
  let fetchError = false;
  try {
    ({ data: documents, pagination } = await listDocuments(apiCtx, {
      documentType: type,
      limit: PAGE_SIZE,
      page,
    }));
  } catch {
    fetchError = true;
  }

  const nameKey = `types.${type}.name` as Parameters<typeof t>[0];
  const typeName = t.has(nameKey) ? t(nameKey) : type;
  const createHref = CREATE_HREFS[type];

  return (
    <div>
      <PageHeader
        title={typeName}
        backHref="/documents"
        backLabel={t('title')}
        action={
          createHref ? (
            <Link href={`${createHref}?from=documents-${type}`} className={buttonVariants({ size: 'sm' })}>
              <Plus className="h-4 w-4" />
              {t('createNew')}
            </Link>
          ) : undefined
        }
      />

      <DocumentTable
        documents={documents}
        fetchError={fetchError}
        from={`documents-${type}`}
        labels={{
          sequential: t('list.table.sequential'),
          buyer: t('list.table.buyer'),
          date: t('list.table.date'),
          total: t('list.table.total'),
          status: t('list.table.status'),
          empty: t('list.empty'),
          error: t('list.error'),
        }}
      />

      {pagination && (
        <DocumentPagination
          pagination={pagination}
          basePath={`/documents/${type}`}
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
