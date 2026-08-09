import 'server-only';
import { db } from '@/lib/db';
import { encrypt, decrypt, lastFour } from '@/lib/crypto';
import { createTenantApiKey, revokeTenantApiKey } from '@/lib/api';
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

/** Finds, mints, or reconciles the key a role should authenticate with. Idempotent — safe to call eagerly on role assignment or lazily from requireContext(). */
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
      // Best-effort — still deactivate the local row below either way.
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
    { timeout: 15000 }, // default 5s is tight for 2 sequential external API calls
  );
}
