import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { listPendingPayments, listAdminIssuers } from '@/lib/admin-api';
import { PageHeader } from '@/components/page-header';
import { AdminPaymentManager } from '@/components/admin-payment-manager';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

const STATUSES = ['REPORTED', 'VERIFIED', 'REJECTED'] as const;
type PaymentStatus = typeof STATUSES[number];

export default async function AdminPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ locale }, { status: rawStatus }] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const t = await getTranslations('admin.payments');

  await requireSuperAdmin();

  const status: PaymentStatus = STATUSES.includes(rawStatus as PaymentStatus)
    ? (rawStatus as PaymentStatus)
    : 'REPORTED';

  const [payments, issuers] = await Promise.all([
    listPendingPayments(status),
    listAdminIssuers(),
  ]);

  // Build tenantId → business name. All issuers under a tenant share the same
  // legal name — use the first one found.
  const tenantNames: Record<string, string> = {};
  for (const issuer of issuers) {
    if (!(issuer.tenantId in tenantNames)) {
      tenantNames[issuer.tenantId] = issuer.businessName;
    }
  }

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />

      {/* Status filter tabs */}
      <div className="mb-6 flex gap-1 rounded-lg border border-border bg-muted/40 p-1 w-fit">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/payments?status=${s}`}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              status === s
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`statuses.${s}`)}
          </Link>
        ))}
      </div>

      <AdminPaymentManager key={status} payments={payments} tenantNames={tenantNames} reviewable={status === 'REPORTED'} />
    </div>
  );
}
