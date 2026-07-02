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
import type { PaidTier, BillingInterval } from '@/lib/subscription-tiers';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function ProductionPromotion({
  documentTypes,
  emailVerified,
  tiers,
  intendedTier,
  intendedBillingInterval,
  activeSubscriptionTier,
  agreementsAccepted,
}: {
  documentTypes: string[];
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
  const [sequentials, setSequentials] = useState<Record<string, number>>(
    () => Object.fromEntries(documentTypes.map((code) => [code, 1]))
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

  function handlePromote() {
    setErrorCode(null);
    setResendSent(false);
    const initialSequentials = Object.entries(sequentials)
      .filter(([, seq]) => seq >= 1)
      .map(([documentType, sequential]) => ({ documentType, sequential }));
    startTransition(async () => {
      const result = await promoteTenantAction(
        initialSequentials,
        activeSubscriptionTier || selectedTier === 'FREE' ? undefined : selectedTier,
        activeSubscriptionTier || selectedTier === 'FREE' ? undefined : selectedInterval,
      );
      if (result && 'error' in result) {
        setConfirming(false);
        setErrorCode(result.error);
      }
    });
  }

  function handleResend() {
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
        {/* Plan selection */}
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
                onValueChange={(value) => value && setSelectedTier(value)}
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
                    {(['MONTHLY', 'YEARLY'] as const).map((interval) => (
                      <button
                        key={interval}
                        type="button"
                        onClick={() => setSelectedInterval(interval)}
                        disabled={isPending}
                        className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                          selectedInterval === interval
                            ? 'border-primary bg-primary/5 font-medium'
                            : 'border-border text-muted-foreground'
                        }`}
                      >
                        {tPricing(`interval.${interval.toLowerCase()}` as Parameters<typeof tPricing>[0])}
                      </button>
                    ))}
                  </div>
                  {selectedTierInfo && (
                    <p className="text-sm">
                      {t('planSummary', {
                        price: currencyFormatter.format(
                          selectedInterval === 'MONTHLY'
                            ? selectedTierInfo.priceMonthlyUsd
                            : selectedTierInfo.priceYearlyUsd,
                        ),
                        interval: tPricing(
                          selectedInterval === 'MONTHLY' ? 'perMonth' : 'perYear',
                        ),
                        quota: selectedTierInfo.documentQuota,
                      })}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Production sequentials */}
        <div className="rounded-md border p-4 space-y-3">
          <div>
            <p className="text-sm font-medium">{t('sequentials')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t('sequentialsHint')}</p>
          </div>
          <div className="divide-y divide-border rounded-md border">
            {documentTypes.map((code) => (
              <div key={code} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex-1 text-sm">
                  {tSetup(`docType${code}` as Parameters<typeof tSetup>[0])}
                  <span className="ml-1.5 text-xs text-muted-foreground">({code})</span>
                </span>
                <Input
                  type="number"
                  min={1}
                  value={sequentials[code] ?? 1}
                  onChange={(e) =>
                    setSequentials((prev) => ({
                      ...prev,
                      [code]: Math.max(1, parseInt(e.target.value) || 1),
                    }))
                  }
                  className="w-24 text-right"
                  disabled={isPending}
                />
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
      {errorCode === 'EMAIL_NOT_VERIFIED' && (
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
