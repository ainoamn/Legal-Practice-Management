CREATE FUNCTION public.check_platform_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE due_amount integer; voided timestamptz; paid_amount bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice:'||NEW."invoiceId"::text,0));
  SELECT "amountMinor","voidedAt" INTO due_amount,voided FROM public."PlatformInvoice" WHERE id=NEW."invoiceId";
  IF NOT FOUND OR voided IS NOT NULL THEN RAISE EXCEPTION 'Invoice is unavailable' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(sum("amountMinor"),0) INTO paid_amount FROM public."PlatformPayment" WHERE "invoiceId"=NEW."invoiceId";
  IF NEW."amountMinor"<=0 OR paid_amount+NEW."amountMinor">due_amount THEN RAISE EXCEPTION 'Receipt exceeds invoice balance' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER platform_receipt_integrity BEFORE INSERT ON "PlatformPayment" FOR EACH ROW EXECUTE FUNCTION public.check_platform_receipt();
CREATE FUNCTION public.check_platform_invoice_void() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice:'||NEW.id::text,0));
  IF NEW."voidedAt" IS NOT NULL AND EXISTS(SELECT 1 FROM public."PlatformPayment" WHERE "invoiceId"=NEW.id) THEN RAISE EXCEPTION 'Paid invoices cannot be voided' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER platform_invoice_void_integrity BEFORE UPDATE OF "voidedAt" ON "PlatformInvoice" FOR EACH ROW EXECUTE FUNCTION public.check_platform_invoice_void();
