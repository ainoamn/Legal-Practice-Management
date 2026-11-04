import "dotenv/config";
import { requireTestDatabase } from "./setup-env.js";
requireTestDatabase();
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "../apps/api/src/app.js";
import {
  db,
  platformDatabase,
  inTenant,
} from "../packages/database/src/index.js";
import { hashPassword } from "../apps/api/src/auth/password.js";
import { totp } from "../apps/api/src/auth/totp.js";
import { platformPermissions } from "../packages/contracts/src/platform.js";
import { redis } from "../apps/api/src/security.js";
process.env.MFA_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
let app: INestApplication,
  base: string,
  ownerCookie: string,
  ownerId: string,
  tenantCookie: string,
  tenantId: string,
  tenantUserId: string,
  planId: string,
  invoiceId: string;
const marker = randomUUID().slice(0, 8),
  password = "Platform-Test-Password-2026!",
  p = platformDatabase();
type Item = { id: string; [key: string]: unknown };
type List = { items: Item[]; total: number };
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
) {
  return fetch(`${base}/api/v1/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: process.env.WEB_ORIGIN!,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function adminLogin(email: string) {
  const login = await request("platform/auth/login", "POST", {
    email,
    password,
  });
  expect(login.status).toBe(201);
  const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  expect(login.headers.get("set-cookie")).toMatch(/HttpOnly/);
  const setup = await request(
    "platform/auth/mfa/setup",
    "POST",
    { password },
    cookie,
  );
  expect(setup.status).toBe(201);
  const { secret } = (await setup.json()) as { secret: string };
  expect(
    (await request("platform/overview", "GET", undefined, cookie)).status,
  ).toBe(403);
  const confirm = await request(
    "platform/auth/mfa/confirm",
    "POST",
    { code: totp(secret) },
    cookie,
  );
  expect(confirm.status).toBe(201);
  return cookie;
}
beforeAll(async () => {
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  const owner = await p.platformAdmin.create({
    data: {
      email: `platform-owner-${marker}@tests.invalid`,
      name: "Test platform owner",
      passwordHash: await hashPassword(password),
      kind: "OWNER",
      permissions: [...platformPermissions],
    },
  });
  ownerId = owner.id;
  ownerCookie = await adminLogin(owner.email);
  const res = await request("auth/register", "POST", {
    email: `platform-firm-${marker}@tests.invalid`,
    password,
    fullName: "Firm Owner",
    officeName: "Platform Test Firm",
    slug: `platform-firm-${marker}`,
    countryCode: "OM",
  });
  expect(res.status).toBe(201);
  tenantCookie = res.headers.get("set-cookie")!.split(";")[0]!;
  const profile = (await (
    await request("auth/me", "GET", undefined, tenantCookie)
  ).json()) as { tenant: { id: string }; user: { id: string } };
  tenantId = profile.tenant.id;
  tenantUserId = profile.user.id;
}, 60000);
afterAll(async () => {
  await app?.close();
  await db.$disconnect();
  await p.$disconnect();
  redis.disconnect();
});
describe("real platform administration and privilege separation", () => {
  it("requires a separate administrator identity and MFA", async () => {
    expect(
      (await request("platform/overview", "GET", undefined, tenantCookie))
        .status,
    ).toBe(401);
    expect(
      (await request("auth/me", "GET", undefined, ownerCookie)).status,
    ).toBe(401);
    const me = await (
      await request("platform/auth/me", "GET", undefined, ownerCookie)
    ).json();
    expect(me.mfaReady).toBe(true);
    expect(me.passwordHash).toBeUndefined();
  });
  it("constrains both database principals independently", async () => {
    await expect(p.user.findMany()).rejects.toThrow();
    await expect(p.tenant.findMany()).rejects.toThrow();
    await expect(p.membership.findMany()).rejects.toThrow();
    await expect(p.legalInstrument.findMany()).rejects.toThrow();
    await expect(db.platformAdmin.findMany()).rejects.toThrow();
    await expect(
      db.$executeRaw`SELECT platform_set_tenant_access(${tenantId}::uuid,'READ_ONLY')`,
    ).rejects.toThrow();
    expect(
      await p.$queryRaw<
        Item[]
      >`SELECT id FROM "PlatformTenantMetadata" WHERE id=${tenantId}::uuid`,
    ).toHaveLength(1);
  });
  it("shows real aggregates and bounded searchable directories", async () => {
    const overview = await request(
      "platform/overview",
      "GET",
      undefined,
      ownerCookie,
    );
    expect(overview.status).toBe(200);
    const snapshot = await overview.json();
    expect(snapshot.tenants.total).toBeGreaterThan(0);
    for (const key of ["contracts", "powersOfAttorney", "licences"])
      expect(snapshot.practice[key]).toEqual(expect.any(Number));
    const offices = (await (
      await request(
        `platform/tenants?search=${marker}&pageSize=1`,
        "GET",
        undefined,
        ownerCookie,
      )
    ).json()) as List;
    expect(offices.items).toHaveLength(1);
    expect(offices.total).toBe(1);
    const users = (await (
      await request(
        `platform/users?search=${marker}`,
        "GET",
        undefined,
        ownerCookie,
      )
    ).json()) as List;
    expect(users.items[0]?.passwordHash).toBeUndefined();
    expect(users.items[0]?.userId).toBe(tenantUserId);
  });
  it("creates plans and enforces actual subscription user quotas", async () => {
    const plan = await request(
      "platform/plans",
      "POST",
      {
        name: `Plan ${marker}`,
        price: "10.250",
        currency: "OMR",
        currencyDecimals: 3,
        interval: "MONTHLY",
        maxUsers: 1,
        maxMatters: 20,
        maxBranches: 1,
        maxStorageMiB: 1024,
        maxAiOperations: 0,
        active: true,
      },
      ownerCookie,
    );
    expect(plan.status).toBe(201);
    const data = await plan.json();
    planId = data.id;
    expect(data.priceMinor).toBe(10250);
    const sub = await request(
      "platform/subscriptions",
      "POST",
      {
        tenantId,
        planId,
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 86400000).toISOString(),
      },
      ownerCookie,
    );
    expect(sub.status).toBe(201);
    const roles = (await (
      await request("roles", "GET", undefined, tenantCookie)
    ).json()) as { id: string; key: string }[];
    const me = await (
      await request("auth/me", "GET", undefined, tenantCookie)
    ).json();
    const blocked = await request(
      "users",
      "POST",
      {
        email: `quota-${marker}@tests.invalid`,
        password,
        fullName: "Quota User",
        roleId: roles.find((r) => r.key === "LAWYER")!.id,
        branchId: me.branch.id,
      },
      tenantCookie,
    );
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).error.code).toBe("USER_QUOTA_EXCEEDED");
  });
  it("makes a suspended office read-only without deleting its data", async () => {
    expect(
      (
        await request(
          `platform/tenants/${tenantId}/access`,
          "PATCH",
          { status: "READ_ONLY" },
          ownerCookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request("tenants/current", "GET", undefined, tenantCookie)).status,
    ).toBe(200);
    const blocked = await request(
      "tenants/current",
      "PATCH",
      { name: "Blocked Change", timezone: "Asia/Muscat" },
      tenantCookie,
    );
    expect(blocked.status).toBe(403);
    await request(
      `platform/tenants/${tenantId}/access`,
      "PATCH",
      { status: "ACTIVE" },
      ownerCookie,
    );
  });
  it("records invoices and prevents duplicate or excessive receipts", async () => {
    const created = await request(
      "platform/invoices",
      "POST",
      {
        tenantId,
        description: "Platform subscription fee",
        amount: "10.250",
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      },
      ownerCookie,
    );
    expect(created.status).toBe(201);
    invoiceId = (await created.json()).id;
    const payload = {
      invoiceId,
      amount: "6.000",
      reference: `receipt-${marker}`,
      method: "BANK_TRANSFER",
    };
    expect(
      (await request("platform/payments", "POST", payload, ownerCookie)).status,
    ).toBe(201);
    expect(
      (
        await request(
          "platform/payments",
          "POST",
          { ...payload, amount: "1.000" },
          ownerCookie,
        )
      ).status,
    ).toBe(409);
    const list = (await (
      await request("platform/invoices", "GET", undefined, ownerCookie)
    ).json()) as List;
    const invoice = list.items.find((i) => i.id === invoiceId)!;
    expect(invoice.paidMinor).toBe(6000);
    expect(invoice.remainingMinor).toBe(4250);
    const concurrent = await Promise.all([
      request(
        "platform/payments",
        "POST",
        { ...payload, reference: `concurrent-a-${marker}`, amount: "4.250" },
        ownerCookie,
      ),
      request(
        "platform/payments",
        "POST",
        { ...payload, reference: `concurrent-b-${marker}`, amount: "4.250" },
        ownerCookie,
      ),
    ]);
    expect(concurrent.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(
      (
        await request(
          `platform/invoices/${invoiceId}/void`,
          "POST",
          {},
          ownerCookie,
        )
      ).status,
    ).toBe(400);
    await expect(
      p.platformPayment.create({
        data: {
          invoiceId,
          reference: `sql-overpay-${marker}`,
          amountMinor: 1,
          method: "BANK_TRANSFER",
          recordedBy: ownerId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      p.platformPayment.deleteMany({ where: { invoiceId } }),
    ).rejects.toThrow();
  });
  it("exposes only published pages and escapes content at the rendering boundary", async () => {
    const payload = {
      slug: `policy-${marker}`,
      title: "Test policy",
      body: "<script>alert(1)</script>\nSafe legal platform text",
      status: "DRAFT",
    };
    const created = await request(
      "platform/pages",
      "POST",
      payload,
      ownerCookie,
    );
    expect(created.status).toBe(201);
    const id = (await created.json()).id;
    expect((await request(`public/pages/${payload.slug}`)).status).toBe(404);
    expect(await db.sitePage.findFirst({ where: { id } })).toBeNull();
    expect(
      (
        await request(
          `platform/pages/${id}`,
          "PATCH",
          { ...payload, status: "PUBLISHED" },
          ownerCookie,
        )
      ).status,
    ).toBe(200);
    expect((await request(`public/pages/${payload.slug}`)).status).toBe(200);
  });
  it("applies brand and registration settings without exposing credentials", async () => {
    const original = await p.platformSettings.findUnique({
      where: { id: "default" },
    });
    try {
      expect(
        (
          await request(
            "platform/settings",
            "POST",
            {
              brandName: "LEGAL OFFICE AI",
              primaryColor: "#087e83",
              supportEmail: "support@tests.invalid",
              registrationOpen: false,
            },
            ownerCookie,
          )
        ).status,
      ).toBe(201);
      expect(
        (await (await request("public/settings")).json()).registrationOpen,
      ).toBe(false);
      expect(
        (
          await request("auth/register", "POST", {
            email: `closed-${marker}@tests.invalid`,
            password,
            fullName: "Closed User",
            officeName: "Closed Firm",
            slug: `closed-${marker}`,
            countryCode: "OM",
          })
        ).status,
      ).toBe(403);
      const provisioned = await request(
        "platform/tenants",
        "POST",
        {
          email: `provision-${marker}@tests.invalid`,
          password,
          fullName: "Provisioned Owner",
          officeName: "Provisioned Firm",
          slug: `provision-${marker}`,
          countryCode: "OM",
        },
        ownerCookie,
      );
      expect(provisioned.status).toBe(201);
      expect((await provisioned.json()).tenantId).toBeTruthy();
    } finally {
      await request(
        "platform/settings",
        "POST",
        original
          ? {
              brandName: original.brandName,
              primaryColor: original.primaryColor,
              supportEmail: original.supportEmail ?? "",
              registrationOpen: original.registrationOpen,
            }
          : {
              brandName: "LEGAL OFFICE AI",
              primaryColor: "#087e83",
              supportEmail: "",
              registrationOpen: true,
            },
        ownerCookie,
      );
    }
  });
  it("keeps support operators within delegated permissions and protects the owner", async () => {
    const email = `operator-${marker}@tests.invalid`;
    expect(
      (
        await request(
          "platform/admins",
          "POST",
          {
            email,
            name: "Support operator",
            password,
            permissions: ["tenants:read"],
          },
          ownerCookie,
        )
      ).status,
    ).toBe(201);
    const operator = await adminLogin(email);
    expect(
      (await request("platform/tenants", "GET", undefined, operator)).status,
    ).toBe(200);
    expect(
      (await request("platform/invoices", "GET", undefined, operator)).status,
    ).toBe(403);
    expect((await request("platform/plans", "POST", {}, operator)).status).toBe(
      400,
    );
    expect(
      (
        await request(
          `platform/tenants/${tenantId}/access`,
          "PATCH",
          { status: "READ_ONLY" },
          operator,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `platform/admins/${ownerId}`,
          "PATCH",
          { active: false, permissions: [] },
          ownerCookie,
        )
      ).status,
    ).toBe(403);
  });
  it("disables a firm user immediately and preserves the registry", async () => {
    expect(
      (
        await request(
          `platform/users/${tenantUserId}`,
          "PATCH",
          { enabled: false },
          ownerCookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request("auth/me", "GET", undefined, tenantCookie)).status,
    ).toBe(401);
    expect(await inTenant(tenantId, (tx) => tx.membership.count())).toBe(1);
    await request(
      `platform/users/${tenantUserId}`,
      "PATCH",
      { enabled: true },
      ownerCookie,
    );
  });
  it("lists administrator sessions without tokens and revokes other sessions", async () => {
    const token = randomBytes(32).toString("hex");
    const other = await p.platformSession.create({
      data: {
        adminId: ownerId,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        verified: true,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const response = await request(
      "platform/sessions",
      "GET",
      undefined,
      ownerCookie,
    );
    expect(response.status).toBe(200);
    const list = (await response.json()) as List;
    expect(list.items.some((item) => item.id === other.id)).toBe(true);
    expect(JSON.stringify(list)).not.toContain("tokenHash");
    expect(
      (await request("platform/auth/revoke-others", "POST", {}, ownerCookie))
        .status,
    ).toBe(201);
    expect(
      (
        await request(
          "platform/auth/me",
          "GET",
          undefined,
          `legal_platform_session=${token}`,
        )
      ).status,
    ).toBe(401);
    expect(
      (await request("platform/auth/me", "GET", undefined, ownerCookie)).status,
    ).toBe(200);
  });
  it("provides real monitoring and append-only administrative audit", async () => {
    const health = await (
      await request("platform/monitoring", "GET", undefined, ownerCookie)
    ).json();
    expect(health.platformDatabase).toBe("ok");
    expect(health.redis).toBe("ok");
    expect(health.paymentGatewayConfigured).toBe(false);
    const log = (await (
      await request(
        "platform/audit?pageSize=100",
        "GET",
        undefined,
        ownerCookie,
      )
    ).json()) as List;
    expect(log.items.some((i) => i.action === "payment.recorded")).toBe(true);
    await expect(
      p.platformAudit.updateMany({
        where: { adminId: ownerId },
        data: { action: "tampered" },
      }),
    ).rejects.toThrow();
  });
});
