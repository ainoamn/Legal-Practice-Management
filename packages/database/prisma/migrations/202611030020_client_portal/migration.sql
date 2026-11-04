-- AlterTable
ALTER TABLE "Matter" ADD COLUMN     "clientVisible" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ClientAccess" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalMessage" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "sender" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalRequest" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "preferredAt" TIMESTAMPTZ,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "response" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PortalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientAccess_tenantId_memberId_key" ON "ClientAccess"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "PortalMessage_tenantId_clientId_createdAt_idx" ON "PortalMessage"("tenantId", "clientId", "createdAt");

-- CreateIndex
CREATE INDEX "PortalRequest_tenantId_clientId_createdAt_idx" ON "PortalRequest"("tenantId", "clientId", "createdAt");
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['ClientAccess','PortalMessage','PortalRequest'] LOOP
 EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("tenantId","clientId") REFERENCES "Client"("tenantId",id)',n,lower(n)||'_client_fk');
 EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("tenantId","memberId") REFERENCES "Membership"("tenantId",id)',n,lower(n)||'_member_fk');
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('GRANT SELECT,INSERT ON %I TO legal_app',n);
 EXECUTE format('CREATE POLICY tenant_boundary ON %I AS RESTRICTIVE USING ("tenantId"=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK ("tenantId"=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 END LOOP;
END $$;
GRANT UPDATE ON "ClientAccess","PortalRequest" TO legal_app;
CREATE POLICY staff_access ON "ClientAccess" USING (practice_permission('clients:manage') AND EXISTS(SELECT 1 FROM "Client" c WHERE c.id="clientId")) WITH CHECK (practice_permission('clients:manage') AND EXISTS(SELECT 1 FROM "Client" c WHERE c.id="clientId"));
CREATE FUNCTION portal_client() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT a."clientId" FROM public."ClientAccess" a JOIN public."Membership" m ON m.id=a."memberId" AND m."tenantId"=a."tenantId" JOIN public."Role" r ON r.id=m."roleId" AND r."tenantId"=m."tenantId"
 WHERE a."tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND a."memberId"=NULLIF(current_setting('app.member_id',true),'')::uuid AND a.active AND m.active AND r.key='CLIENT' AND 'portal:read'=ANY(r.permissions);
$$;
REVOKE ALL ON FUNCTION portal_client() FROM PUBLIC; GRANT EXECUTE ON FUNCTION portal_client() TO legal_app;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['PortalMessage','PortalRequest'] LOOP
 EXECUTE format('CREATE POLICY read_scope ON %I FOR SELECT USING ("clientId"=portal_client() OR (practice_permission(''clients:manage'') AND EXISTS(SELECT 1 FROM "Client" c WHERE c.id="clientId")))',n);
 EXECUTE format('CREATE POLICY create_scope ON %I FOR INSERT WITH CHECK ("memberId"=NULLIF(current_setting(''app.member_id'',true),'''')::uuid AND ("clientId"=portal_client() OR (practice_permission(''clients:manage'') AND EXISTS(SELECT 1 FROM "Client" c WHERE c.id="clientId"))))',n);
 END LOOP;
END $$;
CREATE POLICY staff_reply ON "PortalRequest" FOR UPDATE USING (practice_permission('clients:manage') AND EXISTS(SELECT 1 FROM "Client" c WHERE c.id="clientId")) WITH CHECK (practice_permission('clients:manage'));
ALTER TABLE "PortalMessage" ADD CONSTRAINT portal_message_values CHECK (sender IN ('CLIENT','STAFF') AND length(body) BETWEEN 1 AND 5000);
ALTER TABLE "PortalRequest" ADD CONSTRAINT portal_request_values CHECK (kind IN ('APPOINTMENT','CONTACT_UPDATE','DOCUMENT_REQUEST','OTHER') AND status IN ('OPEN','ACCEPTED','REJECTED','COMPLETED') AND length(body) BETWEEN 2 AND 5000);

CREATE FUNCTION portal_snapshot() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH own AS (SELECT public.portal_client() AS id)
 SELECT jsonb_build_object(
 'client',(SELECT jsonb_build_object('id',c.id,'name',c.name,'phone',c.phone,'email',c.email,'address',c.address) FROM public."Client" c,own WHERE c.id=own.id),
 'matters',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'reference',m.reference,'title',m.title,'courtNumber',m."courtNumber",'status',m.status)) FROM public."Matter" m,own WHERE m."clientId"=own.id AND m."clientVisible"),'[]'),
 'hearings',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'matterId',h."matterId",'startsAt',h."startsAt",'endsAt',h."endsAt",'room',h.room,'status',h.status,'outcome',h.outcome,'decision',h.decision)) FROM public."Hearing" h JOIN public."Matter" m ON m.id=h."matterId",own WHERE m."clientId"=own.id AND m."clientVisible" AND h."clientVisible"),'[]'),
 'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'matterId',d."matterId",'title',d.title,'versionId',v.id,'filename',v.filename,'mime',v.mime)) FROM public."LegalDocument" d JOIN public."Matter" m ON m.id=d."matterId" JOIN public."DocumentVersion" v ON v."documentId"=d.id AND v.version=d."approvedVersion",own WHERE m."clientId"=own.id AND m."clientVisible" AND d."clientVisible" AND d.status='APPROVED' AND d."approvedVersion"=d."currentVersion" AND v.state='READY'),'[]'),
 'invoices',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'sequence',i.sequence,'description',i.description,'totalMinor',i."totalMinor",'dueAt',i."dueAt",'paidMinor',(SELECT coalesce(sum(r."amountMinor"),0) FROM public."OfficeReceipt" r WHERE r."invoiceId"=i.id))) FROM public."OfficeInvoice" i,own WHERE i."clientId"=own.id AND i."clientVisible" AND i.status='ISSUED'),'[]')
 );
$$;
CREATE FUNCTION portal_file(target uuid) RETURNS TABLE("objectKey" text,filename text,mime text,sha256 text,"versionId" uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT v."objectKey",v.filename,v.mime,v.sha256,v.id FROM public."DocumentVersion" v JOIN public."LegalDocument" d ON d.id=v."documentId" JOIN public."Matter" m ON m.id=d."matterId"
 WHERE v.id=target AND m."clientId"=public.portal_client() AND m."clientVisible" AND d."clientVisible" AND d.status='APPROVED' AND d."approvedVersion"=d."currentVersion" AND v.version=d."approvedVersion" AND v.state='READY';
$$;
REVOKE ALL ON FUNCTION portal_snapshot(),portal_file(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_snapshot(),portal_file(uuid) TO legal_app;
ALTER TABLE "Role" DROP CONSTRAINT role_permission_catalog;
ALTER TABLE "Role" ADD CONSTRAINT role_permission_catalog CHECK (permissions IS NOT NULL AND permissions <@ ARRAY['workspace:read','workspace:manage','team:read','team:manage','roles:read','roles:manage','audit:read','clients:read','clients:manage','matters:read','matters:manage','matters:read:all','matters:read:branch','matters:assign','hearings:manage','tasks:manage','courts:manage','conflicts:read','documents:read','documents:manage','documents:review','documents:approve','documents:download','finance:read','finance:manage','finance:approve','portal:read']::text[]);
DO $$ DECLARE t record; BEGIN FOR t IN SELECT "tenantId" FROM "OfficeDirectory" LOOP
 PERFORM set_config('app.tenant_id',t."tenantId"::text,true);
 UPDATE "Role" SET permissions=permissions||ARRAY['portal:read']::text[] WHERE key IN ('OWNER','CLIENT') AND "tenantId"=t."tenantId" AND NOT ('portal:read'=ANY(permissions));
END LOOP;END $$;

