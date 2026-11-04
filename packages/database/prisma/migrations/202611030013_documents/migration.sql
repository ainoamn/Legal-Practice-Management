-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "approvedVersion" INTEGER,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMPTZ,
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "extractedText" TEXT NOT NULL DEFAULT '',
    "requiresReview" BOOLEAN NOT NULL DEFAULT true,
    "extractionMethod" TEXT,
    "failureCode" TEXT,
    "uploadedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalDocument_tenantId_matterId_idx" ON "LegalDocument"("tenantId", "matterId");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_tenantId_id_key" ON "LegalDocument"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_objectKey_key" ON "DocumentVersion"("objectKey");

-- CreateIndex
CREATE INDEX "DocumentVersion_tenantId_state_idx" ON "DocumentVersion"("tenantId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_tenantId_id_key" ON "DocumentVersion"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_tenantId_documentId_version_key" ON "DocumentVersion"("tenantId", "documentId", "version");

-- CreateIndex
CREATE INDEX "DocumentTemplate_tenantId_idx" ON "DocumentTemplate"("tenantId");

-- AddForeignKey
ALTER TABLE "LegalDocument" ADD CONSTRAINT "LegalDocument_tenantId_matterId_fkey" FOREIGN KEY ("tenantId", "matterId") REFERENCES "Matter"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_tenantId_documentId_fkey" FOREIGN KEY ("tenantId", "documentId") REFERENCES "LegalDocument"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "LegalDocument" ADD CONSTRAINT document_creator FOREIGN KEY ("tenantId","createdBy") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "LegalDocument" ADD CONSTRAINT document_approver FOREIGN KEY ("tenantId","approvedBy") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "DocumentVersion" ADD CONSTRAINT version_uploader FOREIGN KEY ("tenantId","uploadedBy") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "DocumentVersion" ADD CONSTRAINT version_bounds CHECK (size>0 AND size<=26214400 AND version>0 AND state IN ('PENDING','PROCESSING','READY','REJECTED','FAILED'));
ALTER TABLE "LegalDocument" ADD CONSTRAINT document_workflow CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','ARCHIVED') AND (NOT "clientVisible" OR (status='APPROVED' AND "approvedVersion"="currentVersion" AND "approvedBy" IS NOT NULL)));
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['LegalDocument','DocumentVersion','DocumentTemplate'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO legal_app',n);
 EXECUTE format('CREATE POLICY tenant_boundary ON %I AS RESTRICTIVE USING ("tenantId"=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK ("tenantId"=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 END LOOP;
END $$;
CREATE POLICY document_scope ON "LegalDocument" USING (practice_permission('documents:read') AND EXISTS(SELECT 1 FROM "Matter" m WHERE m.id="matterId")) WITH CHECK (EXISTS(SELECT 1 FROM "Matter" m WHERE m.id="matterId"));
CREATE POLICY version_scope ON "DocumentVersion" USING (EXISTS(SELECT 1 FROM "LegalDocument" d WHERE d.id="documentId")) WITH CHECK (EXISTS(SELECT 1 FROM "LegalDocument" d WHERE d.id="documentId"));
CREATE POLICY template_scope ON "DocumentTemplate" USING (practice_permission('documents:read')) WITH CHECK (practice_permission('documents:manage'));

CREATE FUNCTION practice_storage_bytes() RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(sum(size),0)::bigint FROM public."DocumentVersion" WHERE "tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND state<>'REJECTED' AND public.practice_permission('documents:manage');
$$;
REVOKE ALL ON FUNCTION practice_storage_bytes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION practice_storage_bytes() TO legal_app;
-- No runtime may alter a historical file's identity or overwrite extracted text after approval.
CREATE FUNCTION document_version_integrity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF (NEW."tenantId",NEW."documentId",NEW.version,NEW."objectKey",NEW.filename,NEW.mime,NEW.size,NEW.sha256,NEW."uploadedBy",NEW."createdAt") IS DISTINCT FROM (OLD."tenantId",OLD."documentId",OLD.version,OLD."objectKey",OLD.filename,OLD.mime,OLD.size,OLD.sha256,OLD."uploadedBy",OLD."createdAt") THEN RAISE EXCEPTION 'Immutable file identity'; END IF;
 IF EXISTS(SELECT 1 FROM public."LegalDocument" d WHERE d.id=OLD."documentId" AND d.status='APPROVED' AND d."approvedVersion"=OLD.version) THEN RAISE EXCEPTION 'Approved version is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER version_integrity BEFORE UPDATE ON "DocumentVersion" FOR EACH ROW EXECUTE FUNCTION document_version_integrity();
ALTER TABLE "Role" DROP CONSTRAINT role_permission_catalog;
ALTER TABLE "Role" ADD CONSTRAINT role_permission_catalog CHECK (permissions IS NOT NULL AND permissions <@ ARRAY[
 'workspace:read','workspace:manage','team:read','team:manage','roles:read','roles:manage','audit:read','clients:read','clients:manage','matters:read','matters:manage','matters:read:all','matters:read:branch','matters:assign','hearings:manage','tasks:manage','courts:manage','conflicts:read','documents:read','documents:manage','documents:review','documents:approve','documents:download']::text[]);
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT "tenantId" FROM "OfficeDirectory" LOOP
 PERFORM set_config('app.tenant_id',t."tenantId"::text,true);
 UPDATE "Role" SET permissions=permissions||ARRAY['documents:read','documents:manage','documents:review','documents:approve','documents:download']::text[] WHERE key='OWNER' AND "tenantId"=t."tenantId";
 END LOOP;
END $$;

