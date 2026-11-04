ALTER TABLE "DocumentVersion" ADD COLUMN "processingStartedAt" TIMESTAMPTZ;
CREATE OR REPLACE FUNCTION document_pending_jobs() RETURNS TABLE("tenantId" uuid,"versionId" uuid,"memberId" uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT "tenantId",id,"uploadedBy" FROM public."DocumentVersion"
 WHERE state='PENDING' OR (state='PROCESSING' AND coalesce("processingStartedAt","createdAt")<now()-interval '15 minutes') ORDER BY "createdAt" LIMIT 500;
$$;
