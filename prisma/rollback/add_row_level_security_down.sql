-- Rollback for 20261008000000_add_row_level_security. Run as the table owner (the app role).
-- Only swaps policies: instant, loses no data, and the converted application code works
-- with or without RLS, so no code rollback is needed.
-- Afterwards run:  DELETE FROM _prisma_migrations WHERE migration_name = '20261008000000_add_row_level_security';
-- (or `prisma migrate resolve --rolled-back 20261008000000_add_row_level_security`).

BEGIN;
DROP POLICY IF EXISTS notification_reads_isolation ON notification_reads;
ALTER TABLE notification_reads NO FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_reads DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS webhook_endpoints_isolation ON webhook_endpoints;
ALTER TABLE webhook_endpoints NO FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_isolation ON notifications;
ALTER TABLE notifications NO FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_templates_isolation ON document_templates;
ALTER TABLE document_templates NO FORCE ROW LEVEL SECURITY;
ALTER TABLE document_templates DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clients_isolation ON clients;
ALTER TABLE clients NO FORCE ROW LEVEL SECURITY;
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_isolation ON products;
ALTER TABLE products NO FORCE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_issuer_access_isolation ON user_issuer_access;
ALTER TABLE user_issuer_access NO FORCE ROW LEVEL SECURITY;
ALTER TABLE user_issuer_access DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS issuers_isolation ON issuers;
ALTER TABLE issuers NO FORCE ROW LEVEL SECURITY;
ALTER TABLE issuers DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_api_keys_isolation ON tenant_api_keys;
ALTER TABLE tenant_api_keys NO FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_api_keys DISABLE ROW LEVEL SECURITY;
DROP FUNCTION IF EXISTS app_is_system();
DROP FUNCTION IF EXISTS app_current_tenant_id();
COMMIT;
