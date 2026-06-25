import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/page-header';
import { DocumentTable } from '@/components/document-table';
import { DashboardSummaryCards } from '@/components/dashboard-summary-cards';
import { buttonVariants } from '@/components/ui/button';
import { listDocuments, getDocumentStats } from '@/lib/api';
import { requireContext } from '@/lib/context';
import { Plus } from 'lucide-react';
import type { Document, DocumentStats } from '@/lib/api';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard');
  const tDocs = await getTranslations('documents');

  const ctx = await requireContext();
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };

  let documents: Document[] = [];
  let fetchError = false;
  let stats: DocumentStats | null = null;
  let statsError = false;

  const [documentsOutcome, statsOutcome] = await Promise.allSettled([
    listDocuments(apiCtx, { limit: 10 }),
    getDocumentStats(apiCtx),
  ]);

  if (documentsOutcome.status === 'fulfilled') {
    documents = documentsOutcome.value.data;
  } else {
    fetchError = true;
  }

  if (statsOutcome.status === 'fulfilled') {
    stats = statsOutcome.value;
  } else {
    statsError = true;
  }

  const typeName = (code: string) => {
    const key = `types.${code}.name` as Parameters<typeof tDocs>[0];
    return tDocs.has(key) ? tDocs(key) : code;
  };

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

      <DashboardSummaryCards
        stats={stats}
        fetchError={statsError}
        labels={{
          issuedThisMonth: t('summary.issuedThisMonth'),
          netRevenue: t('summary.netRevenue'),
          needsAttention: t('summary.needsAttention'),
          noActivity: t('summary.noActivity'),
          error: t('summary.error'),
        }}
        typeName={typeName}
      />

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t('recent')}</h2>
        <Link
          href="/documents"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          {t('viewAll')}
        </Link>
      </div>

      <DocumentTable
        documents={documents}
        fetchError={fetchError}
        from="dashboard"
        typeName={typeName}
        labels={{
          sequential: t('table.sequential'),
          type: t('table.type'),
          buyer: t('table.buyer'),
          date: t('table.date'),
          total: t('table.total'),
          status: t('table.status'),
          empty: t('table.empty'),
          error: t('table.error'),
          actions: t('table.actions'),
          downloadPdf: t('table.downloadPdf'),
          downloadXml: t('table.downloadXml'),
        }}
      />
    </div>
  );
}
