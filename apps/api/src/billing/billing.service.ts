import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { WorkspaceService } from "../workspace/workspace.service.js";
import type { Actor } from "../security.js";
import { TRIAL_MS } from "./trial.js";

@Injectable()
export class BillingService {
  constructor(@Inject(WorkspaceService) private readonly workspace: WorkspaceService) {}

  subscription(actor: Actor) {
    return this.workspace.run(actor, "workspace:read", false, async (tx) => {
      const row = await tx.subscription.findUnique({
        where: { tenantId: actor.tenantId },
        include: { plan: true },
      });
      return { subscription: row };
    });
  }

  startTrial(actor: Actor, planId: string) {
    return this.workspace.run(actor, "workspace:manage", true, async (tx) => {
      const existing = await tx.subscription.findUnique({
        where: { tenantId: actor.tenantId },
      });
      if (existing) throw new ConflictException("TRIAL_ALREADY_USED");
      const plan = await tx.plan.findFirst({
        where: { id: planId, active: true },
      });
      if (!plan) throw new BadRequestException("INACTIVE_PLAN");
      const [members, matters, branches] = await Promise.all([
        tx.membership.count({ where: { active: true } }),
        tx.matter.count(),
        tx.branch.count(),
      ]);
      if (members > plan.maxUsers)
        throw new BadRequestException("WOULD_EXCEED_USER_QUOTA");
      if (matters > plan.maxMatters || branches > plan.maxBranches)
        throw new BadRequestException("WOULD_EXCEED_PLAN_LIMITS");
      const storage = await tx.documentVersion.aggregate({ _sum: { size: true } });
      if (BigInt(storage._sum.size ?? 0) > BigInt(plan.maxStorageMiB) * 1048576n)
        throw new BadRequestException("WOULD_EXCEED_PLAN_LIMITS");
      const result = await tx.subscription.create({
        data: {
          tenantId: actor.tenantId,
          planId: plan.id,
          status: "TRIAL",
          currentPeriodEnd: new Date(Date.now() + TRIAL_MS),
        },
      });
      await this.workspace.audit(tx, actor, "subscription.trial_started", result.id);
      return result;
    });
  }

  checkout() {
    throw new HttpException("PAYMENT_UNAVAILABLE", 503);
  }
}
