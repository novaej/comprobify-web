import 'server-only';
import { db } from '@/lib/db';
import { getCurrentTenant, listTenantApiKeys, type ApiCtx } from '@/lib/api';
import { listTiers } from '@/lib/public-api';

interface LimitCtx {
  apiKey: ApiCtx['apiKey'];
  tenant: { id: string; environment: 'sandbox' | 'production' };
}

export interface TenantLimits {
  // maxUsers (WEB-scoped, ADR-031) + extraSeats (ADR-032) — comprobify-web's
  // own dashboard-seat cap, enforced entirely here since comprobify has no
  // users/session concept at all to check it against.
  seats: { used: number; limit: number | null; extraSeats: number; maxUsers: number | null };
  // maxApiKeys (API-scoped, ADR-031) — comprobify enforces this itself at key
  // creation, but every distinct role in use lazily mints its own key
  // (resolveApiKeyForRole in tenant-api-key.ts), so a role-granting action on
  // this side needs to know the same headroom before minting one silently
  // fails (see roleNeedsNewApiKey). `used`/`limit` are read straight from the
  // API's own GET /v1/keys response — `limit.max` already includes
  // comprobify's reservedForFrontend.apiKeys allowance on top of the tier's
  // raw self-service pool (ADR-034), so this can never drift from what
  // createKey() actually enforces. The raw pool alone is 0 on
  // FREE/SOLO/LITE, which would make comprobify-web's own reserved keys
  // alone look like an over-limit tenant if compared against directly.
  apiKeys: { used: number; limit: number | null };
}

/**
 * Resolves both tenant-wide caps that gate adding a new user: dashboard
 * seats (WEB-enforced) and API keys (API-enforced, but consumed indirectly
 * by comprobify-web's per-role key minting). Both need an API round-trip —
 * seats via getCurrentTenant()+listTiers(), API keys via listTenantApiKeys()
 * — so they're resolved together rather than as two separate helpers.
 */
export async function resolveTenantLimits(ctx: LimitCtx): Promise<TenantLimits> {
  const [userCount, { limit: apiKeyLimit }, tenantInfo, { tiers }] = await Promise.all([
    // Every seat regardless of active/inviteStatus — removeUserAction clears
    // tenantId on removal, so this already excludes removed users.
    db.user.count({ where: { tenantId: ctx.tenant.id } }),
    // The API's own limit/used is tenant-wide across both environments (see
    // apiKeyModel.countActiveByTenantId, no environment filter) and is the
    // same ceiling createKey() checks against — read live from the API
    // rather than reimplementing the tier + reserved-pool arithmetic here.
    listTenantApiKeys(ctx),
    getCurrentTenant(ctx),
    listTiers(),
  ]);

  const tier = tiers.find((t) => t.name === tenantInfo.subscriptionTier) ?? null;
  const maxUsers = tier?.maxUsers ?? null;

  return {
    seats: {
      used: userCount,
      limit: maxUsers === null ? null : maxUsers + tenantInfo.extraSeats,
      extraSeats: tenantInfo.extraSeats,
      maxUsers,
    },
    apiKeys: {
      used: apiKeyLimit.used,
      limit: apiKeyLimit.max,
    },
  };
}
