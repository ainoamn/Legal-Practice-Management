import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { inTenant, type Tx } from "../../../../packages/database/src/index.js";
import {
  canDelegate,
  pageSchema,
  type Permission,
  type MemberInput,
  type MemberPatch,
  type RoleInput,
  tenantPatchSchema,
} from "../../../../packages/contracts/src/index.js";
import { type Actor, parse } from "../security.js";
import { hashPassword } from "../auth/password.js";
import type { z } from "zod";
type Member = Awaited<ReturnType<WorkspaceService["actorMember"]>>;
@Injectable()
export class WorkspaceService {
  async actorMember(tx: Tx, actor: Actor) {
    return tx.membership.findFirstOrThrow({
      where: { id: actor.membershipId, tenantId: actor.tenantId, active: true },
      include: { role: true },
    });
  }
  async run<T>(
    actor: Actor,
    permission: Permission,
    write: boolean,
    work: (tx: Tx, member: Member) => Promise<T>,
  ) {
    return inTenant(actor.tenantId, async (tx) => {
      if (write)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.tenantId}, 0))`;
      const member = await this.actorMember(tx, actor);
      await tx.$executeRaw`SELECT set_config('app.member_id', ${member.id}, true)`;
      if (write) {
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: actor.tenantId },
        });
        const subscription = await tx.subscription.findUnique({
          where: { tenantId: actor.tenantId },
        });
        if (
          tenant.accessStatus !== "ACTIVE" ||
          (subscription &&
            (!["ACTIVE", "TRIAL"].includes(subscription.status) ||
              subscription.currentPeriodEnd <= new Date()))
        )
          throw new ForbiddenException("TENANT_READ_ONLY");
      }
      if (!member.role.permissions.includes(permission))
        throw new ForbiddenException("FORBIDDEN");
      return work(tx, member);
    });
  }
  async audit(tx: Tx, actor: Actor, action: string, resourceId?: string) {
    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        action,
        resourceId,
      },
    });
  }
  async current(actor: Actor) {
    return this.run(actor, "workspace:read", false, async (tx) => ({
      tenant: await tx.tenant.findUniqueOrThrow({
        where: { id: actor.tenantId },
      }),
      branches: await tx.branch.findMany({
        where: { tenantId: actor.tenantId },
      }),
    }));
  }
  async updateTenant(actor: Actor, input: z.infer<typeof tenantPatchSchema>) {
    return this.run(actor, "workspace:manage", true, async (tx) => {
      const result = await tx.tenant.update({
        where: { id: actor.tenantId },
        data: input,
      });
      await this.audit(tx, actor, "office.updated", actor.tenantId);
      return result;
    });
  }
  async users(actor: Actor, query: unknown) {
    const p = parse(pageSchema, query);
    return this.run(actor, "team:read", false, async (tx) => {
      const where = {
        tenantId: actor.tenantId,
        ...(p.search
          ? {
              user: {
                OR: [
                  {
                    fullName: {
                      contains: p.search,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    email: { contains: p.search, mode: "insensitive" as const },
                  },
                ],
              },
            }
          : {}),
      };
      const items = await tx.membership.findMany({
        where,
        select: {
          id: true,
          active: true,
          createdAt: true,
          user: { select: { id: true, fullName: true, email: true } },
          role: true,
          branch: true,
        },
        orderBy:
          p.sort === "name"
            ? { user: { fullName: p.direction } }
            : { createdAt: p.direction },
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
      });
      const total = await tx.membership.count({ where });
      return { items, total, page: p.page, pageSize: p.pageSize };
    });
  }
  async createUser(actor: Actor, input: MemberInput) {
    const passwordHash = await hashPassword(input.password);
    return this.run(actor, "team:manage", true, async (tx, member) => {
      const subscription = await tx.subscription.findUnique({
        where: { tenantId: actor.tenantId },
        include: { plan: true },
      });
      if (
        subscription &&
        (await tx.membership.count({
          where: { tenantId: actor.tenantId, active: true },
        })) >= subscription.plan.maxUsers
      )
        throw new ForbiddenException("USER_QUOTA_EXCEEDED");
      const role = await tx.role.findFirst({
        where: { id: input.roleId, tenantId: actor.tenantId },
      });
      const branch = await tx.branch.findFirst({
        where: { id: input.branchId, tenantId: actor.tenantId },
      });
      if (!role || !branch) throw new NotFoundException("NOT_FOUND");
      if (
        role.key === "OWNER" ||
        !canDelegate(member.role.permissions, role.permissions)
      )
        throw new ForbiddenException("CANNOT_DELEGATE");
      if (await tx.user.findUnique({ where: { email: input.email } }))
        throw new ConflictException("INVITATION_REQUIRED");
      const user = await tx.user.create({
        data: { email: input.email, fullName: input.fullName, passwordHash },
      });
      const result = await tx.membership.create({
        data: {
          tenantId: actor.tenantId,
          userId: user.id,
          roleId: role.id,
          branchId: branch.id,
        },
        select: { id: true },
      });
      await this.audit(tx, actor, "member.created", result.id);
      return result;
    });
  }
  async updateUser(actor: Actor, id: string, input: MemberPatch) {
    return this.run(actor, "team:manage", true, async (tx, member) => {
      const target = await tx.membership.findFirst({
        where: { id, tenantId: actor.tenantId },
        include: { role: true },
      });
      if (!target) throw new NotFoundException("NOT_FOUND");
      if (input.active && !target.active) {
        const subscription = await tx.subscription.findUnique({
          where: { tenantId: actor.tenantId },
          include: { plan: true },
        });
        if (
          subscription &&
          (await tx.membership.count({
            where: { tenantId: actor.tenantId, active: true },
          })) >= subscription.plan.maxUsers
        )
          throw new ForbiddenException("USER_QUOTA_EXCEEDED");
      }
      if (
        target.id === member.id ||
        target.role.key === "OWNER" ||
        !canDelegate(member.role.permissions, target.role.permissions)
      )
        throw new ForbiddenException("PROTECTED_MEMBER");
      if (input.roleId) {
        const role = await tx.role.findFirst({
          where: { id: input.roleId, tenantId: actor.tenantId },
        });
        if (!role) throw new NotFoundException("NOT_FOUND");
        if (
          role.key === "OWNER" ||
          !canDelegate(member.role.permissions, role.permissions)
        )
          throw new ForbiddenException("CANNOT_DELEGATE");
      }
      if (
        input.branchId &&
        !(await tx.branch.findFirst({
          where: { id: input.branchId, tenantId: actor.tenantId },
        }))
      )
        throw new NotFoundException("NOT_FOUND");
      await tx.membership.update({ where: { id }, data: input });
      await this.audit(tx, actor, "member.updated", id);
      return { ok: true };
    });
  }
  async roles(actor: Actor) {
    return this.run(actor, "roles:read", false, (tx) =>
      tx.role.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: { createdAt: "asc" },
      }),
    );
  }
  async saveRole(actor: Actor, input: RoleInput, id?: string) {
    return this.run(actor, "roles:manage", true, async (tx, member) => {
      if (
        input.key === "CLIENT" &&
        input.permissions.some(
          (p) => !["workspace:read", "portal:read"].includes(p),
        )
      )
        throw new ForbiddenException("CANNOT_DELEGATE");
      if (
        input.key === "OWNER" ||
        !canDelegate(member.role.permissions, input.permissions)
      )
        throw new ForbiddenException("CANNOT_DELEGATE");
      if (id) {
        const target = await tx.role.findFirst({
          where: { id, tenantId: actor.tenantId },
        });
        if (!target) throw new NotFoundException("NOT_FOUND");
        if (target.key === "CLIENT" && input.key !== "CLIENT")
          throw new ForbiddenException("PROTECTED_ROLE");
        if (
          target.key === "OWNER" ||
          target.id === member.roleId ||
          !canDelegate(member.role.permissions, target.permissions)
        )
          throw new ForbiddenException("PROTECTED_ROLE");
      }
      const result = id
        ? await tx.role.update({ where: { id }, data: input })
        : await tx.role.create({
            data: { tenantId: actor.tenantId, ...input },
          });
      await this.audit(
        tx,
        actor,
        id ? "role.updated" : "role.created",
        result.id,
      );
      return result;
    });
  }
  async logs(actor: Actor, query: unknown) {
    const p = parse(pageSchema, query);
    return this.run(actor, "audit:read", false, async (tx) => ({
      items: await tx.auditLog.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: { createdAt: "desc" },
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
      }),
      total: await tx.auditLog.count({ where: { tenantId: actor.tenantId } }),
      page: p.page,
      pageSize: p.pageSize,
    }));
  }
  async dashboard(actor: Actor) {
    return this.run(actor, "workspace:read", false, async (tx, member) => ({
      activeMembers: member.role.permissions.includes("team:read")
        ? await tx.membership.count({
            where: { tenantId: actor.tenantId, active: true },
          })
        : null,
      branches: await tx.branch.count({ where: { tenantId: actor.tenantId } }),
      roles: member.role.permissions.includes("roles:read")
        ? await tx.role.count({ where: { tenantId: actor.tenantId } })
        : null,
    }));
  }
}
