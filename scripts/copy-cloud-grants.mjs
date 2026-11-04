import { readFileSync } from "node:fs";
import pg from "pg";

const ownerUrl = readFileSync(new URL("../.local/owner.url", import.meta.url), "utf8").trim();
const deploy = Object.fromEntries(
  readFileSync(new URL("../.local/deploy.env", import.meta.url), "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);
const owner = new pg.Client({ connectionString: ownerUrl });
await owner.connect();
const copy = `
DO $$
DECLARE
  source text := '__SOURCE__';
  target text := '__TARGET__';
  r record;
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', target);
  FOR r IN
    SELECT table_schema, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE grantee = source AND table_schema = 'public'
  LOOP
    EXECUTE format('GRANT %s ON TABLE %I.%I TO %I', r.privilege_type, r.table_schema, r.table_name, target);
  END LOOP;
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS sequence_name, a.privilege_type
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE c.relkind = 'S' AND n.nspname = 'public' AND a.grantee = source::regrole
  LOOP
    EXECUTE format('GRANT %s ON SEQUENCE %I.%I TO %I', r.privilege_type, r.schema_name, r.sequence_name, target);
  END LOOP;
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege(source, p.oid, 'EXECUTE')
      AND NOT has_function_privilege('public', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', r.signature, target);
  END LOOP;
END $$;
`;
await owner.query(copy.replaceAll("__SOURCE__", "legal_app").replaceAll("__TARGET__", "legal_runtime"));
await owner.query(
  copy.replaceAll("__SOURCE__", "legal_platform").replaceAll("__TARGET__", "legal_platform_runtime"),
);
const policies = await owner.query(
  `SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('Tenant','Branch','Role','Membership','AuditLog','Client','Court','Matter','MatterAssignment','MatterParty','Hearing','HearingReminder','WorkTask','MatterNote','MatterEvent','LegalDocument','DocumentVersion','DocumentTemplate','LedgerAccount','Journal','JournalLine','OfficeInvoice','OfficeReceipt','OfficeExpense','FeeAgreement','TimeEntry','ClientAccess','PortalMessage','PortalRequest','LegalInstrument','InstrumentObligation','InstrumentReminder','InstrumentEvent') AND c.relrowsecurity AND c.relforcerowsecurity`,
);
await owner.end();

async function check(label, url, sql) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const result = await client.query(sql);
  console.log(label, JSON.stringify(result.rows));
  await client.end();
}
await check(
  "runtime",
  deploy.DATABASE_URL,
  `SELECT current_user AS user, rolbypassrls FROM pg_roles WHERE rolname=current_user`,
);
await check("country", deploy.DATABASE_URL, `SELECT code FROM "Country"`);
await check(
  "tenant-without-context",
  deploy.DATABASE_URL,
  `SELECT count(*)::int AS tenants FROM "Tenant"`,
);
await check(
  "platform-boundaries",
  deploy.PLATFORM_DATABASE_URL,
  `SELECT rolbypassrls, has_table_privilege(current_user,'public."User"','SELECT') AS users, has_table_privilege(current_user,'public."Tenant"','SELECT') AS tenants, has_table_privilege(current_user,'public."Membership"','SELECT') AS members, has_table_privilege(current_user,'public."PlatformAdmin"','SELECT') AS admins FROM pg_roles WHERE rolname=current_user`,
);
console.log("forced-rls", policies.rows[0].count);
