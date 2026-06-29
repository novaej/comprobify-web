'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { toastApiError } from '@/lib/api-error-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { submitPaymentProofAction, changeTierAction, createSubscriptionAction } from '@/app/actions/billing';
import type { ApiTenantInfo, ApiSubscriptionInfo, ApiPaymentInfo, ApiBankTransferInfo } from '@/lib/api';
import type { ApiTierInfo } from '@/lib/public-api';
import type { PaidTier, BillingInterval } from '@/lib/subscription-tiers';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
const dateFormatter = new Intl.DateTimeFormat('es-EC', { dateStyle: 'long' });

const SUBSCRIPTION_STATUS_STYLES: Record<string, string> = {
  PENDING_PAYMENT: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  PAYMENT_RECEIVED: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  INVOICE_PROCESSING: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  ACTIVE: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30',
  EXPIRED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  SUSPENDED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  CANCELLED: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-500/15 dark:text-zinc-300 dark:border-zinc-500/30',
};

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-500/15 dark:text-zinc-300 dark:border-zinc-500/30',
  REPORTED: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  VERIFIED: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30',
  REJECTED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  REFUNDED: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-500/15 dark:text-zinc-300 dark:border-zinc-500/30',
};

export function BillingManager({
  tenantInfo,
  currentTier,
  tiers,
  subscriptions,
  pendingBankTransfer,
  canManageBilling,
  isSandbox,
  emailVerified,
}: {
  tenantInfo: ApiTenantInfo;
  currentTier: ApiTierInfo | null;
  tiers: ApiTierInfo[];
  subscriptions: ApiSubscriptionInfo[];
  pendingBankTransfer: ApiBankTransferInfo | null;
  canManageBilling: boolean;
  isSandbox: boolean;
  emailVerified: boolean;
}) {
  const t = useTranslations('billing');
  const tPricing = useTranslations('pricing');

  const tierKey = `tiers.${tenantInfo.subscriptionTier}.name` as Parameters<typeof tPricing>[0];
  const tierName = tPricing.has(tierKey) ? tPricing(tierKey) : tenantInfo.subscriptionTier;

  const latestSubscription = subscriptions[0] ?? null;
  const latestPayment = latestSubscription?.payments[0] ?? null;
  const isSubscriptionOver = latestSubscription?.status === 'CANCELLED' || latestSubscription?.status === 'EXPIRED';
  const needsAction = !!latestPayment && latestPayment.status !== 'VERIFIED' && !isSubscriptionOver;
  const pendingDowngradeTier = latestSubscription?.status === 'ACTIVE' ? latestSubscription.pending_tier : null;
  const canChangeTier =
    canManageBilling &&
    latestSubscription?.status === 'ACTIVE' &&
    !needsAction &&
    !pendingDowngradeTier;
  // POST /v1/subscriptions blocks a new subscription while any prior one isn't
  // CANCELLED/EXPIRED — mirror that here rather than just "no subscriptions yet".
  const canSubscribeNew = canManageBilling && subscriptions.every((s) => s.status === 'CANCELLED' || s.status === 'EXPIRED');

  return (
    <div className="space-y-4">
      {isSandbox && (
        <div
          role="note"
          className="flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
        >
          <p>{t('sandboxNotice')}</p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold">{t('currentPlan')}</h2>
        <p className="mt-1.5 text-lg font-semibold">{tierName}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('usage', { count: Number(tenantInfo.documentCount), quota: tenantInfo.documentQuota })}
        </p>
        {currentTier && currentTier.priceMonthlyUsd > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {currencyFormatter.format(currentTier.priceMonthlyUsd)}
            {tPricing('perMonth')}
          </p>
        )}
        {pendingDowngradeTier && latestSubscription?.current_period_end && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
            {t('downgradeScheduled', {
              tier: tPricing.has(`tiers.${pendingDowngradeTier}.name` as Parameters<typeof tPricing>[0])
                ? tPricing(`tiers.${pendingDowngradeTier}.name` as Parameters<typeof tPricing>[0])
                : pendingDowngradeTier,
              date: dateFormatter.format(new Date(latestSubscription.current_period_end)),
            })}
          </p>
        )}
      </div>

      {needsAction && latestPayment && (
        <PendingPaymentCard
          payment={latestPayment}
          bankTransfer={pendingBankTransfer}
          canManageBilling={canManageBilling}
        />
      )}

      {canSubscribeNew && <SubscribeCard tiers={tiers} emailVerified={emailVerified} />}

      {canChangeTier && latestSubscription && (
        <ChangeTierCard tiers={tiers} currentSubscriptionTier={latestSubscription.tier} />
      )}

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold mb-3">{t('history')}</h2>
        {subscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noHistory')}</p>
        ) : (
          <div className="divide-y divide-border">
            {subscriptions.map((sub) => {
              const subTierKey = `tiers.${sub.tier}.name` as Parameters<typeof tPricing>[0];
              const subStatusKey = `subscriptionStatus.${sub.status}` as Parameters<typeof t>[0];
              const intervalKey = `billingInterval.${sub.billing_interval}` as Parameters<typeof t>[0];
              return (
                <div key={sub.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {tPricing.has(subTierKey) ? tPricing(subTierKey) : sub.tier}
                      {' · '}
                      {t.has(intervalKey) ? t(intervalKey) : sub.billing_interval}
                    </span>
                    <Badge variant="outline" className={SUBSCRIPTION_STATUS_STYLES[sub.status] ?? ''}>
                      {t.has(subStatusKey) ? t(subStatusKey) : sub.status}
                    </Badge>
                  </div>
                  {sub.payments.map((p) => {
                    const paymentStatusKey = `paymentStatus.${p.status}` as Parameters<typeof t>[0];
                    const targetTierKey = p.target_tier
                      ? (`tiers.${p.target_tier}.name` as Parameters<typeof tPricing>[0])
                      : null;
                    return (
                      <div
                        key={p.id}
                        className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground"
                      >
                        <span>
                          {currencyFormatter.format(Number(p.amount))}
                          {p.purpose === 'TIER_CHANGE' && targetTierKey && (
                            <>
                              {' · '}
                              {t('tierChangeTo', {
                                tier: tPricing.has(targetTierKey) ? tPricing(targetTierKey) : p.target_tier ?? '',
                              })}
                            </>
                          )}
                          {p.purpose === 'RENEWAL' && (
                            <>
                              {' · '}
                              {t('renewal')}
                            </>
                          )}
                          {' · '}
                          {p.proof_filename ?? t('noProofYet')}
                        </span>
                        <Badge variant="outline" className={PAYMENT_STATUS_STYLES[p.status] ?? ''}>
                          {t.has(paymentStatusKey) ? t(paymentStatusKey) : p.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PendingPaymentCard({
  payment,
  bankTransfer,
  canManageBilling,
}: {
  payment: ApiPaymentInfo;
  bankTransfer: ApiBankTransferInfo | null;
  canManageBilling: boolean;
}) {
  const t = useTranslations('billing');
  const tPricing = useTranslations('pricing');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [hasFile, setHasFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isTierChange = payment.purpose === 'TIER_CHANGE';
  const targetTierKey = payment.target_tier
    ? (`tiers.${payment.target_tier}.name` as Parameters<typeof tPricing>[0])
    : null;
  const targetTierName =
    targetTierKey && tPricing.has(targetTierKey) ? tPricing(targetTierKey) : payment.target_tier ?? '';

  function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set('proof', file);
    startTransition(async () => {
      const result = await submitPaymentProofAction(payment.id, formData);
      if ('error' in result) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('pendingPayment.uploaded'));
        setHasFile(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
      <h2 className="text-sm font-semibold">
        {isTierChange
          ? t('pendingPayment.tierChangeTitle', { tier: targetTierName })
          : payment.purpose === 'RENEWAL'
            ? t('pendingPayment.renewalTitle')
            : t('pendingPayment.title')}
      </h2>
      <p className="mt-1 text-sm">
        {t('pendingPayment.amount', { amount: currencyFormatter.format(Number(payment.amount)) })}
      </p>

      {payment.rejection_reason && (
        <p className="mt-2 text-sm text-destructive">
          {t('pendingPayment.rejected', { reason: payment.rejection_reason })}
        </p>
      )}

      {bankTransfer ? (
        <div className="mt-3 space-y-1 rounded-md border border-border bg-background p-3 text-sm">
          <p>
            <span className="text-muted-foreground">{t('pendingPayment.bank')}:</span> {bankTransfer.bankName}
          </p>
          <p>
            <span className="text-muted-foreground">{t('pendingPayment.accountType')}:</span>{' '}
            {bankTransfer.accountType}
          </p>
          <p>
            <span className="text-muted-foreground">{t('pendingPayment.accountNumber')}:</span>{' '}
            {bankTransfer.accountNumber}
          </p>
          <p>
            <span className="text-muted-foreground">{t('pendingPayment.accountHolder')}:</span>{' '}
            {bankTransfer.accountHolder}
          </p>
          <p>
            <span className="text-muted-foreground">{t('pendingPayment.identification')}:</span>{' '}
            {bankTransfer.identification}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{t('pendingPayment.contactSupport')}</p>
      )}

      {canManageBilling && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,application/pdf"
            disabled={isPending}
            onChange={(e) => setHasFile(!!e.target.files?.[0])}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary"
          />
          <Button size="sm" onClick={handleUpload} disabled={isPending || !hasFile}>
            {isPending ? t('pendingPayment.uploading') : t('pendingPayment.upload')}
          </Button>
        </div>
      )}
    </div>
  );
}

function ChangeTierCard({
  tiers,
  currentSubscriptionTier,
}: {
  tiers: ApiTierInfo[];
  currentSubscriptionTier: PaidTier;
}) {
  const t = useTranslations('billing');
  const tPricing = useTranslations('pricing');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [selectedTier, setSelectedTier] = useState<PaidTier | null>(null);
  const options = tiers.filter(
    (tier): tier is ApiTierInfo & { name: PaidTier } =>
      tier.name !== 'FREE' && tier.name !== currentSubscriptionTier,
  );

  function handleChange() {
    if (!selectedTier) return;
    startTransition(async () => {
      const result = await changeTierAction(selectedTier);
      if ('error' in result) {
        toastApiError(result.error, tError);
        return;
      }
      setConfirming(false);
      setSelectedTier(null);
      if (result.effectiveAt) {
        toast.success(t('changePlan.downgradeScheduled'));
      } else if (result.payment) {
        toast.success(t('changePlan.upgradeRequested'));
      } else {
        toast.success(t('changePlan.upgradeApplied'));
      }
    });
  }

  if (options.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold">{t('changePlan.title')}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t('changePlan.hint')}</p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select<PaidTier>
          value={selectedTier ?? undefined}
          onValueChange={(value) => {
            setSelectedTier(value);
            setConfirming(false);
          }}
        >
          <SelectTrigger className="w-full sm:w-56" disabled={isPending}>
            <SelectValue>
              {(value: PaidTier | null) => {
                const key = value ? (`tiers.${value}.name` as Parameters<typeof tPricing>[0]) : null;
                return key && tPricing.has(key) ? tPricing(key) : t('changePlan.placeholder');
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((tier) => (
              <SelectItem key={tier.name} value={tier.name}>
                {tPricing(`tiers.${tier.name}.name` as Parameters<typeof tPricing>[0])}
                {' — '}
                {currencyFormatter.format(tier.priceMonthlyUsd)}
                {tPricing('perMonth')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedTier && !confirming && (
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)} disabled={isPending}>
            {t('changePlan.button')}
          </Button>
        )}
      </div>

      {confirming && selectedTier && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-sm space-y-2">
          <p>{t('changePlan.confirmHint')}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleChange} disabled={isPending}>
              {isPending ? t('changePlan.confirming') : t('changePlan.confirm')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={isPending}>
              {t('changePlan.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SubscribeCard({ tiers, emailVerified }: { tiers: ApiTierInfo[]; emailVerified: boolean }) {
  const t = useTranslations('billing');
  const tPricing = useTranslations('pricing');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [selectedTier, setSelectedTier] = useState<PaidTier | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('MONTHLY');
  const options = tiers.filter((tier): tier is ApiTierInfo & { name: PaidTier } => tier.name !== 'FREE');

  function handleSubscribe() {
    if (!selectedTier) return;
    startTransition(async () => {
      const result = await createSubscriptionAction(selectedTier, billingInterval);
      if ('error' in result) {
        toastApiError(result.error, tError);
        return;
      }
      setConfirming(false);
      setSelectedTier(null);
      toast.success(t('subscribe.requested'));
    });
  }

  if (options.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold">{t('subscribe.title')}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t('subscribe.hint')}</p>

      {!emailVerified ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('subscribe.emailRequired')}</p>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select<PaidTier>
              value={selectedTier ?? undefined}
              onValueChange={(value) => {
                setSelectedTier(value);
                setConfirming(false);
              }}
            >
              <SelectTrigger className="w-full sm:w-56" disabled={isPending}>
                <SelectValue>
                  {(value: PaidTier | null) => {
                    const key = value ? (`tiers.${value}.name` as Parameters<typeof tPricing>[0]) : null;
                    return key && tPricing.has(key) ? tPricing(key) : t('subscribe.placeholder');
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map((tier) => (
                  <SelectItem key={tier.name} value={tier.name}>
                    {tPricing(`tiers.${tier.name}.name` as Parameters<typeof tPricing>[0])}
                    {' — '}
                    {currencyFormatter.format(tier.priceMonthlyUsd)}
                    {tPricing('perMonth')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              {(['MONTHLY', 'YEARLY'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setBillingInterval(value)}
                  disabled={isPending}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    billingInterval === value
                      ? 'border-primary bg-primary/5 font-medium'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  {tPricing(`interval.${value.toLowerCase()}` as Parameters<typeof tPricing>[0])}
                </button>
              ))}
            </div>

            {selectedTier && !confirming && (
              <Button size="sm" variant="outline" onClick={() => setConfirming(true)} disabled={isPending}>
                {t('subscribe.button')}
              </Button>
            )}
          </div>

          {confirming && selectedTier && (
            <div className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-sm space-y-2">
              <p>{t('subscribe.confirmHint')}</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSubscribe} disabled={isPending}>
                  {isPending ? t('subscribe.confirming') : t('subscribe.confirm')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={isPending}>
                  {t('subscribe.cancel')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
