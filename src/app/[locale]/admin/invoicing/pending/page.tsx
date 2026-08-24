import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { listPendingInvoicing } from '@/lib/admin-api';
import { PageHeader } from '@/components/page-header';
import { AdminInvoicingManager } from '@/components/admin-invoicing-manager';
import { AdminRateLimitNotice } from '@/components/admin-rate-limit-notice';
import { ApiError } from '@/lib/errors';

export default async function AdminPendingInvoicingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.invoicing');

  await requireSuperAdmin();

  let items;
  try {
    items = (await listPendingInvoicing()).items;
  } catch (err) {
    if (!(err instanceof ApiError) || !err.isRateLimit()) throw err;
    items = null;
  }

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      {items === null ? <AdminRateLimitNotice /> : <AdminInvoicingManager items={items} />}
    </div>
  );
}
