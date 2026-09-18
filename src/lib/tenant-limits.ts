import 'server-only';
import { db } from '@/lib/db';
import { getCurrentTenant, type ApiCtx } from '@/lib/api';
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
}

/**
 * Resolves the tenant-wide cap that gates adding a new user: dashboard seats
 * (WEB-enforced). Every distinct role in use also lazily mints its own API
 * key (resolveApiKeyForRole in tenant-api-key.ts), but that key is minted
 * `is_reserved` through the admin-gated path (comprobify migration 102) and
 * never competes for the tenant's own self-service maxApiKeys pool — see
 * src/app/[locale]/settings/api-keys/page.tsx for the unrelated, real
 * self-service key cap (which does still apply, just not here).
 */
export async function resolveTenantLimits(ctx: LimitCtx): Promise<TenantLimits> {
  const [userCount, tenantInfo, { tiers }] = await Promise.all([
    // Every seat regardless of active/inviteStatus — removeUserAction clears
    // tenantId on removal, so this already excludes removed users.
    db.user.count({ where: { tenantId: ctx.tenant.id } }),
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
  };
}
