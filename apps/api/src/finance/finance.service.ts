import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import type { z } from "zod";
import type { Tx } from "../../../../packages/database/src/index.js";
import { WorkspaceService } from "../workspace/workspace.service.js";
import { parse, type Actor } from "../security.js";
import { practiceQuery } from "../../../../packages/contracts/src/practice.js";
import type {
  officeInvoiceSchema,
  officeReceiptSchema,
  expenseSchema,
  trustSchema,
  feeSchema,
  timeEntrySchema,
  manualJournalSchema,
} from "../../../../packages/contracts/src/finance.js";
const chart = [
  ["1000", "النقد التشغيلي / Operating cash", "ASSET", "OPERATING"],
  ["1100", "الذمم المدينة / Receivables", "ASSET", "OPERATING"],
  ["2000", "ضرائب مستحقة / Tax payable", "LIABILITY", "OPERATING"],
  ["4000", "إيرادات / Revenue", "REVENUE", "OPERATING"],
  ["5000", "مصروفات / Expenses", "EXPENSE", "OPERATING"],
  ["1010", "بنك الأمانات / Client funds bank", "ASSET", "TRUST"],
  ["2010", "التزامات الأمانات / Client funds liability", "LIABILITY", "TRUST"],
] as const;
type Link = { clientId?: string | null; matterId?: string | null };
type Line = { code: string; debitMinor?: number; creditMinor?: number } & Link;
@Injectable()
export class FinanceService {
  constructor(
    @Inject(WorkspaceService) private readonly workspace: WorkspaceService,
  ) {}
  private async links(tx: Tx, input: Link) {
    if (
      input.clientId &&
      !(
        await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM "FinanceClientDirectory" WHERE id=${input.clientId}::uuid`
      )[0]
    )
      throw new NotFoundException("NOT_FOUND");
    if (input.matterId) {
      const m = (
        await tx.$queryRaw<
          { clientId: string }[]
        >`SELECT "clientId" FROM "FinanceMatterDirectory" WHERE id=${input.matterId}::uuid`
      )[0];
      if (!m) throw new NotFoundException("NOT_FOUND");
      if (input.clientId && input.clientId !== m.clientId)
        throw new BadRequestException("MATTER_CLIENT_MISMATCH");
    }
  }
  private async accounts(tx: Tx, tenantId: string) {
    await tx.ledgerAccount.createMany({
      data: chart.map(([code, name, kind, fund]) => ({
        tenantId,
        code,
        name,
        kind,
        fund,
      })),
      skipDuplicates: true,
    });
    return tx.ledgerAccount.findMany({ orderBy: { code: "asc" } });
  }
  initialize(actor: Actor) {
    return this.workspace.run(actor, "finance:manage", true, async (tx) => {
      const accounts = await this.accounts(tx, actor.tenantId);
      await this.workspace.audit(tx, actor, "finance.chart_initialized");
      return accounts;
    });
  }
  private async post(
    tx: Tx,
    actor: Actor,
    reference: string,
    description: string,
    fund: "OPERATING" | "TRUST",
    lines: Line[],
    clientId?: string,
  ) {
    const accounts = await this.accounts(tx, actor.tenantId);
    const entries = lines
      .filter((l) => (l.debitMinor ?? 0) + (l.creditMinor ?? 0) > 0)
      .map(({ code, ...l }) => {
        const a = accounts.find((v) => v.code === code && v.fund === fund);
        if (!a) throw new BadRequestException("INVALID_ACCOUNT");
        return {
          ...l,
          accountId: a.id,
          debitMinor: l.debitMinor ?? 0,
          creditMinor: l.creditMinor ?? 0,
        };
      });
    if (entries.reduce((s, l) => s + l.debitMinor - l.creditMinor, 0) !== 0)
      throw new BadRequestException("UNBALANCED_JOURNAL");
    return tx.journal.create({
      data: {
        tenantId: actor.tenantId,
        reference,
        description,
        fund,
        clientId,
        postedBy: actor.membershipId,
        lines: { create: entries },
      },
    });
  }
  directory(actor: Actor, query: unknown) {
    const p = parse(practiceQuery, query),
      term = `%${p.search}%`;
    return this.workspace.run(actor, "finance:read", false, async (tx) => ({
      clients: await tx.$queryRaw<
        { id: string; name: string }[]
      >`SELECT id,name FROM "FinanceClientDirectory" WHERE name ILIKE ${term} ORDER BY name LIMIT 200`,
      matters: await tx.$queryRaw<
        { id: string; reference: string; clientId: string }[]
      >`SELECT id,reference,"clientId" FROM "FinanceMatterDirectory" WHERE reference ILIKE ${term} ORDER BY reference LIMIT 200`,
      accounts: await tx.ledgerAccount.findMany({ orderBy: { code: "asc" } }),
    }));
  }
  invoices(actor: Actor, query: unknown) {
    const p = parse(practiceQuery, query);
    return this.workspace.run(actor, "finance:read", false, async (tx) => {
      const where = {
        ...(p.clientId ? { clientId: p.clientId } : {}),
        ...(p.matterId ? { matterId: p.matterId } : {}),
        ...(p.status ? { status: p.status } : {}),
        ...(p.search
          ? {
              description: { contains: p.search, mode: "insensitive" as const },
            }
          : {}),
      };
      const items = await tx.officeInvoice.findMany({
        where,
        include: { receipts: true },
        orderBy: { sequence: "desc" },
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
      });
      return {
        items: items.map((i) => {
          const paidMinor = i.receipts.reduce((s, r) => s + r.amountMinor, 0);
          return {
            ...i,
            paidMinor,
            outstandingMinor:
              i.status === "VOID" ? 0 : i.totalMinor - paidMinor,
            paymentStatus:
              i.status !== "ISSUED"
                ? i.status
                : paidMinor >= i.totalMinor
                  ? "PAID"
                  : i.dueAt < new Date()
                    ? "OVERDUE"
                    : paidMinor > 0
                      ? "PARTIAL"
                      : "ISSUED",
          };
        }),
        total: await tx.officeInvoice.count({ where }),
        page: p.page,
        pageSize: p.pageSize,
      };
    });
  }
  createInvoice(actor: Actor, input: z.infer<typeof officeInvoiceSchema>) {
    return this.workspace.run(actor, "finance:manage", true, async (tx) => {
      await this.links(tx, input);
      const netMinor =
          input.quantity * input.unitPriceMinor - input.discountMinor,
        taxMinor = Math.round((netMinor * input.taxBasisPoints) / 10000),
        totalMinor = netMinor + taxMinor;
      if (netMinor < 0 || totalMinor <= 0 || totalMinor > 2147483647)
        throw new BadRequestException("INVALID_AMOUNT");
      const max = await tx.officeInvoice.aggregate({
        _max: { sequence: true },
      });
      const result = await tx.officeInvoice.create({
        data: {
          ...input,
          tenantId: actor.tenantId,
          sequence: (max._max.sequence ?? 0) + 1,
          netMinor,
          taxMinor,
          totalMinor,
        },
      });
      await this.workspace.audit(
        tx,
        actor,
        "finance.invoice_created",
        result.id,
      );
      return result;
    });
  }
  issue(actor: Actor, id: string, clientVisible: boolean) {
    return this.workspace.run(actor, "finance:approve", true, async (tx) => {
      const i = await tx.officeInvoice.findFirst({ where: { id } });
      if (!i) throw new NotFoundException("NOT_FOUND");
      if (i.status !== "DRAFT")
        throw new ConflictException("INVOICE_NOT_DRAFT");
      const dim = { clientId: i.clientId, matterId: i.matterId };
      await this.post(tx, actor, `invoice:${id}`, i.description, "OPERATING", [
        { code: "1100", debitMinor: i.totalMinor, ...dim },
        { code: "4000", creditMinor: i.netMinor, ...dim },
        { code: "2000", creditMinor: i.taxMinor, ...dim },
      ]);
      await tx.officeInvoice.update({
        where: { id },
        data: { status: "ISSUED", issuedAt: new Date(), clientVisible },
      });
      await this.workspace.audit(tx, actor, "finance.invoice_issued", id);
      return { ok: true };
    });
  }
  voidDraft(actor: Actor, id: string) {
    return this.workspace.run(actor, "finance:approve", true, async (tx) => {
      const i = await tx.officeInvoice.findFirst({ where: { id } });
      if (!i) throw new NotFoundException("NOT_FOUND");
      if (i.status !== "DRAFT")
        throw new ConflictException("INVOICE_NOT_DRAFT");
      await tx.officeInvoice.update({
        where: { id },
        data: { status: "VOID" },
      });
      await this.workspace.audit(tx, actor, "finance.invoice_voided", id);
      return { ok: true };
    });
  }
  receipt(actor: Actor, input: z.infer<typeof officeReceiptSchema>) {
    return this.workspace.run(actor, "finance:manage", true, async (tx) => {
      const i = await tx.officeInvoice.findFirst({
        where: { id: input.invoiceId },
        include: { receipts: true },
      });
      if (!i) throw new NotFoundException("NOT_FOUND");
      if (i.status !== "ISSUED")
        throw new ConflictException("INVOICE_NOT_ISSUED");
      if (
        i.receipts.reduce((s, r) => s + r.amountMinor, 0) + input.amountMinor >
        i.totalMinor
      )
        throw new ConflictException("OVERPAYMENT");
      const r = await tx.officeReceipt.create({
          data: {
            ...input,
            tenantId: actor.tenantId,
            recordedBy: actor.membershipId,
          },
        }),
        dim = { clientId: i.clientId, matterId: i.matterId };
      await this.post(
        tx,
        actor,
        `receipt:${r.id}`,
        input.reference,
        "OPERATING",
        [
          { code: "1000", debitMinor: input.amountMinor, ...dim },
          { code: "1100", creditMinor: input.amountMinor, ...dim },
        ],
      );
      await this.workspace.audit(tx, actor, "finance.receipt_recorded", r.id);
      return r;
    });
  }
  expenses(actor: Actor, query: unknown) {
    const p = parse(practiceQuery, query);
    return this.workspace.run(actor, "finance:read", false, async (tx) => {
      const where = {
        ...(p.clientId ? { clientId: p.clientId } : {}),
        ...(p.matterId ? { matterId: p.matterId } : {}),
        ...(p.search
          ? {
              description: { contains: p.search, mode: "insensitive" as const },
            }
          : {}),
      };
      return {
        items: await tx.officeExpense.findMany({
          where,
          orderBy: { incurredAt: "desc" },
          skip: (p.page - 1) * p.pageSize,
          take: p.pageSize,
        }),
        total: await tx.officeExpense.count({ where }),
        page: p.page,
        pageSize: p.pageSize,
      };
    });
  }
  createExpense(actor: Actor, input: z.infer<typeof expenseSchema>) {
    return this.workspace.run(actor, "finance:manage", true, async (tx) => {
      await this.links(tx, input);
      const r = await tx.officeExpense.create({
        data: {
          ...input,
          tenantId: actor.tenantId,
          createdBy: actor.membershipId,
        },
      });
      await this.workspace.audit(tx, actor, "finance.expense_created", r.id);
      return r;
    });
  }
  approveExpense(actor: Actor, id: string) {
    return this.workspace.run(actor, "finance:approve", true, async (tx) => {
      const e = await tx.officeExpense.findFirst({ where: { id } });
      if (!e) throw new NotFoundException("NOT_FOUND");
      if (e.approvedAt) throw new ConflictException("ALREADY_APPROVED");
      const dim = { clientId: e.clientId, matterId: e.matterId };
      await this.post(tx, actor, `expense:${id}`, e.description, "OPERATING", [
        { code: "5000", debitMinor: e.amountMinor, ...dim },
        { code: "1000", creditMinor: e.amountMinor, ...dim },
      ]);
      await tx.officeExpense.update({
        where: { id },
        data: { approvedBy: actor.membershipId, approvedAt: new Date() },
      });
      await this.workspace.audit(tx, actor, "finance.expense_approved", id);
      return { ok: true };
    });
  }
  trust(actor: Actor, input: z.infer<typeof trustSchema>) {
    return this.workspace.run(actor, "finance:manage", true, async (tx) => {
      await this.links(tx, input);
      const accounts = await this.accounts(tx, actor.tenantId),
        bank = accounts.find((a) => a.code === "1010")!;
      const t = await tx.journalLine.aggregate({
        where: { accountId: bank.id, clientId: input.clientId },
        _sum: { debitMinor: true, creditMinor: true },
      });
      if (
        input.direction === "WITHDRAWAL" &&
        (t._sum.debitMinor ?? 0) - (t._sum.creditMinor ?? 0) < input.amountMinor
      )
        throw new ConflictException("INSUFFICIENT_CLIENT_FUNDS");
      const deposit = input.direction === "DEPOSIT";
      const r = await this.post(
        tx,
        actor,
        `trust:${input.reference}`,
        input.description,
        "TRUST",
        [
          {
            code: "1010",
            clientId: input.clientId,
            ...(deposit
              ? { debitMinor: input.amountMinor }
              : { creditMinor: input.amountMinor }),
          },
          {
            code: "2010",
            clientId: input.clientId,
            ...(deposit
              ? { creditMinor: input.amountMinor }
              : { debitMinor: input.amountMinor }),
          },
        ],
        input.clientId,
      );
      await this.workspace.audit(
        tx,
        actor,
        `finance.trust_${input.direction.toLowerCase()}`,
        r.id,
      );
      return r;
    });
  }
  fees(actor: Actor) {
    return this.workspace.run(actor, "finance:read", false, (tx) =>
      tx.feeAgreement.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    );
  }
  createFee(actor: Actor, input: z.infer<typeof feeSchema>) {
    return this.workspace.run(actor, "finance:manage", true, async (tx) => {
      await this.links(tx, input);
      if (
        input.documentId &&
        !(await tx.legalDocument.findFirst({
          where: { id: input.documentId, status: "APPROVED" },
        }))
      )
        throw new NotFoundException("NOT_FOUND");
      const r = await tx.feeAgreement.create({
        data: { ...input, tenantId: actor.tenantId },
      });
      await this.workspace.audit(tx, actor, "finance.fee_created", r.id);
      return r;
    });
  }
  time(actor: Actor) {
    return this.workspace.run(actor, "finance:read", false, (tx) =>
      tx.timeEntry.findMany({ orderBy: { workedAt: "desc" }, take: 100 }),
    );
  }
  createTime(actor: Actor, input: z.infer<typeof timeEntrySchema>) {
    return this.workspace.run(actor, "finance:manage", true, async (tx) => {
      await this.links(tx, input);
      if (
        !(await tx.membership.findFirst({
          where: { id: input.memberId, active: true },
        }))
      )
        throw new NotFoundException("NOT_FOUND");
      const amountMinor = Math.round(
        (input.minutes * input.hourlyRateMinor) / 60,
      );
      if (amountMinor > 2147483647)
        throw new BadRequestException("INVALID_AMOUNT");
      const r = await tx.timeEntry.create({
        data: { ...input, amountMinor, tenantId: actor.tenantId },
      });
      await this.workspace.audit(tx, actor, "finance.time_recorded", r.id);
      return r;
    });
  }
  journals(actor: Actor, query: unknown) {
    const p = parse(practiceQuery, query);
    return this.workspace.run(actor, "finance:read", false, async (tx) => ({
      items: await tx.journal.findMany({
        include: { lines: { include: { account: true } } },
        orderBy: { postedAt: "desc" },
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
      }),
      total: await tx.journal.count(),
      page: p.page,
      pageSize: p.pageSize,
    }));
  }
  manual(actor: Actor, input: z.infer<typeof manualJournalSchema>) {
    return this.workspace.run(actor, "finance:manage", true, async (tx) => {
      const accounts = await this.accounts(tx, actor.tenantId),
        lines: Line[] = [];
      for (const l of input.lines) {
        const a = accounts.find(
          (v) => v.id === l.accountId && v.fund === "OPERATING",
        );
        if (!a) throw new BadRequestException("OPERATING_ACCOUNTS_ONLY");
        await this.links(tx, l);
        lines.push({
          code: a.code,
          debitMinor: l.debitMinor,
          creditMinor: l.creditMinor,
          clientId: l.clientId,
          matterId: l.matterId,
        });
      }
      const r = await this.post(
        tx,
        actor,
        `manual:${input.reference}`,
        input.description,
        "OPERATING",
        lines,
      );
      await this.workspace.audit(tx, actor, "finance.journal_posted", r.id);
      return r;
    });
  }
  reports(actor: Actor, query: unknown) {
    const p = parse(practiceQuery, query);
    return this.workspace.run(actor, "finance:read", false, async (tx) => {
      const from = p.from ?? new Date("2000-01-01T00:00:00Z"),
        to = p.to ?? new Date("2100-01-01T00:00:00Z");
      const balances = await tx.$queryRaw<
        {
          id: string;
          code: string;
          name: string;
          kind: string;
          fund: string;
          debit: string;
          credit: string;
          balance: string;
        }[]
      >`SELECT a.id,a.code,a.name,a.kind,a.fund,coalesce(sum(l."debitMinor"),0)::text AS debit,coalesce(sum(l."creditMinor"),0)::text AS credit,coalesce(sum(l."debitMinor"-l."creditMinor"),0)::text AS balance FROM "LedgerAccount" a LEFT JOIN ("JournalLine" l JOIN "Journal" j ON j.id=l."journalId" AND j."postedAt">=${from} AND j."postedAt"<${to}) ON l."accountId"=a.id GROUP BY a.id ORDER BY a.code`;
      const trustBalances = await tx.$queryRaw<
        { clientId: string; name: string; balance: string }[]
      >`SELECT l."clientId",c.name,sum(l."debitMinor"-l."creditMinor")::text AS balance FROM "JournalLine" l JOIN "LedgerAccount" a ON a.id=l."accountId" JOIN "FinanceClientDirectory" c ON c.id=l."clientId" WHERE a.code='1010' GROUP BY l."clientId",c.name`;
      const overdue = await tx.officeInvoice.findMany({
        where: { status: "ISSUED", dueAt: { lt: new Date() } },
        include: { receipts: true },
      });
      const revenue = balances
          .filter((a) => a.kind === "REVENUE")
          .reduce((s, a) => s - BigInt(a.balance), 0n),
        expenses = balances
          .filter((a) => a.kind === "EXPENSE")
          .reduce((s, a) => s + BigInt(a.balance), 0n);
      return {
        balances,
        trustBalances,
        overdue: overdue
          .map((i) => ({
            id: i.id,
            sequence: i.sequence,
            clientId: i.clientId,
            dueAt: i.dueAt,
            outstandingMinor:
              i.totalMinor - i.receipts.reduce((s, r) => s + r.amountMinor, 0),
          }))
          .filter((i) => i.outstandingMinor > 0),
        revenueMinor: revenue.toString(),
        expenseMinor: expenses.toString(),
        netIncomeMinor: (revenue - expenses).toString(),
        from,
        to,
      };
    });
  }
}
