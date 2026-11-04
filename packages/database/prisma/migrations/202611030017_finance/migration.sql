-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fund" TEXT NOT NULL,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fund" TEXT NOT NULL,
    "clientId" UUID,
    "postedBy" UUID NOT NULL,
    "postedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "journalId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "debitMinor" INTEGER NOT NULL DEFAULT 0,
    "creditMinor" INTEGER NOT NULL DEFAULT 0,
    "clientId" UUID,
    "matterId" UUID,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficeInvoice" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "clientId" UUID NOT NULL,
    "matterId" UUID,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL,
    "taxBasisPoints" INTEGER NOT NULL,
    "netMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "dueAt" TIMESTAMPTZ NOT NULL,
    "issuedAt" TIMESTAMPTZ,
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "OfficeInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficeReceipt" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "paidAt" TIMESTAMPTZ NOT NULL,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficeReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficeExpense" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID,
    "matterId" UUID,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "incurredAt" TIMESTAMPTZ NOT NULL,
    "createdBy" UUID NOT NULL,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficeExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeAgreement" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "matterId" UUID,
    "kind" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "terms" TEXT NOT NULL,
    "agreedAt" TIMESTAMPTZ NOT NULL,
    "documentId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "hourlyRateMinor" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "workedAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_tenantId_id_key" ON "LedgerAccount"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_tenantId_code_key" ON "LedgerAccount"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Journal_tenantId_postedAt_idx" ON "Journal"("tenantId", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_tenantId_id_key" ON "Journal"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_tenantId_reference_key" ON "Journal"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "JournalLine_tenantId_accountId_idx" ON "JournalLine"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "OfficeInvoice_tenantId_clientId_idx" ON "OfficeInvoice"("tenantId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeInvoice_tenantId_id_key" ON "OfficeInvoice"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeInvoice_tenantId_sequence_key" ON "OfficeInvoice"("tenantId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeReceipt_tenantId_reference_key" ON "OfficeReceipt"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "OfficeExpense_tenantId_incurredAt_idx" ON "OfficeExpense"("tenantId", "incurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeeAgreement_tenantId_id_key" ON "FeeAgreement"("tenantId", "id");

-- CreateIndex
CREATE INDEX "TimeEntry_tenantId_matterId_idx" ON "TimeEntry"("tenantId", "matterId");

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_tenantId_journalId_fkey" FOREIGN KEY ("tenantId", "journalId") REFERENCES "Journal"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_tenantId_accountId_fkey" FOREIGN KEY ("tenantId", "accountId") REFERENCES "LedgerAccount"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OfficeReceipt" ADD CONSTRAINT "OfficeReceipt_tenantId_invoiceId_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "OfficeInvoice"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['LedgerAccount','Journal','JournalLine','OfficeInvoice','OfficeReceipt','OfficeExpense','FeeAgreement','TimeEntry'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('GRANT SELECT,INSERT ON %I TO legal_app',n);
 EXECUTE format('CREATE POLICY tenant_boundary ON %I AS RESTRICTIVE USING ("tenantId"=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK ("tenantId"=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('CREATE POLICY finance_access ON %I USING (practice_permission(''finance:read'')) WITH CHECK (practice_permission(''finance:manage'') OR practice_permission(''finance:approve''))',n);
 END LOOP;
END $$;
GRANT UPDATE ON "OfficeInvoice","OfficeExpense" TO legal_app;
ALTER TABLE "LedgerAccount" ADD CONSTRAINT account_catalog CHECK (kind IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE') AND fund IN ('OPERATING','TRUST'));
ALTER TABLE "JournalLine" ADD CONSTRAINT journal_line_positive CHECK ("debitMinor">=0 AND "creditMinor">=0 AND (("debitMinor">0) <> ("creditMinor">0)));
ALTER TABLE "OfficeInvoice" ADD CONSTRAINT office_invoice_values CHECK (status IN ('DRAFT','ISSUED','VOID') AND quantity>0 AND "unitPriceMinor">=0 AND "discountMinor">=0 AND "taxBasisPoints" BETWEEN 0 AND 10000 AND "netMinor">=0 AND "taxMinor">=0 AND "totalMinor">0 AND "netMinor"=quantity::bigint*"unitPriceMinor"-"discountMinor" AND "totalMinor"="netMinor"+"taxMinor");
ALTER TABLE "OfficeReceipt" ADD CONSTRAINT office_receipt_positive CHECK ("amountMinor">0);
ALTER TABLE "OfficeExpense" ADD CONSTRAINT office_expense_positive CHECK ("amountMinor">0);
ALTER TABLE "TimeEntry" ADD CONSTRAINT time_entry_values CHECK (minutes BETWEEN 1 AND 1440 AND "hourlyRateMinor">=0 AND "amountMinor">=0);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['Journal','JournalLine','OfficeInvoice','OfficeExpense','FeeAgreement'] LOOP
 EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("tenantId","clientId") REFERENCES "Client"("tenantId",id)',n,lower(n)||'_client_fk');
 END LOOP;
 FOREACH n IN ARRAY ARRAY['JournalLine','OfficeInvoice','OfficeExpense','FeeAgreement','TimeEntry'] LOOP
 EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("tenantId","matterId") REFERENCES "Matter"("tenantId",id)',n,lower(n)||'_matter_fk');
 END LOOP;
END $$;
ALTER TABLE "Journal" ADD CONSTRAINT journal_actor_fk FOREIGN KEY ("tenantId","postedBy") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "OfficeReceipt" ADD CONSTRAINT receipt_actor_fk FOREIGN KEY ("tenantId","recordedBy") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "OfficeExpense" ADD CONSTRAINT expense_creator_fk FOREIGN KEY ("tenantId","createdBy") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "OfficeExpense" ADD CONSTRAINT expense_approver_fk FOREIGN KEY ("tenantId","approvedBy") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "TimeEntry" ADD CONSTRAINT time_member_fk FOREIGN KEY ("tenantId","memberId") REFERENCES "Membership"("tenantId",id);
ALTER TABLE "FeeAgreement" ADD CONSTRAINT fee_document_fk FOREIGN KEY ("tenantId","documentId") REFERENCES "LegalDocument"("tenantId",id);

-- Accountants receive billing identifiers without internal legal notes or narratives.
CREATE VIEW "FinanceClientDirectory" WITH (security_barrier=true) AS SELECT id,name,"tenantId" FROM public."Client" WHERE "tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND public.practice_permission('finance:read');
CREATE VIEW "FinanceMatterDirectory" WITH (security_barrier=true) AS SELECT id,reference,"clientId","tenantId" FROM public."Matter" WHERE "tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND public.practice_permission('finance:read');
GRANT SELECT ON "FinanceClientDirectory","FinanceMatterDirectory" TO legal_app;

CREATE FUNCTION finance_journal_lock() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('finance:'||NEW."tenantId"::text,0)); RETURN NEW; END $$;
CREATE TRIGGER journal_lock BEFORE INSERT ON "Journal" FOR EACH ROW EXECUTE FUNCTION finance_journal_lock();
CREATE FUNCTION finance_balance_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE target uuid; j public."Journal"; total_debit bigint; total_credit bigint; count_lines integer;
BEGIN
 IF TG_TABLE_NAME='Journal' THEN target=NEW.id; ELSE target=NEW."journalId"; END IF;
 SELECT * INTO STRICT j FROM public."Journal" WHERE id=target;
 SELECT coalesce(sum("debitMinor"),0),coalesce(sum("creditMinor"),0),count(*) INTO total_debit,total_credit,count_lines FROM public."JournalLine" WHERE "journalId"=target;
 IF total_debit<>total_credit OR total_debit=0 OR count_lines<2 THEN RAISE EXCEPTION 'Unbalanced journal'; END IF;
 IF EXISTS(SELECT 1 FROM public."JournalLine" l JOIN public."LedgerAccount" a ON a.id=l."accountId" WHERE l."journalId"=target AND (a.fund<>j.fund OR (j.fund='TRUST' AND (j."clientId" IS NULL OR l."clientId" IS DISTINCT FROM j."clientId")))) THEN RAISE EXCEPTION 'Client funds must remain separate'; END IF;
 IF j.fund='TRUST' AND (SELECT coalesce(sum(l."debitMinor"-l."creditMinor"),0) FROM public."JournalLine" l JOIN public."LedgerAccount" a ON a.id=l."accountId" WHERE l."tenantId"=j."tenantId" AND l."clientId"=j."clientId" AND a.code='1010')<0 THEN RAISE EXCEPTION 'Insufficient client funds'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_balanced AFTER INSERT ON "Journal" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_balance_guard();
CREATE CONSTRAINT TRIGGER journal_lines_balanced AFTER INSERT ON "JournalLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_balance_guard();

CREATE FUNCTION office_receipt_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE invoice public."OfficeInvoice"; paid bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('finance:'||NEW."tenantId"::text,0));
 SELECT * INTO STRICT invoice FROM public."OfficeInvoice" WHERE id=NEW."invoiceId";
 SELECT coalesce(sum("amountMinor"),0) INTO paid FROM public."OfficeReceipt" WHERE "invoiceId"=NEW."invoiceId";
 IF invoice.status<>'ISSUED' OR paid+NEW."amountMinor">invoice."totalMinor" THEN RAISE EXCEPTION 'Receipt exceeds issued invoice'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER office_receipt_integrity BEFORE INSERT ON "OfficeReceipt" FOR EACH ROW EXECUTE FUNCTION office_receipt_guard();
CREATE FUNCTION office_invoice_lock() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION 'Issued invoice is immutable'; END IF;
 IF NEW.status NOT IN ('ISSUED','VOID') OR (NEW."clientId",NEW."matterId",NEW.description,NEW.quantity,NEW."unitPriceMinor",NEW."discountMinor",NEW."taxBasisPoints",NEW."totalMinor",NEW."dueAt") IS DISTINCT FROM (OLD."clientId",OLD."matterId",OLD.description,OLD.quantity,OLD."unitPriceMinor",OLD."discountMinor",OLD."taxBasisPoints",OLD."totalMinor",OLD."dueAt") THEN RAISE EXCEPTION 'Invalid invoice transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER office_invoice_integrity BEFORE UPDATE ON "OfficeInvoice" FOR EACH ROW EXECUTE FUNCTION office_invoice_lock();
ALTER TABLE "Role" DROP CONSTRAINT role_permission_catalog;
ALTER TABLE "Role" ADD CONSTRAINT role_permission_catalog CHECK (permissions IS NOT NULL AND permissions <@ ARRAY['workspace:read','workspace:manage','team:read','team:manage','roles:read','roles:manage','audit:read','clients:read','clients:manage','matters:read','matters:manage','matters:read:all','matters:read:branch','matters:assign','hearings:manage','tasks:manage','courts:manage','conflicts:read','documents:read','documents:manage','documents:review','documents:approve','documents:download','finance:read','finance:manage','finance:approve']::text[]);
DO $$ DECLARE t record; BEGIN FOR t IN SELECT "tenantId" FROM "OfficeDirectory" LOOP
 PERFORM set_config('app.tenant_id',t."tenantId"::text,true);
 UPDATE "Role" SET permissions=permissions||ARRAY['finance:read','finance:manage','finance:approve']::text[] WHERE key='OWNER' AND "tenantId"=t."tenantId";
END LOOP; END $$;

