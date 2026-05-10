import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/page-header';
import { DocumentTable } from '@/components/document-table';
import { buttonVariants } from '@/components/ui/button';
import { listDocuments } from '@/lib/api';
import { requireApiKey } from '@/lib/auth-token';
import { ChevronLeft, Plus } from 'lucide-react';
import type { Document } from '@/lib/api';

const CREATE_HREFS: Record<string, string> = {
  '01': '/invoices/new',
};

export default async function DocumentListPage({
  params,
}: {
  params: Promise<{ locale: string; type: string }>;
}) {
  const { locale, type } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('documents');

  const apiKey = await requireApiKey();
  let documents: Document[] = [];
  let fetchError = false;
  try {
    ({ data: documents } = await listDocuments(apiKey, { documentType: type, limit: 50 }));
  } catch {
    fetchError = true;
  }

  const nameKey = `types.${type}.name` as Parameters<typeof t>[0];
  const typeName = t.has(nameKey) ? t(nameKey) : type;
  const createHref = CREATE_HREFS[type];

  return (
    <div>
      <Link
        href="/documents"
        className="mb-4 flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {t('title')}
      </Link>

      <PageHeader
        title={typeName}
        action={
          createHref ? (
            <Link href={createHref} className={buttonVariants({ size: 'sm' })}>
              <Plus className="h-4 w-4" />
              {t('createNew')}
            </Link>
          ) : undefined
        }
      />

      <DocumentTable
        documents={documents}
        fetchError={fetchError}
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
    </div>
  );
}
