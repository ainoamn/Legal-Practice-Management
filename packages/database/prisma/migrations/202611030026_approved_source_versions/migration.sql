-- AlterTable
ALTER TABLE "LegalInstrument" ADD COLUMN     "documentVersionId" UUID;
ALTER TABLE "LegalInstrument" ADD CONSTRAINT instrument_source_version FOREIGN KEY ("tenantId","documentVersionId") REFERENCES "DocumentVersion"("tenantId",id);
ALTER TABLE "LegalInstrument" ADD CONSTRAINT active_instrument_source CHECK (status<>'ACTIVE' OR "documentId" IS NULL OR "documentVersionId" IS NOT NULL);
CREATE OR REPLACE FUNCTION instrument_link_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW."matterId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Matter" WHERE id=NEW."matterId" AND "tenantId"=NEW."tenantId" AND "clientId"=NEW."clientId") THEN RAISE EXCEPTION 'Matter and client mismatch'; END IF;
 IF NEW."documentId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."LegalDocument" d JOIN public."Matter" m ON m.id=d."matterId" AND m."tenantId"=d."tenantId" WHERE d.id=NEW."documentId" AND d."tenantId"=NEW."tenantId" AND m."clientId"=NEW."clientId" AND (NEW."matterId" IS NULL OR NEW."matterId"=d."matterId")) THEN RAISE EXCEPTION 'Document and client mismatch'; END IF;
 IF NEW."documentVersionId" IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public."DocumentVersion" v WHERE v.id=NEW."documentVersionId" AND v."tenantId"=NEW."tenantId" AND v."documentId"=NEW."documentId" AND v.state='READY') THEN RAISE EXCEPTION 'Invalid instrument source version'; END IF;
   IF TG_OP='INSERT' OR NEW."documentVersionId" IS DISTINCT FROM OLD."documentVersionId" OR (NEW.status='ACTIVE' AND OLD.status<>'ACTIVE') THEN
     IF NOT EXISTS(SELECT 1 FROM public."LegalDocument" d JOIN public."DocumentVersion" v ON v."documentId"=d.id AND v.version=d."approvedVersion" WHERE v.id=NEW."documentVersionId" AND d.status='APPROVED' AND d."approvedVersion"=d."currentVersion") THEN RAISE EXCEPTION 'Source must be the approved current version'; END IF;
   END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER TABLE "LegalDocument" ADD CONSTRAINT document_version_bounds CHECK ("currentVersion">=0 AND ("approvedVersion" IS NULL OR ("approvedVersion">0 AND "approvedVersion"<="currentVersion")) AND (status<>'APPROVED' OR ("approvedVersion"="currentVersion" AND "approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL)));
CREATE FUNCTION document_pointer_monotonic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW."currentVersion"<OLD."currentVersion" THEN RAISE EXCEPTION 'Document version cannot move backwards'; END IF; RETURN NEW; END $$;
CREATE TRIGGER document_pointer_monotonic BEFORE UPDATE ON "LegalDocument" FOR EACH ROW EXECUTE FUNCTION document_pointer_monotonic();
CREATE FUNCTION document_pointer_consistent() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE d public."LegalDocument";
BEGIN
 SELECT * INTO d FROM public."LegalDocument" WHERE id=NEW.id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF d."currentVersion">0 AND NOT EXISTS(SELECT 1 FROM public."DocumentVersion" v WHERE v."documentId"=d.id AND v.version=d."currentVersion") THEN RAISE EXCEPTION 'Document version missing'; END IF;
 IF d.status='APPROVED' AND NOT EXISTS(SELECT 1 FROM public."DocumentVersion" v WHERE v."documentId"=d.id AND v.version=d."approvedVersion" AND v.state='READY' AND NOT v."requiresReview") THEN RAISE EXCEPTION 'Document approval requires reviewed clean version'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER document_pointer_consistent AFTER INSERT OR UPDATE ON "LegalDocument" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION document_pointer_consistent();

