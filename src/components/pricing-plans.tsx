'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Check } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ApiTierInfo } from '@/lib/public-api';

const TIER_ORDER: ApiTierInfo['name'][] = ['FREE', 'STARTER', 'GROWTH', 'BUSINESS'];
const HIGHLIGHTED: ApiTierInfo['name'] = 'GROWTH';
const DOC_TYPE_LABEL_KEYS: Record<string, string> = {
  '01': 'docType01',
  '04': 'docType04',
  '05': 'docType05',
  '06': 'docType06',
  '07': 'docType07',
};

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function upcomingDateFormatter(locale: string) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-EC', { dateStyle: 'long' });
}

export function PricingPlans({ tiers }: { tiers: ApiTierInfo[] }) {
  const t = useTranslations('pricing');
  const tDocTypes = useTranslations('settings.setup');
  const locale = useLocale();
  const [interval, setInterval] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');

  const ordered = TIER_ORDER.map((name) => tiers.find((tier) => tier.name === name)).filter(
    (tier): tier is ApiTierInfo => Boolean(tier),
  );

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
        {ordered.map((tier) => {
          const highlighted = tier.name === HIGHLIGHTED;
          const price = interval === 'MONTHLY' ? tier.priceMonthlyUsd : tier.priceYearlyUsd;
          const isFree = tier.priceMonthlyUsd === 0;
          const upcomingPrice = interval === 'MONTHLY' ? tier.upcomingPriceMonthlyUsd : tier.upcomingPriceYearlyUsd;
          const upcomingEffectiveAt = interval === 'MONTHLY' ? tier.monthlyPriceEffectiveAt : tier.yearlyPriceEffectiveAt;
          const docTypeNames = tier.allowedDocumentTypes.map((code) =>
            DOC_TYPE_LABEL_KEYS[code] ? tDocTypes(DOC_TYPE_LABEL_KEYS[code] as Parameters<typeof tDocTypes>[0]) : code,
          );

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
                <p className="text-3xl font-bold mt-1">
                  {isFree ? '$0' : currencyFormatter.format(price)}
                  {!isFree && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {interval === 'MONTHLY' ? t('perMonth') : t('perYear')}
                    </span>
                  )}
                </p>
                {!isFree && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {interval === 'YEARLY'
                      ? t('yearlyEquivalent', { price: currencyFormatter.format(Math.round(price / 12)) })
                      : null}
                    {interval === 'YEARLY' && ' · '}
                    {t('ivaNote', { rate: Math.round((tier.ivaRate ?? 0.15) * 100) })}
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
                  {t('features.quota', { count: tier.documentQuota })}
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
    </div>
  );
}
