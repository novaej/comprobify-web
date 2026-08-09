-- Per-role API keys — see src/lib/tenant-api-key.ts's resolveApiKeyForRole.

-- AlterTable
ALTER TABLE "tenant_api_keys"
  ADD COLUMN "is_managed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "managed_role" TEXT,
  ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: flag each tenant's oldest active key per environment as the master key.
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

-- Partial unique index (not representable in schema.prisma) — prevents two
-- concurrent first-requests for the same role from both minting a row.
CREATE UNIQUE INDEX "tenant_api_keys_managed_role_active_key"
  ON "tenant_api_keys" ("tenant_id", "environment", "managed_role")
  WHERE "is_active" = true AND "managed_role" IS NOT NULL;
