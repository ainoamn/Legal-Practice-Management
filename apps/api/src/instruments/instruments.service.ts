import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import type { z } from "zod";
import type { Tx } from "../../../../packages/database/src/index.js";
import type {
  LegalInstrument,
  Prisma,
} from "../../../../packages/database/generated/client.js";
import { WorkspaceService } from "../workspace/workspace.service.js";
import { parse, type Actor } from "../security.js";
import {
  instrumentQuery,
  type InstrumentInput,
  type instrumentPatchSchema,
  type obligationSchema,
  type obligationPatchSchema,
} from "../../../../packages/contracts/src/instruments.js";
import { officeToday, officeReminderTime } from "./time.js";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
@Injectable()
export class InstrumentsService {
  constructor(
    @Inject(WorkspaceService) private readonly workspace: WorkspaceService,
  ) {}
  catalog(actor: Actor) {
    return this.run(actor, "instruments:read", false, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: actor.tenantId },
        }),
        own = await tx.country.findUniqueOrThrow({
          where: { code: tenant.countryCode },
        }),
        countries = await tx.country.findMany({
          where: { enabled: true },
          orderBy: { code: "asc" },
        }),
        currencies = new Map<
          string,
          { currency: string; currencyDecimals: number }
        >();
      for (const c of [own, ...countries])
        if (!currencies.has(c.currency))
          currencies.set(c.currency, {
            currency: c.currency,
            currencyDecimals: c.currencyDecimals,
          });
      return {
        currencies: [...currencies.values()],
        timezone: tenant.timezone,
        today: officeToday(tenant.timezone),
      };
    });
  }
  private run<T>(
    actor: Actor,
    permission:
      "instruments:read" | "instruments:manage" | "instruments:approve",
    write: boolean,
    work: (tx: Tx) => Promise<T>,
  ) {
    return this.workspace.run(actor, permission, write, async (tx, m) => {
      if (
        !m.role.permissions.includes("instruments:read") ||
        !m.role.permissions.includes("clients:read")
      )
        throw new ForbiddenException("INSTRUMENT_READ_REQUIRED");
      return work(tx);
    });
  }
  private async item(tx: Tx, id: string) {
    const d = await tx.legalInstrument.findFirst({ where: { id } });
    if (!d) throw new NotFoundException("NOT_FOUND");
    return d;
  }
  private async event(
    tx: Tx,
    a: Actor,
    id: string,
    action: string,
    details?: Prisma.InputJsonValue,
  ) {
    await tx.instrumentEvent.create({
      data: {
        tenantId: a.tenantId,
        instrumentId: id,
        actorId: a.membershipId,
        action,
        ...(details ? { details } : {}),
      },
    });
    await this.workspace.audit(tx, a, action, id);
  }
  private async validate(
    tx: Tx,
    input: InstrumentInput,
    old?: LegalInstrument,
  ) {
    if (
      (input.startsAt && input.endsAt && input.endsAt < input.startsAt) ||
      (input.kind === "CONTRACT" && !input.partyTwo.trim()) ||
      (input.kind === "POWER_OF_ATTORNEY" &&
        (!input.agent.trim() ||
          !input.issuingAuthority.trim() ||
          !input.referenceNumber))
    )
      throw new BadRequestException("INSTRUMENT_DETAILS_REQUIRED");
    const c = await tx.client.findFirst({
      where: { id: input.clientId, ...(!old ? { archived: false } : {}) },
    });
    if (!c) throw new NotFoundException("NOT_FOUND");
    const m = await tx.membership.findFirst({
      where: { id: input.responsibleId },
      include: { role: true },
    });
    if (
      !m ||
      ((!old || old.responsibleId !== input.responsibleId) &&
        (!m.active ||
          !m.role.permissions.includes("instruments:read") ||
          !m.role.permissions.includes("clients:read")))
    )
      throw new BadRequestException("INVALID_RESPONSIBLE");
    if (input.matterId && (!old || old.matterId !== input.matterId)) {
      const matter = await tx.matter.findFirst({
        where: { id: input.matterId },
      });
      if (!matter) throw new NotFoundException("NOT_FOUND");
      if (matter.clientId !== input.clientId)
        throw new BadRequestException("MATTER_CLIENT_MISMATCH");
    }
    if (
      input.documentId &&
      (!old ||
        old.documentId !== input.documentId ||
        old.matterId !== input.matterId)
    ) {
      const d = await tx.legalDocument.findFirst({
        where: { id: input.documentId, status: { not: "ARCHIVED" } },
      });
      if (!d) throw new NotFoundException("NOT_FOUND");
      const matter = await tx.matter.findFirst({ where: { id: d.matterId } });
      if (
        !matter ||
        matter.clientId !== input.clientId ||
        (input.matterId && input.matterId !== d.matterId)
      )
        throw new BadRequestException("MATTER_CLIENT_MISMATCH");
    }
    let currencyDecimals =
      old?.currency === input.currency ? old.currencyDecimals : undefined;
    if (currencyDecimals === undefined) {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: c.tenantId },
      });
      const country =
        input.currency === tenant.currency
          ? await tx.country.findUnique({ where: { code: tenant.countryCode } })
          : await tx.country.findFirst({
              where: { currency: input.currency, enabled: true },
              orderBy: { code: "asc" },
            });
      if (!country) throw new BadRequestException("UNKNOWN_CURRENCY");
      currencyDecimals = country.currencyDecimals;
    }
    return { client: c, currencyDecimals };
  }
  private effective(d: LegalInstrument, timeZone: string) {
    return d.status === "ACTIVE" &&
      d.endsAt &&
      d.endsAt.toISOString().slice(0, 10) < officeToday(timeZone)
      ? "EXPIRED"
      : d.status;
  }
  private async scheduleObligation(
    tx: Tx,
    d: LegalInstrument,
    o: { id: string; dueAt: Date; status: string; version: number },
  ) {
    await tx.instrumentReminder.updateMany({
      where: {
        instrumentId: d.id,
        obligationId: o.id,
        readAt: null,
        cancelledAt: null,
      },
      data: { cancelledAt: new Date() },
    });
    if (d.status !== "ACTIVE" || !["TODO", "IN_PROGRESS"].includes(o.status))
      return;
    const now = new Date(),
      times = [new Date(o.dueAt.getTime() - 86400000), o.dueAt].filter(
        (t) => t >= now,
      );
    if (!times.length) times.push(now);
    await tx.instrumentReminder.createMany({
      data: times.map((dueAt) => ({
        tenantId: d.tenantId,
        instrumentId: d.id,
        obligationId: o.id,
        memberId: d.responsibleId,
        kind: "OBLIGATION",
        dueAt,
        generation: o.version,
      })),
    });
  }
  private async reschedule(tx: Tx, d: LegalInstrument, timeZone: string) {
    await tx.instrumentReminder.updateMany({
      where: { instrumentId: d.id, readAt: null, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });
    if (d.status !== "ACTIVE") return;
    const now = new Date();
    for (const [kind, deadline] of [
      ["EXPIRY", d.endsAt],
      ["RENEWAL", d.renewalAt],
    ] as const) {
      if (!deadline || !d.reminderDays.length) continue;
      const times = d.reminderDays
        .map((days) =>
          officeReminderTime(
            new Date(deadline.getTime() - days * 86400000),
            timeZone,
          ),
        )
        .filter((t) => t >= now);
      if (!times.length) times.push(now);
      await tx.instrumentReminder.createMany({
        data: times.map((dueAt) => ({
          tenantId: d.tenantId,
          instrumentId: d.id,
          memberId: d.responsibleId,
          kind,
          dueAt,
          generation: d.version,
        })),
      });
    }
    const obligations = await tx.instrumentObligation.findMany({
      where: { instrumentId: d.id, status: { in: ["TODO", "IN_PROGRESS"] } },
    });
    for (const o of obligations) await this.scheduleObligation(tx, d, o);
  }
  list(actor: Actor, q: unknown) {
    const p = parse(instrumentQuery, q);
    if (p.status === "EXPIRED" && p.expiringWithinDays !== undefined)
      throw new BadRequestException("VALIDATION_ERROR");
    return this.run(actor, "instruments:read", false, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: actor.tenantId },
        }),
        today = new Date(officeToday(tenant.timezone) + "T00:00:00Z");
      const where: Prisma.LegalInstrumentWhereInput = {
        ...(p.kind ? { kind: p.kind } : {}),
        ...(p.clientId ? { clientId: p.clientId } : {}),
        ...(p.matterId ? { matterId: p.matterId } : {}),
        ...(p.status === "EXPIRED"
          ? { status: "ACTIVE", endsAt: { lt: today } }
          : p.status
            ? { status: p.status }
            : { status: { not: "ARCHIVED" } }),
        ...(p.expiringWithinDays !== undefined
          ? {
              status: "ACTIVE",
              endsAt: {
                gte: today,
                lte: new Date(
                  today.getTime() + p.expiringWithinDays * 86400000,
                ),
              },
            }
          : {}),
        ...(p.search
          ? {
              OR: [
                "title",
                "reference",
                "referenceNumber",
                "partyOne",
                "partyTwo",
                "agent",
              ].map((k) => ({
                [k]: { contains: p.search, mode: "insensitive" },
              })),
            }
          : {}),
      };
      const items = await tx.legalInstrument.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
      });
      return {
        items: items.map((d) => ({
          ...d,
          effectiveStatus: this.effective(d, tenant.timezone),
        })),
        total: await tx.legalInstrument.count({ where }),
        page: p.page,
        pageSize: p.pageSize,
      };
    });
  }
  create(actor: Actor, input: InstrumentInput) {
    return this.run(actor, "instruments:manage", true, async (tx) => {
      const { client, currencyDecimals } = await this.validate(tx, input);
      const counter =
          (
            await tx.$queryRaw<
              { sequence: number }[]
            >`SELECT instrument_sequence() AS sequence`
          )[0]!.sequence + 1,
        prefix = { CONTRACT: "CTR", POWER_OF_ATTORNEY: "POA", LICENCE: "LIC" }[
          input.kind
        ];
      const d = await tx.legalInstrument.create({
        data: {
          ...input,
          tenantId: actor.tenantId,
          branchId: client.branchId,
          createdBy: actor.membershipId,
          sequence: counter,
          reference: `${prefix}-${String(counter).padStart(6, "0")}`,
          currencyDecimals,
        },
      });
      await this.event(tx, actor, d.id, "instrument.created");
      return d;
    });
  }
  detail(actor: Actor, id: string) {
    return this.run(actor, "instruments:read", false, async (tx) => {
      const d = await this.item(tx, id),
        tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: actor.tenantId },
        });
      return {
        ...d,
        effectiveStatus: this.effective(d, tenant.timezone),
        client: await tx.client.findFirst({
          where: { id: d.clientId },
          select: { id: true, name: true },
        }),
        matter: d.matterId
          ? await tx.matter.findFirst({
              where: { id: d.matterId },
              select: { id: true, reference: true },
            })
          : null,
        responsible: await tx.membership.findFirst({
          where: { id: d.responsibleId },
          select: { id: true, user: { select: { fullName: true } } },
        }),
        document: d.documentId
          ? await tx.legalDocument.findFirst({
              where: { id: d.documentId },
              select: {
                id: true,
                title: true,
                status: true,
                currentVersion: true,
                approvedVersion: true,
              },
            })
          : null,
        obligations: await tx.instrumentObligation.findMany({
          where: { instrumentId: id },
          orderBy: { dueAt: "asc" },
        }),
        reminders: await tx.instrumentReminder.findMany({
          where: { instrumentId: id, cancelledAt: null },
          orderBy: { dueAt: "asc" },
          take: 100,
        }),
        events: await tx.instrumentEvent.findMany({
          where: { instrumentId: id },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      };
    });
  }
  update(
    actor: Actor,
    id: string,
    input: z.infer<typeof instrumentPatchSchema>,
  ) {
    return this.run(actor, "instruments:manage", true, async (tx) => {
      const old = await this.item(tx, id);
      if (old.version !== input.version)
        throw new ConflictException("STALE_VERSION");
      const merged = { ...old, ...input };
      const { currencyDecimals } = await this.validate(
        tx,
        {
          kind: old.kind as InstrumentInput["kind"],
          clientId: old.clientId,
          title: merged.title,
          category: merged.category,
          matterId: merged.matterId,
          documentId: merged.documentId,
          responsibleId: merged.responsibleId,
          referenceNumber: merged.referenceNumber,
          partyOne: merged.partyOne,
          partyTwo: merged.partyTwo,
          agent: merged.agent,
          issuingAuthority: merged.issuingAuthority,
          issuedAt: merged.issuedAt,
          startsAt: merged.startsAt,
          endsAt: merged.endsAt,
          renewalAt: merged.renewalAt,
          amountMinor: merged.amountMinor?.toString() ?? null,
          currency: merged.currency,
          terms: merged.terms,
          notes: merged.notes,
          confidentiality:
            merged.confidentiality as InstrumentInput["confidentiality"],
          reminderDays: merged.reminderDays,
        },
        old,
      );
      const { version, ...patch } = input;
      const statusOnly =
        Object.keys(input).every((k) => k === "version" || k === "status") &&
        input.status !== "DRAFT";
      const d = await tx.legalInstrument.update({
        where: { id, version },
        data: {
          ...patch,
          currencyDecimals,
          status: input.status ?? "DRAFT",
          approvedBy: statusOnly ? old.approvedBy : null,
          approvedAt: statusOnly ? old.approvedAt : null,
          documentVersionId: statusOnly ? old.documentVersionId : null,
          version: { increment: 1 },
        },
      });
      if (old.responsibleId !== d.responsibleId)
        await tx.instrumentObligation.updateMany({
          where: { instrumentId: id, status: { in: ["TODO", "IN_PROGRESS"] } },
          data: { assignedTo: d.responsibleId, version: { increment: 1 } },
        });
      await this.reschedule(
        tx,
        d,
        (await tx.tenant.findUniqueOrThrow({ where: { id: actor.tenantId } }))
          .timezone,
      );
      await this.event(tx, actor, id, "instrument.updated", {
        before: json(old),
        after: json(d),
      });
      return d;
    });
  }
  approve(actor: Actor, id: string, version: number) {
    return this.run(actor, "instruments:approve", true, async (tx) => {
      const old = await this.item(tx, id);
      if (old.version !== version) throw new ConflictException("STALE_VERSION");
      if (old.status !== "DRAFT")
        throw new ConflictException("INSTRUMENT_NOT_DRAFT");
      const responsible = await tx.membership.findFirst({
        where: { id: old.responsibleId, active: true },
        include: { role: true },
      });
      if (
        !responsible ||
        !responsible.role.permissions.includes("instruments:read") ||
        !responsible.role.permissions.includes("clients:read")
      )
        throw new BadRequestException("INVALID_RESPONSIBLE");
      if (
        !(await tx.client.findFirst({
          where: { id: old.clientId, archived: false },
        }))
      )
        throw new ConflictException("CLIENT_ARCHIVED");
      let documentVersionId: string | null = null;
      if (old.documentId) {
        const d = await tx.legalDocument.findFirst({
          where: { id: old.documentId, status: "APPROVED" },
        });
        if (!d || d.approvedVersion !== d.currentVersion)
          throw new ConflictException("REVIEW_REQUIRED");
        const file = await tx.documentVersion.findFirst({
          where: {
            documentId: d.id,
            version: d.approvedVersion!,
            state: "READY",
            requiresReview: false,
          },
        });
        if (!file) throw new ConflictException("REVIEW_REQUIRED");
        documentVersionId = file.id;
      }
      const d = await tx.legalInstrument.update({
        where: { id, version },
        data: {
          status: "ACTIVE",
          approvedBy: actor.membershipId,
          approvedAt: new Date(),
          documentVersionId,
          version: { increment: 1 },
        },
      });
      await this.reschedule(
        tx,
        d,
        (await tx.tenant.findUniqueOrThrow({ where: { id: actor.tenantId } }))
          .timezone,
      );
      await this.event(tx, actor, id, "instrument.approved", {
        version: d.version,
      });
      return d;
    });
  }
  obligation(
    actor: Actor,
    id: string,
    input: z.infer<typeof obligationSchema>,
  ) {
    return this.run(actor, "instruments:manage", true, async (tx) => {
      const d = await this.item(tx, id);
      if (["CANCELLED", "ARCHIVED", "CLOSED"].includes(d.status))
        throw new ConflictException("INSTRUMENT_CLOSED");
      const o = await tx.instrumentObligation.create({
        data: {
          ...input,
          tenantId: actor.tenantId,
          instrumentId: id,
          assignedTo: d.responsibleId,
          currency: d.currency,
          currencyDecimals: d.currencyDecimals,
        },
      });
      await this.scheduleObligation(tx, d, o);
      await this.event(tx, actor, id, "instrument.obligation_created", {
        id: o.id,
      });
      return o;
    });
  }
  updateObligation(
    actor: Actor,
    id: string,
    obligationId: string,
    input: z.infer<typeof obligationPatchSchema>,
  ) {
    return this.run(actor, "instruments:manage", true, async (tx) => {
      const d = await this.item(tx, id),
        old = await tx.instrumentObligation.findFirst({
          where: { id: obligationId, instrumentId: id },
        });
      if (!old) throw new NotFoundException("NOT_FOUND");
      if (old.version !== input.version)
        throw new ConflictException("STALE_VERSION");
      const { version, ...patch } = input;
      const o = await tx.instrumentObligation.update({
        where: { id: obligationId, version },
        data: {
          ...patch,
          completedAt: input.status === "DONE" ? new Date() : null,
          version: { increment: 1 },
        },
      });
      await this.scheduleObligation(tx, d, o);
      await this.event(tx, actor, id, "instrument.obligation_updated", {
        before: json(old),
        after: json(o),
      });
      return o;
    });
  }
  notifications(actor: Actor) {
    return this.run(actor, "instruments:read", false, (tx) =>
      tx.instrumentReminder.findMany({
        where: {
          memberId: actor.membershipId,
          dueAt: { lte: new Date() },
          readAt: null,
          cancelledAt: null,
        },
        include: {
          instrument: { select: { id: true, title: true, reference: true } },
        },
        orderBy: { dueAt: "desc" },
        take: 100,
      }),
    );
  }
  read(actor: Actor, id: string) {
    return this.run(actor, "instruments:read", true, async (tx) => {
      const r = await tx.instrumentReminder.updateMany({
        where: { id, memberId: actor.membershipId, cancelledAt: null },
        data: { readAt: new Date() },
      });
      if (!r.count) throw new NotFoundException("NOT_FOUND");
      return { ok: true };
    });
  }
}
