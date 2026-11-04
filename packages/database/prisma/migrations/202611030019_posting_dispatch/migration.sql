CREATE OR REPLACE FUNCTION office_finance_posting_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE required_ref text;
BEGIN
 IF TG_TABLE_NAME='OfficeInvoice' THEN
   IF NEW.status<>'ISSUED' THEN RETURN NULL; END IF;
   required_ref='invoice:'||NEW.id::text;
 ELSIF TG_TABLE_NAME='OfficeReceipt' THEN
   required_ref='receipt:'||NEW.id::text;
 ELSIF TG_TABLE_NAME='OfficeExpense' THEN
   IF NEW."approvedAt" IS NULL THEN RETURN NULL; END IF;
   required_ref='expense:'||NEW.id::text;
 ELSE RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Journal" WHERE "tenantId"=NEW."tenantId" AND reference=required_ref) THEN RAISE EXCEPTION 'Financial posting missing'; END IF;
 RETURN NULL;
END $$;
