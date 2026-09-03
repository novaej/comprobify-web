import type { ApiTierInfo, ApiExtraSeatPricing } from './public-api';

// Shared validation for the tier/billingInterval pair threaded from /pricing
// through registration and onboarding onto Tenant.intendedTier/intendedBillingInterval.
// Mirrors the tiers accepted by ../comprobify/src/constants/subscription-tiers.js
// (FREE is the default and never needs to be requested explicitly here).

export const PAID_TIERS = ['SOLO', 'LITE', 'STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE'] as const;
export type PaidTier = (typeof PAID_TIERS)[number];

// Ascending price order, FREE first. The single source of truth for tier
// display order and price-comparison ranking — every component that needs
// either (pricing page, admin price manager, admin tenant tier picker,
// change-plan upgrade/downgrade classification) reads from this instead of
// keeping its own hardcoded tier list in sync by hand.
export const ALL_TIERS = ['FREE', ...PAID_TIERS] as const;
export const TIER_RANK: Record<string, number> = Object.fromEntries(
  ALL_TIERS.map((name, i) => [name, i]),
);

export const BILLING_INTERVALS = ['MONTHLY', 'YEARLY'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

// A tier's price at `interval` if it sells that interval, otherwise its price
// at whichever interval it does sell (e.g. SOLO always resolves to YEARLY —
// see billingIntervals). Returns the tax-EXCLUSIVE base price — every price
// display on this site shows "$X + IVA" rather than a bundled inclusive
// total (matches how the API itself computes a charge: base first, IVA added
// on top via breakdownAmount() — see subscription.service.js).
export function resolveTierTotal(
  tier: Pick<ApiTierInfo, 'billingIntervals' | 'priceMonthlyUsd' | 'priceYearlyUsd'>,
  interval: BillingInterval,
): { base: number; effectiveInterval: BillingInterval } {
  const billingIntervals = tier.billingIntervals?.length ? tier.billingIntervals : BILLING_INTERVALS;
  const effectiveInterval = billingIntervals.includes(interval) ? interval : billingIntervals[0];
  const base = (effectiveInterval === 'MONTHLY' ? tier.priceMonthlyUsd : tier.priceYearlyUsd) ?? 0;
  return { base, effectiveInterval };
}

// The extra-seat add-on's tax-EXCLUSIVE base price at `interval` (ADR-032) —
// shown as the advertised "$X + IVA" price rather than a bundled total, unlike
// a tier's own headline price. No billingIntervals fallback needed, since the
// add-on always sells both intervals (see db/migrations/095's seed).
export function resolveSeatBasePrice(extraSeat: ApiExtraSeatPricing, interval: BillingInterval): number {
  return (interval === 'MONTHLY' ? extraSeat.priceMonthlyUsd : extraSeat.priceYearlyUsd) ?? 0;
}

export function isPaidTier(value: string | null | undefined): value is PaidTier {
  return !!value && (PAID_TIERS as readonly string[]).includes(value);
}

export function isBillingInterval(value: string | null | undefined): value is BillingInterval {
  return !!value && (BILLING_INTERVALS as readonly string[]).includes(value);
}

// Validates a raw tier/interval pair (e.g. from searchParams or FormData).
// Returns null if the tier is missing or invalid — the interval defaults to
// MONTHLY when omitted, since it's meaningless without a valid tier. SOLO is
// the one exception: it's yearly-only (comprobify's billingIntervals), so an
// omitted/invalid interval defaults to YEARLY for it instead — defaulting to
// MONTHLY would hand downstream code (createSubscription/promoteTenant) a
// combination the API rejects.
export function parseIntendedPlan(
  tier: string | null | undefined,
  interval: string | null | undefined,
): { tier: PaidTier; interval: BillingInterval } | null {
  if (!isPaidTier(tier)) return null;
  if (isBillingInterval(interval)) return { tier, interval };
  return { tier, interval: tier === 'SOLO' ? 'YEARLY' : 'MONTHLY' };
}
