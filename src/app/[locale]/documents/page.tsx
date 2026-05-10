import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { listDocuments, listDocumentTypes } from '@/lib/api';
import { requireApiKey } from '@/lib/auth-token';
import { cn } from '@/lib/utils';
import {
  FileText,
  FileMinus,
  FilePlus,
  Truck,
  Percent,
  ShoppingBag,
  Plus,
  ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const TYPE_META: Record<string, { icon: LucideIcon; createHref?: string }> = {
  '01': { icon: FileText, createHref: '/invoices/new' },
  '03': { icon: ShoppingBag },
  '04': { icon: FileMinus },
  '05': { icon: FilePlus },
  '06': { icon: Truck },
  '07': { icon: Percent },
};

type TypeStats = { total: number; authorized: number } | null;

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  return {
    from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: fmt(now),
  };
}

async function fetchTypeStats(apiKey: string, type: string): Promise<TypeStats> {
  const { from, to } = currentMonthRange();
  try {
    const [totalRes, authorizedRes] = await Promise.all([
      listDocuments(apiKey, { documentType: type, from, to, limit: 1 }),
      listDocuments(apiKey, { documentType: type, status: 'AUTHORIZED', from, to, limit: 1 }),
    ]);
    return {
      total: totalRes.pagination.total,
      authorized: authorizedRes.pagination.total,
    };
  } catch {
    return null;
  }
}

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('documents');

  const apiKey = await requireApiKey();

  let docTypes: string[] = [];
  let fetchError = false;
  try {
    docTypes = await listDocumentTypes(apiKey);
  } catch {
    fetchError = true;
  }

  const statsResults = docTypes.length > 0
    ? await Promise.all(docTypes.map((type) => fetchTypeStats(apiKey, type)))
    : [];
  const statsMap: Record<string, TypeStats> = Object.fromEntries(
    docTypes.map((type, i) => [type, statsResults[i]])
  );

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />

      {fetchError ? (
        <p className="text-sm text-destructive">{t('list.error')}</p>
      ) : docTypes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noTypes')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {docTypes.map((type) => {
            const meta = TYPE_META[type];
            const Icon = meta?.icon ?? FileText;
            const createHref = meta?.createHref;
            const nameKey = `types.${type}.name` as Parameters<typeof t>[0];
            const descKey = `types.${type}.description` as Parameters<typeof t>[0];
            const stats = statsMap[type];

            return (
              <div
                key={type}
                className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Header */}
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="font-semibold leading-snug text-foreground">
                      {t.has(nameKey) ? t(nameKey) : type}
                    </p>
                    {t.has(descKey) && (
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {t(descKey)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="rounded-lg bg-muted/40 px-4 py-3">
                  <p className="mb-2.5 text-xs font-medium text-muted-foreground">{t('stats.period')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-2xl font-bold tabular-nums leading-none text-foreground">
                        {stats ? stats.total : '—'}
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">{t('stats.total')}</p>
                    </div>
                    <div>
                      <p className={cn(
                        'text-2xl font-bold tabular-nums leading-none',
                        stats && stats.authorized > 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-foreground'
                      )}>
                        {stats ? stats.authorized : '—'}
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">{t('stats.authorized')}</p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-auto flex flex-wrap gap-2">
                  <Link
                    href={`/documents/${type}`}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
                  >
                    {t('viewList')}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  {createHref && (
                    <Link
                      href={createHref}
                      className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t('createNew')}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
