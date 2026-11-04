import "dotenv/config";
import { requireTestDatabase } from "./setup-env.js";
requireTestDatabase();
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "../apps/api/src/app.js";
import { db, inTenant } from "../packages/database/src/index.js";
import { redis } from "../apps/api/src/security.js";
import { totp } from "../apps/api/src/auth/totp.js";
import { type Mailer } from "../apps/api/src/auth/mail.js";
const mailbox = new Map<string, string>();
const mailer: Mailer = {
  configured: () => true,
  sendPasswordReset: async (email, link) => {
    mailbox.set(email, link);
  },
};
process.env.MFA_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
import type {
  Me,
  Role,
  Branch,
  Page,
  Member,
  Session,
} from "../apps/web/src/lib/api.js";
let app: INestApplication, base: string;
const password = "Correct-Horse-Password-2026!";
const run = randomUUID().slice(0, 8);
type Office = { cookie: string; me: Me; slug: string; email: string };
let a: Office, b: Office;
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
  origin = process.env.WEB_ORIGIN,
) {
  return fetch(`${base}/api/v1/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function register(suffix: string): Promise<Office> {
  const email = `${run}-${suffix}@tests.invalid`,
    slug = `test-${run}-${suffix}`;
  const res = await request("auth/register", "POST", {
    email,
    password,
    fullName: "Test Owner",
    officeName: `Firm ${suffix}`,
    slug,
    countryCode: "OM",
  });
  expect(res.status).toBe(201);
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  const me = (await (
    await request("auth/me", "GET", undefined, cookie)
  ).json()) as Me;
  return { cookie, me, slug, email };
}
async function roleIn(office: Office, key: string) {
  const roles = (await (
    await request("roles", "GET", undefined, office.cookie)
  ).json()) as Role[];
  return roles.find((r) => r.key === key)!;
}
async function addMember(office: Office, key: string, suffix: string) {
  const role = await roleIn(office, key),
    email = `${run}-${suffix}@tests.invalid`;
  const res = await request(
    "users",
    "POST",
    {
      email,
      password,
      fullName: `Test ${suffix}`,
      roleId: role.id,
      branchId: office.me.branch.id,
    },
    office.cookie,
  );
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  const login = await request("auth/login", "POST", {
    email,
    password,
    slug: office.slug,
  });
  expect(login.status).toBe(201);
  return {
    id,
    cookie: login.headers.get("set-cookie")!.split(";")[0]!,
    email,
    role,
  };
}
beforeAll(async () => {
  app = await createApp({ mailer });
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  a = await register("a");
  b = await register("b");
}, 60000);
afterAll(async () => {
  await app?.close();
  await db.$disconnect();
  redis.disconnect();
});
describe("real HTTP + PostgreSQL isolation", () => {
  it("creates independent offices atomically and stores no plaintext password", async () => {
    expect(a.me.tenant.id).not.toBe(b.me.tenant.id);
    const user = await db.user.findUniqueOrThrow({ where: { email: a.email } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(password);
    const role = await roleIn(a, "OWNER");
    expect(role.permissions).toContain("roles:manage");
  });
  it("uses HttpOnly cookies and generic credential failures", async () => {
    const res = await request("auth/login", "POST", {
      email: a.email,
      password,
      slug: a.slug,
    });
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(res.headers.get("set-cookie")).toMatch(/SameSite=Lax/i);
    const invalid = await request("auth/login", "POST", {
      email: a.email,
      password: "wrong",
      slug: a.slug,
    });
    const absent = await request("auth/login", "POST", {
      email: `${run}-absent@tests.invalid`,
      password: "wrong",
      slug: a.slug,
    });
    expect(invalid.status).toBe(401);
    expect((await invalid.json()).error.code).toBe(
      (await absent.json()).error.code,
    );
  });
  it("rejects office spoofing and cross-office logins", async () => {
    expect(
      (
        await request("auth/login", "POST", {
          email: a.email,
          password,
          slug: b.slug,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(
          "tenants/current",
          "PATCH",
          { name: "Spoof", timezone: "UTC", tenantId: b.me.tenant.id },
          a.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (await request("tenants/current", "GET", undefined, a.cookie)).status,
    ).toBe(200);
  });
  it("rejects CSRF before mutation and unauthenticated reads", async () => {
    expect(
      (
        await request(
          "auth/login",
          "POST",
          { email: a.email, password, slug: a.slug },
          "",
          "https://evil.invalid",
        )
      ).status,
    ).toBe(403);
    expect((await request("users")).status).toBe(401);
  });
  it("rolls back duplicate slug registration without orphaned users", async () => {
    const email = `${run}-rollback@tests.invalid`;
    expect(
      (
        await request("auth/register", "POST", {
          email,
          password,
          fullName: "Rollback User",
          officeName: "Rollback Firm",
          slug: a.slug,
          countryCode: "OM",
        })
      ).status,
    ).toBe(409);
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });
  it("denies direct business SQL without tenant context", async () => {
    const rows = await db.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "Membership"`;
    expect(rows).toEqual([]);
    const tenants = await db.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "Tenant"`;
    expect(tenants).toEqual([]);
  });
  it("does not leak pooled tenant context", async () => {
    const values = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        inTenant(i % 2 ? a.me.tenant.id : b.me.tenant.id, (tx) =>
          tx.membership.findMany(),
        ),
      ),
    );
    values.forEach((list, i) =>
      expect(
        list.every(
          (m) => m.tenantId === (i % 2 ? a.me.tenant.id : b.me.tenant.id),
        ),
      ).toBe(true),
    );
    expect(await db.membership.count()).toBe(0);
  });
  it("blocks IDOR against foreign members, roles and branches", async () => {
    const roleB = await roleIn(b, "LAWYER");
    expect(
      (
        await request(
          `users/${b.me.membership.id}`,
          "PATCH",
          { active: false },
          a.cookie,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `roles/${roleB.id}`,
          "PATCH",
          { key: "LAWYER", name: "Changed", permissions: [] },
          a.cookie,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          "users",
          "POST",
          {
            email: `${run}-foreign@tests.invalid`,
            password,
            fullName: "Foreign User",
            roleId: roleB.id,
            branchId: a.me.branch.id,
          },
          a.cookie,
        )
      ).status,
    ).toBe(404);
    const roleA = await roleIn(a, "LAWYER");
    expect(
      (
        await request(
          "users",
          "POST",
          {
            email: `${run}-foreign2@tests.invalid`,
            password,
            fullName: "Foreign User",
            roleId: roleA.id,
            branchId: b.me.branch.id,
          },
          a.cookie,
        )
      ).status,
    ).toBe(404);
  });
  it("enforces composite FK even when a service forgets a reference check", async () => {
    await expect(
      inTenant(a.me.tenant.id, (tx) =>
        tx.membership.create({
          data: {
            tenantId: a.me.tenant.id,
            userId: b.me.user.id,
            roleId: b.me.role.id,
            branchId: a.me.branch.id,
          },
        }),
      ),
    ).rejects.toThrow();
  });
  it("rejects a session bound to another user membership in the database", async () => {
    await expect(
      db.session.create({
        data: {
          tenantId: a.me.tenant.id,
          userId: b.me.user.id,
          membershipId: a.me.membership.id,
          tokenHash: randomUUID(),
          userAgent: "test",
          expiresAt: new Date(Date.now() + 60000),
        },
      }),
    ).rejects.toThrow();
  });
  it("protects owner and audit immutability", async () => {
    expect(
      (
        await request(
          `users/${a.me.membership.id}`,
          "PATCH",
          { active: false },
          a.cookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `roles/${a.me.role.id}`,
          "PATCH",
          { name: "Owner Changed", key: "NEW_OWNER", permissions: [] },
          a.cookie,
        )
      ).status,
    ).toBe(403);
    await expect(
      inTenant(
        a.me.tenant.id,
        (tx) =>
          tx.$executeRaw`UPDATE "AuditLog" SET action='changed' WHERE "tenantId"=${a.me.tenant.id}::uuid`,
      ),
    ).rejects.toThrow();
  });
  it.each(["ACCOUNTANT", "LAWYER", "CLIENT"])(
    "restricts independent %s account",
    async (key) => {
      const user = await addMember(a, key, key.toLowerCase());
      expect(
        (await request("auth/me", "GET", undefined, user.cookie)).status,
      ).toBe(200);
      expect(
        (await request("users", "GET", undefined, user.cookie)).status,
      ).toBe(403);
      expect(
        (await request("audit", "GET", undefined, user.cookie)).status,
      ).toBe(403);
      expect(
        (
          await request(
            "roles",
            "POST",
            {
              name: "Elevated",
              key: "ELEVATED",
              permissions: ["roles:manage"],
            },
            user.cookie,
          )
        ).status,
      ).toBe(403);
      const stats = await (
        await request("dashboard", "GET", undefined, user.cookie)
      ).json();
      expect(stats.activeMembers).toBeNull();
    },
  );
  it("prevents partner delegation escalation and immediate suspension bypass", async () => {
    const partner = await addMember(a, "MANAGING_PARTNER", "partner");
    expect(
      (
        await request(
          "users",
          "POST",
          {
            email: `${run}-elevate@tests.invalid`,
            password,
            fullName: "No Elevation",
            roleId: a.me.role.id,
            branchId: a.me.branch.id,
          },
          partner.cookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `users/${partner.id}`,
          "PATCH",
          { active: false },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request("auth/me", "GET", undefined, partner.cookie)).status,
    ).toBe(401);
  });
  it("creates and edits a custom role then applies grants on the next request", async () => {
    const created = await request(
      "roles",
      "POST",
      {
        name: "Team reader",
        key: "TEAM_READER",
        permissions: ["workspace:read", "team:read"],
      },
      a.cookie,
    );
    expect(created.status).toBe(201);
    const role = (await created.json()) as Role;
    const user = await addMember(a, "TEAM_READER", "reader");
    expect((await request("users", "GET", undefined, user.cookie)).status).toBe(
      200,
    );
    expect(
      (
        await request(
          `roles/${role.id}`,
          "PATCH",
          {
            name: "Restricted reader",
            key: "TEAM_READER",
            permissions: ["workspace:read"],
          },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    expect((await request("users", "GET", undefined, user.cookie)).status).toBe(
      403,
    );
  });
  it("paginates actual members and derives dashboard counts from DB", async () => {
    const data = (await (
      await request("users?pageSize=2&page=1", "GET", undefined, a.cookie)
    ).json()) as Page<Member>;
    expect(data.items).toHaveLength(2);
    expect(data.total).toBeGreaterThan(2);
    expect(data.items.every((m) => m.branch.id === a.me.branch.id)).toBe(true);
    expect(
      (await request("users?pageSize=200", "GET", undefined, a.cookie)).status,
    ).toBe(400);
    const stats = await (
      await request("dashboard", "GET", undefined, a.cookie)
    ).json();
    expect(stats.activeMembers).toBe(
      await inTenant(a.me.tenant.id, (tx) =>
        tx.membership.count({ where: { active: true } }),
      ),
    );
    const workspace = (await (
      await request("tenants/current", "GET", undefined, a.cookie)
    ).json()) as { branches: Branch[] };
    expect(workspace.branches).toHaveLength(1);
  });
  it("revokes other sessions and logout prevents reuse", async () => {
    const res = await request("auth/login", "POST", {
      email: b.email,
      password,
      slug: b.slug,
    });
    const other = res.headers.get("set-cookie")!.split(";")[0]!;
    expect(
      (await request("auth/revoke-others", "POST", {}, b.cookie)).status,
    ).toBe(201);
    expect((await request("auth/me", "GET", undefined, other)).status).toBe(
      401,
    );
    const list = (await (
      await request("auth/sessions", "GET", undefined, b.cookie)
    ).json()) as Session[];
    expect(list).toHaveLength(1);
    expect(
      (
        await request(
          `auth/sessions/${list[0]!.id}`,
          "DELETE",
          undefined,
          a.cookie,
        )
      ).status,
    ).toBe(409);
    await request("auth/logout", "POST", {}, b.cookie);
    expect((await request("auth/me", "GET", undefined, b.cookie)).status).toBe(
      401,
    );
  });
  it("enforces MFA, encrypted secrets, one-use factors and revocation", async () => {
    const office = await register("mfa");
    const oldLogin = await request("auth/login", "POST", {
      email: office.email,
      password,
      slug: office.slug,
    });
    const oldCookie = oldLogin.headers.get("set-cookie")!.split(";")[0]!;
    const setup = await request(
      "auth/mfa/setup",
      "POST",
      { password },
      office.cookie,
    );
    expect(setup.status).toBe(201);
    const { secret } = (await setup.json()) as { secret: string };
    const config = await db.mFAConfiguration.findUniqueOrThrow({
      where: { userId: office.me.user.id },
    });
    expect(config.pendingSecret).not.toContain(secret);
    const code = totp(secret);
    const confirm = await request(
      "auth/mfa/confirm",
      "POST",
      { code },
      office.cookie,
    );
    expect(confirm.status).toBe(201);
    const { recoveryCodes } = (await confirm.json()) as {
      recoveryCodes: string[];
    };
    expect(recoveryCodes).toHaveLength(10);
    expect((await request("auth/me", "GET", undefined, oldCookie)).status).toBe(
      401,
    );
    const credentials = { email: office.email, password, slug: office.slug };
    const required = await request("auth/login", "POST", credentials);
    expect((await required.json()).error.code).toBe("MFA_REQUIRED");
    expect(
      (await request("auth/login", "POST", { ...credentials, factor: code }))
        .status,
    ).toBe(401);
    const attempts = await Promise.all([
      request("auth/login", "POST", {
        ...credentials,
        factor: recoveryCodes[0],
      }),
      request("auth/login", "POST", {
        ...credentials,
        factor: recoveryCodes[0],
      }),
    ]);
    expect(attempts.map((r) => r.status).sort()).toEqual([201, 401]);
    expect(
      (
        await request(
          "auth/mfa/disable",
          "POST",
          { password: "wrong", factor: recoveryCodes[1] },
          office.cookie,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await request(
          "auth/mfa/disable",
          "POST",
          { password, factor: recoveryCodes[1] },
          office.cookie,
        )
      ).status,
    ).toBe(201);
    const status = await (
      await request("auth/mfa", "GET", undefined, office.cookie)
    ).json();
    expect(status.enabled).toBe(false);
    expect((await request("auth/login", "POST", credentials)).status).toBe(201);
  });
  it("recovers passwords with one-use hashed tokens and revokes old sessions", async () => {
    const office = await register("recovery");
    const sent = await request("auth/password/forgot", "POST", {
      email: office.email,
      slug: office.slug,
    });
    const absent = await request("auth/password/forgot", "POST", {
      email: `${run}-unknown@tests.invalid`,
      slug: office.slug,
    });
    expect(sent.status).toBe(201);
    expect(await sent.json()).toEqual(await absent.json());
    const link = mailbox.get(office.email)!;
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get(
      "reset",
    )!;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const stored = await db.passwordReset.findFirstOrThrow({
      where: { userId: office.me.user.id, usedAt: null },
    });
    expect(stored.tokenHash).not.toBe(token);
    const newPassword = "Recovered-Secure-Password-2026";
    const results = await Promise.all([
      request("auth/password/reset", "POST", { token, password: newPassword }),
      request("auth/password/reset", "POST", { token, password: newPassword }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(
      (await request("auth/me", "GET", undefined, office.cookie)).status,
    ).toBe(401);
    expect(
      (
        await request("auth/login", "POST", {
          email: office.email,
          password,
          slug: office.slug,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request("auth/login", "POST", {
          email: office.email,
          password: newPassword,
          slug: office.slug,
        })
      ).status,
    ).toBe(201);
    await request("auth/password/forgot", "POST", {
      email: office.email,
      slug: office.slug,
    });
    const expiring = new URLSearchParams(
      new URL(mailbox.get(office.email)!).hash.slice(1),
    ).get("reset")!;
    await db.passwordReset.updateMany({
      where: { userId: office.me.user.id, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (
        await request("auth/password/reset", "POST", {
          token: expiring,
          password: newPassword,
        })
      ).status,
    ).toBe(400);
  });
  it("expires sessions and enforces account throttling", async () => {
    const login = await request("auth/login", "POST", {
      email: a.email,
      password,
      slug: a.slug,
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    await db.session.updateMany({
      where: { userId: a.me.user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await request("auth/me", "GET", undefined, cookie)).status).toBe(
      401,
    );
    await redis.set(
      `rate:POST:/api/v1/auth/login:${(await import("../apps/api/src/security.js")).hashToken("127.0.0.1")}`,
      40,
      "EX",
      600,
    );
    expect(
      (
        await request("auth/login", "POST", {
          email: a.email,
          password,
          slug: a.slug,
        })
      ).status,
    ).toBe(429);
    await redis.del(
      `rate:POST:/api/v1/auth/login:${(await import("../apps/api/src/security.js")).hashToken("127.0.0.1")}`,
    );
  });
});
