import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { listPendingPayments } from '@/lib/admin-api';
import { PageHeader } from '@/components/page-header';
import { AdminPaymentManager } from '@/components/admin-payment-manager';

export default async function AdminPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.payments');

  await requireSuperAdmin();
  const payments = await listPendingPayments('REPORTED');

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <AdminPaymentManager payments={payments} />
    </div>
  );
}
