-- Queue bootstrap metadata only: no file keys, text or case contents.
CREATE FUNCTION document_pending_jobs() RETURNS TABLE("tenantId" uuid,"versionId" uuid,"memberId" uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT "tenantId",id,"uploadedBy" FROM public."DocumentVersion"
 WHERE state='PENDING' OR (state='PROCESSING' AND "createdAt"<now()-interval '15 minutes') ORDER BY "createdAt" LIMIT 500;
$$;
REVOKE ALL ON FUNCTION document_pending_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION document_pending_jobs() TO legal_app;
