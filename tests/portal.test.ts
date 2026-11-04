import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createApp } from "../apps/api/src/app.js";
import { db, inTenant } from "../packages/database/src/index.js";
import { redis, type Actor } from "../apps/api/src/security.js";
import { DocumentStorage } from "../apps/api/src/documents/storage.js";
import { DocumentTools } from "../apps/api/src/documents/tools.js";
import { DocumentsService } from "../apps/api/src/documents/documents.service.js";
import { requireTestDatabase } from "./setup-env.js";
requireTestDatabase();
// Deterministic file fixture for portal authorization. Live scanning/S3/OCR have a separate suite.
class FileFixture extends DocumentStorage {
  files = new Map<string, Buffer>();
  configured() {
    return true;
  }
  async put(k: string, b: Buffer) {
    this.files.set(k, Buffer.from(b));
  }
  async get(k: string) {
    const b = this.files.get(k);
    if (!b) throw new Error("Missing fixture");
    return b;
  }
  async remove(k: string) {
    this.files.delete(k);
  }
  async health() {}
}
class ScanFixture extends DocumentTools {
  async inspect(b: Buffer) {
    return {
      text: b.toString("utf8"),
      method: "TEST_FIXTURE",
      requiresReview: false,
    };
  }
}
let app: INestApplication,
  base: string,
  owner: string,
  clientSession: string,
  otherSession: string,
  clientId: string,
  memberId: string,
  matterId: string,
  documentId: string,
  versionId: string,
  actor: Actor;
const run = randomUUID().slice(0, 8),
  password = "Portal-Secure-Password-2026";
async function req(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = owner,
) {
  return fetch(`${base}/api/v1/${path}`, {
    method,
    headers: {
      cookie,
      origin: process.env.WEB_ORIGIN!,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function post(path: string, body: unknown, cookie = owner) {
  const r = await req(path, "POST", body, cookie),
    d = await r.json();
  expect(r.status, JSON.stringify(d)).toBe(201);
  return d;
}
beforeAll(async () => {
  app = await createApp({
    documents: {
      storage: new FileFixture(),
      tools: new ScanFixture(),
      worker: false,
    },
  });
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  const reg = await req(
    "auth/register",
    "POST",
    {
      email: `portal-${run}@tests.invalid`,
      password,
      fullName: "Portal Owner",
      officeName: "Portal Firm",
      slug: `portal-${run}`,
      countryCode: "OM",
    },
    "",
  );
  expect(reg.status).toBe(201);
  owner = reg.headers.get("set-cookie")!.split(";")[0]!;
  const me = await (await req("auth/me")).json();
  actor = {
    tenantId: me.tenant.id,
    userId: me.user.id,
    membershipId: me.membership.id,
    sessionId: "portal-fixture",
  };
  const roles = await (await req("roles")).json(),
    role = roles.find((r: { key: string }) => r.key === "CLIENT");
  const own = await post("practice/clients", {
      name: "Client A",
      branchId: me.branch.id,
      notes: "SECRET CLIENT NOTES",
      phone: "+96890000000",
    }),
    other = await post("practice/clients", {
      name: "Client B",
      branchId: me.branch.id,
    });
  clientId = own.id;
  const a = await post("users", {
    email: `portal-a-${run}@tests.invalid`,
    password,
    fullName: "Portal Client A",
    roleId: role.id,
    branchId: me.branch.id,
  });
  memberId = a.id;
  const b = await post("users", {
    email: `portal-b-${run}@tests.invalid`,
    password,
    fullName: "Portal Client B",
    roleId: role.id,
    branchId: me.branch.id,
  });
  for (const [id, c] of [
    [a.id, own.id],
    [b.id, other.id],
  ])
    await post(`practice/clients/${c}/portal-access`, {
      memberId: id,
      active: true,
    });
  const login = async (s: string) => {
    const r = await req("auth/login", "POST", {
      email: `portal-${s}-${run}@tests.invalid`,
      password,
      slug: me.tenant.slug,
    });
    expect(r.status).toBe(201);
    return r.headers.get("set-cookie")!.split(";")[0]!;
  };
  clientSession = await login("a");
  otherSession = await login("b");
  const m = await post("practice/matters", {
    title: "Shared case",
    clientId: own.id,
    branchId: me.branch.id,
    category: "CIVIL",
    countryCode: "OM",
    summary: "SECRET LEGAL STRATEGY",
    nextStep: "SECRET NEXT STEP",
  });
  matterId = m.id;
  await post(`practice/matters/${matterId}/notes`, {
    body: "SECRET INTERNAL NOTE",
  });
  const foreign = await post("practice/matters", {
    title: "Other client case",
    clientId: other.id,
    branchId: me.branch.id,
    category: "CIVIL",
    countryCode: "OM",
  });
  expect(
    (
      await req(`practice/matters/${foreign.id}/portal`, "PATCH", {
        version: 1,
        clientVisible: true,
      })
    ).status,
  ).toBe(200);
}, 60000);
afterAll(async () => {
  await app?.close();
  await db.$disconnect();
  redis.disconnect();
});
describe("published-only client portal", () => {
  it("only exposes explicitly published own cases, with no internal fields", async () => {
    let snapshot = await (
      await req("portal", "GET", undefined, clientSession)
    ).json();
    expect(snapshot.matters).toEqual([]);
    expect(snapshot.client.name).toBe("Client A");
    expect(snapshot.client.notes).toBeUndefined();
    expect(
      (
        await req(`practice/matters/${matterId}/portal`, "PATCH", {
          version: 1,
          clientVisible: true,
        })
      ).status,
    ).toBe(200);
    snapshot = await (
      await req("portal", "GET", undefined, clientSession)
    ).json();
    expect(snapshot.matters).toHaveLength(1);
    expect(snapshot.matters[0].title).toBe("Shared case");
    expect(JSON.stringify(snapshot)).not.toContain("SECRET");
    expect(JSON.stringify(snapshot)).not.toContain("Other client case");
    expect(
      (
        await req(
          `practice/matters/${matterId}`,
          "GET",
          undefined,
          clientSession,
        )
      ).status,
    ).toBe(403);
    expect(
      (await req("finance/invoices", "GET", undefined, clientSession)).status,
    ).toBe(403);
    expect((await req("portal", "GET", undefined, owner)).status).toBe(403);
  });
  it("only exposes approved current files and revokes old version downloads on a new draft", async () => {
    const service = app.get(DocumentsService),
      d = await service.create(actor, {
        matterId,
        title: "Shared pleading",
        kind: "PLEADING",
        body: "Approved client file",
        tags: [],
      });
    documentId = d.id;
    let detail = await service.detail(actor, documentId);
    versionId = detail.versions[0]!.id;
    await service.process(actor, versionId);
    expect(
      (await req(`portal/files/${versionId}`, "GET", undefined, clientSession))
        .status,
    ).toBe(404);
    await service.review(actor, documentId, 1);
    await service.approve(actor, documentId, 1, true);
    let snapshot = await (
      await req("portal", "GET", undefined, clientSession)
    ).json();
    expect(snapshot.documents).toHaveLength(1);
    expect(snapshot.documents[0].objectKey).toBeUndefined();
    const file = await req(
      `portal/files/${versionId}`,
      "GET",
      undefined,
      clientSession,
    );
    expect(file.status).toBe(200);
    expect(await file.text()).toBe("Approved client file");
    expect(
      (await req(`portal/files/${versionId}`, "GET", undefined, otherSession))
        .status,
    ).toBe(404);
    await service.upload(
      actor,
      documentId,
      Buffer.from("Internal new draft"),
      "draft.txt",
      1,
    );
    detail = await service.detail(actor, documentId);
    expect(detail.currentVersion).toBe(2);
    await service.process(actor, detail.versions[0]!.id);
    snapshot = await (
      await req("portal", "GET", undefined, clientSession)
    ).json();
    expect(snapshot.documents).toEqual([]);
    expect(
      (await req(`portal/files/${versionId}`, "GET", undefined, clientSession))
        .status,
    ).toBe(404);
  });
  it("only exposes published issued invoices and their own balances", async () => {
    for (const visible of [true, false]) {
      const i = await post("finance/invoices", {
        clientId,
        description: visible ? "Published bill" : "Hidden bill",
        quantity: 1,
        unitPriceMinor: 1000,
        dueAt: new Date().toISOString(),
      });
      await post(`finance/invoices/${i.id}/issue`, { clientVisible: visible });
    }
    const s = await (
      await req("portal", "GET", undefined, clientSession)
    ).json();
    expect(s.invoices).toHaveLength(1);
    expect(s.invoices[0].description).toBe("Published bill");
    expect(s.invoices[0].totalMinor).toBe(1000);
    expect(
      (await (await req("portal", "GET", undefined, otherSession)).json())
        .invoices,
    ).toEqual([]);
  });
  it("isolates correspondence and request responses between clients", async () => {
    await post(
      "portal/messages",
      { body: "Private client question" },
      clientSession,
    );
    await post(`practice/clients/${clientId}/portal-messages`, {
      body: "Firm reply",
    });
    const request = await post(
      "portal/requests",
      {
        kind: "APPOINTMENT",
        body: "Please arrange a meeting",
        preferredAt: new Date(Date.now() + 86400000).toISOString(),
      },
      clientSession,
    );
    await post(`practice/portal-requests/${request.id}/respond`, {
      status: "ACCEPTED",
      response: "We will confirm the meeting time",
    });
    const inbox = await (
      await req("portal/messages", "GET", undefined, clientSession)
    ).json();
    expect(inbox.messages).toHaveLength(2);
    expect(inbox.requests[0].status).toBe("ACCEPTED");
    expect(
      (
        await (
          await req("portal/messages", "GET", undefined, otherSession)
        ).json()
      ).messages,
    ).toEqual([]);
    expect(
      (
        await req(
          `practice/portal-requests/${request.id}/respond`,
          "POST",
          { status: "COMPLETED", response: "spoof" },
          otherSession,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await req(
          "portal/messages",
          "POST",
          { body: "Spoofed", clientId },
          otherSession,
        )
      ).status,
    ).toBe(400);
  });
  it("revokes the linked account immediately and denies access without a session", async () => {
    const roles = await (await req("roles")).json(),
      role = roles.find((r: { key: string }) => r.key === "CLIENT");
    expect(
      (
        await req(`roles/${role.id}`, "PATCH", {
          name: "Unsafe client",
          key: "CLIENT",
          permissions: ["workspace:read", "portal:read", "finance:read"],
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await req(`roles/${role.id}`, "PATCH", {
          name: "Renamed client",
          key: "RENAMED_CLIENT",
          permissions: ["workspace:read"],
        })
      ).status,
    ).toBe(403);
    await expect(
      inTenant(actor.tenantId, async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.member_id',${actor.membershipId},true)`;
        return tx.role.update({
          where: { id: role.id },
          data: {
            permissions: ["workspace:read", "portal:read", "finance:read"],
          },
        });
      }),
    ).rejects.toThrow();
    await post(`practice/clients/${clientId}/portal-access`, {
      memberId,
      active: false,
    });
    expect((await req("portal", "GET", undefined, clientSession)).status).toBe(
      403,
    );
    expect(
      (await req(`portal/files/${versionId}`, "GET", undefined, clientSession))
        .status,
    ).toBe(403);
    expect((await req("portal", "GET", undefined, "")).status).toBe(401);
  });
});
