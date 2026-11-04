import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { requireTestDatabase } from "./setup-env.js";
import { createApp } from "../apps/api/src/app.js";
import {
  db,
  inTenant,
  platformDatabase,
} from "../packages/database/src/index.js";
import { redis } from "../apps/api/src/security.js";
requireTestDatabase();
let app: INestApplication, base: string;
const run = randomUUID().slice(0, 8),
  password = "Secure-Legal-Test-Password-2026";
type Office = {
  cookie: string;
  tenant: string;
  branch: string;
  member: string;
  slug: string;
};
type RecordId = { id: string; version: number; reference: string };
let a: Office,
  b: Office,
  client: RecordId,
  matter: RecordId,
  lawyer: { cookie: string; id: string },
  outsider: { cookie: string; id: string };
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
) {
  return fetch(`${base}/api/v1/${path}`, {
    method,
    headers: {
      origin: process.env.WEB_ORIGIN!,
      "content-type": "application/json",
      cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function office(suffix: string): Promise<Office> {
  const slug = `practice-${run}-${suffix}`;
  const res = await request("auth/register", "POST", {
    email: `${slug}@tests.invalid`,
    password,
    fullName: "Legal Owner",
    officeName: "Legal Office",
    slug,
    countryCode: "OM",
  });
  expect(res.status).toBe(201);
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  const me = await (await request("auth/me", "GET", undefined, cookie)).json();
  return {
    cookie,
    tenant: me.tenant.id,
    branch: me.branch.id,
    member: me.membership.id,
    slug,
  };
}
async function member(suffix: string) {
  const roleResponse = await request(
    "roles",
    "POST",
    {
      key: `SCOPED_${suffix.toUpperCase()}`,
      name: "Assigned lawyer",
      permissions: [
        "workspace:read",
        "clients:read",
        "clients:manage",
        "matters:read",
        "matters:manage",
        "hearings:manage",
        "tasks:manage",
        "conflicts:read",
      ],
    },
    a.cookie,
  );
  expect(roleResponse.status).toBe(201);
  const role = await roleResponse.json();
  const email = `${run}-${suffix}@tests.invalid`;
  const res = await request(
    "users",
    "POST",
    {
      email,
      password,
      fullName: "Assigned Lawyer",
      roleId: role.id,
      branchId: a.branch,
    },
    a.cookie,
  );
  expect(res.status).toBe(201);
  const user = await res.json();
  const login = await request("auth/login", "POST", {
    email,
    password,
    slug: a.slug,
  });
  return {
    cookie: login.headers.get("set-cookie")!.split(";")[0]!,
    id: user.id,
  };
}
async function post(path: string, body: unknown, cookie = a.cookie) {
  const res = await request(`practice/${path}`, "POST", body, cookie);
  const data = await res.json();
  expect(res.status, JSON.stringify(data)).toBe(201);
  return data;
}
beforeAll(async () => {
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  a = await office("a");
  b = await office("b");
  lawyer = await member("lawyer");
  outsider = await member("outsider");
}, 60000);
afterAll(async () => {
  await app?.close();
  await db.$disconnect();
  await platformDatabase().$disconnect();
  redis.disconnect();
});
describe("legal practice real HTTP and database", () => {
  it("creates clients, rejects mass assignment and duplicates", async () => {
    client = await post("clients", {
      name: "شركة العدالة",
      kind: "COMPANY",
      branchId: a.branch,
      registrationNumber: "REG-001",
      phone: "+96890000000",
      notes: "Internal contact",
      tags: ["retained"],
    });
    const updatedClient = await request(
      `practice/clients/${client.id}`,
      "PATCH",
      { phone: "+96891111111" },
      a.cookie,
    );
    expect(updatedClient.status).toBe(200);
    const preserved = await updatedClient.json();
    expect(preserved.kind).toBe("COMPANY");
    expect(preserved.notes).toBe("Internal contact");
    expect(preserved.tags).toEqual(["retained"]);
    expect(
      (
        await request(
          "practice/clients",
          "POST",
          { name: "Foreign", branchId: b.branch },
          a.cookie,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          "practice/clients",
          "POST",
          { name: "Spoof", branchId: a.branch, tenantId: b.tenant },
          a.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "practice/clients",
          "POST",
          {
            name: "Duplicate",
            branchId: a.branch,
            registrationNumber: "REG-001",
          },
          a.cookie,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `practice/clients/${client.id}`,
          "GET",
          undefined,
          b.cookie,
        )
      ).status,
    ).toBe(404);
  });
  it("creates unique numbered matters and enforces foreign references", async () => {
    const court = await post("courts", {
      name: "محكمة الاختبار",
      countryCode: "OM",
    });
    matter = await post("matters", {
      title: "دعوى تجارية",
      category: "COMMERCIAL",
      countryCode: "OM",
      clientId: client.id,
      branchId: a.branch,
      courtId: court.id,
      claimMinor: 100250,
      summary: "Sensitive summary",
      confidentiality: "RESTRICTED",
    });
    expect(matter.reference).toMatch(/^\d{4}-000001$/);
    const res = await request(
      "practice/matters",
      "POST",
      {
        title: "Foreign case",
        category: "CIVIL",
        countryCode: "OM",
        clientId: client.id,
        branchId: b.branch,
      },
      b.cookie,
    );
    expect(res.status).toBe(404);
    const more = await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        post("matters", {
          title: `Concurrent ${i}`,
          category: "CIVIL",
          countryCode: "OM",
          clientId: client.id,
          branchId: a.branch,
        }),
      ),
    );
    expect(new Set(more.map((m) => m.reference)).size).toBe(3);
  });
  it("hides records until assignment and removes access immediately on unassignment", async () => {
    expect(
      (
        await request(
          `practice/matters/${matter.id}`,
          "GET",
          undefined,
          lawyer.cookie,
        )
      ).status,
    ).toBe(404);
    await post(`matters/${matter.id}/assignments`, {
      memberIds: [a.member, lawyer.id],
      leadId: lawyer.id,
    });
    expect(
      (
        await request(
          `practice/matters/${matter.id}`,
          "GET",
          undefined,
          lawyer.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `practice/clients/${client.id}`,
          "GET",
          undefined,
          lawyer.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `practice/matters/${matter.id}`,
          "GET",
          undefined,
          outsider.cookie,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `practice/matters/${matter.id}`,
          "GET",
          undefined,
          b.cookie,
        )
      ).status,
    ).toBe(404);
    await post(`matters/${matter.id}/assignments`, {
      memberIds: [a.member],
      leadId: a.member,
    });
    expect(
      (
        await request(
          `practice/matters/${matter.id}`,
          "GET",
          undefined,
          lawyer.cookie,
        )
      ).status,
    ).toBe(404);
    await post(`matters/${matter.id}/assignments`, {
      memberIds: [a.member, lawyer.id],
      leadId: lawyer.id,
    });
  });
  it("enforces database scope without relying on controller filters", async () => {
    const results = await Promise.all(
      [a, b].map((o) =>
        inTenant(o.tenant, async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.member_id', ${o.member}, true)`;
          return tx.matter.findMany();
        }),
      ),
    );
    expect(results[0]!.length).toBe(4);
    expect(results[1]).toEqual([]);
    const hidden = await inTenant(a.tenant, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.member_id', ${outsider.id}, true)`;
      return tx.matter.findMany();
    });
    expect(hidden).toEqual([]);
    expect(await db.matter.count()).toBe(0);
    await expect(
      inTenant(a.tenant, async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.member_id', ${a.member}, true)`;
        return tx.matterAssignment.create({
          data: { tenantId: a.tenant, matterId: matter.id, memberId: b.member },
        });
      }),
    ).rejects.toThrow();
    await expect(platformDatabase().matter.findMany()).rejects.toThrow();
  });
  it("records changes and rejects stale edits without overwriting", async () => {
    const first = await request(
      `practice/matters/${matter.id}`,
      "PATCH",
      { version: 1, status: "FILED", nextStep: "Prepare hearing" },
      lawyer.cookie,
    );
    expect(first.status).toBe(200);
    expect(
      (
        await request(
          `practice/matters/${matter.id}`,
          "PATCH",
          { version: 1, title: "Lost update" },
          a.cookie,
        )
      ).status,
    ).toBe(409);
    const detail = await (
      await request(`practice/matters/${matter.id}`, "GET", undefined, a.cookie)
    ).json();
    expect(detail.version).toBe(2);
    expect(detail.summary).toBe("Sensitive summary");
    expect(detail.confidentiality).toBe("RESTRICTED");
    expect(
      detail.events.some(
        (e: { action: string }) => e.action === "matter.updated",
      ),
    ).toBe(true);
  });
  it("checks conflicts within authorized records only", async () => {
    await post(`matters/${matter.id}/parties`, {
      name: "شركة الخصم",
      kind: "OPPONENT",
      identityNumber: "OP-001",
    });
    const found = await (
      await request(
        "practice/conflicts?search=" + encodeURIComponent("الخصم"),
        "GET",
        undefined,
        lawyer.cookie,
      )
    ).json();
    expect(found.parties).toHaveLength(1);
    const hidden = await (
      await request(
        "practice/conflicts?search=" + encodeURIComponent("الخصم"),
        "GET",
        undefined,
        outsider.cookie,
      )
    ).json();
    expect(hidden.parties).toHaveLength(0);
    await post(
      `matters/${matter.id}/notes`,
      { body: "Internal legal strategy" },
      lawyer.cookie,
    );
  });
  it("creates hearings with reminders and preparation tasks, rejects overlaps and unauthorized attendees", async () => {
    const start = new Date(Date.now() + 3600000),
      end = new Date(start.getTime() + 3600000);
    const payload = {
      matterId: matter.id,
      responsibleId: lawyer.id,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      preparation: "Prepare evidence",
      createPreparationTask: true,
    };
    const hearing = await post("hearings", payload);
    expect(
      (await request("practice/hearings", "POST", payload, a.cookie)).status,
    ).toBe(409);
    expect(
      (
        await request(
          "practice/hearings",
          "POST",
          { ...payload, responsibleId: outsider.id },
          a.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "practice/hearings",
          "POST",
          {
            ...payload,
            startsAt: end.toISOString(),
            endsAt: start.toISOString(),
          },
          a.cookie,
        )
      ).status,
    ).toBe(400);
    const notifications = await (
      await request("practice/notifications", "GET", undefined, lawyer.cookie)
    ).json();
    expect(notifications.length).toBeGreaterThan(0);
    expect(
      (
        await request(
          `practice/notifications/${notifications[0].id}/read`,
          "POST",
          {},
          outsider.cookie,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `practice/notifications/${notifications[0].id}/read`,
          "POST",
          {},
          lawyer.cookie,
        )
      ).status,
    ).toBe(201);
    const tasks = await (
      await request("practice/tasks", "GET", undefined, lawyer.cookie)
    ).json();
    expect(tasks.items).toHaveLength(1);
    expect(
      (
        await request(
          `practice/hearings/${hearing.id}`,
          "PATCH",
          {
            status: "HELD",
            outcome: "Adjourned",
            decision: "Evidence required",
          },
          lawyer.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `practice/hearings/${hearing.id}`,
          "PATCH",
          { status: "CANCELLED" },
          b.cookie,
        )
      ).status,
    ).toBe(404);
  });
  it("persists tasks and counts actual scoped dashboard data", async () => {
    const task = await post("tasks", {
      matterId: matter.id,
      assignedTo: lawyer.id,
      title: "Draft pleading",
      dueAt: new Date(Date.now() - 60000).toISOString(),
      priority: "HIGH",
    });
    let stats = await (
      await request("practice/overview", "GET", undefined, lawyer.cookie)
    ).json();
    expect(stats.overdueTasks).toBeGreaterThan(0);
    expect(stats.matters).toBe(1);
    const done = await request(
      `practice/tasks/${task.id}`,
      "PATCH",
      { status: "DONE" },
      lawyer.cookie,
    );
    expect(done.status).toBe(200);
    expect((await done.json()).completedAt).toBeTruthy();
    stats = await (
      await request("practice/overview", "GET", undefined, outsider.cookie)
    ).json();
    expect(stats.matters).toBe(0);
    expect(stats.clients).toBe(0);
    expect(
      (
        await request(
          "practice/matters?pageSize=1000",
          "GET",
          undefined,
          a.cookie,
        )
      ).status,
    ).toBe(400);
  });
  it("enforces plan matter quota and office read-only state", async () => {
    const p = platformDatabase();
    const plan = await p.plan.create({
      data: {
        name: `Practice-${run}`,
        priceMinor: 0,
        currency: "OMR",
        interval: "MONTHLY",
        maxUsers: 10,
        maxMatters: 4,
        maxBranches: 1,
        maxStorageMiB: 1,
        maxAiOperations: 0,
      },
    });
    await p.subscription.create({
      data: {
        tenantId: a.tenant,
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 86400000),
      },
    });
    const res = await request(
      "practice/matters",
      "POST",
      {
        title: "Over quota",
        category: "CIVIL",
        countryCode: "OM",
        clientId: client.id,
        branchId: a.branch,
      },
      a.cookie,
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("MATTER_QUOTA_EXCEEDED");
    await p.$executeRaw`SELECT platform_set_tenant_access(${a.tenant}::uuid,'READ_ONLY')`;
    expect(
      (
        await request(
          "practice/clients",
          "POST",
          { name: "Blocked", branchId: a.branch },
          a.cookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (await request("practice/matters", "GET", undefined, a.cookie)).status,
    ).toBe(200);
    await p.$executeRaw`SELECT platform_set_tenant_access(${a.tenant}::uuid,'ACTIVE')`;
  });
  it("calendar includes midnight-spanning hearings, bounds tasks and retains SQL scope", async () => {
    const from = "2050-01-01T20:00:00.000Z",
      to = "2050-01-02T20:00:00.000Z";
    const crossing = await post("hearings", {
      matterId: matter.id,
      responsibleId: lawyer.id,
      startsAt: "2050-01-01T19:30:00Z",
      endsAt: "2050-01-01T20:30:00Z",
      reminderMinutes: [],
    });
    await post("hearings", {
      matterId: matter.id,
      responsibleId: lawyer.id,
      startsAt: to,
      endsAt: "2050-01-02T21:00:00Z",
      reminderMinutes: [],
    });
    const task = await post("tasks", {
      matterId: matter.id,
      assignedTo: lawyer.id,
      title: "Calendar boundary task",
      description: "Internal task details",
      dueAt: from,
    });
    await post("tasks", {
      matterId: matter.id,
      assignedTo: lawyer.id,
      title: "Next day task",
      dueAt: to,
    });
    const query = new URLSearchParams({ from, to });
    const response = await request(
      `practice/calendar?${query}`,
      "GET",
      undefined,
      lawyer.cookie,
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.hearings.map((h: { id: string }) => h.id)).toEqual([
      crossing.id,
    ]);
    expect(data.tasks.map((t: { id: string }) => t.id)).toEqual([task.id]);
    expect(data.hearings[0].matter.summary).toBeUndefined();
    expect(data.tasks[0].description).toBeUndefined();
    for (const cookie of [outsider.cookie, b.cookie]) {
      const empty = await (
        await request(`practice/calendar?${query}`, "GET", undefined, cookie)
      ).json();
      expect(empty.hearings).toEqual([]);
      expect(empty.tasks).toEqual([]);
    }
    query.set("memberId", outsider.id);
    const filtered = await (
      await request(`practice/calendar?${query}`, "GET", undefined, a.cookie)
    ).json();
    expect(filtered.hearings).toEqual([]);
    expect(filtered.tasks).toEqual([]);
    expect(
      (
        await request(
          "practice/calendar?from=2050-01-01T00:00:00Z&to=2050-04-01T00:00:00Z",
          "GET",
          undefined,
          a.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "practice/calendar?from=2050-01-01T00:00:00Z",
          "GET",
          undefined,
          a.cookie,
        )
      ).status,
    ).toBe(400);
  });
});
