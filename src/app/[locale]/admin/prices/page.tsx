import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { listTierPrices } from '@/lib/admin-api';
import { PageHeader } from '@/components/page-header';
import { AdminPriceManager } from '@/components/admin-price-manager';

export default async function AdminPricesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.prices');

  await requireSuperAdmin();
  const prices = await listTierPrices();

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <AdminPriceManager prices={prices} />
    </div>
  );
}
