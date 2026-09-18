'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { promoteTenantAction } from '@/app/actions/tenant';
import { resendVerificationAction } from '@/app/actions/tenant';
import { AlertTriangle, Info, MailCheck, FileWarning } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { ApiTierInfo } from '@/lib/public-api';
import { resolveTierTotal, type PaidTier, type BillingInterval } from '@/lib/subscription-tiers';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export type IssuerForPromotion = {
  id: string;
  apiIssuerId: string;
  name: string;
  branchCode: string;
  issuePointCode: string;
  documentTypes: string[];
};

export function ProductionPromotion({
  issuers,
  emailVerified,
  tiers,
  intendedTier,
  intendedBillingInterval,
  activeSubscriptionTier,
  agreementsAccepted,
}: {
  issuers: IssuerForPromotion[];
  emailVerified: boolean;
  tiers: ApiTierInfo[];
  intendedTier: string | null;
  intendedBillingInterval: string | null;
  activeSubscriptionTier: string | null;
  agreementsAccepted: boolean;
}) {
  const t = useTranslations('settings.promote');
  const tSetup = useTranslations('settings.setup');
  const tPricing = useTranslations('pricing');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [isResendPending, startResendTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [resendSent, setResendSent] = useState(false);

  // Sequentials keyed by apiIssuerId → documentType → number
  const [sequentials, setSequentials] = useState<Record<string, Record<string, number>>>(
    () => Object.fromEntries(
      issuers.map((issuer) => [
        issuer.apiIssuerId,
        Object.fromEntries(issuer.documentTypes.map((code) => [code, 1])),
      ])
    )
  );

  const [selectedTier, setSelectedTier] = useState<'FREE' | PaidTier>(
    () => (intendedTier as PaidTier | null) ?? 'FREE',
  );
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval>(
    () => (intendedBillingInterval as BillingInterval | null) ?? 'MONTHLY',
  );
  const selectedTierInfo = tiers.find((tier) => tier.name === selectedTier);

  const error = errorCode
    ? (tError.has(errorCode as Parameters<typeof tError>[0])
        ? tError(errorCode as Parameters<typeof tError>[0])
        : errorCode)
    : null;

  function handleSequentialChange(apiIssuerId: string, code: string, raw: string) {
    setSequentials((prev) => ({
      ...prev,
      [apiIssuerId]: {
        ...(prev[apiIssuerId] ?? {}),
        [code]: Math.max(1, parseInt(raw) || 1),
      },
    }));
  }

  function handlePromote() {
    setErrorCode(null);
    setResendSent(false);
    const initialSequentials = issuers.flatMap((issuer) =>
      issuer.documentTypes.map((code) => ({
        issuerId: issuer.apiIssuerId,
        documentType: code,
        sequential: sequentials[issuer.apiIssuerId]?.[code] ?? 1,
      }))
    );
    startTransition(async () => {
      const tier = activeSubscriptionTier || selectedTier === 'FREE' ? undefined : selectedTier;
      // Resolve off the tier's own billingIntervals rather than the raw toggle
      // state — guards against submitting an interval the tier doesn't sell
      // (e.g. Mensual for SOLO, which is yearly-only).
      const interval = activeSubscriptionTier || selectedTier === 'FREE' || !selectedTierInfo
        ? undefined
        : resolveTierTotal(selectedTierInfo, selectedInterval).effectiveInterval;
      const result = await promoteTenantAction(initialSequentials, tier, interval);
      if (result && 'error' in result) {
        setConfirming(false);
        setErrorCode(result.error);
      }
    });
  }

  function handleResend() {
    // Guard against a second fire beating the disabled button's re-render —
    // this calls POST /v1/resend-verification, which has its own strict,
    // IP-keyed rate limit (5/hour, independent from register/recover's own
    // limiters — comprobify's 83c54ed).
    if (isResendPending) return;
    startResendTransition(async () => {
      const result = await resendVerificationAction();
      if (!result) {
        setResendSent(true);
      } else if ('error' in result) {
        setErrorCode(result.error);
      }
    });
  }

  if (confirming) {
    return (
      <div className="space-y-4">
        {/* Plan section */}
        <div className="rounded-md border p-4 space-y-3">
          {activeSubscriptionTier ? (
            <p className="text-sm">
              {t('planAlreadyActive', {
                tier: tPricing.has(`tiers.${activeSubscriptionTier}.name` as Parameters<typeof tPricing>[0])
                  ? tPricing(`tiers.${activeSubscriptionTier}.name` as Parameters<typeof tPricing>[0])
                  : activeSubscriptionTier,
              })}{' '}
              <Link href="/settings/billing" className="underline underline-offset-4">
                {t('planAlreadyActiveLink')}
              </Link>
            </p>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium">{t('plan')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('planHint')}</p>
              </div>
              <Select<'FREE' | PaidTier>
                value={selectedTier}
                onValueChange={(value) => {
                  if (!value) return;
                  setSelectedTier(value);
                  // Keep the interval toggle in sync when the picked tier doesn't
                  // sell the currently-selected interval (e.g. SOLO is yearly-only).
                  const info = tiers.find((tier) => tier.name === value);
                  if (info) setSelectedInterval(resolveTierTotal(info, selectedInterval).effectiveInterval);
                }}
              >
                <SelectTrigger className="w-full" disabled={isPending}>
                  <SelectValue>
                    {(value: ('FREE' | PaidTier) | null) =>
                      value ? tPricing(`tiers.${value}.name`) : value
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(['FREE', ...tiers.filter((tier) => tier.name !== 'FREE').map((tier) => tier.name)] as ('FREE' | PaidTier)[]).map(
                    (name) => (
                      <SelectItem key={name} value={name}>
                        {tPricing(`tiers.${name}.name`)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              {selectedTier !== 'FREE' && (
                <>
                  <div className="flex gap-2">
                    {(['MONTHLY', 'YEARLY'] as const).map((interval) => {
                      const sellsInterval = selectedTierInfo
                        ? (selectedTierInfo.billingIntervals ?? ['MONTHLY', 'YEARLY']).includes(interval)
                        : true;
                      return (
                        <button
                          key={interval}
                          type="button"
                          onClick={() => setSelectedInterval(interval)}
                          disabled={isPending || !sellsInterval}
                          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                            selectedInterval === interval
                              ? 'border-primary bg-primary/5 font-medium'
                              : 'border-border text-muted-foreground'
                          } ${!sellsInterval ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          {tPricing(`interval.${interval.toLowerCase()}` as Parameters<typeof tPricing>[0])}
                        </button>
                      );
                    })}
                  </div>
                  {selectedTierInfo && (() => {
                    const { base, effectiveInterval } = resolveTierTotal(selectedTierInfo, selectedInterval);
                    const priceInterval = {
                      price: currencyFormatter.format(base),
                      interval: tPricing(effectiveInterval === 'MONTHLY' ? 'perMonth' : 'perYear'),
                    };
                    return (
                      <p className="text-sm">
                        {selectedTierInfo.documentQuota === null
                          ? t('planSummaryUnlimited', priceInterval)
                          : t('planSummary', { ...priceInterval, quota: selectedTierInfo.documentQuota })}
                        {' '}
                        <span className="text-xs text-muted-foreground">
                          ({tPricing('plusIva')})
                        </span>
                      </p>
                    );
                  })()}
                </>
              )}
            </>
          )}
        </div>

        {/* Production sequentials — grouped per issuer */}
        <div className="rounded-md border p-4 space-y-3">
          <div>
            <p className="text-sm font-medium">{t('sequentials')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t('sequentialsHint')}</p>
          </div>
          <div className="space-y-3">
            {issuers.map((issuer) => (
              <div key={issuer.apiIssuerId}>
                {issuers.length > 1 && (
                  <p className="text-xs font-medium text-muted-foreground mb-1.5 px-0.5">
                    {issuer.name}
                    <span className="font-normal ml-1.5">
                      ({issuer.branchCode}-{issuer.issuePointCode})
                    </span>
                  </p>
                )}
                <div className="divide-y divide-border rounded-md border">
                  {issuer.documentTypes.map((code) => (
                    <div key={code} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="flex-1 text-sm">
                        {tSetup(`docType${code}` as Parameters<typeof tSetup>[0])}
                        <span className="ml-1.5 text-xs text-muted-foreground">({code})</span>
                      </span>
                      <Input
                        type="number"
                        min={1}
                        value={sequentials[issuer.apiIssuerId]?.[code] ?? 1}
                        onChange={(e) => handleSequentialChange(issuer.apiIssuerId, code, e.target.value)}
                        className="w-24 text-right"
                        disabled={isPending}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Irreversibility warning */}
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p>{t('warning')}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={handlePromote}
            >
              {isPending ? t('confirming') : t('confirm')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setConfirming(false)}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('description')}</p>
      {activeSubscriptionTier && (
        <p className="text-sm">
          {t('planAlreadyActive', {
            tier: tPricing.has(`tiers.${activeSubscriptionTier}.name` as Parameters<typeof tPricing>[0])
              ? tPricing(`tiers.${activeSubscriptionTier}.name` as Parameters<typeof tPricing>[0])
              : activeSubscriptionTier,
          })}{' '}
          <Link href="/settings/billing" className="underline underline-offset-4">
            {t('planAlreadyActiveLink')}
          </Link>
        </p>
      )}
      {!agreementsAccepted && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
        >
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            {t('agreementRequired')}{' '}
            <Link href="/agreements" className="underline underline-offset-4">
              {t('agreementRequiredLink')}
            </Link>
          </p>
        </div>
      )}
      <div
        role="note"
        className="flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>{t('sriNotice')}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)} disabled={!emailVerified || !agreementsAccepted}>
        {t('button')}
      </Button>
      {!emailVerified && (
        <p className="text-xs text-muted-foreground">{t('emailRequired')}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {errorCode === 'EMAIL_VERIFICATION_REQUIRED' && (
        resendSent ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MailCheck className="h-4 w-4 shrink-0" />
            {t('resendSent')}
          </p>
        ) : (
          <button
            onClick={handleResend}
            disabled={isResendPending}
            className="cursor-pointer text-sm underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            {isResendPending ? t('resending') : t('resend')}
          </button>
        )
      )}
    </div>
  );
}
