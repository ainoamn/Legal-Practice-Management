import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { z } from "zod";
import { WorkspaceService } from "../workspace/workspace.service.js";
import { DocumentStorage } from "../documents/storage.js";
import type { Actor } from "../security.js";
import type { Tx } from "../../../../packages/database/src/index.js";
import type {
  clientAccessSchema,
  portalRequestSchema,
  portalResponseSchema,
} from "../../../../packages/contracts/src/portal.js";
type Snapshot = {
  client: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  } | null;
  matters: unknown[];
  hearings: unknown[];
  documents: unknown[];
  invoices: unknown[];
};
@Injectable()
export class PortalService {
  constructor(
    @Inject(WorkspaceService) private readonly workspace: WorkspaceService,
    @Inject(DocumentStorage) private readonly storage: DocumentStorage,
  ) {}
  private async own(tx: Tx) {
    const c = (
      await tx.$queryRaw<{ id: string | null }[]>`SELECT portal_client() AS id`
    )[0]?.id;
    if (!c) throw new ForbiddenException("PORTAL_ACCESS_UNAVAILABLE");
    return c;
  }
  snapshot(actor: Actor) {
    return this.workspace.run(actor, "portal:read", false, async (tx) => {
      await this.own(tx);
      const data = (
        await tx.$queryRaw<
          { data: Snapshot }[]
        >`SELECT portal_snapshot() AS data`
      )[0]!.data;
      await this.workspace.audit(tx, actor, "portal.viewed", data.client?.id);
      return data;
    });
  }
  messages(actor: Actor) {
    return this.workspace.run(actor, "portal:read", false, async (tx) => {
      const clientId = await this.own(tx);
      return {
        messages: await tx.portalMessage.findMany({
          where: { clientId },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        requests: await tx.portalRequest.findMany({
          where: { clientId },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      };
    });
  }
  send(actor: Actor, body: string) {
    return this.workspace.run(actor, "portal:read", true, async (tx) => {
      const clientId = await this.own(tx);
      const r = await tx.portalMessage.create({
        data: {
          tenantId: actor.tenantId,
          clientId,
          memberId: actor.membershipId,
          sender: "CLIENT",
          body,
        },
      });
      await this.workspace.audit(tx, actor, "portal.message_sent", r.id);
      return r;
    });
  }
  request(actor: Actor, input: z.infer<typeof portalRequestSchema>) {
    return this.workspace.run(actor, "portal:read", true, async (tx) => {
      const clientId = await this.own(tx);
      const r = await tx.portalRequest.create({
        data: {
          ...input,
          tenantId: actor.tenantId,
          clientId,
          memberId: actor.membershipId,
        },
      });
      await this.workspace.audit(tx, actor, "portal.request_created", r.id);
      return r;
    });
  }
  async download(actor: Actor, versionId: string) {
    const file = await this.workspace.run(
      actor,
      "portal:read",
      false,
      async (tx) => {
        await this.own(tx);
        const f = (
          await tx.$queryRaw<
            {
              objectKey: string;
              filename: string;
              mime: string;
              sha256: string;
              versionId: string;
            }[]
          >`SELECT * FROM portal_file(${versionId}::uuid)`
        )[0];
        if (!f) throw new NotFoundException("NOT_FOUND");
        await this.workspace.audit(
          tx,
          actor,
          "portal.document_downloaded",
          versionId,
        );
        return f;
      },
    );
    const body = await this.storage.get(file.objectKey);
    if (createHash("sha256").update(body).digest("hex") !== file.sha256)
      throw new ServiceUnavailableException("FILE_INTEGRITY_FAILED");
    return { body, filename: file.filename, mime: file.mime };
  }
  staff(actor: Actor, clientId: string) {
    return this.workspace.run(actor, "clients:manage", false, async (tx) => {
      if (!(await tx.client.findFirst({ where: { id: clientId } })))
        throw new NotFoundException("NOT_FOUND");
      return {
        access: await tx.clientAccess.findMany({ where: { clientId } }),
        messages: await tx.portalMessage.findMany({
          where: { clientId },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        requests: await tx.portalRequest.findMany({
          where: { clientId },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      };
    });
  }
  link(
    actor: Actor,
    clientId: string,
    input: z.infer<typeof clientAccessSchema>,
  ) {
    return this.workspace.run(actor, "clients:manage", true, async (tx) => {
      if (!(await tx.client.findFirst({ where: { id: clientId } })))
        throw new NotFoundException("NOT_FOUND");
      const member = await tx.membership.findFirst({
        where: { id: input.memberId },
        include: { role: true },
      });
      if (
        !member ||
        (input.active && !member.active) ||
        member.role.key !== "CLIENT" ||
        member.role.permissions.some(
          (p) => !["workspace:read", "portal:read"].includes(p),
        )
      )
        throw new ForbiddenException("CLIENT_ROLE_REQUIRED");
      const existing = await tx.clientAccess.findFirst({
        where: { memberId: input.memberId },
      });
      if (existing?.active && existing.clientId !== clientId)
        throw new ConflictException("CLIENT_ALREADY_LINKED");
      const r = await tx.clientAccess.upsert({
        where: {
          tenantId_memberId: {
            tenantId: actor.tenantId,
            memberId: input.memberId,
          },
        },
        create: { ...input, tenantId: actor.tenantId, clientId },
        update: { active: input.active, clientId },
      });
      await this.workspace.audit(tx, actor, "portal.access_changed", r.id);
      return r;
    });
  }
  reply(actor: Actor, clientId: string, body: string) {
    return this.workspace.run(actor, "clients:manage", true, async (tx) => {
      if (!(await tx.client.findFirst({ where: { id: clientId } })))
        throw new NotFoundException("NOT_FOUND");
      const r = await tx.portalMessage.create({
        data: {
          tenantId: actor.tenantId,
          clientId,
          memberId: actor.membershipId,
          sender: "STAFF",
          body,
        },
      });
      await this.workspace.audit(tx, actor, "portal.staff_replied", r.id);
      return r;
    });
  }
  respond(
    actor: Actor,
    id: string,
    input: z.infer<typeof portalResponseSchema>,
  ) {
    return this.workspace.run(actor, "clients:manage", true, async (tx) => {
      const old = await tx.portalRequest.findFirst({ where: { id } });
      if (!old) throw new NotFoundException("NOT_FOUND");
      const r = await tx.portalRequest.update({ where: { id }, data: input });
      await this.workspace.audit(tx, actor, "portal.request_responded", id);
      return r;
    });
  }
  publishMatter(
    actor: Actor,
    id: string,
    version: number,
    clientVisible: boolean,
  ) {
    return this.workspace.run(actor, "matters:manage", true, async (tx) => {
      const m = await tx.matter.findFirst({ where: { id } });
      if (!m) throw new NotFoundException("NOT_FOUND");
      if (m.version !== version) throw new ConflictException("STALE_VERSION");
      await tx.matter.update({
        where: { id, version },
        data: { clientVisible, version: { increment: 1 } },
      });
      await this.workspace.audit(
        tx,
        actor,
        "portal.matter_publication_changed",
        id,
      );
      return { ok: true };
    });
  }
}
