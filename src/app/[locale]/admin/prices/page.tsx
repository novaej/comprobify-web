import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { listTierPrices } from '@/lib/admin-api';
import { PageHeader } from '@/components/page-header';
import { AdminPriceManager } from '@/components/admin-price-manager';
import { AdminRateLimitNotice } from '@/components/admin-rate-limit-notice';
import { ApiError } from '@/lib/errors';

export default async function AdminPricesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.prices');

  await requireSuperAdmin();

  let prices;
  try {
    prices = await listTierPrices();
  } catch (err) {
    if (!(err instanceof ApiError) || !err.isRateLimit()) throw err;
    prices = null;
  }

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      {prices === null ? <AdminRateLimitNotice /> : <AdminPriceManager prices={prices} />}
    </div>
  );
}
