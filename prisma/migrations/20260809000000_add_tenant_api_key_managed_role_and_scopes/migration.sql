-- Per-role API keys (see src/lib/tenant-api-key.ts's resolveApiKeyForRole).
-- isManaged/managedRole distinguish keys this app mints for its own
-- authentication from ordinary user-created self-service integration keys;
-- scopes mirrors what the Comprobify API actually granted, so scope drift
-- from a future ROLE_API_SCOPES edit can be detected locally.

-- AlterTable
ALTER TABLE "tenant_api_keys"
  ADD COLUMN "is_managed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "managed_role" TEXT,
  ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: every tenant already has exactly one active key per environment
-- that requireContext() has been using as "the app's key" (the oldest active
-- row — findAppApiKeyRow's ordering). Flag exactly that row as the master key
-- so behavior for every existing tenant is unchanged on day one; narrower
-- per-role keys get minted afterward (eagerly on role assignment, or lazily
-- on first request — see resolveApiKeyForRole).
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY tenant_id, environment
    ORDER BY created_at ASC, id ASC
  ) AS rn
  FROM "tenant_api_keys"
  WHERE is_active = true
)
UPDATE "tenant_api_keys"
SET is_managed = true
WHERE id IN (SELECT id FROM ranked WHERE rn = 1);

-- Partial unique index — not representable via Prisma's `@@unique` (no WHERE
-- clause support), so it's raw-SQL-only and intentionally absent from
-- schema.prisma. Prevents two concurrent first-requests for the same role
-- from both minting a row; self-service keys (managed_role IS NULL) are
-- unconstrained by it.
CREATE UNIQUE INDEX "tenant_api_keys_managed_role_active_key"
  ON "tenant_api_keys" ("tenant_id", "environment", "managed_role")
  WHERE "is_active" = true AND "managed_role" IS NOT NULL;
