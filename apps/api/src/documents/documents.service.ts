import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import type { z } from "zod";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Header,
  Footer,
  PageNumber,
  AlignmentType,
} from "docx";
import { chromium } from "playwright";
import { WorkspaceService } from "../workspace/workspace.service.js";
import { PracticeService } from "../practice/practice.service.js";
import { DocumentStorage } from "./storage.js";
import { DocumentTools, validateDocumentFile } from "./tools.js";
import { parse, type Actor } from "../security.js";
import { practiceQuery } from "../../../../packages/contracts/src/practice.js";
import type {
  documentSchema,
  templateSchema,
} from "../../../../packages/contracts/src/documents.js";
import type { Tx } from "../../../../packages/database/src/index.js";
import type { Prisma } from "../../../../packages/database/generated/client.js";
const versionSelect = {
  id: true,
  version: true,
  filename: true,
  mime: true,
  size: true,
  sha256: true,
  state: true,
  extractedText: true,
  requiresReview: true,
  extractionMethod: true,
  failureCode: true,
  uploadedBy: true,
  createdAt: true,
} as const;
function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(WorkspaceService) private readonly workspace: WorkspaceService,
    @Inject(PracticeService) private readonly practice: PracticeService,
    @Inject(DocumentStorage) readonly storage: DocumentStorage,
    @Inject(DocumentTools) private readonly tools: DocumentTools,
  ) {}
  private async document(tx: Tx, id: string) {
    const d = await tx.legalDocument.findFirst({ where: { id } });
    if (!d) throw new NotFoundException("NOT_FOUND");
    return d;
  }
  list(actor: Actor, query: unknown) {
    const p = parse(practiceQuery, query);
    return this.workspace.run(actor, "documents:read", false, async (tx) => {
      const where: Prisma.LegalDocumentWhereInput = {
        ...(p.clientId ? { matter: { clientId: p.clientId } } : {}),
        ...(p.matterId ? { matterId: p.matterId } : {}),
        ...(p.status ? { status: p.status } : { status: { not: "ARCHIVED" } }),
        ...(p.search
          ? {
              OR: [
                { title: { contains: p.search, mode: "insensitive" } },
                {
                  versions: {
                    some: {
                      state: "READY",
                      extractedText: {
                        contains: p.search,
                        mode: "insensitive",
                      },
                    },
                  },
                },
                { tags: { has: p.search } },
              ],
            }
          : {}),
      };
      return {
        items: await tx.legalDocument.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip: (p.page - 1) * p.pageSize,
          take: p.pageSize,
          include: {
            versions: {
              select: versionSelect,
              orderBy: { version: "desc" },
              take: 1,
            },
          },
        }),
        total: await tx.legalDocument.count({ where }),
        page: p.page,
        pageSize: p.pageSize,
      };
    });
  }
  detail(actor: Actor, id: string) {
    return this.workspace.run(actor, "documents:read", false, async (tx) => {
      await this.document(tx, id);
      return tx.legalDocument.findUniqueOrThrow({
        where: { id },
        include: {
          versions: { select: versionSelect, orderBy: { version: "desc" } },
        },
      });
    });
  }
  async create(actor: Actor, input: z.infer<typeof documentSchema>) {
    const { body, ...data } = input;
    const document = await this.workspace.run(
      actor,
      "documents:manage",
      true,
      async (tx) => {
        await this.practice.matter(tx, input.matterId);
        const result = await tx.legalDocument.create({
          data: {
            ...data,
            tenantId: actor.tenantId,
            createdBy: actor.membershipId,
          },
        });
        await this.practice.event(
          tx,
          actor,
          input.matterId,
          "document.created",
          { id: result.id },
        );
        return result;
      },
    );
    if (body)
      await this.upload(
        actor,
        document.id,
        Buffer.from(body, "utf8"),
        "draft.txt",
        0,
      );
    return document;
  }
  async upload(
    actor: Actor,
    id: string,
    buffer: Buffer,
    filename: string,
    expectedVersion?: number,
  ) {
    let mime: string;
    try {
      mime = validateDocumentFile(buffer, filename);
    } catch {
      throw new BadRequestException("INVALID_DOCUMENT_FILE");
    }
    if (!this.storage.configured())
      throw new ServiceUnavailableException("DOCUMENT_STORAGE_UNAVAILABLE");
    const key = `${actor.tenantId}/${id}/${randomUUID()}`;
    // Authorize before storing bytes, then authorize again inside the quota reservation transaction.
    await this.workspace.run(actor, "documents:manage", false, (tx) =>
      this.document(tx, id),
    );
    await this.storage.put(key, buffer, mime);
    try {
      return await this.workspace.run(
        actor,
        "documents:manage",
        true,
        async (tx) => {
          const d = await this.document(tx, id);
          if (d.status === "ARCHIVED")
            throw new ConflictException("DOCUMENT_ARCHIVED");
          if (
            expectedVersion !== undefined &&
            expectedVersion !== d.currentVersion
          )
            throw new ConflictException("STALE_VERSION");
          const subscription = await tx.subscription.findUnique({
            where: { tenantId: actor.tenantId },
            include: { plan: true },
          });
          const usage = await tx.$queryRaw<
            { bytes: bigint }[]
          >`SELECT practice_storage_bytes() AS bytes`;
          if (
            subscription &&
            Number(usage[0]?.bytes ?? 0) + buffer.length >
              subscription.plan.maxStorageMiB * 1048576
          )
            throw new ForbiddenException("STORAGE_QUOTA_EXCEEDED");
          const version = await tx.documentVersion.create({
            data: {
              tenantId: actor.tenantId,
              documentId: id,
              version: d.currentVersion + 1,
              objectKey: key,
              filename: filename
                .split("")
                .map((c) =>
                  c.charCodeAt(0) < 32 || c === "/" || c === "\\" ? "_" : c,
                )
                .join("")
                .slice(0, 240),
              mime,
              size: buffer.length,
              sha256: createHash("sha256").update(buffer).digest("hex"),
              uploadedBy: actor.membershipId,
            },
          });
          await tx.legalDocument.update({
            where: { id },
            data: {
              currentVersion: version.version,
              status: "DRAFT",
              approvedVersion: null,
              approvedBy: null,
              approvedAt: null,
              clientVisible: false,
            },
          });
          await this.practice.event(
            tx,
            actor,
            d.matterId,
            "document.version_uploaded",
            { documentId: id, versionId: version.id, version: version.version },
          );
          const { objectKey: _privateKey, ...safe } = version;
          void _privateKey;
          return safe;
        },
      );
    } catch (error) {
      await this.storage.remove(key).catch(() => undefined);
      throw error;
    }
  }
  async process(actor: Actor, versionId: string) {
    const v = await this.workspace.run(
      actor,
      "documents:manage",
      true,
      async (tx) => {
        const version = await tx.documentVersion.findFirst({
          where: {
            id: versionId,
            OR: [
              { state: { in: ["PENDING", "FAILED"] } },
              {
                state: "PROCESSING",
                processingStartedAt: { lt: new Date(Date.now() - 10 * 60000) },
              },
            ],
          },
        });
        if (!version) return null;
        await tx.documentVersion.update({
          where: { id: versionId },
          data: {
            state: "PROCESSING",
            processingStartedAt: new Date(),
            failureCode: null,
          },
        });
        return version;
      },
    );
    if (!v) return;
    try {
      const buffer = await this.storage.get(v.objectKey);
      if (
        buffer.length !== v.size ||
        createHash("sha256").update(buffer).digest("hex") !== v.sha256
      )
        throw new Error("FILE_INTEGRITY_FAILED");
      const result = await this.tools.inspect(buffer, v.filename, v.mime);
      await this.workspace.run(actor, "documents:manage", true, async (tx) => {
        await tx.documentVersion.update({
          where: { id: versionId },
          data: {
            state: "READY",
            extractedText: result.text,
            extractionMethod: result.method,
            requiresReview: result.requiresReview,
          },
        });
        await this.workspace.audit(
          tx,
          actor,
          "document.scan_completed",
          versionId,
        );
      });
    } catch (error) {
      const known = [
        "MALWARE_DETECTED",
        "SCANNER_UNAVAILABLE",
        "FILE_INTEGRITY_FAILED",
        "EXTRACTION_FAILED",
        "OCR_FAILED",
        "DOCUMENT_TOOL_TIMEOUT",
        "EXTRACTION_LIMIT",
      ];
      const code =
        error instanceof Error && known.includes(error.message)
          ? error.message
          : "PROCESSING_FAILED";
      await this.workspace.run(actor, "documents:manage", true, async (tx) => {
        await tx.documentVersion.update({
          where: { id: versionId },
          data: {
            state: code === "MALWARE_DETECTED" ? "REJECTED" : "FAILED",
            failureCode: code,
          },
        });
        await this.workspace.audit(
          tx,
          actor,
          `document.${code.toLowerCase()}`,
          versionId,
        );
      });
      if (code !== "MALWARE_DETECTED") throw new Error(code, { cause: error });
    }
  }
  review(actor: Actor, id: string, version: number, reviewedText?: string) {
    return this.workspace.run(actor, "documents:review", true, async (tx) => {
      const d = await this.document(tx, id);
      if (d.currentVersion !== version)
        throw new ConflictException("STALE_VERSION");
      if (d.status === "APPROVED" || d.status === "ARCHIVED")
        throw new ConflictException("DOCUMENT_LOCKED");
      const v = await tx.documentVersion.findFirst({
        where: { documentId: id, version, state: "READY" },
      });
      if (!v) throw new ConflictException("SCAN_REQUIRED");
      await tx.documentVersion.update({
        where: { id: v.id },
        data: {
          requiresReview: false,
          ...(reviewedText === undefined
            ? {}
            : { extractedText: reviewedText }),
        },
      });
      await tx.legalDocument.update({
        where: { id },
        data: { status: "IN_REVIEW" },
      });
      await this.practice.event(tx, actor, d.matterId, "document.reviewed", {
        documentId: id,
        version,
      });
      return { ok: true };
    });
  }
  approve(actor: Actor, id: string, version: number, clientVisible: boolean) {
    return this.workspace.run(actor, "documents:approve", true, async (tx) => {
      const d = await this.document(tx, id);
      if (d.currentVersion !== version)
        throw new ConflictException("STALE_VERSION");
      const v = await tx.documentVersion.findFirst({
        where: {
          documentId: id,
          version,
          state: "READY",
          requiresReview: false,
        },
      });
      if (!v || d.status !== "IN_REVIEW")
        throw new ConflictException("REVIEW_REQUIRED");
      await tx.legalDocument.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedVersion: version,
          approvedBy: actor.membershipId,
          approvedAt: new Date(),
          clientVisible,
        },
      });
      await this.practice.event(tx, actor, d.matterId, "document.approved", {
        documentId: id,
        version,
        clientVisible,
      });
      return { ok: true };
    });
  }
  archive(actor: Actor, id: string) {
    return this.workspace.run(actor, "documents:manage", true, async (tx) => {
      const d = await this.document(tx, id);
      await tx.legalDocument.update({
        where: { id },
        data: { status: "ARCHIVED", clientVisible: false },
      });
      await this.practice.event(tx, actor, d.matterId, "document.archived", {
        documentId: id,
      });
      return { ok: true };
    });
  }
  retry(actor: Actor, id: string, versionId: string) {
    return this.workspace.run(actor, "documents:manage", true, async (tx) => {
      const d = await this.document(tx, id);
      const v = await tx.documentVersion.findFirst({
        where: { id: versionId, documentId: id, state: "FAILED" },
      });
      if (!v || v.version !== d.currentVersion || d.status === "ARCHIVED")
        throw new ConflictException("RETRY_UNAVAILABLE");
      await tx.documentVersion.update({
        where: { id: versionId },
        data: { state: "PENDING", failureCode: null },
      });
      await this.workspace.audit(
        tx,
        actor,
        "document.processing_retried",
        versionId,
      );
      return { ok: true };
    });
  }
  async download(actor: Actor, id: string, versionId: string) {
    const version = await this.workspace.run(
      actor,
      "documents:download",
      false,
      async (tx) => {
        await this.document(tx, id);
        const v = await tx.documentVersion.findFirst({
          where: { id: versionId, documentId: id, state: "READY" },
        });
        if (!v) throw new NotFoundException("NOT_FOUND");
        await this.workspace.audit(tx, actor, "document.downloaded", v.id);
        return v;
      },
    );
    const body = await this.storage.get(version.objectKey);
    if (createHash("sha256").update(body).digest("hex") !== version.sha256)
      throw new ServiceUnavailableException("FILE_INTEGRITY_FAILED");
    return { body, filename: version.filename, mime: version.mime };
  }
  templates(actor: Actor) {
    return this.workspace.run(actor, "documents:read", false, (tx) =>
      tx.documentTemplate.findMany({ orderBy: { title: "asc" } }),
    );
  }
  saveTemplate(actor: Actor, input: z.infer<typeof templateSchema>) {
    return this.workspace.run(actor, "documents:manage", true, async (tx) => {
      const result = await tx.documentTemplate.create({
        data: { ...input, tenantId: actor.tenantId },
      });
      await this.workspace.audit(
        tx,
        actor,
        "document.template_created",
        result.id,
      );
      return result;
    });
  }
  async export(actor: Actor, id: string, format: "pdf" | "docx") {
    const { d, v, tenant, matter } = await this.workspace.run(
      actor,
      "documents:download",
      false,
      async (tx) => {
        const d = await this.document(tx, id);
        const v = await tx.documentVersion.findFirst({
          where: { documentId: id, version: d.currentVersion, state: "READY" },
        });
        if (!v) throw new ConflictException("SCAN_REQUIRED");
        await this.workspace.audit(tx, actor, `document.export_${format}`, id);
        return {
          d,
          v,
          tenant: await tx.tenant.findUniqueOrThrow({
            where: { id: actor.tenantId },
          }),
          matter: await tx.matter.findUniqueOrThrow({
            where: { id: d.matterId },
          }),
        };
      },
    );
    const rtl = /[\u0600-\u06ff]/.test(v.extractedText);
    const text = v.extractedText
      .replaceAll("{{case_reference}}", `\u2066${matter.reference}\u2069`)
      .replaceAll("{{case_title}}", `\u2068${matter.title}\u2069`)
      .replaceAll("{{office_name}}", `\u2068${tenant.name}\u2069`);
    let body: Buffer;
    if (format === "docx") {
      body = await Packer.toBuffer(
        new Document({
          sections: [
            {
              headers: {
                default: new Header({
                  children: [
                    new Paragraph({ text: tenant.name, bidirectional: rtl }),
                  ],
                }),
              },
              footers: {
                default: new Footer({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({ children: [PageNumber.CURRENT] }),
                      ],
                    }),
                  ],
                }),
              },
              children: [
                new Paragraph({
                  text: d.title,
                  heading: "Heading1",
                  bidirectional: rtl,
                }),
                ...text.split("\n").map(
                  (line) =>
                    new Paragraph({
                      bidirectional: /[\u0600-\u06ff]/.test(line),
                      children: [
                        new TextRun({
                          text: line,
                          rightToLeft: /[\u0600-\u06ff]/.test(line),
                          font: "Arial",
                          size: 24,
                        }),
                      ],
                    }),
                ),
              ],
            },
          ],
        }),
      );
    } else {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.route("**/*", (route) => route.abort());
        await page.setContent(
          `<!doctype html><html lang="${rtl ? "ar" : "en"}" dir="${rtl ? "rtl" : "ltr"}"><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:14px;line-height:1.9}h1{font-size:24px}p{white-space:pre-wrap;overflow-wrap:anywhere}</style><body><small><bdi>${escapeHtml(tenant.name)}</bdi> · <bdi>${escapeHtml(matter.reference)}</bdi></small><h1>${escapeHtml(d.title)}</h1>${text
            .split("\n")
            .map((line) => `<p dir="auto">${escapeHtml(line) || "&nbsp;"}</p>`)
            .join("")}</body></html>`,
        );
        body = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
          displayHeaderFooter: true,
          headerTemplate: "<span></span>",
          footerTemplate:
            '<div style="font-size:9px;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
        });
      } finally {
        await browser.close();
      }
    }
    return {
      body,
      filename: `${d.title.replace(/[\r\n\\/]/g, "_")}.${format}`,
      mime:
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }
}
