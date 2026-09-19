import 'server-only';
import { db } from '@/lib/db';
import { encrypt, lastFour } from '@/lib/crypto';
import { createReservedApiKey, listAdminApiKeys, revokeAdminApiKey } from '@/lib/admin-api';
import { computeApiScopesForRole, isFullAccessScopeSet, sameScopes } from '@/lib/role-api-scopes';
import type { Role } from '@/lib/rbac';
import type { TenantApiKey } from '@prisma/client';

/** The tenant's full-access key — used directly by Owner/Admin, and as the minting authority for narrower per-role keys. */
export function findMasterApiKeyRow(tenantId: string, environment: string) {
  return db.tenantApiKey.findFirst({
    where: { tenantId, environment, isActive: true, isManaged: true, managedRole: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

/**
 * Finds, mints, or reconciles the key a role should authenticate with.
 * Idempotent — safe to call eagerly on role assignment or lazily from
 * requireContext(). `apiTenantId` is the API-side tenant id (Context.tenant.apiTenantId)
 * — required for the admin-gated mint/revoke path below, which addresses a
 * tenant by its API id, not comprobify-web's local one.
 */
export async function resolveApiKeyForRole(
  tenantId: string,
  apiTenantId: string,
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
    await revokeStaleManagedKey(existing);
  }

  return mintManagedKey(tenantId, apiTenantId, environment, role, targetScopes);
}

/**
 * Revokes one managed key both locally and at the API. Reserved keys are
 * invisible to (and rejected by) the tenant-facing DELETE /v1/keys/:id —
 * comprobify's api-key.service.js's revokeKey() 404s any is_reserved row on
 * purpose, so a per-role key's own scoped token can never authenticate this
 * revocation either way. Use the admin-gated path, which needs no local
 * credential at all — just the API-side key id.
 */
async function revokeStaleManagedKey(row: TenantApiKey): Promise<void> {
  try {
    await revokeAdminApiKey(row.apiKeyId);
  } catch {
    // Best-effort — still deactivate the local row below either way.
  }
  await db.tenantApiKey.update({
    where: { id: row.id },
    data: { isActive: false, revokedAt: new Date() },
  });
}

async function mintManagedKey(
  tenantId: string,
  apiTenantId: string,
  environment: string,
  role: Role,
  targetScopes: ReturnType<typeof computeApiScopesForRole>,
): Promise<TenantApiKey | null> {
  const label = `App — ${role}`;

  // Advisory lock keyed on (tenantId, environment, role) — serializes
  // concurrent mint attempts before any of them calls the real API, so a
  // race can't mint multiple orphaned real keys (confirmed happening without this).
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tenant_api_key_mint'), hashtext(${`${tenantId}:${environment}:${role}`}))`;

      // Re-check inside the lock in case a concurrent call already won.
      const existing = await tx.tenantApiKey.findFirst({
        where: { tenantId, environment, isActive: true, isManaged: true, managedRole: role },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (existing && sameScopes(existing.scopes, targetScopes)) return existing;

      const plainKey = await createReservedApiKey(apiTenantId, {
        label,
        environment: environment as 'sandbox' | 'production',
        scopes: targetScopes,
      });

      // POST .../api-keys returns only the plaintext token (no id/scopes) —
      // resolve metadata with a follow-up admin list call (Common Mistake #18).
      // Filtered by label+environment (not just "newest") since a concurrent
      // mint for a *different* role could otherwise race ahead of us in the list.
      const adminKeys = await listAdminApiKeys(apiTenantId);
      const created = adminKeys.find((k) => k.environment === environment && k.label === label);
      if (!created) throw new Error('RESERVED_KEY_METADATA_MISSING');

      return tx.tenantApiKey.create({
        data: {
          tenantId,
          apiKeyId: created.id,
          label: created.label ?? label,
          environment: created.environment,
          encryptedKey: encrypt(plainKey),
          lastFour: lastFour(plainKey),
          isActive: true,
          isManaged: true,
          managedRole: role,
          scopes: created.scopes,
        },
      });
    },
    { timeout: 15000 }, // default 5s is tight for 2 sequential external API calls
  );
}
