-- Platform administrators receive aggregate counts, without parties, terms or documents.
CREATE OR REPLACE VIEW "PlatformPracticeUsage" WITH (security_barrier=true) AS
SELECT t.id AS "tenantId",
 (SELECT count(*)::int FROM public."Client" c WHERE c."tenantId"=t.id) AS "clientCount",
 (SELECT count(*)::int FROM public."Matter" m WHERE m."tenantId"=t.id) AS "matterCount",
 (SELECT count(*)::int FROM public."Branch" b WHERE b."tenantId"=t.id) AS "branchCount",
 (SELECT count(*)::int FROM public."Hearing" h WHERE h."tenantId"=t.id) AS "hearingCount",
 (SELECT count(*)::int FROM public."WorkTask" w WHERE w."tenantId"=t.id) AS "taskCount",
 (SELECT count(*)::int FROM public."LegalDocument" d WHERE d."tenantId"=t.id) AS "documentCount",
 (SELECT coalesce(sum(v.size),0)::bigint FROM public."DocumentVersion" v WHERE v."tenantId"=t.id) AS "storageBytes",
 (SELECT count(*)::int FROM public."LegalInstrument" i WHERE i."tenantId"=t.id AND i.kind='CONTRACT') AS "contractCount",
 (SELECT count(*)::int FROM public."LegalInstrument" i WHERE i."tenantId"=t.id AND i.kind='POWER_OF_ATTORNEY') AS "powerCount",
 (SELECT count(*)::int FROM public."LegalInstrument" i WHERE i."tenantId"=t.id AND i.kind='LICENCE') AS "licenceCount"
FROM public."Tenant" t;
