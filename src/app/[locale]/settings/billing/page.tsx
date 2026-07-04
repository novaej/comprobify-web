import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import { getCurrentTenant, getMySubscriptions, listPaymentProofs } from '@/lib/api';
import { listTiers, type ApiTierInfo } from '@/lib/public-api';
import { isPaidTier, isBillingInterval } from '@/lib/subscription-tiers';
import { PageHeader } from '@/components/page-header';
import { BillingManager } from '@/components/billing-manager';
import type { ApiBankTransferInfo, ApiPaymentProof } from '@/lib/api';

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
    db.tenant.findUnique({ where: { id: ctx.tenant.id }, select: { pendingBankTransfer: true, intendedTier: true, intendedBillingInterval: true } }),
    listTiers().catch(() => []),
  ]);

  // Fetch proofs for the payment that needs action (pending, reported, or rejected),
  // so PendingPaymentCard can render the uploaded-files list on first render.
  const latestPayment = subscriptions[0]?.payments[0] ?? null;
  const isSubscriptionOver = subscriptions[0]?.status === 'CANCELLED' || subscriptions[0]?.status === 'EXPIRED';
  const needsAction = !!latestPayment && latestPayment.status !== 'VERIFIED' && !isSubscriptionOver;
  const initialProofs: ApiPaymentProof[] = needsAction
    ? await listPaymentProofs({ apiKey: ctx.apiKey }, latestPayment!.id).catch(() => [])
    : [];

  // bankTransfer is static, env-configured config on the API — identical for every
  // tenant and every payment (initial, tier-change, or renewal) — so once cached it's
  // kept indefinitely rather than cleared after each payment verifies. A renewal
  // payment in particular is opened by a backend cron job with no frontend call
  // involved, so there is no fresher bankTransfer to ever cache for it — this stays
  // the only source once the tenant's first payment captured it.
  const pendingBankTransfer = tenantRow?.pendingBankTransfer as ApiBankTransferInfo | null;
  const intendedTier = isPaidTier(tenantRow?.intendedTier) ? tenantRow.intendedTier : undefined;
  const intendedBillingInterval = isBillingInterval(tenantRow?.intendedBillingInterval) ? tenantRow.intendedBillingInterval : undefined;

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
        initialProofs={initialProofs}
        canManageBilling={ctx.permissions.has('billing.manage')}
        isSandbox={ctx.tenant.environment === 'sandbox'}
        emailVerified={ctx.user.emailVerified}
        intendedTier={intendedTier}
        intendedBillingInterval={intendedBillingInterval}
      />
    </div>
  );
}
