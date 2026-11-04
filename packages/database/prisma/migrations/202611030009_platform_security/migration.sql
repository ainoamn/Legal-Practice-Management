-- Dedicated platform runtime: metadata only, never a BYPASSRLS connection.
GRANT USAGE ON SCHEMA public TO legal_platform;
GRANT SELECT, INSERT, UPDATE ON "PlatformAdmin", "PlatformSession", "Plan", "Subscription", "SitePage", "PlatformSettings", "Country" TO legal_platform;
GRANT SELECT, INSERT ON "PlatformAudit", "PlatformInvoice", "PlatformPayment" TO legal_platform;
GRANT UPDATE ("voidedAt") ON "PlatformInvoice" TO legal_platform;
GRANT USAGE, SELECT ON SEQUENCE "PlatformInvoice_number_seq" TO legal_platform;
GRANT SELECT ON "Plan", "Subscription", "SitePage", "PlatformSettings" TO legal_app;

CREATE VIEW "PlatformTenantMetadata" AS
SELECT t.id,t.name,t.slug,t."countryCode",t.currency,c."currencyDecimals",t.timezone,t."accessStatus",t."createdAt", (SELECT count(*)::int FROM public."Membership" m WHERE m."tenantId"=t.id) AS "memberCount"
FROM public."Tenant" t JOIN public."Country" c ON c.code=t."countryCode";
CREATE VIEW "PlatformUserMetadata" AS
SELECT m.id AS "membershipId",u.id AS "userId",u.email,u."fullName",u.enabled,m."tenantId",t.name AS "tenantName",m.active AS "membershipActive",r.key AS "roleKey",u."createdAt"
FROM public."Membership" m JOIN public."User" u ON u.id=m."userId" JOIN public."Tenant" t ON t.id=m."tenantId" JOIN public."Role" r ON r.id=m."roleId";
GRANT SELECT ON "PlatformTenantMetadata", "PlatformUserMetadata" TO legal_platform;

CREATE FUNCTION public.platform_set_tenant_access(target uuid, new_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF new_status NOT IN ('ACTIVE','READ_ONLY') THEN RAISE EXCEPTION 'Invalid access status'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(target::text,0));
  UPDATE public."Tenant" SET "accessStatus"=new_status,"updatedAt"=now() WHERE id=target;
END $$;
CREATE FUNCTION public.platform_set_user_enabled(target uuid, new_enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:'||target::text,0));
  UPDATE public."User" SET enabled=new_enabled,"updatedAt"=now() WHERE id=target;
  IF NOT new_enabled THEN UPDATE public."Session" SET "revokedAt"=now() WHERE "userId"=target AND "revokedAt" IS NULL; END IF;
END $$;
REVOKE ALL ON FUNCTION public.platform_set_tenant_access(uuid,text), public.platform_set_user_enabled(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_set_tenant_access(uuid,text), public.platform_set_user_enabled(uuid,boolean) TO legal_platform;

ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" FORCE ROW LEVEL SECURITY;
CREATE POLICY subscription_tenant ON "Subscription" TO legal_app USING ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY subscription_platform ON "Subscription" TO legal_platform USING (true) WITH CHECK (true);
ALTER TABLE "SitePage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SitePage" FORCE ROW LEVEL SECURITY;
CREATE POLICY page_published ON "SitePage" TO legal_app USING (status='PUBLISHED');
CREATE POLICY page_platform ON "SitePage" TO legal_platform USING (true) WITH CHECK (true);

ALTER TABLE "Tenant" ADD CONSTRAINT tenant_access_catalog CHECK ("accessStatus" IN ('ACTIVE','READ_ONLY'));
ALTER TABLE "Country" ADD CONSTRAINT currency_decimals_bounds CHECK ("currencyDecimals" BETWEEN 0 AND 4);
ALTER TABLE "PlatformAdmin" ADD CONSTRAINT platform_admin_kind CHECK (kind IN ('OWNER','OPERATOR'));
ALTER TABLE "PlatformAdmin" ADD CONSTRAINT platform_admin_permissions CHECK (permissions IS NOT NULL AND permissions <@ ARRAY['overview:read','tenants:read','tenants:manage','users:read','users:manage','plans:read','plans:manage','subscriptions:read','subscriptions:manage','finance:read','finance:manage','content:read','content:manage','settings:read','settings:manage','security:read','admins:manage']::text[]);
ALTER TABLE "Plan" ADD CONSTRAINT plan_bounds CHECK ("priceMinor">=0 AND "currencyDecimals" BETWEEN 0 AND 4 AND "maxUsers">0 AND "maxMatters">=0 AND "maxBranches">0 AND "maxStorageMiB">=0 AND "maxAiOperations">=0 AND "interval" IN ('MONTHLY','YEARLY'));
ALTER TABLE "Subscription" ADD CONSTRAINT subscription_status CHECK (status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED'));
ALTER TABLE "Subscription" ADD CONSTRAINT subscription_tenant_fk FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT;
ALTER TABLE "PlatformInvoice" ADD CONSTRAINT invoice_amount_positive CHECK ("amountMinor">0 AND "currencyDecimals" BETWEEN 0 AND 4);
ALTER TABLE "PlatformInvoice" ADD CONSTRAINT invoice_tenant_fk FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT;
ALTER TABLE "PlatformPayment" ADD CONSTRAINT payment_amount_positive CHECK ("amountMinor">0);
ALTER TABLE "PlatformPayment" ADD CONSTRAINT payment_actor_fk FOREIGN KEY ("recordedBy") REFERENCES "PlatformAdmin"(id) ON DELETE RESTRICT;
ALTER TABLE "SitePage" ADD CONSTRAINT page_status CHECK (status IN ('DRAFT','PUBLISHED'));
