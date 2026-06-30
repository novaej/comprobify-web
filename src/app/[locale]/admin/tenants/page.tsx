import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { listTenants } from '@/lib/admin-api';
import { PageHeader } from '@/components/page-header';
import { AdminTenantManager } from '@/components/admin-tenant-manager';

export default async function AdminTenantsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.tenants');

  await requireSuperAdmin();
  const tenants = await listTenants();

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <AdminTenantManager tenants={tenants} />
    </div>
  );
}
