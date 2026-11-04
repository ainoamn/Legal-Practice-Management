import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { requireTestDatabase } from "./setup-env.js";
import { createApp } from "../apps/api/src/app.js";
import { DocumentsService } from "../apps/api/src/documents/documents.service.js";
import { S3DocumentStorage } from "../apps/api/src/documents/storage.js";
import { db, inTenant } from "../packages/database/src/index.js";
import { redis, type Actor } from "../apps/api/src/security.js";
requireTestDatabase();
let app: INestApplication,
  base: string,
  service: DocumentsService,
  cookie: string,
  foreignCookie: string,
  actor: Actor,
  matterId: string,
  documentId: string,
  firstVersionId: string;
const run = randomUUID().slice(0, 8),
  password = "Documents-Secure-Password-2026";
async function req(
  path: string,
  method = "GET",
  body?: unknown,
  session = cookie,
) {
  return fetch(`${base}/api/v1/${path}`, {
    method,
    headers: {
      origin: process.env.WEB_ORIGIN!,
      "content-type": "application/json",
      cookie: session,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function post(path: string, body: unknown) {
  const r = await req(path, "POST", body);
  const data = await r.json();
  expect(r.status, JSON.stringify(data)).toBe(201);
  return data;
}
async function register(suffix: string) {
  const res = await req(
    "auth/register",
    "POST",
    {
      email: `doc-${run}-${suffix}@tests.invalid`,
      password,
      fullName: "Document Owner",
      officeName: "Documents Office",
      slug: `doc-${run}-${suffix}`,
      countryCode: "OM",
    },
    "",
  );
  expect(res.status).toBe(201);
  return res.headers.get("set-cookie")!.split(";")[0]!;
}
beforeAll(async () => {
  if (
    process.env.S3_BUCKET !== "legal-test" ||
    process.env.S3_ENDPOINT !== "http://127.0.0.1:4320"
  )
    throw new Error(
      "Live document tests require isolated local S3: npm run storage:setup and npm run storage:dev",
    );
  await new S3DocumentStorage().health();
  app = await createApp({ documents: { worker: false } });
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  service = app.get(DocumentsService);
  cookie = await register("a");
  foreignCookie = await register("b");
  const me = await (await req("auth/me")).json();
  actor = {
    tenantId: me.tenant.id,
    membershipId: me.membership.id,
    userId: me.user.id,
    sessionId: "document-test",
  };
  const client = await post("practice/clients", {
    name: "Document Client",
    branchId: me.branch.id,
  });
  const matter = await post("practice/matters", {
    title: "Document Matter",
    branchId: me.branch.id,
    clientId: client.id,
    category: "CIVIL",
    countryCode: "OM",
  });
  matterId = matter.id;
}, 60000);
afterAll(async () => {
  await app?.close();
  await db.$disconnect();
  redis.disconnect();
});
describe("documents using real private S3, ClamAV and PostgreSQL", () => {
  it("quarantines a new version and blocks download until scanned", async () => {
    const d = await post("practice/documents", {
      title: "مذكرة قانونية",
      kind: "PLEADING",
      matterId,
      body: "هذه مسودة قانونية لمكتب {{office_name}} للقضية {{case_reference}}.\nLegal draft for review.",
    });
    documentId = d.id;
    const detail = await (await req(`practice/documents/${documentId}`)).json();
    firstVersionId = detail.versions[0].id;
    expect(detail.versions[0].state).toBe("PENDING");
    expect(detail.versions[0].objectKey).toBeUndefined();
    expect(
      (
        await req(
          `practice/documents/${documentId}/versions/${firstVersionId}/download`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await req(`practice/documents/${documentId}/approve`, "POST", {
          expectedVersion: 1,
          clientVisible: true,
        })
      ).status,
    ).toBe(409);
    await service.process(actor, firstVersionId);
    const scanned = await (
      await req(`practice/documents/${documentId}`)
    ).json();
    expect(scanned.versions[0].state).toBe("READY");
    expect(scanned.versions[0].extractionMethod).toBe("TEXT");
  }, 90000);
  it("enforces review, approval and immutable approved contents", async () => {
    expect(
      (
        await req(`practice/documents/${documentId}/approve`, "POST", {
          expectedVersion: 1,
          clientVisible: true,
        })
      ).status,
    ).toBe(409);
    await post(`practice/documents/${documentId}/review`, {
      expectedVersion: 1,
    });
    await post(`practice/documents/${documentId}/approve`, {
      expectedVersion: 1,
      clientVisible: true,
    });
    const d = await (await req(`practice/documents/${documentId}`)).json();
    expect(d.status).toBe("APPROVED");
    expect(d.clientVisible).toBe(true);
    await expect(
      inTenant(actor.tenantId, async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.member_id',${actor.membershipId},true)`;
        return tx.documentVersion.update({
          where: { id: firstVersionId },
          data: { extractedText: "Tampered" },
        });
      }),
    ).rejects.toThrow();
    const file = await req(
      `practice/documents/${documentId}/versions/${firstVersionId}/download`,
    );
    expect(file.status).toBe(200);
    expect(file.headers.get("content-disposition")).toContain("attachment");
    expect(await file.text()).toContain("مسودة قانونية");
    expect(
      (
        await req(
          `practice/documents/${documentId}`,
          "GET",
          undefined,
          foreignCookie,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await req(
          `practice/documents/${documentId}/versions/${firstVersionId}/download`,
          "GET",
          undefined,
          foreignCookie,
        )
      ).status,
    ).toBe(404);
  });
  it("exports real PDF and DOCX with Arabic text", async () => {
    const pdf = await req(`practice/documents/${documentId}/export/pdf`);
    expect(pdf.status).toBe(200);
    const pdfBytes = Buffer.from(await pdf.arrayBuffer());
    expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-");
    await mkdir(".local/qa", { recursive: true });
    await writeFile(".local/qa/legal-document.pdf", pdfBytes);
    const word = await req(`practice/documents/${documentId}/export/docx`);
    expect(word.status).toBe(200);
    expect(
      Buffer.from(await word.arrayBuffer())
        .subarray(0, 2)
        .toString(),
    ).toBe("PK");
  }, 60000);
  it("extracts images with Arabic/English OCR and blocks unsigned S3 reads", async () => {
    const d = await post("practice/documents", {
      title: "OCR review",
      kind: "SUPPORTING",
      matterId,
    });
    const browser = await chromium.launch({ headless: true });
    let image: Buffer;
    try {
      const page = await browser.newPage({
        viewport: { width: 800, height: 300 },
      });
      await page.setContent(
        '<html dir="rtl"><meta charset="utf-8"><body style="font:32px Arial;padding:30px">اختبار المستندات القانونية<br><span dir="ltr">LEGAL OCR TEST</span></body></html>',
      );
      image = await page.screenshot();
    } finally {
      await browser.close();
    }
    const v = await service.upload(actor, d.id, image, "ocr-test.png", 0);
    await service.process(actor, v.id);
    const detail = await (await req(`practice/documents/${d.id}`)).json();
    expect(detail.versions[0].state).toBe("READY");
    expect(detail.versions[0].extractionMethod).toBe("OCR_ARA_ENG");
    expect(detail.versions[0].requiresReview).toBe(true);
    expect(detail.versions[0].extractedText.toUpperCase()).toContain(
      "LEGAL OCR TEST",
    );
    const unsigned = await fetch(
      `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/`,
    );
    expect(unsigned.status).toBe(403);
  }, 90000);
  it("creates a new version while retaining history and revoking publication", async () => {
    const newer = await post(`practice/documents/${documentId}/drafts`, {
      body: "نسخة ثانية للمراجعة",
      expectedVersion: 1,
    });
    const d = await (await req(`practice/documents/${documentId}`)).json();
    expect(d.currentVersion).toBe(2);
    expect(d.versions).toHaveLength(2);
    expect(d.clientVisible).toBe(false);
    expect(d.approvedVersion).toBeNull();
    await expect(
      inTenant(actor.tenantId, async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.member_id',${actor.membershipId},true)`;
        return tx.documentVersion.update({
          where: { id: firstVersionId },
          data: { extractedText: "Historical tampering after new draft" },
        });
      }),
    ).rejects.toThrow();
    expect(
      (
        await req(`practice/documents/${documentId}/drafts`, "POST", {
          body: "stale edit",
          expectedVersion: 1,
        })
      ).status,
    ).toBe(409);
    await service.process(actor, newer.id);
    const result = await (
      await req("practice/documents?search=" + encodeURIComponent("نسخة ثانية"))
    ).json();
    expect(result.items.map((v: { id: string }) => v.id)).toContain(documentId);
  }, 90000);
  it("rejects disguised files and malware without permitting download", async () => {
    const invalid = new FormData();
    invalid.append("file", new Blob(["not a PDF"]), "fake.pdf");
    let response = await fetch(
      `${base}/api/v1/practice/documents/${documentId}/files`,
      {
        method: "POST",
        headers: { cookie, origin: process.env.WEB_ORIGIN! },
        body: invalid,
      },
    );
    expect(response.status).toBe(400);
    const malware = new FormData();
    malware.append(
      "file",
      new Blob([
        "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
      ]),
      "antivirus-test.txt",
    );
    response = await fetch(
      `${base}/api/v1/practice/documents/${documentId}/files`,
      {
        method: "POST",
        headers: { cookie, origin: process.env.WEB_ORIGIN! },
        body: malware,
      },
    );
    expect(response.status).toBe(201);
    const v = await response.json();
    await service.process(actor, v.id);
    const detail = await (await req(`practice/documents/${documentId}`)).json();
    expect(detail.versions[0].state).toBe("REJECTED");
    expect(detail.versions[0].failureCode).toBe("MALWARE_DETECTED");
    await inTenant(actor.tenantId, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.member_id',${actor.membershipId},true)`;
      const sum = await tx.documentVersion.aggregate({ _sum: { size: true } }),
        usage = await tx.$queryRaw<
          { bytes: bigint }[]
        >`SELECT practice_storage_bytes() AS bytes`;
      expect(usage[0]!.bytes).toBe(BigInt(sum._sum.size ?? 0));
    });
    expect(
      (await req(`practice/documents/${documentId}/versions/${v.id}/download`))
        .status,
    ).toBe(404);
  }, 90000);
});
