-- CreateTable
CREATE TABLE "LegalInstrument" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "matterId" UUID,
    "documentId" UUID,
    "createdBy" UUID NOT NULL,
    "responsibleId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "partyOne" TEXT NOT NULL,
    "partyTwo" TEXT NOT NULL DEFAULT '',
    "agent" TEXT NOT NULL DEFAULT '',
    "issuingAuthority" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "confidentiality" TEXT NOT NULL DEFAULT 'NORMAL',
    "issuedAt" DATE NOT NULL,
    "startsAt" DATE,
    "endsAt" DATE,
    "renewalAt" DATE,
    "amountMinor" INTEGER,
    "currency" TEXT NOT NULL,
    "currencyDecimals" INTEGER NOT NULL,
    "terms" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "reminderDays" INTEGER[] DEFAULT ARRAY[30, 7, 1, 0]::INTEGER[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "LegalInstrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentObligation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "instrumentId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "assignedTo" UUID NOT NULL,
    "dueAt" TIMESTAMPTZ NOT NULL,
    "amountMinor" INTEGER,
    "currency" TEXT NOT NULL,
    "currencyDecimals" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "completedAt" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "InstrumentObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentReminder" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "instrumentId" UUID NOT NULL,
    "obligationId" UUID,
    "memberId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "dueAt" TIMESTAMPTZ NOT NULL,
    "readAt" TIMESTAMPTZ,
    "cancelledAt" TIMESTAMPTZ,
    "generation" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstrumentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentEvent" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "instrumentId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstrumentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalInstrument_tenantId_endsAt_idx" ON "LegalInstrument"("tenantId", "endsAt");

-- CreateIndex
CREATE INDEX "LegalInstrument_tenantId_clientId_idx" ON "LegalInstrument"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "LegalInstrument_tenantId_responsibleId_idx" ON "LegalInstrument"("tenantId", "responsibleId");

-- CreateIndex
CREATE UNIQUE INDEX "LegalInstrument_tenantId_id_key" ON "LegalInstrument"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LegalInstrument_tenantId_sequence_key" ON "LegalInstrument"("tenantId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "LegalInstrument_tenantId_reference_key" ON "LegalInstrument"("tenantId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "LegalInstrument_tenantId_kind_referenceNumber_key" ON "LegalInstrument"("tenantId", "kind", "referenceNumber");

-- CreateIndex
CREATE INDEX "InstrumentObligation_tenantId_dueAt_idx" ON "InstrumentObligation"("tenantId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstrumentObligation_tenantId_id_instrumentId_key" ON "InstrumentObligation"("tenantId", "id", "instrumentId");

-- CreateIndex
CREATE INDEX "InstrumentReminder_tenantId_memberId_dueAt_idx" ON "InstrumentReminder"("tenantId", "memberId", "dueAt");

-- CreateIndex
CREATE INDEX "InstrumentEvent_tenantId_instrumentId_createdAt_idx" ON "InstrumentEvent"("tenantId", "instrumentId", "createdAt");

-- AddForeignKey
ALTER TABLE "InstrumentObligation" ADD CONSTRAINT "InstrumentObligation_tenantId_instrumentId_fkey" FOREIGN KEY ("tenantId", "instrumentId") REFERENCES "LegalInstrument"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InstrumentReminder" ADD CONSTRAINT "InstrumentReminder_tenantId_instrumentId_fkey" FOREIGN KEY ("tenantId", "instrumentId") REFERENCES "LegalInstrument"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InstrumentEvent" ADD CONSTRAINT "InstrumentEvent_tenantId_instrumentId_fkey" FOREIGN KEY ("tenantId", "instrumentId") REFERENCES "LegalInstrument"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['LegalInstrument','InstrumentObligation','InstrumentReminder','InstrumentEvent'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('GRANT SELECT,INSERT ON %I TO legal_app',n);
 EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id)',n,lower(n)||'_tenant_fk');
 EXECUTE format('CREATE POLICY tenant_boundary ON %I AS RESTRICTIVE USING ("tenantId"=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK ("tenantId"=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 END LOOP;
END $$;
GRANT UPDATE ON "LegalInstrument","InstrumentObligation","InstrumentReminder" TO legal_app;
ALTER TABLE "LegalInstrument" ADD CONSTRAINT instrument_client FOREIGN KEY ("tenantId","clientId") REFERENCES "Client"("tenantId",id);
ALTER TABLE "LegalInstrument" ADD CONSTRAINT instrument_branch FOREIGN KEY ("tenantId","branchId") REFERENCES "Branch"("tenantId",id);
ALTER TABLE "LegalInstrument" ADD CONSTRAINT instrument_matter FOREIGN KEY ("tenantId","matterId") REFERENCES "Matter"("tenantId",id);
ALTER TABLE "LegalInstrument" ADD CONSTRAINT instrument_document FOREIGN KEY ("tenantId","documentId") REFERENCES "LegalDocument"("tenantId",id);
ALTER TABLE "LegalInstrument" ADD CONSTRAINT instrument_creator FOREIGN KEY ("tenantId","createdBy") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "LegalInstrument" ADD CONSTRAINT instrument_responsible FOREIGN KEY ("tenantId","responsibleId") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "LegalInstrument" ADD CONSTRAINT instrument_approver FOREIGN KEY ("tenantId","approvedBy") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "InstrumentObligation" ADD CONSTRAINT obligation_member FOREIGN KEY ("tenantId","assignedTo") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "InstrumentReminder" ADD CONSTRAINT instrument_reminder_member FOREIGN KEY ("tenantId","memberId") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "InstrumentReminder" ADD CONSTRAINT instrument_reminder_obligation FOREIGN KEY ("tenantId","obligationId","instrumentId") REFERENCES "InstrumentObligation"("tenantId",id,"instrumentId");
ALTER TABLE "InstrumentEvent" ADD CONSTRAINT instrument_event_actor FOREIGN KEY ("tenantId","actorId") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "LegalInstrument" ADD CONSTRAINT instrument_values CHECK (kind IN ('CONTRACT','POWER_OF_ATTORNEY','LICENCE') AND status IN ('DRAFT','ACTIVE','CLOSED','CANCELLED','ARCHIVED') AND confidentiality IN ('NORMAL','CONFIDENTIAL','RESTRICTED') AND ("amountMinor" IS NULL OR "amountMinor">=0) AND "currencyDecimals" BETWEEN 0 AND 4 AND ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt">="startsAt") AND (status<>'ACTIVE' OR ("approvedAt" IS NOT NULL AND "approvedBy" IS NOT NULL)));
ALTER TABLE "InstrumentObligation" ADD CONSTRAINT obligation_values CHECK (status IN ('TODO','IN_PROGRESS','DONE','CANCELLED') AND ("amountMinor" IS NULL OR "amountMinor">=0));
ALTER TABLE "InstrumentReminder" ADD CONSTRAINT instrument_reminder_kind CHECK (kind IN ('EXPIRY','RENEWAL','OBLIGATION'));
CREATE POLICY instrument_scope ON "LegalInstrument" USING (
 practice_permission('instruments:read') AND practice_permission('clients:read') AND (
 practice_permission('matters:read:all') OR "createdBy"=NULLIF(current_setting('app.member_id',true),'')::uuid OR "responsibleId"=NULLIF(current_setting('app.member_id',true),'')::uuid
 OR EXISTS(SELECT 1 FROM "Matter" m WHERE m.id="matterId")
 OR (confidentiality='NORMAL' AND practice_permission('matters:read:branch') AND "branchId"=(SELECT "branchId" FROM "Membership" WHERE id=NULLIF(current_setting('app.member_id',true),'')::uuid))
 )) WITH CHECK (practice_permission('instruments:manage') OR practice_permission('instruments:approve'));
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['InstrumentObligation','InstrumentReminder','InstrumentEvent'] LOOP
 EXECUTE format('CREATE POLICY instrument_child ON %I USING (EXISTS(SELECT 1 FROM "LegalInstrument" i WHERE i.id="instrumentId")) WITH CHECK (EXISTS(SELECT 1 FROM "LegalInstrument" i WHERE i.id="instrumentId"))',n);
END LOOP; END $$;
DROP POLICY client_scope ON "Client";
CREATE POLICY client_scope ON "Client" USING (
 practice_permission('clients:read') AND (practice_permission('matters:read:all') OR "createdBy"=NULLIF(current_setting('app.member_id',true),'')::uuid OR EXISTS(SELECT 1 FROM "Matter" m WHERE m."clientId"="Client".id) OR EXISTS(SELECT 1 FROM "LegalInstrument" i WHERE i."clientId"="Client".id))
 ) WITH CHECK (practice_permission('clients:manage'));
CREATE FUNCTION instrument_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF (NEW."tenantId",NEW."clientId",NEW.kind,NEW.sequence,NEW.reference,NEW."createdBy",NEW."createdAt") IS DISTINCT FROM (OLD."tenantId",OLD."clientId",OLD.kind,OLD.sequence,OLD.reference,OLD."createdBy",OLD."createdAt") THEN RAISE EXCEPTION 'Instrument identity is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER instrument_identity BEFORE UPDATE ON "LegalInstrument" FOR EACH ROW EXECUTE FUNCTION instrument_identity_guard();
CREATE FUNCTION instrument_sequence() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT coalesce(max(sequence),0)::int FROM public."LegalInstrument" WHERE "tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND public.practice_permission('instruments:manage'); $$;
REVOKE ALL ON FUNCTION instrument_sequence() FROM PUBLIC; GRANT EXECUTE ON FUNCTION instrument_sequence() TO legal_app;


ALTER TABLE "Role" DROP CONSTRAINT role_permission_catalog;
ALTER TABLE "Role" ADD CONSTRAINT role_permission_catalog CHECK (permissions IS NOT NULL AND permissions <@ ARRAY['workspace:read','workspace:manage','team:read','team:manage','roles:read','roles:manage','audit:read','clients:read','clients:manage','matters:read','matters:manage','matters:read:all','matters:read:branch','matters:assign','hearings:manage','tasks:manage','courts:manage','conflicts:read','documents:read','documents:manage','documents:review','documents:approve','documents:download','finance:read','finance:manage','finance:approve','portal:read','instruments:read','instruments:manage','instruments:approve']::text[]);
DO $$ DECLARE t record; BEGIN FOR t IN SELECT "tenantId" FROM "OfficeDirectory" LOOP
 PERFORM set_config('app.tenant_id',t."tenantId"::text,true);
 UPDATE "Role" SET permissions=permissions||ARRAY['instruments:read','instruments:manage','instruments:approve']::text[] WHERE key='OWNER' AND "tenantId"=t."tenantId";
END LOOP;END $$;

