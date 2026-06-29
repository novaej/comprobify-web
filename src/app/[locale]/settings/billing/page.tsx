import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import { getCurrentTenant, getMySubscriptions } from '@/lib/api';
import { listTiers, type ApiTierInfo } from '@/lib/public-api';
import { PageHeader } from '@/components/page-header';
import { BillingManager } from '@/components/billing-manager';
import type { ApiBankTransferInfo } from '@/lib/api';
import { Prisma } from '@prisma/client';

export default async function BillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('billing');
  const tSettings = await getTranslations('settings');

  const ctx = await requirePermission('billing.read', { skipIssuer: true });

  // Subscribing/changing tier no longer depends on environment — POST /v1/subscriptions
  // works while still in sandbox (the grant just has no production effect until promoted).
  const [tenantInfo, subscriptions, tenantRow, tiers] = await Promise.all([
    getCurrentTenant({ apiKey: ctx.apiKey }),
    getMySubscriptions({ apiKey: ctx.apiKey }),
    db.tenant.findUnique({ where: { id: ctx.tenant.id }, select: { pendingBankTransfer: true } }),
    listTiers().catch(() => []),
  ]);

  const latestSubscription = subscriptions[0] ?? null;
  const latestPayment = latestSubscription?.payments[0] ?? null;
  let pendingBankTransfer = tenantRow?.pendingBankTransfer as ApiBankTransferInfo | null;

  // The bank transfer block is only relevant while a payment is awaiting review —
  // once verified, clear the cached info so a future rejected/re-submitted
  // payment on a *new* subscription doesn't show stale account details.
  if (latestPayment?.status === 'VERIFIED' && pendingBankTransfer) {
    pendingBankTransfer = null;
    db.tenant
      .update({ where: { id: ctx.tenant.id }, data: { pendingBankTransfer: Prisma.JsonNull } })
      .catch(() => {});
  }

  const currentTier = tiers.find((tier: ApiTierInfo) => tier.name === tenantInfo.subscriptionTier) ?? null;

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('title')} backHref="/settings" backLabel={tSettings('title')} />
      <BillingManager
        tenantInfo={tenantInfo}
        currentTier={currentTier}
        tiers={tiers}
        subscriptions={subscriptions}
        pendingBankTransfer={pendingBankTransfer}
        canManageBilling={ctx.permissions.has('billing.manage')}
        isSandbox={ctx.tenant.environment === 'sandbox'}
        emailVerified={ctx.user.emailVerified}
      />
    </div>
  );
}
