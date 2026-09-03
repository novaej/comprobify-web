import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { listSeatPrices } from '@/lib/admin-api';
import { PageHeader } from '@/components/page-header';
import { AdminSeatPriceManager } from '@/components/admin-seat-price-manager';
import { AdminRateLimitNotice } from '@/components/admin-rate-limit-notice';
import { ApiError } from '@/lib/errors';

export default async function AdminSeatPricesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.seatPrices');

  await requireSuperAdmin();

  let prices;
  try {
    prices = await listSeatPrices();
  } catch (err) {
    if (!(err instanceof ApiError) || !err.isRateLimit()) throw err;
    prices = null;
  }

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      {prices === null ? <AdminRateLimitNotice /> : <AdminSeatPriceManager prices={prices} />}
    </div>
  );
}
