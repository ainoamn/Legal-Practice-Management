import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import type { z } from "zod";
import type { Prisma } from "../../../../packages/database/generated/client.js";
import type { Tx } from "../../../../packages/database/src/index.js";
import { WorkspaceService } from "../workspace/workspace.service.js";
import { parse, type Actor } from "../security.js";
import {
  practiceQuery,
  calendarQuery,
  type ClientInput,
  type MatterInput,
  type HearingInput,
  type TaskInput,
  type clientPatchSchema,
  type matterPatchSchema,
  type courtSchema,
  type assignmentSchema,
  type partySchema,
  type hearingPatchSchema,
  type taskPatchSchema,
} from "../../../../packages/contracts/src/practice.js";

@Injectable()
export class PracticeService {
  constructor(
    @Inject(WorkspaceService) private readonly workspace: WorkspaceService,
  ) {}
  async matter(tx: Tx, id: string) {
    const record = await tx.matter.findFirst({ where: { id } });
    if (!record) throw new NotFoundException("NOT_FOUND");
    return record;
  }
  async branch(tx: Tx, actor: Actor, id: string) {
    if (!(await tx.branch.findFirst({ where: { id } })))
      throw new NotFoundException("NOT_FOUND");
    const member = await this.workspace.actorMember(tx, actor);
    if (
      id !== member.branchId &&
      !member.role.permissions.includes("matters:read:all")
    )
      throw new ForbiddenException("BRANCH_FORBIDDEN");
  }
  async assigned(tx: Tx, matterId: string, memberId: string) {
    const assignment = await tx.matterAssignment.findFirst({
      where: { matterId, memberId },
      include: { matter: true },
    });
    const member = await tx.membership.findFirst({
      where: { id: memberId, active: true },
      include: { role: true },
    });
    if (
      !assignment ||
      !member ||
      !member.role.permissions.includes("matters:read")
    )
      throw new BadRequestException("ASSIGNEE_NOT_ON_MATTER");
  }
  async event(
    tx: Tx,
    actor: Actor,
    matterId: string,
    action: string,
    details?: Prisma.InputJsonValue,
  ) {
    await tx.matterEvent.create({
      data: {
        tenantId: actor.tenantId,
        matterId,
        actorId: actor.membershipId,
        action,
        ...(details ? { details } : {}),
      },
    });
    await this.workspace.audit(tx, actor, action, matterId);
  }
  clients(actor: Actor, query: unknown) {
    const p = parse(practiceQuery, query);
    return this.workspace.run(actor, "clients:read", false, async (tx) => {
      const where: Prisma.ClientWhereInput = {
        archived: false,
        ...(p.branchId ? { branchId: p.branchId } : {}),
        ...(p.search
          ? {
              OR: [
                "name",
                "identityNumber",
                "registrationNumber",
                "phone",
                "email",
              ].map((key) => ({
                [key]: { contains: p.search, mode: "insensitive" },
              })),
            }
          : {}),
      };
      return {
        items: await tx.client.findMany({
          where,
          orderBy:
            p.sort === "name"
              ? { name: p.direction }
              : { createdAt: p.direction },
          skip: (p.page - 1) * p.pageSize,
          take: p.pageSize,
        }),
        total: await tx.client.count({ where }),
        page: p.page,
        pageSize: p.pageSize,
      };
    });
  }
  saveClient(
    actor: Actor,
    input: ClientInput | z.infer<typeof clientPatchSchema>,
    id?: string,
  ) {
    return this.workspace.run(actor, "clients:manage", true, async (tx) => {
      if (input.branchId) await this.branch(tx, actor, input.branchId);
      if (id && !(await tx.client.findFirst({ where: { id } })))
        throw new NotFoundException("NOT_FOUND");
      const result = id
        ? await tx.client.update({ where: { id }, data: input })
        : await tx.client.create({
            data: {
              ...(input as ClientInput),
              tenantId: actor.tenantId,
              createdBy: actor.membershipId,
            },
          });
      await this.workspace.audit(
        tx,
        actor,
        id ? "client.updated" : "client.created",
        result.id,
      );
      return result;
    });
  }
  clientDetail(actor: Actor, id: string) {
    return this.workspace.run(actor, "clients:read", false, async (tx) => {
      const item = await tx.client.findFirst({
        where: { id },
        include: { matters: { orderBy: { updatedAt: "desc" } } },
      });
      if (!item) throw new NotFoundException("NOT_FOUND");
      return item;
    });
  }
  courts(actor: Actor) {
    return this.workspace.run(actor, "matters:read", false, (tx) =>
      tx.court.findMany({ orderBy: { name: "asc" } }),
    );
  }
  createCourt(actor: Actor, input: z.infer<typeof courtSchema>) {
    return this.workspace.run(actor, "courts:manage", true, async (tx) => {
      if (
        !(await tx.country.findUnique({ where: { code: input.countryCode } }))
      )
        throw new BadRequestException("INVALID_COUNTRY");
      const result = await tx.court.create({
        data: { ...input, tenantId: actor.tenantId },
      });
      await this.workspace.audit(tx, actor, "court.created", result.id);
      return result;
    });
  }
  matters(actor: Actor, query: unknown) {
    const p = parse(practiceQuery, query);
    return this.workspace.run(actor, "matters:read", false, async (tx) => {
      const where: Prisma.MatterWhereInput = {
        ...(p.clientId ? { clientId: p.clientId } : {}),
        ...(p.status ? { status: p.status } : {}),
        ...(p.branchId ? { branchId: p.branchId } : {}),
        ...(p.search
          ? {
              OR: ["title", "reference", "courtNumber"].map((key) => ({
                [key]: { contains: p.search, mode: "insensitive" },
              })),
            }
          : {}),
      };
      return {
        items: await tx.matter.findMany({
          where,
          include: {
            client: { select: { id: true, name: true } },
            court: true,
            assignments: true,
          },
          orderBy: { createdAt: p.direction },
          skip: (p.page - 1) * p.pageSize,
          take: p.pageSize,
        }),
        total: await tx.matter.count({ where }),
        page: p.page,
        pageSize: p.pageSize,
      };
    });
  }
  createMatter(actor: Actor, input: MatterInput) {
    return this.workspace.run(actor, "matters:manage", true, async (tx) => {
      await this.branch(tx, actor, input.branchId);
      const client = await tx.client.findFirst({
        where: { id: input.clientId, archived: false },
      });
      if (
        !client ||
        (input.courtId &&
          !(await tx.court.findFirst({ where: { id: input.courtId } })))
      )
        throw new NotFoundException("NOT_FOUND");
      const country = await tx.country.findUnique({
        where: { code: input.countryCode },
      });
      if (!country) throw new BadRequestException("INVALID_COUNTRY");
      const subscription = await tx.subscription.findUnique({
        where: { tenantId: actor.tenantId },
        include: { plan: true },
      });
      // Count all tenant matters, including records hidden from the creator, through a narrow SQL function.
      const counts = await tx.$queryRaw<
        { count: number; sequence: number }[]
      >`SELECT * FROM practice_matter_counters()`;
      if (!counts[0]) throw new ForbiddenException("FORBIDDEN");
      if (subscription && counts[0].count >= subscription.plan.maxMatters)
        throw new ForbiddenException("MATTER_QUOTA_EXCEEDED");
      const sequence = counts[0].sequence + 1;
      const result = await tx.matter.create({
        data: {
          ...input,
          tenantId: actor.tenantId,
          createdBy: actor.membershipId,
          sequence,
          reference: `${new Date().getUTCFullYear()}-${String(sequence).padStart(6, "0")}`,
        },
      });
      await tx.matterAssignment.create({
        data: {
          tenantId: actor.tenantId,
          matterId: result.id,
          memberId: actor.membershipId,
          lead: true,
        },
      });
      await this.event(tx, actor, result.id, "matter.created");
      return result;
    });
  }
  updateMatter(
    actor: Actor,
    id: string,
    input: z.infer<typeof matterPatchSchema>,
  ) {
    return this.workspace.run(actor, "matters:manage", true, async (tx) => {
      const old = await this.matter(tx, id);
      if (old.version !== input.version)
        throw new ConflictException("STALE_VERSION");
      if (input.branchId) await this.branch(tx, actor, input.branchId);
      if (
        input.clientId &&
        !(await tx.client.findFirst({
          where: { id: input.clientId, archived: false },
        }))
      )
        throw new NotFoundException("NOT_FOUND");
      if (
        input.courtId &&
        !(await tx.court.findFirst({ where: { id: input.courtId } }))
      )
        throw new NotFoundException("NOT_FOUND");
      const { version, ...patch } = input;
      const result = await tx.matter.update({
        where: { id, version },
        data: { ...patch, version: { increment: 1 } },
      });
      await this.event(tx, actor, id, "matter.updated", {
        before: JSON.parse(JSON.stringify(old)),
        after: JSON.parse(JSON.stringify(result)),
      });
      return result;
    });
  }
  detail(actor: Actor, id: string) {
    return this.workspace.run(actor, "matters:read", false, async (tx) => {
      await this.matter(tx, id);
      return tx.matter.findUniqueOrThrow({
        where: { id },
        include: {
          client: true,
          court: true,
          assignments: true,
          parties: true,
          hearings: { orderBy: { startsAt: "desc" } },
          tasks: { orderBy: { dueAt: "asc" } },
          notes: { orderBy: { createdAt: "desc" } },
          events: { orderBy: { createdAt: "desc" }, take: 100 },
        },
      });
    });
  }
  assign(actor: Actor, id: string, input: z.infer<typeof assignmentSchema>) {
    return this.workspace.run(actor, "matters:assign", true, async (tx) => {
      await this.matter(tx, id);
      const members = await tx.membership.findMany({
        where: { id: { in: input.memberIds }, active: true },
        include: { role: true },
      });
      if (
        members.length !== input.memberIds.length ||
        members.some((m) => !m.role.permissions.includes("matters:read"))
      )
        throw new BadRequestException("INVALID_ASSIGNEES");
      await tx.matterAssignment.deleteMany({ where: { matterId: id } });
      await tx.matterAssignment.createMany({
        data: input.memberIds.map((memberId) => ({
          tenantId: actor.tenantId,
          matterId: id,
          memberId,
          lead: memberId === input.leadId,
        })),
      });
      await this.event(tx, actor, id, "matter.assigned", input);
      return { ok: true };
    });
  }
  addParty(actor: Actor, id: string, input: z.infer<typeof partySchema>) {
    return this.workspace.run(actor, "matters:manage", true, async (tx) => {
      await this.matter(tx, id);
      const result = await tx.matterParty.create({
        data: { ...input, tenantId: actor.tenantId, matterId: id },
      });
      await this.event(tx, actor, id, "party.created", { id: result.id });
      return result;
    });
  }
  addNote(actor: Actor, id: string, body: string) {
    return this.workspace.run(actor, "matters:manage", true, async (tx) => {
      await this.matter(tx, id);
      const result = await tx.matterNote.create({
        data: {
          tenantId: actor.tenantId,
          matterId: id,
          authorId: actor.membershipId,
          body,
        },
      });
      await this.event(tx, actor, id, "note.created", { id: result.id });
      return result;
    });
  }
  conflicts(actor: Actor, query: unknown) {
    const p = parse(practiceQuery, query);
    if (p.search.length < 2) throw new BadRequestException("SEARCH_REQUIRED");
    return this.workspace.run(actor, "conflicts:read", false, async (tx) => ({
      clients: await tx.client.findMany({
        where: {
          OR: [
            { name: { contains: p.search, mode: "insensitive" } },
            { identityNumber: p.search },
            { registrationNumber: p.search },
          ],
        },
        select: { id: true, name: true, kind: true },
        take: 50,
      }),
      parties: await tx.matterParty.findMany({
        where: {
          OR: [
            { name: { contains: p.search, mode: "insensitive" } },
            { identityNumber: p.search },
          ],
        },
        select: { id: true, name: true, kind: true, matterId: true },
        take: 50,
      }),
      scope: "AUTHORIZED_RECORDS_ONLY",
    }));
  }
  createHearing(actor: Actor, input: HearingInput) {
    return this.workspace.run(actor, "hearings:manage", true, async (tx) => {
      await this.matter(tx, input.matterId);
      await this.assigned(tx, input.matterId, input.responsibleId);
      const overlapping = await tx.$queryRaw<
        { conflict: boolean }[]
      >`SELECT practice_hearing_conflict(${input.responsibleId}::uuid,${input.startsAt}::timestamptz,${input.endsAt}::timestamptz) AS conflict`;
      if (overlapping[0]?.conflict)
        throw new ConflictException("HEARING_TIME_CONFLICT");
      const { reminderMinutes, createPreparationTask, ...data } = input;
      const result = await tx.hearing.create({
        data: { ...data, tenantId: actor.tenantId },
      });
      const times = new Set([0, ...reminderMinutes]);
      await tx.hearingReminder.createMany({
        data: [...times].map((minutes) => ({
          tenantId: actor.tenantId,
          hearingId: result.id,
          memberId: input.responsibleId,
          dueAt: new Date(input.startsAt.getTime() - minutes * 60000),
        })),
      });
      if (createPreparationTask)
        await tx.workTask.create({
          data: {
            tenantId: actor.tenantId,
            matterId: input.matterId,
            assignedTo: input.responsibleId,
            title: "تحضير الجلسة / Hearing preparation",
            description: input.preparation,
            dueAt: new Date(input.startsAt.getTime() - 86400000),
          },
        });
      await this.event(tx, actor, input.matterId, "hearing.created", {
        id: result.id,
        startsAt: input.startsAt.toISOString(),
      });
      return result;
    });
  }
  updateHearing(
    actor: Actor,
    id: string,
    input: z.infer<typeof hearingPatchSchema>,
  ) {
    return this.workspace.run(actor, "hearings:manage", true, async (tx) => {
      const old = await tx.hearing.findFirst({ where: { id } });
      if (!old) throw new NotFoundException("NOT_FOUND");
      const result = await tx.hearing.update({ where: { id }, data: input });
      await this.event(tx, actor, old.matterId, "hearing.updated", {
        id,
        before: old.status,
        after: input.status,
      });
      return result;
    });
  }
  hearings(actor: Actor, query: unknown) {
    const p = parse(practiceQuery, query);
    return this.workspace.run(actor, "matters:read", false, async (tx) => {
      const where: Prisma.HearingWhereInput = {
        ...(p.matterId ? { matterId: p.matterId } : {}),
        ...(p.memberId ? { responsibleId: p.memberId } : {}),
        ...(p.status ? { status: p.status } : {}),
        ...(p.from || p.to ? { startsAt: { gte: p.from, lt: p.to } } : {}),
      };
      return {
        items: await tx.hearing.findMany({
          where,
          include: {
            matter: {
              select: { id: true, title: true, reference: true, court: true },
            },
          },
          orderBy: { startsAt: "asc" },
          skip: (p.page - 1) * p.pageSize,
          take: p.pageSize,
        }),
        total: await tx.hearing.count({ where }),
        page: p.page,
        pageSize: p.pageSize,
      };
    });
  }
  calendar(actor: Actor, query: unknown) {
    const p = parse(calendarQuery, query);
    return this.workspace.run(actor, "matters:read", false, async (tx) => {
      const matterSearch: Prisma.MatterWhereInput = p.search
        ? {
            OR: [
              { title: { contains: p.search, mode: "insensitive" } },
              { reference: { contains: p.search, mode: "insensitive" } },
            ],
          }
        : {};
      const hearingWhere: Prisma.HearingWhereInput = {
        startsAt: { lt: p.to },
        endsAt: { gt: p.from },
        ...(p.memberId ? { responsibleId: p.memberId } : {}),
        matter: matterSearch,
      };
      const taskWhere: Prisma.WorkTaskWhereInput = {
        dueAt: { gte: p.from, lt: p.to },
        ...(p.memberId ? { assignedTo: p.memberId } : {}),
        ...(p.search
          ? {
              OR: [
                { title: { contains: p.search, mode: "insensitive" } },
                { matter: matterSearch },
              ],
            }
          : {}),
      };
      const matter = {
        select: { id: true, title: true, reference: true },
      } as const;
      const result = {
        from: p.from,
        to: p.to,
        hearings: await tx.hearing.findMany({
          where: hearingWhere,
          select: {
            id: true,
            matterId: true,
            startsAt: true,
            endsAt: true,
            status: true,
            room: true,
            responsibleId: true,
            matter,
          },
          orderBy: [{ startsAt: "asc" }, { id: "asc" }],
          take: 2001,
        }),
        tasks: await tx.workTask.findMany({
          where: taskWhere,
          select: {
            id: true,
            matterId: true,
            title: true,
            status: true,
            priority: true,
            dueAt: true,
            assignedTo: true,
            matter,
          },
          orderBy: [{ dueAt: "asc" }, { id: "asc" }],
          take: 2001,
        }),
      };
      if (result.hearings.length + result.tasks.length > 2000)
        throw new BadRequestException("CALENDAR_WINDOW_TOO_BUSY");
      return result;
    });
  }
  tasks(actor: Actor, query: unknown) {
    const p = parse(practiceQuery, query);
    return this.workspace.run(actor, "matters:read", false, async (tx) => {
      const where: Prisma.WorkTaskWhereInput = {
        ...(p.matterId ? { matterId: p.matterId } : {}),
        ...(p.memberId ? { assignedTo: p.memberId } : {}),
        ...(p.status ? { status: p.status } : {}),
        ...(p.search
          ? { title: { contains: p.search, mode: "insensitive" } }
          : {}),
      };
      return {
        items: await tx.workTask.findMany({
          where,
          orderBy: { dueAt: "asc" },
          skip: (p.page - 1) * p.pageSize,
          take: p.pageSize,
        }),
        total: await tx.workTask.count({ where }),
        page: p.page,
        pageSize: p.pageSize,
      };
    });
  }
  createTask(actor: Actor, input: TaskInput) {
    return this.workspace.run(actor, "tasks:manage", true, async (tx) => {
      await this.matter(tx, input.matterId);
      await this.assigned(tx, input.matterId, input.assignedTo);
      const result = await tx.workTask.create({
        data: { ...input, tenantId: actor.tenantId },
      });
      await this.event(tx, actor, input.matterId, "task.created", {
        id: result.id,
      });
      return result;
    });
  }
  updateTask(actor: Actor, id: string, input: z.infer<typeof taskPatchSchema>) {
    return this.workspace.run(actor, "tasks:manage", true, async (tx) => {
      const old = await tx.workTask.findFirst({ where: { id } });
      if (!old) throw new NotFoundException("NOT_FOUND");
      const result = await tx.workTask.update({
        where: { id },
        data: {
          ...input,
          completedAt: input.status === "DONE" ? new Date() : null,
        },
      });
      await this.event(tx, actor, old.matterId, "task.updated", {
        id,
        before: old.status,
        after: input.status,
      });
      return result;
    });
  }
  notifications(actor: Actor) {
    return this.workspace.run(actor, "matters:read", false, (tx) =>
      tx.hearingReminder.findMany({
        where: {
          memberId: actor.membershipId,
          dueAt: { lte: new Date() },
          readAt: null,
          hearing: { status: { in: ["SCHEDULED", "CONFIRMED"] } },
        },
        include: {
          hearing: {
            include: { matter: { select: { id: true, title: true } } },
          },
        },
        orderBy: { dueAt: "desc" },
        take: 100,
      }),
    );
  }
  readNotification(actor: Actor, id: string) {
    return this.workspace.run(actor, "matters:read", true, async (tx) => {
      const result = await tx.hearingReminder.updateMany({
        where: { id, memberId: actor.membershipId },
        data: { readAt: new Date() },
      });
      if (!result.count) throw new NotFoundException("NOT_FOUND");
      return { ok: true };
    });
  }
  overview(actor: Actor) {
    return this.workspace.run(actor, "matters:read", false, async (tx) => ({
      matters: await tx.matter.count(),
      active: await tx.matter.count({
        where: { status: { notIn: ["CLOSED", "ARCHIVED"] } },
      }),
      clients: await tx.client.count({ where: { archived: false } }),
      overdueTasks: await tx.workTask.count({
        where: {
          dueAt: { lt: new Date() },
          status: { notIn: ["DONE", "CANCELLED"] },
        },
      }),
      byStatus: await tx.matter.groupBy({ by: ["status"], _count: true }),
      byCategory: await tx.matter.groupBy({ by: ["category"], _count: true }),
      upcomingHearings: await tx.hearing.findMany({
        where: {
          startsAt: { gte: new Date() },
          status: { in: ["SCHEDULED", "CONFIRMED"] },
        },
        include: { matter: { select: { id: true, title: true } } },
        orderBy: { startsAt: "asc" },
        take: 10,
      }),
    }));
  }
}
