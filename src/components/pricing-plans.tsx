'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Check } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ApiTierInfo, ApiExtraSeatPricing } from '@/lib/public-api';
import { ALL_TIERS, resolveTierTotal, resolveSeatBasePrice } from '@/lib/subscription-tiers';

const TIER_ORDER: ApiTierInfo['name'][] = [...ALL_TIERS];
const HIGHLIGHTED: ApiTierInfo['name'] = 'GROWTH';
const DOC_TYPE_LABEL_KEYS: Record<string, string> = {
  '01': 'docType01',
  '04': 'docType04',
  '05': 'docType05',
  '06': 'docType06',
  '07': 'docType07',
};

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
// Precise (2-decimal) formatter for the yearly-equivalent monthly figure —
// currencyFormatter's 0-decimal rounding there was silently off by a few
// cents from the actual price/12 value.
const currencyFormatterPrecise = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

function upcomingDateFormatter(locale: string) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-EC', { dateStyle: 'long' });
}

export function PricingPlans({ tiers, extraSeat }: { tiers: ApiTierInfo[]; extraSeat: ApiExtraSeatPricing }) {
  const t = useTranslations('pricing');
  const tDocTypes = useTranslations('settings.setup');
  const locale = useLocale();
  const [interval, setInterval] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');

  const ordered = TIER_ORDER.map((name) => tiers.find((tier) => tier.name === name)).filter(
    (tier): tier is ApiTierInfo => Boolean(tier),
  );
  // FREE is monthly-only and SOLO is yearly-only (comprobify's own
  // billingIntervals — verified against subscription-tiers.js), so each is
  // hidden entirely on the tab it doesn't sell, rather than shown with a
  // mismatched price and a "yearly only" caveat.
  const visibleTiers = ordered.filter((tier) => tier.billingIntervals.includes(interval));

  return (
    <div>
      <div className="mb-8 flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
          <button
            type="button"
            onClick={() => setInterval('MONTHLY')}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              interval === 'MONTHLY' ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
          >
            {t('interval.monthly')}
          </button>
          <button
            type="button"
            onClick={() => setInterval('YEARLY')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              interval === 'YEARLY' ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
          >
            {t('interval.yearly')}
            <Badge variant="secondary" className="text-[10px]">
              {t('interval.yearlyDiscount')}
            </Badge>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {visibleTiers.map((tier) => {
          const highlighted = tier.name === HIGHLIGHTED;
          // Every visible tier sells the selected interval (see visibleTiers'
          // filter above), so resolveTierTotal never falls back to a
          // different interval here — effectiveInterval always equals
          // `interval`. The headline price is the tax-EXCLUSIVE base, shown
          // with a "+ IVA" badge, never a bundled inclusive total (see
          // resolveTierTotal's comment).
          const { base: price } = resolveTierTotal(tier, interval);
          const isFree = price === 0;
          const upcomingPrice = interval === 'MONTHLY' ? tier.upcomingPriceMonthlyUsd : tier.upcomingPriceYearlyUsd;
          const upcomingEffectiveAt = interval === 'MONTHLY' ? tier.monthlyPriceEffectiveAt : tier.yearlyPriceEffectiveAt;
          const docTypeNames = tier.allowedDocumentTypes.map((code) =>
            DOC_TYPE_LABEL_KEYS[code] ? tDocTypes(DOC_TYPE_LABEL_KEYS[code] as Parameters<typeof tDocTypes>[0]) : code,
          );
          // A YEARLY subscriber's quota pools the full year up front
          // (documentQuota × 12, see tenant-quota.service.js's
          // periodMonthsForTier) rather than resetting monthly — mirror that
          // here instead of showing the flat monthly figure on the Anual tab.
          // FREE is excluded on principle (it never pools annually), though
          // it's moot in practice now — FREE is filtered out of the YEARLY
          // tab entirely, same as SOLO is filtered out of MONTHLY.
          const yearlyPooled = interval === 'YEARLY' && tier.name !== 'FREE';
          // Only ever read when tier.documentQuota !== null (see the ternary below) — the
          // ?? 0 fallback is unreachable, just satisfying the type since TS can't narrow
          // this const declaration against a check made at the call site.
          const quotaCount = (yearlyPooled ? (tier.documentQuota ?? 0) * 12 : tier.documentQuota) ?? 0;

          return (
            <div
              key={tier.name}
              className={cn(
                'border rounded-lg p-6 flex flex-col gap-5',
                highlighted && 'border-primary ring-1 ring-primary',
              )}
            >
              {highlighted && (
                <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {t('badge.popular')}
                </span>
              )}
              <div>
                <h2 className="text-lg font-semibold">{t(`tiers.${tier.name}.name`)}</h2>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <p className="text-3xl font-bold">
                    {isFree ? '$0' : currencyFormatter.format(price)}
                    {!isFree && (
                      <span className="text-sm font-normal text-muted-foreground">
                        {interval === 'MONTHLY' ? t('perMonth') : t('perYear')}
                      </span>
                    )}
                  </p>
                  {!isFree && (
                    <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                      {t('plusIva')}
                    </Badge>
                  )}
                </div>
                {!isFree && interval === 'YEARLY' && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('yearlyEquivalent', { price: currencyFormatterPrecise.format(price / 12) })}
                  </p>
                )}
                <p className="text-sm text-muted-foreground mt-2">{t(`tiers.${tier.name}.description`)}</p>
                {upcomingPrice !== null && upcomingEffectiveAt && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    {t('upcomingPriceNote', {
                      price: currencyFormatter.format(upcomingPrice),
                      date: upcomingDateFormatter(locale).format(new Date(upcomingEffectiveAt)),
                    })}
                  </p>
                )}
              </div>

              <ul className="flex flex-col gap-2 flex-1 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  {tier.documentQuota === null
                    ? t('features.unlimitedQuota')
                    : yearlyPooled
                      ? t('features.quotaYearly', { count: quotaCount })
                      : t('features.quota', { count: quotaCount })}
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  {tier.maxBranches === null
                    ? t('features.unlimitedBranches')
                    : t('features.branches', { count: tier.maxBranches })}
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  {tier.maxIssuePointsPerBranch === null
                    ? t('features.unlimitedIssuePoints')
                    : t('features.issuePoints', { count: tier.maxIssuePointsPerBranch })}
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  {t('features.docTypes', { types: docTypeNames.join(', ') })}
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  {t('features.webhooks', { count: tier.maxWebhookEndpoints })}
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  {tier.maxUsers === null
                    ? t('features.unlimitedUsers')
                    : t('features.users', { count: tier.maxUsers })}
                </li>
              </ul>

              {/* Plain <a> to force full-page navigation — Next.js <Link> intercepts
                  clicks and issues a cross-origin RSC fetch (staging.comprobify.com →
                  app-staging.comprobify.com) that the browser blocks with a CORS error. */}
              <a
                href={isFree ? `/${locale}/register` : `/${locale}/register?tier=${tier.name}&interval=${interval}`}
                className={cn(
                  buttonVariants({
                    variant: highlighted ? 'default' : 'outline',
                    size: 'sm',
                  }),
                  'w-full justify-center',
                )}
              >
                {t(`tiers.${tier.name}.cta`)}
              </a>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t('extraSeatNote', { price: currencyFormatter.format(resolveSeatBasePrice(extraSeat, interval)) })}
        {interval === 'MONTHLY' ? t('perMonth') : t('perYear')}
        {' '}{t('plusIva')}
      </p>
    </div>
  );
}
