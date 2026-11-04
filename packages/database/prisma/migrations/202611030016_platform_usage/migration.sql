-- Counts only: platform operators never receive legal contents through this view.
CREATE VIEW "PlatformPracticeUsage" WITH (security_barrier=true) AS
SELECT t.id AS "tenantId",
 (SELECT count(*)::int FROM public."Client" c WHERE c."tenantId"=t.id) AS "clientCount",
 (SELECT count(*)::int FROM public."Matter" m WHERE m."tenantId"=t.id) AS "matterCount",
 (SELECT count(*)::int FROM public."Branch" b WHERE b."tenantId"=t.id) AS "branchCount",
 (SELECT count(*)::int FROM public."Hearing" h WHERE h."tenantId"=t.id) AS "hearingCount",
 (SELECT count(*)::int FROM public."WorkTask" w WHERE w."tenantId"=t.id) AS "taskCount",
 (SELECT count(*)::int FROM public."LegalDocument" d WHERE d."tenantId"=t.id) AS "documentCount",
 (SELECT coalesce(sum(v.size),0)::bigint FROM public."DocumentVersion" v WHERE v."tenantId"=t.id AND v.state<>'REJECTED') AS "storageBytes"
FROM public."Tenant" t;
GRANT SELECT ON "PlatformPracticeUsage" TO legal_platform;
