import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { listPendingInvoicing } from '@/lib/admin-api';
import { PageHeader } from '@/components/page-header';
import { AdminInvoicingManager } from '@/components/admin-invoicing-manager';

export default async function AdminPendingInvoicingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.invoicing');

  await requireSuperAdmin();

  const { items } = await listPendingInvoicing();

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <AdminInvoicingManager items={items} />
    </div>
  );
}
