import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../generated/client.js";
export type Tx = Prisma.TransactionClient;
config({ path: resolve(process.cwd(), ".env"), quiet: true });
config({ path: resolve(process.cwd(), "../../.env"), quiet: true });
const poolMax = process.env.VERCEL ? 1 : 10;
export const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: poolMax,
  }),
});
let platformClient: PrismaClient | undefined;
export function platformDatabase() {
  if (!process.env.PLATFORM_DATABASE_URL)
    throw new Error(
      "PLATFORM_DATABASE_URL required for platform administration",
    );
  return (platformClient ??= new PrismaClient({
adapter: new PrismaPg({
    connectionString: process.env.PLATFORM_DATABASE_URL,
    max: process.env.VERCEL ? 1 : 5,
  }),
  }));
}
export async function assertSafePlatformDatabase() {
  const p = platformDatabase();
  const roles = await p.$queryRaw<
    { rolsuper: boolean; rolbypassrls: boolean }[]
  >`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
  if (!roles[0] || roles[0].rolsuper || roles[0].rolbypassrls)
    throw new Error("Platform runtime cannot bypass RLS");
  const access = await p.$queryRaw<
    { users: boolean; tenants: boolean; members: boolean }[]
  >`SELECT has_table_privilege(current_user,'public."User"','SELECT') AS users,has_table_privilege(current_user,'public."Tenant"','SELECT') AS tenants,has_table_privilege(current_user,'public."Membership"','SELECT') AS members`;
  if (access[0]?.users || access[0]?.tenants || access[0]?.members)
    throw new Error("Platform runtime must use metadata views only");
}
export async function inTenant<T>(
  tenantId: string,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return work(tx);
    },
    { timeout: 15000 },
  );
}
export async function assertSafeDatabase() {
  const rows = await db.$queryRaw<
    { rolsuper: boolean; rolbypassrls: boolean }[]
  >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user`;
  if (!rows[0] || rows[0].rolsuper || rows[0].rolbypassrls)
    throw new Error(
      "Unsafe DATABASE_URL: runtime role must be NOSUPERUSER NOBYPASSRLS",
    );
  const policies = await db.$queryRaw<
    { count: bigint }[]
  >`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('Tenant','Branch','Role','Membership','AuditLog','Client','Court','Matter','MatterAssignment','MatterParty','Hearing','HearingReminder','WorkTask','MatterNote','MatterEvent','LegalDocument','DocumentVersion','DocumentTemplate','LedgerAccount','Journal','JournalLine','OfficeInvoice','OfficeReceipt','OfficeExpense','FeeAgreement','TimeEntry','ClientAccess','PortalMessage','PortalRequest','LegalInstrument','InstrumentObligation','InstrumentReminder','InstrumentEvent') AND c.relrowsecurity AND c.relforcerowsecurity`;
  if (Number(policies[0]?.count) !== 33)
    throw new Error("Tenant RLS migrations are missing or disabled");
}
