-- Quarantined/rejected objects still occupy storage. Count every retained version.
CREATE OR REPLACE FUNCTION practice_storage_bytes() RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(sum(size),0)::bigint FROM public."DocumentVersion" WHERE "tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND public.practice_permission('documents:manage');
$$;
CREATE OR REPLACE VIEW "PlatformPracticeUsage" WITH (security_barrier=true) AS
SELECT t.id AS "tenantId",
 (SELECT count(*)::int FROM public."Client" c WHERE c."tenantId"=t.id) AS "clientCount",
 (SELECT count(*)::int FROM public."Matter" m WHERE m."tenantId"=t.id) AS "matterCount",
 (SELECT count(*)::int FROM public."Branch" b WHERE b."tenantId"=t.id) AS "branchCount",
 (SELECT count(*)::int FROM public."Hearing" h WHERE h."tenantId"=t.id) AS "hearingCount",
 (SELECT count(*)::int FROM public."WorkTask" w WHERE w."tenantId"=t.id) AS "taskCount",
 (SELECT count(*)::int FROM public."LegalDocument" d WHERE d."tenantId"=t.id) AS "documentCount",
 (SELECT coalesce(sum(v.size),0)::bigint FROM public."DocumentVersion" v WHERE v."tenantId"=t.id) AS "storageBytes"
FROM public."Tenant" t;
