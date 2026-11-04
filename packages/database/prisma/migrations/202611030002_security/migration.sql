-- Runtime principal is created by infrastructure; migrations never embed production credentials.
GRANT USAGE ON SCHEMA public TO legal_app;
GRANT SELECT ON "Country" TO legal_app;
GRANT SELECT, INSERT ON "User", "OfficeDirectory", "AuditLog" TO legal_app;
GRANT SELECT, INSERT, UPDATE ON "Tenant", "Branch", "Role", "Membership", "Session" TO legal_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM legal_app;

ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_boundary ON "Tenant"
USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['Branch', 'Role', 'Membership', 'AuditLog'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_boundary ON %I USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', table_name);
  END LOOP;
END $$;

ALTER TABLE "Role" ADD CONSTRAINT role_permission_catalog CHECK (
  permissions IS NOT NULL AND permissions <@ ARRAY['workspace:read','workspace:manage','team:read','team:manage','roles:read','roles:manage','audit:read']::text[]
);

-- Operational configuration, not demo legal records. Future countries/tax rules require admin configuration.
INSERT INTO "Country" (code,"nameAr","nameEn",currency,timezone)
VALUES ('OM','سلطنة عُمان','Oman','OMR','Asia/Muscat');
