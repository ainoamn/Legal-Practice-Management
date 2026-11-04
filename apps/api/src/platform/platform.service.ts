import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { db, type Tx } from "../../../../packages/database/src/index.js";
import {
  pageSchema,
  canDelegate,
} from "../../../../packages/contracts/src/index.js";
import {
  planSchema,
  subscriptionSchema,
  invoiceSchema,
  paymentSchema,
  sitePageSchema,
  settingsSchema,
  countrySchema,
  adminCreateSchema,
  adminPatchSchema,
  parseMinor,
} from "../../../../packages/contracts/src/platform.js";
import type { z } from "zod";
import { parse, redis } from "../security.js";
import { AuthService } from "../auth/auth.service.js";
import { hashPassword } from "../auth/password.js";
import type { RegisterInput } from "../../../../packages/contracts/src/index.js";
import { PlatformAuthService } from "./platform-auth.service.js";
import type { AdminActor } from "./platform.security.js";
export type TenantMetadata = {
  id: string;
  name: string;
  slug: string;
  countryCode: string;
  currency: string;
  currencyDecimals: number;
  timezone: string;
  accessStatus: string;
  createdAt: Date;
  memberCount: number;
};
export type UserMetadata = {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string;
  enabled: boolean;
  tenantId: string;
  tenantName: string;
  membershipActive: boolean;
  roleKey: string;
  createdAt: Date;
};
@Injectable()
export class PlatformService {
  constructor(
    @Inject(PlatformAuthService) private readonly auth: PlatformAuthService,
    @Inject(AuthService) private readonly officeAuth: AuthService,
  ) {}
  async createTenant(actor: AdminActor, input: RegisterInput) {
    await this.auth.run(actor, "tenants:manage", (tx) =>
      this.auth.audit(tx, actor.adminId, "tenant.provision.requested"),
    );
    const result = await this.officeAuth.register(
      input,
      "platform-provisioning",
      true,
    );
    const tenantId = "tenantId" in result ? result.tenantId : undefined;
    await this.auth.run(actor, "tenants:manage", (tx) =>
      this.auth.audit(tx, actor.adminId, "tenant.provisioned", tenantId),
    );
    return { ok: true, tenantId };
  }
  async tenant(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<
      TenantMetadata[]
    >`SELECT * FROM "PlatformTenantMetadata" WHERE id=${id}::uuid`;
    if (!rows[0]) throw new NotFoundException("NOT_FOUND");
    return rows[0];
  }
  minor(value: string, decimals: number) {
    try {
      return parseMinor(value, decimals);
    } catch {
      throw new BadRequestException("INVALID_AMOUNT");
    }
  }
  async overview(actor: AdminActor) {
    return this.auth.run(actor, "overview:read", async (tx) => {
      const tenants = await tx.$queryRaw<
        { total: number; readOnly: number }[]
      >`SELECT count(*)::int AS total,count(*) FILTER(WHERE "accessStatus"='READ_ONLY')::int AS "readOnly" FROM "PlatformTenantMetadata"`;
      const users = await tx.$queryRaw<
        { total: number; enabled: number }[]
      >`SELECT count(DISTINCT "userId")::int AS total,count(DISTINCT "userId") FILTER(WHERE enabled)::int AS enabled FROM "PlatformUserMetadata"`;
      const activeSubscriptions = await tx.subscription.count({
        where: {
          status: { in: ["ACTIVE", "TRIAL"] },
          currentPeriodEnd: { gt: new Date() },
        },
      });
      const invoices = await tx.platformInvoice.count({
          where: { voidedAt: null },
        }),
        publishedPages = await tx.sitePage.count({
          where: { status: "PUBLISHED" },
        });
      const receipts = await tx.$queryRaw<
        { currency: string; currencyDecimals: number; totalMinor: number }[]
      >`SELECT i.currency,i."currencyDecimals",COALESCE(sum(p."amountMinor"),0)::float8 AS "totalMinor" FROM "PlatformPayment" p JOIN "PlatformInvoice" i ON i.id=p."invoiceId" GROUP BY i.currency,i."currencyDecimals"`;
      return {
        tenants: tenants[0],
        users: users[0],
        activeSubscriptions,
        invoices,
        publishedPages,
        receipts,
        practice: (
          await tx.$queryRaw<
            {
              clients: number;
              matters: number;
              hearings: number;
              tasks: number;
              documents: number;
              storageMiB: number;
              contracts: number;
              powersOfAttorney: number;
              licences: number;
            }[]
          >`SELECT coalesce(sum("clientCount"),0)::float8 AS clients,coalesce(sum("matterCount"),0)::float8 AS matters,coalesce(sum("hearingCount"),0)::float8 AS hearings,coalesce(sum("taskCount"),0)::float8 AS tasks,coalesce(sum("documentCount"),0)::float8 AS documents,coalesce(sum("storageBytes"),0)::float8/1048576 AS "storageMiB",coalesce(sum("contractCount"),0)::float8 AS contracts,coalesce(sum("powerCount"),0)::float8 AS "powersOfAttorney",coalesce(sum("licenceCount"),0)::float8 AS licences FROM "PlatformPracticeUsage"`
        )[0],
      };
    });
  }
  async tenants(actor: AdminActor, query: unknown) {
    const p = parse(pageSchema, query),
      term = `%${p.search}%`;
    return this.auth.run(actor, "tenants:read", async (tx) => {
      const items = await tx.$queryRaw<
        TenantMetadata[]
      >`SELECT * FROM "PlatformTenantMetadata" WHERE name ILIKE ${term} OR slug ILIKE ${term} ORDER BY "createdAt" DESC LIMIT ${p.pageSize} OFFSET ${(p.page - 1) * p.pageSize}`;
      const count = await tx.$queryRaw<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM "PlatformTenantMetadata" WHERE name ILIKE ${term} OR slug ILIKE ${term}`;
      return { items, total: count[0]!.n, page: p.page, pageSize: p.pageSize };
    });
  }
  async tenantAccess(actor: AdminActor, id: string, status: string) {
    return this.auth.run(actor, "tenants:manage", async (tx) => {
      await this.tenant(tx, id);
      await tx.$executeRaw`SELECT public.platform_set_tenant_access(${id}::uuid,${status})`;
      await this.auth.audit(tx, actor.adminId, `tenant.access.${status}`, id);
      return { ok: true };
    });
  }
  async users(actor: AdminActor, query: unknown) {
    const p = parse(pageSchema, query),
      term = `%${p.search}%`;
    return this.auth.run(actor, "users:read", async (tx) => {
      const items = await tx.$queryRaw<
        UserMetadata[]
      >`SELECT * FROM "PlatformUserMetadata" WHERE "fullName" ILIKE ${term} OR email ILIKE ${term} ORDER BY "createdAt" DESC LIMIT ${p.pageSize} OFFSET ${(p.page - 1) * p.pageSize}`;
      const count = await tx.$queryRaw<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM "PlatformUserMetadata" WHERE "fullName" ILIKE ${term} OR email ILIKE ${term}`;
      return { items, total: count[0]!.n, page: p.page, pageSize: p.pageSize };
    });
  }
  async userEnabled(actor: AdminActor, id: string, enabled: boolean) {
    return this.auth.run(actor, "users:manage", async (tx) => {
      const rows = await tx.$queryRaw<
        { userId: string }[]
      >`SELECT "userId" FROM "PlatformUserMetadata" WHERE "userId"=${id}::uuid LIMIT 1`;
      if (!rows.length) throw new NotFoundException("NOT_FOUND");
      await tx.$executeRaw`SELECT public.platform_set_user_enabled(${id}::uuid,${enabled})`;
      await this.auth.audit(
        tx,
        actor.adminId,
        enabled ? "user.enabled" : "user.disabled",
        id,
      );
      return { ok: true };
    });
  }
  async plans(actor: AdminActor, query: unknown = {}) {
    const p = parse(pageSchema, query);
    return this.auth.run(actor, "plans:read", async (tx) => {
      const where = {
        name: { contains: p.search, mode: "insensitive" as const },
      };
      const items = await tx.plan.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: p.pageSize,
        skip: (p.page - 1) * p.pageSize,
      });
      const total = await tx.plan.count({ where });
      return { items, total, page: p.page, pageSize: p.pageSize };
    });
  }
  async savePlan(
    actor: AdminActor,
    input: z.infer<typeof planSchema>,
    id?: string,
  ) {
    return this.auth.run(actor, "plans:manage", async (tx) => {
      const { price, ...rest } = input;
      const data = {
        ...rest,
        priceMinor: this.minor(price, input.currencyDecimals),
      };
      const country = await tx.country.findFirst({
        where: {
          currency: input.currency,
          currencyDecimals: input.currencyDecimals,
        },
      });
      if (!country) throw new BadRequestException("UNKNOWN_CURRENCY");
      if (id && !(await tx.plan.findUnique({ where: { id } })))
        throw new NotFoundException("NOT_FOUND");
      const result = id
        ? await tx.plan.update({ where: { id }, data })
        : await tx.plan.create({ data });
      await this.auth.audit(
        tx,
        actor.adminId,
        id ? "plan.updated" : "plan.created",
        result.id,
      );
      return result;
    });
  }
  async subscriptions(actor: AdminActor, query: unknown = {}) {
    const p = parse(pageSchema, query);
    return this.auth.run(actor, "subscriptions:read", async (tx) => {
      const where = {
        plan: { name: { contains: p.search, mode: "insensitive" as const } },
      };
      const items = await tx.subscription.findMany({
        where,
        include: { plan: true },
        orderBy: { createdAt: "desc" },
        take: p.pageSize,
        skip: (p.page - 1) * p.pageSize,
      });
      const total = await tx.subscription.count({ where });
      const rows = [];
      for (const item of items) {
        const tenant = await this.tenant(tx, item.tenantId);
        rows.push({ ...item, tenantName: tenant.name });
      }
      return { items: rows, total, page: p.page, pageSize: p.pageSize };
    });
  }
  async saveSubscription(
    actor: AdminActor,
    input: z.infer<typeof subscriptionSchema>,
  ) {
    return this.auth.run(actor, "subscriptions:manage", async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.tenantId},0))`;
      const tenant = await this.tenant(tx, input.tenantId),
        plan = await tx.plan.findUnique({ where: { id: input.planId } });
      if (!plan?.active) throw new BadRequestException("INACTIVE_PLAN");
      if (tenant.memberCount > plan.maxUsers)
        throw new BadRequestException("WOULD_EXCEED_USER_QUOTA");
      const usage = (
        await tx.$queryRaw<
          { matterCount: number; branchCount: number; storageBytes: bigint }[]
        >`SELECT "matterCount","branchCount","storageBytes" FROM "PlatformPracticeUsage" WHERE "tenantId"=${input.tenantId}::uuid`
      )[0];
      if (
        usage &&
        (usage.matterCount > plan.maxMatters ||
          usage.branchCount > plan.maxBranches ||
          usage.storageBytes > BigInt(plan.maxStorageMiB) * 1048576n)
      )
        throw new BadRequestException("WOULD_EXCEED_PLAN_LIMITS");
      if (
        ["ACTIVE", "TRIAL"].includes(input.status) &&
        new Date(input.currentPeriodEnd) <= new Date()
      )
        throw new BadRequestException("INVALID_PERIOD");
      const data = {
        planId: input.planId,
        status: input.status,
        currentPeriodEnd: new Date(input.currentPeriodEnd),
      };
      const result = await tx.subscription.upsert({
        where: { tenantId: input.tenantId },
        create: { tenantId: input.tenantId, ...data },
        update: data,
      });
      await this.auth.audit(
        tx,
        actor.adminId,
        "subscription.updated",
        result.id,
      );
      return result;
    });
  }
  async invoices(actor: AdminActor, query: unknown = {}) {
    const p = parse(pageSchema, query);
    return this.auth.run(actor, "finance:read", async (tx) => {
      const where = {
        description: { contains: p.search, mode: "insensitive" as const },
      };
      const items = await tx.platformInvoice.findMany({
        where,
        include: { payments: true },
        orderBy: { createdAt: "desc" },
        take: p.pageSize,
        skip: (p.page - 1) * p.pageSize,
      });
      const total = await tx.platformInvoice.count({ where });
      const rows = [];
      for (const item of items) {
        const tenant = await this.tenant(tx, item.tenantId);
        const paidMinor = item.payments.reduce(
          (sum, payment) => sum + payment.amountMinor,
          0,
        );
        rows.push({
          ...item,
          tenantName: tenant.name,
          paidMinor,
          remainingMinor: item.amountMinor - paidMinor,
        });
      }
      return { items: rows, total, page: p.page, pageSize: p.pageSize };
    });
  }
  async createInvoice(actor: AdminActor, input: z.infer<typeof invoiceSchema>) {
    return this.auth.run(actor, "finance:manage", async (tx) => {
      const tenant = await this.tenant(tx, input.tenantId),
        amountMinor = this.minor(input.amount, tenant.currencyDecimals);
      if (amountMinor <= 0) throw new BadRequestException("INVALID_AMOUNT");
      const result = await tx.platformInvoice.create({
        data: {
          tenantId: tenant.id,
          description: input.description,
          amountMinor,
          currency: tenant.currency,
          currencyDecimals: tenant.currencyDecimals,
          dueAt: new Date(input.dueAt),
        },
      });
      await this.auth.audit(tx, actor.adminId, "invoice.created", result.id);
      return result;
    });
  }
  async voidInvoice(actor: AdminActor, id: string) {
    return this.auth.run(actor, "finance:manage", async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`invoice:${id}`},0))`;
      const invoice = await tx.platformInvoice.findUnique({
        where: { id },
        include: { payments: true },
      });
      if (!invoice) throw new NotFoundException("NOT_FOUND");
      if (invoice.payments.length)
        throw new BadRequestException("PAID_INVOICE_IMMUTABLE");
      await tx.platformInvoice.update({
        where: { id },
        data: { voidedAt: new Date() },
      });
      await this.auth.audit(tx, actor.adminId, "invoice.voided", id);
      return { ok: true };
    });
  }
  async payments(actor: AdminActor, query: unknown = {}) {
    const p = parse(pageSchema, query);
    return this.auth.run(actor, "finance:read", async (tx) => {
      const where = {
        reference: { contains: p.search, mode: "insensitive" as const },
      };
      const items = await tx.platformPayment.findMany({
        where,
        include: {
          invoice: {
            select: {
              number: true,
              currency: true,
              currencyDecimals: true,
              tenantId: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: p.pageSize,
        skip: (p.page - 1) * p.pageSize,
      });
      const total = await tx.platformPayment.count({ where });
      return { items, total, page: p.page, pageSize: p.pageSize };
    });
  }
  async createPayment(actor: AdminActor, input: z.infer<typeof paymentSchema>) {
    return this.auth.run(actor, "finance:manage", async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`invoice:${input.invoiceId}`},0))`;
      const invoice = await tx.platformInvoice.findUnique({
        where: { id: input.invoiceId },
        include: { payments: true },
      });
      if (!invoice || invoice.voidedAt)
        throw new BadRequestException("INVALID_INVOICE");
      const amountMinor = this.minor(input.amount, invoice.currencyDecimals),
        remaining =
          invoice.amountMinor -
          invoice.payments.reduce((sum, p) => sum + p.amountMinor, 0);
      if (amountMinor <= 0 || amountMinor > remaining)
        throw new BadRequestException("PAYMENT_EXCEEDS_BALANCE");
      const result = await tx.platformPayment.create({
        data: {
          invoiceId: invoice.id,
          amountMinor,
          reference: input.reference,
          method: input.method,
          recordedBy: actor.adminId,
        },
      });
      await this.auth.audit(tx, actor.adminId, "payment.recorded", result.id);
      return result;
    });
  }
  async pages(actor: AdminActor, query: unknown = {}) {
    const p = parse(pageSchema, query);
    return this.auth.run(actor, "content:read", async (tx) => {
      const where = {
        title: { contains: p.search, mode: "insensitive" as const },
      };
      const items = await tx.sitePage.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: p.pageSize,
        skip: (p.page - 1) * p.pageSize,
      });
      const total = await tx.sitePage.count({ where });
      return { items, total, page: p.page, pageSize: p.pageSize };
    });
  }
  async savePage(
    actor: AdminActor,
    input: z.infer<typeof sitePageSchema>,
    id?: string,
  ) {
    return this.auth.run(actor, "content:manage", async (tx) => {
      if (id && !(await tx.sitePage.findUnique({ where: { id } })))
        throw new NotFoundException("NOT_FOUND");
      const data = {
        ...input,
        publishedAt: input.status === "PUBLISHED" ? new Date() : null,
      };
      const result = id
        ? await tx.sitePage.update({ where: { id }, data })
        : await tx.sitePage.create({ data });
      await this.auth.audit(
        tx,
        actor.adminId,
        input.status === "PUBLISHED" ? "page.published" : "page.drafted",
        result.id,
      );
      return result;
    });
  }
  async settings(actor: AdminActor) {
    return this.auth.run(actor, "settings:read", (tx) =>
      tx.platformSettings.findUnique({ where: { id: "default" } }),
    );
  }
  async saveSettings(actor: AdminActor, input: z.infer<typeof settingsSchema>) {
    return this.auth.run(actor, "settings:manage", async (tx) => {
      const data = { ...input, supportEmail: input.supportEmail || null };
      const result = await tx.platformSettings.upsert({
        where: { id: "default" },
        create: data,
        update: data,
      });
      await this.auth.audit(tx, actor.adminId, "settings.updated", "default");
      return result;
    });
  }
  async countries(actor: AdminActor, query: unknown = {}) {
    const p = parse(pageSchema, query);
    return this.auth.run(actor, "settings:read", async (tx) => {
      const where = {
        OR: [
          { nameAr: { contains: p.search, mode: "insensitive" as const } },
          { nameEn: { contains: p.search, mode: "insensitive" as const } },
          { code: { contains: p.search, mode: "insensitive" as const } },
        ],
      };
      const items = await tx.country.findMany({
        where,
        orderBy: { code: "asc" },
        take: p.pageSize,
        skip: (p.page - 1) * p.pageSize,
      });
      const total = await tx.country.count({ where });
      return { items, total, page: p.page, pageSize: p.pageSize };
    });
  }
  async saveCountry(actor: AdminActor, input: z.infer<typeof countrySchema>) {
    return this.auth.run(actor, "settings:manage", async (tx) => {
      const old = await tx.country.findUnique({ where: { code: input.code } });
      if (
        old &&
        (old.currency !== input.currency ||
          old.currencyDecimals !== input.currencyDecimals)
      ) {
        const count = await tx.$queryRaw<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM "PlatformTenantMetadata" WHERE "countryCode"=${input.code}`;
        if (count[0]!.n > 0) throw new BadRequestException("COUNTRY_IN_USE");
      }
      const result = await tx.country.upsert({
        where: { code: input.code },
        create: input,
        update: input,
      });
      await this.auth.audit(tx, actor.adminId, "country.updated", input.code);
      return result;
    });
  }
  async admins(actor: AdminActor, query: unknown = {}) {
    const p = parse(pageSchema, query);
    return this.auth.run(actor, "admins:manage", async (tx) => {
      const where = {
        OR: [
          { name: { contains: p.search, mode: "insensitive" as const } },
          { email: { contains: p.search, mode: "insensitive" as const } },
        ],
      };
      const items = await tx.platformAdmin.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          kind: true,
          permissions: true,
          active: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: p.pageSize,
        skip: (p.page - 1) * p.pageSize,
      });
      const total = await tx.platformAdmin.count({ where });
      return { items, total, page: p.page, pageSize: p.pageSize };
    });
  }
  async createAdmin(
    actor: AdminActor,
    input: z.infer<typeof adminCreateSchema>,
  ) {
    const passwordHash = await hashPassword(input.password);
    return this.auth.run(actor, "admins:manage", async (tx) => {
      const session = await this.auth.session(tx, actor);
      if (!canDelegate(session.admin.permissions, input.permissions))
        throw new ForbiddenException("CANNOT_DELEGATE");
      const result = await tx.platformAdmin.create({
        data: {
          name: input.name,
          email: input.email,
          permissions: input.permissions,
          passwordHash,
        },
        select: { id: true },
      });
      await this.auth.audit(tx, actor.adminId, "admin.created", result.id);
      return result;
    });
  }
  async updateAdmin(
    actor: AdminActor,
    id: string,
    input: z.infer<typeof adminPatchSchema>,
  ) {
    return this.auth.run(actor, "admins:manage", async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('platform-admins',0))`;
      const session = await this.auth.session(tx, actor),
        target = await tx.platformAdmin.findUnique({ where: { id } });
      if (!target) throw new NotFoundException("NOT_FOUND");
      if (
        target.kind === "OWNER" ||
        target.id === actor.adminId ||
        !canDelegate(session.admin.permissions, target.permissions) ||
        !canDelegate(session.admin.permissions, input.permissions)
      )
        throw new ForbiddenException("PROTECTED_ADMIN");
      await tx.platformAdmin.update({ where: { id }, data: input });
      if (!input.active)
        await tx.platformSession.updateMany({
          where: { adminId: id },
          data: { revokedAt: new Date() },
        });
      await this.auth.audit(tx, actor.adminId, "admin.updated", id);
      return { ok: true };
    });
  }
  async security(actor: AdminActor, query: unknown) {
    const p = parse(pageSchema, query);
    return this.auth.run(actor, "security:read", async (tx) => {
      const items = await tx.platformAudit.findMany({
        include: { admin: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: p.pageSize,
        skip: (p.page - 1) * p.pageSize,
      });
      const total = await tx.platformAudit.count();
      return { items, total, page: p.page, pageSize: p.pageSize };
    });
  }
  async monitoring(actor: AdminActor) {
    return this.auth.run(actor, "security:read", async (tx) => {
      const started = performance.now();
      await tx.$queryRaw`SELECT 1`;
      const platformMs = Math.round(performance.now() - started);
      let appDatabase = "ok",
        redisStatus = "ok";
      try {
        await db.$queryRaw`SELECT 1`;
      } catch {
        appDatabase = "unavailable";
      }
      try {
        await redis.ping();
      } catch {
        redisStatus = "unavailable";
      }
      return {
        platformDatabase: "ok",
        platformMs,
        appDatabase,
        redis: redisStatus,
        activeAdminSessions: await tx.platformSession.count({
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
        }),
        aiConfigured: false,
        paymentGatewayConfigured: false,
        documentWorkersConfigured: Boolean(
          process.env.S3_BUCKET &&
          process.env.S3_REGION &&
          process.env.S3_ACCESS_KEY_ID &&
          process.env.S3_SECRET_ACCESS_KEY,
        ),
      };
    });
  }
  async sessions(actor: AdminActor, query: unknown) {
    const p = parse(pageSchema, query);
    return this.auth.run(actor, "security:read", async (tx) => {
      const where = { revokedAt: null, expiresAt: { gt: new Date() } };
      const items = await tx.platformSession.findMany({
        where,
        select: {
          id: true,
          adminId: true,
          verified: true,
          createdAt: true,
          expiresAt: true,
          admin: { select: { name: true, email: true, kind: true } },
        },
        orderBy: { createdAt: "desc" },
        take: p.pageSize,
        skip: (p.page - 1) * p.pageSize,
      });
      const total = await tx.platformSession.count({ where });
      return {
        items: items.map((item) => ({
          ...item,
          current: item.id === actor.sessionId,
        })),
        total,
        page: p.page,
        pageSize: p.pageSize,
      };
    });
  }
  async revokeSession(actor: AdminActor, id: string) {
    return this.auth.run(actor, "admins:manage", async (tx) => {
      const current = await this.auth.session(tx, actor),
        target = await tx.platformSession.findUnique({
          where: { id },
          include: { admin: true },
        });
      if (!target) throw new NotFoundException("NOT_FOUND");
      if (
        (target.admin.kind === "OWNER" && target.adminId !== actor.adminId) ||
        !canDelegate(current.admin.permissions, target.admin.permissions)
      )
        throw new ForbiddenException("PROTECTED_ADMIN");
      await tx.platformSession.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await this.auth.audit(tx, actor.adminId, "admin.session.revoked", id);
      return { ok: true };
    });
  }
}
