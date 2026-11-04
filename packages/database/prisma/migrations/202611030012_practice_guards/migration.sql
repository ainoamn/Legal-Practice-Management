-- Aggregate quota counters and a boolean scheduling check. No case contents leave these functions.
CREATE FUNCTION practice_matter_counters() RETURNS TABLE(count integer,sequence integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT count(*)::integer,coalesce(max(sequence),0)::integer FROM public."Matter"
 WHERE "tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND public.practice_permission('matters:manage');
$$;
CREATE FUNCTION practice_hearing_conflict(member uuid,starts timestamptz,ends timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public."Hearing" WHERE "tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid
 AND public.practice_permission('hearings:manage') AND "responsibleId"=member AND status NOT IN ('CANCELLED','POSTPONED','NOT_HELD')
 AND "startsAt"<ends AND "endsAt">starts);
$$;
REVOKE ALL ON FUNCTION practice_matter_counters(),practice_hearing_conflict(uuid,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION practice_matter_counters(),practice_hearing_conflict(uuid,timestamptz,timestamptz) TO legal_app;
DROP POLICY assignment_write ON "MatterAssignment";
CREATE POLICY assignment_write ON "MatterAssignment" FOR INSERT WITH CHECK (
 EXISTS(SELECT 1 FROM "Matter" m WHERE m.id="matterId") AND (practice_permission('matters:manage') OR practice_permission('matters:assign')));
