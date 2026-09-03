import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import { getCurrentTenant, getMySubscriptions, listPaymentProofs } from '@/lib/api';
import { listTiers, type ApiTierInfo } from '@/lib/public-api';
import { isPaidTier, isBillingInterval } from '@/lib/subscription-tiers';
import { reconcileTenantStatus } from '@/lib/tenant-status-sync';
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
  const [tenantInfo, subscriptions, tenantRow, tiersResult] = await Promise.all([
    getCurrentTenant({ apiKey: ctx.apiKey }),
    getMySubscriptions({ apiKey: ctx.apiKey }),
    db.tenant.findUnique({ where: { id: ctx.tenant.id }, select: { pendingBankTransfer: true, intendedTier: true, intendedBillingInterval: true } }),
    listTiers().catch(() => null),
  ]);
  const tiers = tiersResult?.tiers ?? [];
  const extraSeat = tiersResult?.extraSeat ?? null;

  // Fetch proofs for every payment upfront so they appear in both the
  // PendingPaymentCard and the read-only payment history rows.
  const allPayments = subscriptions.flatMap((sub) => sub.payments);
  const proofsEntries = await Promise.all(
    allPayments.map(async (p) => [
      String(p.id),
      await listPaymentProofs({ apiKey: ctx.apiKey }, p.id).catch(() => [] as ApiPaymentProof[]),
    ] as const),
  );
  const proofsByPaymentId: Record<string, ApiPaymentProof[]> = Object.fromEntries(proofsEntries);

  // Landing here with a fresh ApiTenantInfo.status in hand is the natural place to
  // reconcile the local mirror — closes the loop for a PAST_DUE tenant who just paid
  // and was flipped back to ACTIVE server-side (activateIfLinked), which this is
  // usually the very next page they'd see, and for an admin-lifted SUSPENDED tenant.
  await reconcileTenantStatus(ctx.tenant.id, ctx.tenant.status, tenantInfo.status);

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
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('title')} backHref="/settings" backLabel={tSettings('title')} />
      <BillingManager
        tenantInfo={tenantInfo}
        currentTier={currentTier}
        tiers={tiers}
        extraSeat={extraSeat}
        subscriptions={subscriptions}
        pendingBankTransfer={pendingBankTransfer}
        proofsByPaymentId={proofsByPaymentId}
        canManageBilling={ctx.permissions.has('billing.manage')}
        isSandbox={ctx.tenant.environment === 'sandbox'}
        emailVerified={ctx.user.emailVerified}
        intendedTier={intendedTier}
        intendedBillingInterval={intendedBillingInterval}
      />
    </div>
  );
}
