-- Fail-closed Row-Level Security on the tenant-owned tables (ADR-010).
--
-- A query with no tenant context sees ZERO rows and cannot insert. Cross-tenant access
-- needs the explicit system flag (app.rls_system = 'on'), set only by asSystem() in
-- src/lib/db.ts. An unset or empty variable never means "allow everything".
--
-- Not protected, on purpose (reason in ADR-010): tenants, users, verification_tokens,
-- agreement_drafts.
--
-- The app role owns these tables and runs `prisma migrate deploy`, so FORCE is required:
-- without it the owner is exempt from its own policies and they filter nothing. FORCE
-- also applies to data migrations - any future migration that writes a protected table
-- must first run:  SELECT set_config('app.rls_system', 'on', false);
--
-- Rollback: prisma/rollback/add_row_level_security_down.sql

CREATE OR REPLACE FUNCTION app_current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$$;

-- Only the exact value 'on' counts ('true', '1', ' on' do not).
CREATE OR REPLACE FUNCTION app_is_system() RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.rls_system', true), '') = 'on'
$$;

ALTER TABLE tenant_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_api_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_api_keys_isolation ON tenant_api_keys FOR ALL
  USING      (app_is_system() OR tenant_id = app_current_tenant_id())
  WITH CHECK (app_is_system() OR tenant_id = app_current_tenant_id());

ALTER TABLE issuers ENABLE ROW LEVEL SECURITY;
ALTER TABLE issuers FORCE ROW LEVEL SECURITY;
CREATE POLICY issuers_isolation ON issuers FOR ALL
  USING      (app_is_system() OR tenant_id = app_current_tenant_id())
  WITH CHECK (app_is_system() OR tenant_id = app_current_tenant_id());

ALTER TABLE user_issuer_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_issuer_access FORCE ROW LEVEL SECURITY;
CREATE POLICY user_issuer_access_isolation ON user_issuer_access FOR ALL
  USING      (app_is_system() OR tenant_id = app_current_tenant_id())
  WITH CHECK (app_is_system() OR tenant_id = app_current_tenant_id());

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
CREATE POLICY products_isolation ON products FOR ALL
  USING      (app_is_system() OR tenant_id = app_current_tenant_id())
  WITH CHECK (app_is_system() OR tenant_id = app_current_tenant_id());

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
CREATE POLICY clients_isolation ON clients FOR ALL
  USING      (app_is_system() OR tenant_id = app_current_tenant_id())
  WITH CHECK (app_is_system() OR tenant_id = app_current_tenant_id());

ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY document_templates_isolation ON document_templates FOR ALL
  USING      (app_is_system() OR tenant_id = app_current_tenant_id())
  WITH CHECK (app_is_system() OR tenant_id = app_current_tenant_id());

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_isolation ON notifications FOR ALL
  USING      (app_is_system() OR tenant_id = app_current_tenant_id())
  WITH CHECK (app_is_system() OR tenant_id = app_current_tenant_id());

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints FORCE ROW LEVEL SECURITY;
CREATE POLICY webhook_endpoints_isolation ON webhook_endpoints FOR ALL
  USING      (app_is_system() OR tenant_id = app_current_tenant_id())
  WITH CHECK (app_is_system() OR tenant_id = app_current_tenant_id());

-- notification_reads has no tenant_id of its own: it follows its parent notification,
-- whose policy applies inside the subquery.
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_reads_isolation ON notification_reads FOR ALL
  USING (
    app_is_system()
    OR EXISTS (SELECT 1 FROM notifications n WHERE n.id = notification_reads.notification_id)
  )
  WITH CHECK (
    app_is_system()
    OR EXISTS (SELECT 1 FROM notifications n WHERE n.id = notification_reads.notification_id)
  );
