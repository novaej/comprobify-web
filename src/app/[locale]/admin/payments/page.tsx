import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { listPendingPayments, listAdminIssuers } from '@/lib/admin-api';
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
  const [payments, issuers] = await Promise.all([
    listPendingPayments('REPORTED'),
    listAdminIssuers(),
  ]);

  // Build tenantId → display name: prefer tradeName, fall back to businessName.
  // Use the first issuer found per tenant (all share the same RUC/legal name).
  const tenantNames = new Map<string, string>();
  for (const issuer of issuers) {
    if (!tenantNames.has(issuer.tenantId)) {
      tenantNames.set(issuer.tenantId, issuer.tradeName ?? issuer.businessName);
    }
  }

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <AdminPaymentManager payments={payments} tenantNames={tenantNames} />
    </div>
  );
}
