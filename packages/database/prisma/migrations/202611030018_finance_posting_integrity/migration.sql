ALTER TABLE "OfficeInvoice" ADD CONSTRAINT tax_rounding CHECK ("taxMinor"=round("netMinor"::numeric*"taxBasisPoints"/10000)::bigint);
CREATE FUNCTION office_finance_posting_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE required_ref text;
BEGIN
 IF TG_TABLE_NAME='OfficeInvoice' AND NEW.status='ISSUED' THEN required_ref='invoice:'||NEW.id::text;
 ELSIF TG_TABLE_NAME='OfficeReceipt' THEN required_ref='receipt:'||NEW.id::text;
 ELSIF TG_TABLE_NAME='OfficeExpense' AND NEW."approvedAt" IS NOT NULL THEN required_ref='expense:'||NEW.id::text;
 ELSE RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Journal" WHERE "tenantId"=NEW."tenantId" AND reference=required_ref) THEN RAISE EXCEPTION 'Financial posting missing'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER invoice_posting AFTER INSERT OR UPDATE ON "OfficeInvoice" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION office_finance_posting_guard();
CREATE CONSTRAINT TRIGGER receipt_posting AFTER INSERT ON "OfficeReceipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION office_finance_posting_guard();
CREATE CONSTRAINT TRIGGER expense_posting AFTER INSERT OR UPDATE ON "OfficeExpense" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION office_finance_posting_guard();
CREATE FUNCTION expense_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF OLD."approvedAt" IS NOT NULL THEN RAISE EXCEPTION 'Approved expense is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER expense_immutable BEFORE UPDATE ON "OfficeExpense" FOR EACH ROW EXECUTE FUNCTION expense_immutable();
