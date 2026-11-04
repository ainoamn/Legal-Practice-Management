import { beforeAll, afterAll, it, expect } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { requireTestDatabase } from "./setup-env.js";
import { createApp } from "../apps/api/src/app.js";
import { db, platformDatabase } from "../packages/database/src/index.js";
import { redis } from "../apps/api/src/security.js";
import type { Actor } from "../apps/api/src/security.js";
import { DocumentStorage } from "../apps/api/src/documents/storage.js";
import { DocumentTools } from "../apps/api/src/documents/tools.js";
import { DocumentsService } from "../apps/api/src/documents/documents.service.js";
// Deterministic source-version authorization fixture; live S3/ClamAV are tested separately.
class FileFixture extends DocumentStorage {
  files = new Map<string, Buffer>();
  configured() {
    return true;
  }
  async put(key: string, body: Buffer) {
    this.files.set(key, Buffer.from(body));
  }
  async get(key: string) {
    const body = this.files.get(key);
    if (!body) throw new Error("Missing fixture");
    return body;
  }
  async remove(key: string) {
    this.files.delete(key);
  }
  async health() {}
}
class ScanFixture extends DocumentTools {
  async inspect(body: Buffer) {
    return {
      text: body.toString("utf8"),
      method: "TEST_FIXTURE",
      requiresReview: false,
    };
  }
}
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
let a: Office,
  b: Office,
  lawyer: { id: string; cookie: string },
  outsider: { id: string; cookie: string };
let client: { id: string },
  record: { id: string; version: number },
  obligation: { id: string; version: number };
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = a?.cookie ?? "",
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
  const slug = `instruments-${run}-${suffix}`;
  const r = await request(
    "auth/register",
    "POST",
    {
      email: `${slug}@tests.invalid`,
      password,
      fullName: "Instrument Owner",
      officeName: "Instrument Firm",
      slug,
      countryCode: "OM",
    },
    "",
  );
  expect(r.status).toBe(201);
  const cookie = r.headers.get("set-cookie")!.split(";")[0]!;
  const me = await (await request("auth/me", "GET", undefined, cookie)).json();
  return {
    cookie,
    slug,
    tenant: me.tenant.id,
    branch: me.branch.id,
    member: me.membership.id,
  };
}
async function member(suffix: string) {
  const role = await (
    await request("roles", "POST", {
      key: `INSTRUMENT_${suffix.toUpperCase()}`,
      name: "Instrument assignee",
      permissions: [
        "workspace:read",
        "clients:read",
        "instruments:read",
        "instruments:manage",
      ],
    })
  ).json();
  const email = `${run}-instrument-${suffix}@tests.invalid`;
  const response = await request("users", "POST", {
    email,
    password,
    fullName: `Instrument ${suffix}`,
    roleId: role.id,
    branchId: a.branch,
  });
  expect(response.status).toBe(201);
  const user = await response.json();
  const login = await request("auth/login", "POST", {
    email,
    password,
    slug: a.slug,
  });
  expect(login.status).toBe(201);
  return {
    id: user.id,
    cookie: login.headers.get("set-cookie")!.split(";")[0]!,
  };
}
async function result(
  path: string,
  method: string,
  body?: unknown,
  cookie = a.cookie,
  expected = 201,
) {
  const r = await request(path, method, body, cookie);
  const value = await r.json();
  expect(r.status, JSON.stringify(value)).toBe(expected);
  return value;
}
const input = () => ({
  kind: "CONTRACT",
  clientId: client.id,
  title: "عقد خدمات قانونية",
  category: "خدمات",
  partyOne: "شركة العميل",
  partyTwo: "مكتب المحاماة",
  responsibleId: lawyer.id,
  issuedAt: "2026-01-01",
  startsAt: "2026-01-01",
  endsAt: "2026-01-02",
  currency: "OMR",
  amountMinor: "99999999999999999999",
  terms: "شروط خاصة بالعقد",
  notes: "ملاحظات داخلية",
  confidentiality: "RESTRICTED",
  reminderDays: [7, 0],
});
beforeAll(async () => {
  app = await createApp({
    documents: {
      worker: false,
      storage: new FileFixture(),
      tools: new ScanFixture(),
    },
  });
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  a = await office("a");
  b = await office("b");
  lawyer = await member("lawyer");
  outsider = await member("outsider");
  client = await result("practice/clients", "POST", {
    name: "شركة العقود",
    kind: "COMPANY",
    branchId: a.branch,
  });
}, 60000);
afterAll(async () => {
  await app?.close();
  await db.$disconnect();
  await platformDatabase().$disconnect();
  redis.disconnect();
});
it("creates independent contracts with exact large amounts and tenant numbering", async () => {
  record = await result("instruments", "POST", input());
  const d = await result(
    `instruments/${record.id}`,
    "GET",
    undefined,
    a.cookie,
    200,
  );
  expect(d.amountMinor).toBe("99999999999999999999");
  expect(d.currencyDecimals).toBe(3);
  expect(d.reference).toMatch(/^CTR-\d{6}$/);
  expect(d.client.id).toBe(client.id);
});
it("enforces assignment, tenant isolation and least privilege at API and client scope", async () => {
  expect(
    (await request(`instruments/${record.id}`, "GET", undefined, lawyer.cookie))
      .status,
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
  for (const cookie of [outsider.cookie, b.cookie])
    expect(
      (await request(`instruments/${record.id}`, "GET", undefined, cookie))
        .status,
    ).toBe(404);
  const list = await result(
    "instruments",
    "GET",
    undefined,
    outsider.cookie,
    200,
  );
  expect(list.total).toBe(0);
  expect(
    (
      await request(
        `instruments/${record.id}/approve`,
        "POST",
        { version: record.version },
        lawyer.cookie,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request("instruments", "POST", {
        ...input(),
        responsibleId: b.member,
      })
    ).status,
  ).toBe(400);
});
it("requires agency details, rejects unsafe amounts and cross-client links", async () => {
  expect(
    (
      await request("instruments", "POST", {
        ...input(),
        kind: "POWER_OF_ATTORNEY",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request("instruments", "POST", {
        ...input(),
        amountMinor: 9007199254740992,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request("instruments", "POST", {
        ...input(),
        startsAt: "2026-02-01",
      })
    ).status,
  ).toBe(400);
  const other = await result("practice/clients", "POST", {
    name: "Other Client",
    branchId: a.branch,
  });
  const matter = await result("practice/matters", "POST", {
    clientId: other.id,
    branchId: a.branch,
    title: "Other client case",
    category: "COMMERCIAL",
    countryCode: "OM",
    confidentiality: "NORMAL",
  });
  expect(
    (await request("instruments", "POST", { ...input(), matterId: matter.id }))
      .status,
  ).toBe(400);
  const agency = await result("instruments", "POST", {
    ...input(),
    kind: "POWER_OF_ATTORNEY",
    agent: "الوكيل المفوض",
    issuingAuthority: "الكاتب بالعدل",
    referenceNumber: `POA-${run}`,
  });
  expect(agency.reference).toMatch(/^POA-/);
  expect(
    (
      await request("instruments", "POST", {
        ...input(),
        kind: "POWER_OF_ATTORNEY",
        agent: "الوكيل المفوض",
        issuingAuthority: "الكاتب بالعدل",
        referenceNumber: `POA-${run}`,
      })
    ).status,
  ).toBe(409);
});
it("approves with optimistic locking and schedules only personal due reminders", async () => {
  record = await result(`instruments/${record.id}/approve`, "POST", {
    version: record.version,
  });
  expect(record.version).toBe(2);
  expect(
    (await request(`instruments/${record.id}/approve`, "POST", { version: 1 }))
      .status,
  ).toBe(409);
  const d = await result(
    `instruments/${record.id}`,
    "GET",
    undefined,
    a.cookie,
    200,
  );
  expect(d.status).toBe("ACTIVE");
  expect(d.effectiveStatus).toBe("EXPIRED");
  const notifications = await result(
    "instruments/notifications",
    "GET",
    undefined,
    lawyer.cookie,
    200,
  );
  expect(
    notifications.some(
      (n: { instrument: { id: string } }) => n.instrument.id === record.id,
    ),
  ).toBe(true);
  const n = notifications.find(
    (n: { instrument: { id: string } }) => n.instrument.id === record.id,
  );
  expect(
    (
      await request(
        `instruments/notifications/${n.id}/read`,
        "POST",
        {},
        outsider.cookie,
      )
    ).status,
  ).toBe(404);
  await result(
    `instruments/notifications/${n.id}/read`,
    "POST",
    {},
    lawyer.cookie,
  );
  expect(
    (
      await result(
        "instruments/notifications",
        "GET",
        undefined,
        lawyer.cookie,
        200,
      )
    ).some((r: { id: string }) => r.id === n.id),
  ).toBe(false);
});
it("tracks obligations without posting payments and cancels reminders on completion", async () => {
  obligation = await result(
    `instruments/${record.id}/obligations`,
    "POST",
    {
      title: "تسليم الملف",
      description: "التزام تعاقدي",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      amountMinor: "10000000000000",
    },
    lawyer.cookie,
  );
  expect(obligation.version).toBe(1);
  const done = await result(
    `instruments/${record.id}/obligations/${obligation.id}`,
    "PATCH",
    { version: 1, status: "DONE" },
    lawyer.cookie,
    200,
  );
  expect(done.completedAt).toBeTruthy();
  expect(
    (
      await request(
        `instruments/${record.id}/obligations/${obligation.id}`,
        "PATCH",
        { version: 1, status: "TODO" },
        lawyer.cookie,
      )
    ).status,
  ).toBe(409);
  const detail = await result(
    `instruments/${record.id}`,
    "GET",
    undefined,
    lawyer.cookie,
    200,
  );
  expect(
    detail.reminders.some(
      (r: { obligationId: string }) => r.obligationId === obligation.id,
    ),
  ).toBe(false);
});
it("partial edits preserve omitted defaults, reset approval, and reject stale versions", async () => {
  const d = await result(
    `instruments/${record.id}`,
    "PATCH",
    { version: record.version, notes: "تعليق جديد" },
    lawyer.cookie,
    200,
  );
  expect(d.terms).toBe("شروط خاصة بالعقد");
  expect(d.confidentiality).toBe("RESTRICTED");
  expect(d.reminderDays).toEqual([7, 0]);
  expect(d.partyTwo).toBe("مكتب المحاماة");
  expect(d.status).toBe("DRAFT");
  expect(d.approvedAt).toBeNull();
  expect(
    (
      await request(`instruments/${record.id}`, "PATCH", {
        version: record.version,
        notes: "stale",
      })
    ).status,
  ).toBe(409);
  record = d;
});
it("accepts valid multilingual requests above the old 100 KB body limit", async () => {
  const terms = "ش".repeat(19000),
    notes = "م".repeat(19000);
  const r = await result("instruments", "POST", { ...input(), terms, notes });
  expect(r.terms).toBe(terms);
  expect(r.notes).toBe(notes);
});
it("closing cancels pending reminders and closed records reject new obligations", async () => {
  record = await result(`instruments/${record.id}/approve`, "POST", {
    version: record.version,
  });
  record = await result(
    `instruments/${record.id}`,
    "PATCH",
    { version: record.version, status: "CLOSED" },
    a.cookie,
    200,
  );
  expect(record).toMatchObject({ status: "CLOSED" });
  expect(
    (
      await request(`instruments/${record.id}/obligations`, "POST", {
        title: "Closed addition",
        dueAt: new Date().toISOString(),
      })
    ).status,
  ).toBe(409);
  const d = await result(
    `instruments/${record.id}`,
    "GET",
    undefined,
    a.cookie,
    200,
  );
  expect(
    d.reminders.filter((r: { readAt: string | null }) => !r.readAt),
  ).toEqual([]);
});
it("pins the approved source version and preserves it after a later document draft", async () => {
  const me = await result("auth/me", "GET", undefined, a.cookie, 200);
  const actor: Actor = {
    tenantId: a.tenant,
    userId: me.user.id,
    membershipId: a.member,
    sessionId: "instrument-fixture",
  };
  const matter = await result("practice/matters", "POST", {
    title: "Contract source case",
    category: "COMMERCIAL",
    countryCode: "OM",
    clientId: client.id,
    branchId: a.branch,
  });
  const service = app.get(DocumentsService);
  const source = await service.create(actor, {
    matterId: matter.id,
    title: "Signed source",
    kind: "CONTRACT",
    body: "Approved contractual wording",
    tags: [],
  });
  let document = await service.detail(actor, source.id);
  const pinned = document.versions[0]!.id;
  await service.process(actor, pinned);
  const instrument = await result("instruments", "POST", {
    ...input(),
    matterId: matter.id,
    documentId: source.id,
  });
  expect(
    (
      await request(`instruments/${instrument.id}/approve`, "POST", {
        version: 1,
      })
    ).status,
  ).toBe(409);
  await service.review(actor, source.id, 1);
  await service.approve(actor, source.id, 1, false);
  const approved = await result(
    `instruments/${instrument.id}/approve`,
    "POST",
    { version: 1 },
  );
  expect(approved.documentVersionId).toBe(pinned);
  await service.upload(
    actor,
    source.id,
    Buffer.from("Unapproved new contractual wording"),
    "draft.txt",
    1,
  );
  document = await service.detail(actor, source.id);
  await service.process(actor, document.versions[0]!.id);
  const current = await result(
    `instruments/${instrument.id}`,
    "GET",
    undefined,
    a.cookie,
    200,
  );
  expect(current.documentVersionId).toBe(pinned);
  expect(current.status).toBe("ACTIVE");
  const archived = await result(
    `instruments/${instrument.id}`,
    "PATCH",
    { version: approved.version, status: "ARCHIVED" },
    a.cookie,
    200,
  );
  expect(archived.documentVersionId).toBe(pinned);
  expect(archived.approvedAt).toBeTruthy();
  const next = await result("instruments", "POST", {
    ...input(),
    matterId: matter.id,
    documentId: source.id,
  });
  expect(
    (await request(`instruments/${next.id}/approve`, "POST", { version: 1 }))
      .status,
  ).toBe(409);
});
it("revokes the former assignee immediately when responsibility changes", async () => {
  const reassigned = await result(
    `instruments/${record.id}`,
    "PATCH",
    { version: record.version, responsibleId: outsider.id },
    a.cookie,
    200,
  );
  expect(reassigned.responsibleId).toBe(outsider.id);
  expect(
    (await request(`instruments/${record.id}`, "GET", undefined, lawyer.cookie))
      .status,
  ).toBe(404);
  expect(
    (
      await request(
        `instruments/${record.id}`,
        "GET",
        undefined,
        outsider.cookie,
      )
    ).status,
  ).toBe(200);
});
it("returns bounded JSON errors for malformed and oversized requests", async () => {
  const raw = async (body: string) =>
    fetch(`${base}/api/v1/instruments`, {
      method: "POST",
      headers: {
        cookie: a.cookie,
        origin: process.env.WEB_ORIGIN!,
        "content-type": "application/json",
      },
      body,
    });
  const malformed = await raw('{"title":');
  expect(malformed.status).toBe(400);
  expect((await malformed.json()).error.code).toBe("INVALID_JSON");
  const oversized = await raw(JSON.stringify({ terms: "x".repeat(1100000) }));
  expect(oversized.status).toBe(413);
  expect((await oversized.json()).error.code).toBe("REQUEST_TOO_LARGE");
});
