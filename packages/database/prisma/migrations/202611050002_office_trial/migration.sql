-- The office runtime may start one trial. It cannot mark a subscription paid.
GRANT INSERT, UPDATE ON "Subscription" TO legal_app;

CREATE OR REPLACE FUNCTION public.subscription_office_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('legal_app', 'legal_runtime') THEN
    IF NEW.status <> 'TRIAL' THEN
      RAISE EXCEPTION 'OFFICE_TRIAL_ONLY';
    END IF;
    IF NEW."currentPeriodEnd" > now() + interval '15 days' THEN
      RAISE EXCEPTION 'OFFICE_TRIAL_WINDOW';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD."currentPeriodEnd" IS DISTINCT FROM NEW."currentPeriodEnd" THEN
      RAISE EXCEPTION 'OFFICE_TRIAL_WINDOW';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS subscription_office_write ON "Subscription";
CREATE TRIGGER subscription_office_write
  BEFORE INSERT OR UPDATE ON "Subscription"
  FOR EACH ROW EXECUTE FUNCTION public.subscription_office_write();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'legal_runtime') THEN
    GRANT SELECT ON "Plan" TO legal_runtime;
    GRANT SELECT, INSERT, UPDATE ON "Subscription" TO legal_runtime;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'Subscription' AND policyname = 'subscription_runtime'
    ) THEN
      CREATE POLICY subscription_runtime ON "Subscription" TO legal_runtime
        USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    END IF;
  END IF;
END $$;
