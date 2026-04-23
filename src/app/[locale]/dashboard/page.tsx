import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { SandboxBanner } from '@/components/sandbox-banner';
import { buttonVariants } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard');

  return (
    <div className="space-y-6">
      <SandboxBanner />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Link href="/invoices/new" className={buttonVariants()}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newInvoice')}
        </Link>
      </div>

      {/* TODO Phase 3: Summary cards (total, authorized this month, pending) */}
      {/* TODO Phase 3: Invoice list table with StatusBadge, pagination */}
      <p className="text-sm text-muted-foreground">
        Panel en construcción — conecta con la API y agrega la tabla de comprobantes.
      </p>
    </div>
  );
}
