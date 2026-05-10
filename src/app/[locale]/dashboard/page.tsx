import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/page-header';
import { DocumentTable } from '@/components/document-table';
import { buttonVariants } from '@/components/ui/button';
import { listDocuments } from '@/lib/api';
import { requireApiKey } from '@/lib/auth-token';
import { Plus } from 'lucide-react';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard');

  const apiKey = await requireApiKey();

  let documents: Awaited<ReturnType<typeof listDocuments>>['data'] = [];
  let fetchError = false;
  try {
    ({ data: documents } = await listDocuments(apiKey, { limit: 50 }));
  } catch {
    fetchError = true;
  }

  return (
    <div>
      <PageHeader
        title={t('title')}
        action={
          <Link href="/invoices/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="h-4 w-4" />
            {t('newDocument')}
          </Link>
        }
      />

      <DocumentTable
        documents={documents}
        fetchError={fetchError}
        labels={{
          sequential: t('table.sequential'),
          buyer: t('table.buyer'),
          date: t('table.date'),
          total: t('table.total'),
          status: t('table.status'),
          empty: t('table.empty'),
          error: t('table.error'),
        }}
      />
    </div>
  );
}
