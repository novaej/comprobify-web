// Shared validation for the tier/billingInterval pair threaded from /pricing
// through registration and onboarding onto Tenant.intendedTier/intendedBillingInterval.
// Mirrors the tiers accepted by ../comprobify/src/constants/subscription-tiers.js
// (FREE is the default and never needs to be requested explicitly here).

export const PAID_TIERS = ['STARTER', 'GROWTH', 'BUSINESS'] as const;
export type PaidTier = (typeof PAID_TIERS)[number];

export const BILLING_INTERVALS = ['MONTHLY', 'YEARLY'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export function isPaidTier(value: string | null | undefined): value is PaidTier {
  return !!value && (PAID_TIERS as readonly string[]).includes(value);
}

export function isBillingInterval(value: string | null | undefined): value is BillingInterval {
  return !!value && (BILLING_INTERVALS as readonly string[]).includes(value);
}

// Validates a raw tier/interval pair (e.g. from searchParams or FormData).
// Returns null if the tier is missing or invalid — the interval defaults to
// MONTHLY when omitted, since it's meaningless without a valid tier.
export function parseIntendedPlan(
  tier: string | null | undefined,
  interval: string | null | undefined,
): { tier: PaidTier; interval: BillingInterval } | null {
  if (!isPaidTier(tier)) return null;
  return { tier, interval: isBillingInterval(interval) ? interval : 'MONTHLY' };
}
