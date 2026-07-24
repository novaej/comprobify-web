import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { listTenants } from '@/lib/admin-api';
import { db } from '@/lib/db';
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

  // The Comprobify API's tenants table has no business name column (it lives on
  // `issuers`, tied to RUC registration) — the local Tenant mirror row is the only
  // place a per-tenant business name exists, and only for tenants that have
  // completed onboarding through this app.
  const localTenants = await db.tenant.findMany({
    where: { apiTenantId: { in: tenants.map((tenant) => tenant.id) } },
    select: { apiTenantId: true, businessName: true },
  });
  const businessNameByApiTenantId = new Map(localTenants.map((t) => [t.apiTenantId, t.businessName]));
  const tenantsWithBusinessName = tenants.map((tenant) => ({
    ...tenant,
    businessName: businessNameByApiTenantId.get(tenant.id) ?? null,
  }));

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <AdminTenantManager tenants={tenantsWithBusinessName} />
    </div>
  );
}
