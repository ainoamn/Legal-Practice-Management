CREATE OR REPLACE FUNCTION document_version_integrity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF (NEW."tenantId",NEW."documentId",NEW.version,NEW."objectKey",NEW.filename,NEW.mime,NEW.size,NEW.sha256,NEW."uploadedBy",NEW."createdAt") IS DISTINCT FROM (OLD."tenantId",OLD."documentId",OLD.version,OLD."objectKey",OLD.filename,OLD.mime,OLD.size,OLD.sha256,OLD."uploadedBy",OLD."createdAt") THEN RAISE EXCEPTION 'Immutable file identity'; END IF;
 IF EXISTS(SELECT 1 FROM public."LegalDocument" d WHERE d.id=OLD."documentId" AND ((d.status='APPROVED' AND d."approvedVersion"=OLD.version) OR (d."currentVersion">OLD.version AND OLD.state='READY'))) THEN RAISE EXCEPTION 'Approved or historical version is immutable'; END IF;
 RETURN NEW;
END $$;
