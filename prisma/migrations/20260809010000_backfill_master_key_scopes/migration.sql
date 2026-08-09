-- Backfills scopes for legacy master-key rows the prior migration flagged
-- is_managed=true but couldn't populate scopes for (confirmed via comprobify's
-- own api_keys table that these always hold the full 9-scope set).

UPDATE "tenant_api_keys"
SET "scopes" = ARRAY[
  'documents:write', 'documents:read',
  'issuers:read', 'issuers:write',
  'keys:manage', 'billing:manage', 'webhooks:manage', 'tenant:manage', 'tenant:promote'
]
WHERE "is_managed" = true
  AND "managed_role" IS NULL
  AND "scopes" = '{}';
