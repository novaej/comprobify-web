-- Backfills TenantApiKey.scopes for master key rows created before this
-- column existed. 20260809000000_add_tenant_api_key_managed_role_and_scopes
-- only backfilled is_managed = true on those legacy rows — it had no local
-- record of what comprobify had actually granted them, so scopes was left
-- at its default empty array. Every such row is the tenant's original
-- onboarding key; comprobify's registration/recovery flows always grant the
-- full scope set to that key (confirmed directly against comprobify's own
-- api_keys table), so backfilling to the same 9 values here is accurate,
-- not a guess. Newer rows (per-role keys, and master keys for tenants
-- created after the per-role-keys feature shipped) already have scopes
-- populated correctly at creation time and are untouched by this migration.

UPDATE "tenant_api_keys"
SET "scopes" = ARRAY[
  'documents:write', 'documents:read',
  'issuers:read', 'issuers:write',
  'keys:manage', 'billing:manage', 'webhooks:manage', 'tenant:manage', 'tenant:promote'
]
WHERE "is_managed" = true
  AND "managed_role" IS NULL
  AND "scopes" = '{}';
