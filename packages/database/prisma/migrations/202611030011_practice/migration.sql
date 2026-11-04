-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "createdBy" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "identityNumber" TEXT,
    "registrationNumber" TEXT,
    "taxNumber" TEXT,
    "nationality" TEXT,
    "birthDate" DATE,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "representative" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Court" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matter" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "createdBy" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "courtNumber" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "countryCode" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT '',
    "division" TEXT NOT NULL DEFAULT '',
    "claimType" TEXT NOT NULL DEFAULT '',
    "litigationLevel" TEXT NOT NULL DEFAULT 'FIRST_INSTANCE',
    "filedAt" DATE,
    "registeredAt" DATE,
    "claimMinor" INTEGER,
    "confidentiality" TEXT NOT NULL DEFAULT 'NORMAL',
    "summary" TEXT NOT NULL DEFAULT '',
    "currentPosition" TEXT NOT NULL DEFAULT '',
    "nextStep" TEXT NOT NULL DEFAULT '',
    "clientId" UUID NOT NULL,
    "courtId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Matter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatterAssignment" (
    "tenantId" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "lead" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MatterAssignment_pkey" PRIMARY KEY ("tenantId","matterId","memberId")
);

-- CreateTable
CREATE TABLE "MatterParty" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "identityNumber" TEXT,
    "lawyer" TEXT NOT NULL DEFAULT '',
    "contact" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "MatterParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hearing" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "responsibleId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ NOT NULL,
    "endsAt" TIMESTAMPTZ NOT NULL,
    "room" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "preparation" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL DEFAULT '',
    "decision" TEXT NOT NULL DEFAULT '',
    "nextHearingAt" TIMESTAMPTZ,
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Hearing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HearingReminder" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "hearingId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "dueAt" TIMESTAMPTZ NOT NULL,
    "readAt" TIMESTAMPTZ,

    CONSTRAINT "HearingReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTask" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "assignedTo" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "dueAt" TIMESTAMPTZ NOT NULL,
    "completedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "WorkTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatterNote" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatterNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatterEvent" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatterEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_tenantId_name_idx" ON "Client"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_tenantId_id_key" ON "Client"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Client_tenantId_identityNumber_key" ON "Client"("tenantId", "identityNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Client_tenantId_registrationNumber_key" ON "Client"("tenantId", "registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Court_tenantId_id_key" ON "Court"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Court_tenantId_name_countryCode_key" ON "Court"("tenantId", "name", "countryCode");

-- CreateIndex
CREATE INDEX "Matter_tenantId_status_idx" ON "Matter"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Matter_tenantId_id_key" ON "Matter"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Matter_tenantId_sequence_key" ON "Matter"("tenantId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Matter_tenantId_reference_key" ON "Matter"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "MatterParty_tenantId_matterId_idx" ON "MatterParty"("tenantId", "matterId");

-- CreateIndex
CREATE INDEX "Hearing_tenantId_startsAt_idx" ON "Hearing"("tenantId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Hearing_tenantId_id_key" ON "Hearing"("tenantId", "id");

-- CreateIndex
CREATE INDEX "HearingReminder_tenantId_memberId_dueAt_idx" ON "HearingReminder"("tenantId", "memberId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "HearingReminder_tenantId_hearingId_dueAt_key" ON "HearingReminder"("tenantId", "hearingId", "dueAt");

-- CreateIndex
CREATE INDEX "WorkTask_tenantId_dueAt_idx" ON "WorkTask"("tenantId", "dueAt");

-- CreateIndex
CREATE INDEX "MatterNote_tenantId_matterId_idx" ON "MatterNote"("tenantId", "matterId");

-- CreateIndex
CREATE INDEX "MatterEvent_tenantId_matterId_createdAt_idx" ON "MatterEvent"("tenantId", "matterId", "createdAt");

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_tenantId_clientId_fkey" FOREIGN KEY ("tenantId", "clientId") REFERENCES "Client"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_tenantId_courtId_fkey" FOREIGN KEY ("tenantId", "courtId") REFERENCES "Court"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MatterAssignment" ADD CONSTRAINT "MatterAssignment_tenantId_matterId_fkey" FOREIGN KEY ("tenantId", "matterId") REFERENCES "Matter"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MatterParty" ADD CONSTRAINT "MatterParty_tenantId_matterId_fkey" FOREIGN KEY ("tenantId", "matterId") REFERENCES "Matter"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_tenantId_matterId_fkey" FOREIGN KEY ("tenantId", "matterId") REFERENCES "Matter"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "HearingReminder" ADD CONSTRAINT "HearingReminder_tenantId_hearingId_fkey" FOREIGN KEY ("tenantId", "hearingId") REFERENCES "Hearing"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_tenantId_matterId_fkey" FOREIGN KEY ("tenantId", "matterId") REFERENCES "Matter"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MatterNote" ADD CONSTRAINT "MatterNote_tenantId_matterId_fkey" FOREIGN KEY ("tenantId", "matterId") REFERENCES "Matter"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MatterEvent" ADD CONSTRAINT "MatterEvent_tenantId_matterId_fkey" FOREIGN KEY ("tenantId", "matterId") REFERENCES "Matter"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- All references include the tenant, even if the application omits a check.
ALTER TABLE "Client" ADD CONSTRAINT client_branch FOREIGN KEY ("tenantId","branchId") REFERENCES "Branch"("tenantId",id);
ALTER TABLE "Client" ADD CONSTRAINT client_creator FOREIGN KEY ("tenantId","createdBy") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "Matter" ADD CONSTRAINT matter_branch FOREIGN KEY ("tenantId","branchId") REFERENCES "Branch"("tenantId",id);
ALTER TABLE "Matter" ADD CONSTRAINT matter_creator FOREIGN KEY ("tenantId","createdBy") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "MatterAssignment" ADD CONSTRAINT assignment_member FOREIGN KEY ("tenantId","memberId") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "Hearing" ADD CONSTRAINT hearing_member FOREIGN KEY ("tenantId","responsibleId") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "WorkTask" ADD CONSTRAINT task_member FOREIGN KEY ("tenantId","assignedTo") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "MatterNote" ADD CONSTRAINT note_author FOREIGN KEY ("tenantId","authorId") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "MatterEvent" ADD CONSTRAINT event_actor FOREIGN KEY ("tenantId","actorId") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "HearingReminder" ADD CONSTRAINT reminder_member FOREIGN KEY ("tenantId","memberId") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "Hearing" ADD CONSTRAINT hearing_time CHECK ("endsAt">"startsAt");
ALTER TABLE "Matter" ADD CONSTRAINT matter_claim CHECK ("claimMinor" IS NULL OR "claimMinor">=0);

CREATE FUNCTION practice_permission(p text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM "Membership" m JOIN "Role" r ON r.id=m."roleId" AND r."tenantId"=m."tenantId"
 WHERE m.id=NULLIF(current_setting('app.member_id',true),'')::uuid AND m.active AND p=ANY(r.permissions));
$$;
REVOKE ALL ON FUNCTION practice_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION practice_permission(text) TO legal_app;

DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['Client','Court','Matter','MatterAssignment','MatterParty','Hearing','HearingReminder','WorkTask','MatterNote','MatterEvent'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO legal_app',n);
 EXECUTE format('CREATE POLICY tenant_boundary ON %I AS RESTRICTIVE FOR ALL USING ("tenantId"=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK ("tenantId"=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 END LOOP;
END $$;
CREATE POLICY matter_scope ON "Matter" USING (
 practice_permission('matters:read') AND (
 practice_permission('matters:read:all') OR "createdBy"=NULLIF(current_setting('app.member_id',true),'')::uuid
 OR EXISTS(SELECT 1 FROM "MatterAssignment" a WHERE a."matterId"="Matter".id AND a."memberId"=NULLIF(current_setting('app.member_id',true),'')::uuid)
 OR (confidentiality='NORMAL' AND practice_permission('matters:read:branch') AND "branchId"=(SELECT "branchId" FROM "Membership" WHERE id=NULLIF(current_setting('app.member_id',true),'')::uuid))
 )) WITH CHECK (practice_permission('matters:manage'));
CREATE POLICY client_scope ON "Client" USING (
 practice_permission('clients:read') AND (practice_permission('matters:read:all') OR "createdBy"=NULLIF(current_setting('app.member_id',true),'')::uuid
 OR EXISTS(SELECT 1 FROM "Matter" m WHERE m."clientId"="Client".id))
 ) WITH CHECK (practice_permission('clients:manage'));
CREATE POLICY court_scope ON "Court" USING (practice_permission('matters:read')) WITH CHECK (practice_permission('courts:manage'));
CREATE POLICY assignment_read ON "MatterAssignment" FOR SELECT USING (NULLIF(current_setting('app.member_id',true),'') IS NOT NULL);
CREATE POLICY assignment_write ON "MatterAssignment" FOR INSERT WITH CHECK (
 EXISTS(SELECT 1 FROM "Matter" m WHERE m.id="matterId") AND practice_permission('matters:manage'));
GRANT DELETE ON "MatterAssignment" TO legal_app;
CREATE POLICY assignment_delete ON "MatterAssignment" FOR DELETE USING (
 practice_permission('matters:assign') AND EXISTS(SELECT 1 FROM "Matter" m WHERE m.id="matterId"));
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['MatterParty','Hearing','WorkTask','MatterNote','MatterEvent'] LOOP
 EXECUTE format('CREATE POLICY record_scope ON %I USING (EXISTS(SELECT 1 FROM "Matter" m WHERE m.id="matterId")) WITH CHECK (EXISTS(SELECT 1 FROM "Matter" m WHERE m.id="matterId"))',n);
 END LOOP;
END $$;
CREATE POLICY reminder_scope ON "HearingReminder" USING (
 "memberId"=NULLIF(current_setting('app.member_id',true),'')::uuid AND EXISTS(SELECT 1 FROM "Hearing" h WHERE h.id="hearingId")
 ) WITH CHECK (EXISTS(SELECT 1 FROM "Hearing" h WHERE h.id="hearingId"));
REVOKE UPDATE ON "MatterEvent","MatterNote" FROM legal_app;

ALTER TABLE "Role" DROP CONSTRAINT role_permission_catalog;
ALTER TABLE "Role" ADD CONSTRAINT role_permission_catalog CHECK (permissions IS NOT NULL AND permissions <@ ARRAY[
 'workspace:read','workspace:manage','team:read','team:manage','roles:read','roles:manage','audit:read',
 'clients:read','clients:manage','matters:read','matters:manage','matters:read:all','matters:read:branch','matters:assign','hearings:manage','tasks:manage','courts:manage','conflicts:read']::text[]);
-- A migration owner has to set a tenant context because RLS is forced.
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT "tenantId" FROM "OfficeDirectory" LOOP
 PERFORM set_config('app.tenant_id',t."tenantId"::text,true);
 UPDATE "Role" SET permissions=permissions||ARRAY['clients:read','clients:manage','matters:read','matters:manage','matters:read:all','matters:read:branch','matters:assign','hearings:manage','tasks:manage','courts:manage','conflicts:read']::text[] WHERE key='OWNER' AND "tenantId"=t."tenantId";
 END LOOP;
END $$;

