import 'server-only';
import { db } from '@/lib/db';
import { encrypt, decrypt, lastFour } from '@/lib/crypto';
import { createTenantApiKey, revokeTenantApiKey } from '@/lib/api';
import { computeApiScopesForRole, isFullAccessScopeSet, sameScopes } from '@/lib/role-api-scopes';
import type { Role } from '@/lib/rbac';
import type { TenantApiKey } from '@prisma/client';

/**
 * Resolves the tenant's full-access ("master") key row — the one every
 * tenant already had before per-role keys existed, and the only key ever
 * used to mint a narrower per-role key (the API's own privilege-containment
 * rule requires the minting key to itself be a superset of what it grants,
 * see resolveApiKeyForRole below).
 *
 * Selection is deterministic — oldest active `isManaged` row with no
 * `managedRole` — same ordering the pre-per-role-keys `findAppApiKeyRow`
 * used, so this is a drop-in replacement for tenants that predate this file.
 */
export function findMasterApiKeyRow(tenantId: string, environment: string) {
  return db.tenantApiKey.findFirst({
    where: { tenantId, environment, isActive: true, isManaged: true, managedRole: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

/**
 * Resolves (minting or reconciling as needed) the API key a given role
 * should authenticate with. Idempotent and self-healing — safe to call both
 * eagerly (on role assignment, src/app/actions/users.ts) and lazily as a
 * fallback (every requireContext() call, src/lib/context.ts).
 *
 * Owner and Admin both compute to every scope that exists, so they share the
 * master key directly rather than getting their own row — only
 * BillingOperator/Viewer/Developer ever get a distinct, narrower key.
 */
export async function resolveApiKeyForRole(
  tenantId: string,
  environment: string,
  role: Role,
): Promise<TenantApiKey | null> {
  const targetScopes = computeApiScopesForRole(role);

  if (isFullAccessScopeSet(targetScopes)) {
    return findMasterApiKeyRow(tenantId, environment);
  }

  const existing = await db.tenantApiKey.findFirst({
    where: { tenantId, environment, isActive: true, isManaged: true, managedRole: role },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  if (existing) {
    if (sameScopes(existing.scopes, targetScopes)) return existing;
    // ROLE_API_SCOPES changed since this key was minted — the API has no
    // endpoint to update a key's scopes in place (immutable per key), so
    // revoke and remint rather than leaving a stale grant in place.
    await revokeStaleManagedKey(tenantId, environment, existing);
  }

  return mintManagedKey(tenantId, environment, role, targetScopes);
}

async function revokeStaleManagedKey(
  tenantId: string,
  environment: string,
  row: TenantApiKey,
): Promise<void> {
  const master = await findMasterApiKeyRow(tenantId, environment);
  if (master) {
    try {
      await revokeTenantApiKey({ apiKey: decrypt(master.encryptedKey) }, row.apiKeyId);
    } catch {
      // Best-effort — if the API-side revoke fails, still stop using the
      // stale local row below; a dangling API-side key with old scopes is
      // strictly narrower than a full-access key, not a security regression.
    }
  }
  await db.tenantApiKey.update({
    where: { id: row.id },
    data: { isActive: false, revokedAt: new Date() },
  });
}

async function mintManagedKey(
  tenantId: string,
  environment: string,
  role: Role,
  targetScopes: ReturnType<typeof computeApiScopesForRole>,
): Promise<TenantApiKey | null> {
  const master = await findMasterApiKeyRow(tenantId, environment);
  if (!master) return null;
  const masterApiKey = decrypt(master.encryptedKey);

  // A Postgres advisory lock, scoped to this transaction and keyed on
  // (tenantId, environment, role), serializes concurrent first-requests for
  // the same role's key *before* any of them calls the real Comprobify API.
  // Without this, the partial unique index below still guarantees only one
  // *local* row survives, but every losing concurrent caller has already
  // minted a real, orphaned key at the API by the time it loses that race —
  // confirmed happening in practice (8 live "App — Viewer" keys at the API
  // for what should have been 1). Two int4 hashtext() args avoid needing to
  // compute a bigint key in JS; the first is a fixed namespace so this can't
  // collide with any other advisory lock this app might use in the future.
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tenant_api_key_mint'), hashtext(${`${tenantId}:${environment}:${role}`}))`;

      // Re-check inside the lock — a concurrent call may have already minted
      // and committed this role's key while we were waiting for the lock.
      const existing = await tx.tenantApiKey.findFirst({
        where: { tenantId, environment, isActive: true, isManaged: true, managedRole: role },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (existing && sameScopes(existing.scopes, targetScopes)) return existing;

      const created = await createTenantApiKey(
        { apiKey: masterApiKey },
        `App — ${role}`,
        environment as 'sandbox' | 'production',
        targetScopes,
      );

      return tx.tenantApiKey.create({
        data: {
          tenantId,
          apiKeyId: created.id,
          label: created.label,
          environment: created.environment,
          encryptedKey: encrypt(created.key),
          lastFour: lastFour(created.key),
          isActive: true,
          isManaged: true,
          managedRole: role,
          scopes: created.scopes,
        },
      });
    },
    // Default Prisma transaction timeout (5s) is tight for two sequential
    // external HTTP calls to the Comprobify API (POST /v1/keys, then the
    // follow-up GET to resolve the new key's id) — give it real headroom.
    { timeout: 15000 },
  );
}
