# System architecture

Modular monolith in an npm-workspaces repository. `apps/web`: Next.js App Router/React/TypeScript, translation dictionaries and RTL/LTR. `apps/api`: NestJS REST services; controllers validate input, services own policy and transactions. `packages/database`: Prisma schema, migrations, PostgreSQL adapter and tenant transaction boundary. `packages/contracts`: shared Zod schemas/permission catalog. `tests`: real HTTP and browser acceptance tests. Infrastructure: PostgreSQL 18, Redis 8, private MinIO (deferred until documents), Docker Compose and CI.

Browser → Next same-origin `/api/v1/*` reverse proxy → Nest → authenticated session → active membership → permission service → transaction with `SET LOCAL app.tenant_id` → PostgreSQL forced RLS. No tenant identifier from a browser body is trusted. Shared credentials are global User identities; workspace roles are Membership/Role records. Platform principals will use a separate authentication surface and table, never an owner role.

Redis is shared throttling infrastructure. Sessions persist in PostgreSQL and are independently revocable. Business queries must use scoped transaction clients, never raw global Prisma. Authentication tables are deliberately outside tenant RLS; no generic endpoints expose them. Office registration creates tenant/branch/roles/membership atomically. All authorization checks reload current membership and role so revocation takes effect on the next request.

Future modules: legal core → documents/jobs → finance → RAG → portal → platform. Object storage, queues and external providers get explicit adapters. No distributed services until measured operational reasons justify extraction. Production requires TLS, separate runtime/migration DB users, encrypted storage/backups, monitored worker queues and tested recovery.

No Sites deployment: required Nest/Postgres/Redis multi-container runtime does not match the Sites Worker runtime. Local repository is the delivery target for this phase.

## Platform administration

`/admin` uses an independent platform module, PlatformAdmin/PlatformSession and a scoped Strict cookie. PLATFORM_DATABASE_URL uses a separate NOSUPERUSER NOBYPASSRLS role with no SELECT on Tenant, User or Membership. Services read safe metadata views and call narrowly scoped SECURITY DEFINER functions for office access status and user activation. Legal content and passwords never appear in the projections. Every privileged operation checks current grants and verified MFA. Browser lookup caches carry the administrator identity and reset on account changes.

Subscription and public SitePage policies distinguish the application and platform DB roles. Ordinary users see only their own subscription; only published pages are visible through the application connection. Platform billing is separate from law-firm accounting. Amounts use bounded integer minor units and currency precision snapshots. Invoice advisory locks and SQL triggers serialize receipts and enforce balances. Audits/payments cannot be modified or deleted by the platform runtime role.
