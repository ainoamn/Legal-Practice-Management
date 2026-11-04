ALTER TABLE "LegalInstrument" ADD CONSTRAINT instrument_version_positive CHECK (version>0);
ALTER TABLE "InstrumentObligation" ADD CONSTRAINT obligation_version_currency CHECK (version>0 AND "currencyDecimals" BETWEEN 0 AND 4);
CREATE FUNCTION instrument_link_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW."matterId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Matter" WHERE id=NEW."matterId" AND "tenantId"=NEW."tenantId" AND "clientId"=NEW."clientId") THEN RAISE EXCEPTION 'Matter and client mismatch'; END IF;
 IF NEW."documentId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."LegalDocument" d JOIN public."Matter" m ON m.id=d."matterId" AND m."tenantId"=d."tenantId" WHERE d.id=NEW."documentId" AND d."tenantId"=NEW."tenantId" AND m."clientId"=NEW."clientId" AND (NEW."matterId" IS NULL OR NEW."matterId"=d."matterId")) THEN RAISE EXCEPTION 'Document and client mismatch'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION instrument_link_guard() FROM PUBLIC;
CREATE TRIGGER instrument_links BEFORE INSERT OR UPDATE ON "LegalInstrument" FOR EACH ROW EXECUTE FUNCTION instrument_link_guard();
