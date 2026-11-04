import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createApp } from "../apps/api/src/app.js";
import { db, inTenant } from "../packages/database/src/index.js";
import { redis } from "../apps/api/src/security.js";
import { requireTestDatabase } from "./setup-env.js";
requireTestDatabase();
let app: INestApplication,
  base: string,
  cookie: string,
  foreign: string,
  tenant: string,
  memberId: string,
  clientId: string,
  matterId: string,
  invoiceId: string;
const run = randomUUID().slice(0, 8),
  password = "Finance-Secure-Password-2026";
async function req(
  path: string,
  method = "GET",
  body?: unknown,
  session = cookie,
) {
  return fetch(`${base}/api/v1/${path}`, {
    method,
    headers: {
      cookie: session,
      origin: process.env.WEB_ORIGIN!,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function post(path: string, body: unknown, session = cookie) {
  const r = await req(path, "POST", body, session),
    data = await r.json();
  expect(r.status, JSON.stringify(data)).toBe(201);
  return data;
}
async function register(s: string) {
  const r = await req(
    "auth/register",
    "POST",
    {
      email: `finance-${run}-${s}@tests.invalid`,
      password,
      fullName: "Finance Owner",
      officeName: "Finance Office",
      slug: `finance-${run}-${s}`,
      countryCode: "OM",
    },
    "",
  );
  expect(r.status).toBe(201);
  return r.headers.get("set-cookie")!.split(";")[0]!;
}
beforeAll(async () => {
  app = await createApp({ documents: { worker: false } });
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  cookie = await register("a");
  foreign = await register("b");
  const me = await (await req("auth/me")).json();
  tenant = me.tenant.id;
  memberId = me.membership.id;
  const c = await post("practice/clients", {
    name: "Billing Client",
    branchId: me.branch.id,
    notes: "Private legal strategy",
  });
  clientId = c.id;
  const m = await post("practice/matters", {
    title: "Confidential case",
    clientId,
    branchId: me.branch.id,
    category: "CIVIL",
    countryCode: "OM",
    summary: "Never disclose to accountants",
  });
  matterId = m.id;
}, 60000);
afterAll(async () => {
  await app?.close();
  await db.$disconnect();
  redis.disconnect();
});
describe("auditable firm accounting", () => {
  it("creates exact invoices and posts balanced issuance journals", async () => {
    const i = await post("finance/invoices", {
      clientId,
      matterId,
      description: "Legal services",
      quantity: 2,
      unitPriceMinor: 10001,
      discountMinor: 2,
      taxBasisPoints: 500,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    });
    invoiceId = i.id;
    expect(i.netMinor).toBe(20000);
    expect(i.taxMinor).toBe(1000);
    expect(i.totalMinor).toBe(21000);
    await post(`finance/invoices/${invoiceId}/issue`, { clientVisible: true });
    const reports = await (await req("finance/reports")).json();
    expect(reports.revenueMinor).toBe("20000");
    expect(
      reports.balances.reduce(
        (s: number, a: { debit: string; credit: string }) =>
          s + Number(a.debit) - Number(a.credit),
        0,
      ),
    ).toBe(0);
    expect(
      (await req(`finance/invoices/${invoiceId}/void`, "POST", {})).status,
    ).toBe(409);
  });
  it("rejects concurrent overpayments and duplicate references atomically", async () => {
    const payload = {
      invoiceId,
      reference: "receipt-a",
      amountMinor: 15000,
      method: "BANK",
      paidAt: new Date().toISOString(),
    };
    const attempts = await Promise.all([
      req("finance/receipts", "POST", payload),
      req("finance/receipts", "POST", { ...payload, reference: "receipt-b" }),
    ]);
    expect(attempts.map((r) => r.status).sort()).toEqual([201, 409]);
    await post("finance/receipts", {
      ...payload,
      reference: "receipt-remainder",
      amountMinor: 6000,
    });
    const invoices = await (await req("finance/invoices")).json();
    expect(invoices.items[0].paidMinor).toBe(21000);
    expect(invoices.items[0].outstandingMinor).toBe(0);
    expect(invoices.items[0].paymentStatus).toBe("PAID");
  });
  it("does not recognize draft expenses until approval", async () => {
    const e = await post("finance/expenses", {
      clientId,
      matterId,
      category: "COURT_FEES",
      description: "Court filing",
      vendor: "Court",
      amountMinor: 2500,
      incurredAt: new Date().toISOString(),
    });
    expect((await (await req("finance/reports")).json()).expenseMinor).toBe(
      "0",
    );
    await post(`finance/expenses/${e.id}/approve`, {});
    const r = await (await req("finance/reports")).json();
    expect(r.expenseMinor).toBe("2500");
    expect(r.netIncomeMinor).toBe("17500");
    expect(
      (await req(`finance/expenses/${e.id}/approve`, "POST", {})).status,
    ).toBe(409);
  });
  it("separates client funds from operating funds and prevents overdrafts", async () => {
    await post("finance/trust", {
      clientId,
      reference: "deposit-1",
      description: "Client deposit",
      direction: "DEPOSIT",
      amountMinor: 50000,
    });
    await post("finance/trust", {
      clientId,
      reference: "withdraw-1",
      description: "Client disbursement",
      direction: "WITHDRAWAL",
      amountMinor: 12000,
    });
    expect(
      (
        await req("finance/trust", "POST", {
          clientId,
          reference: "overdraw-1",
          description: "Overdraw",
          direction: "WITHDRAWAL",
          amountMinor: 38001,
        })
      ).status,
    ).toBe(409);
    const r = await (await req("finance/reports")).json();
    expect(r.trustBalances[0].balance).toBe("38000");
    expect(r.revenueMinor).toBe("20000");
    const dir = await (await req("finance/directory")).json();
    const trust = dir.accounts.find((a: { code: string }) => a.code === "1010"),
      cash = dir.accounts.find((a: { code: string }) => a.code === "1000");
    expect(
      (
        await req("finance/journals", "POST", {
          reference: "mix-1",
          description: "Must reject",
          lines: [
            { accountId: trust.id, debitMinor: 100, creditMinor: 0 },
            { accountId: cash.id, debitMinor: 0, creditMinor: 100 },
          ],
        })
      ).status,
    ).toBe(400);
  });
  it("database rejects unbalanced entries and mutation of posted history", async () => {
    const dir = await (await req("finance/directory")).json();
    const cash = dir.accounts.find((a: { code: string }) => a.code === "1000");
    await expect(
      inTenant(tenant, async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.member_id',${memberId},true)`;
        return tx.journal.create({
          data: {
            tenantId: tenant,
            reference: "unbalanced-direct",
            description: "Invalid",
            fund: "OPERATING",
            postedBy: memberId,
            lines: {
              create: [
                {
                  accountId: cash.id,
                  debitMinor: 1,
                  creditMinor: 0,
                },
              ],
            },
          },
        });
      }),
    ).rejects.toThrow();
    await expect(
      inTenant(tenant, async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.member_id',${memberId},true)`;
        return tx.$executeRaw`UPDATE "JournalLine" SET "debitMinor"=0 WHERE "tenantId"=${tenant}::uuid`;
      }),
    ).rejects.toThrow();
    expect(await db.journal.count()).toBe(0);
  });
  it("allows financial work without exposing internal legal notes", async () => {
    const role = await post("roles", {
      name: "Finance only",
      key: "FINANCE_ONLY",
      permissions: ["workspace:read", "finance:read", "finance:manage"],
    });
    const me = await (await req("auth/me")).json(),
      email = `accountant-${run}@tests.invalid`;
    await post("users", {
      email,
      password,
      fullName: "Accountant",
      branchId: me.branch.id,
      roleId: role.id,
    });
    const login = await req("auth/login", "POST", {
        email,
        password,
        slug: me.tenant.slug,
      }),
      session = login.headers.get("set-cookie")!.split(";")[0]!;
    const dir = await (
      await req("finance/directory", "GET", undefined, session)
    ).json();
    expect(dir.clients[0].name).toBe("Billing Client");
    expect(dir.clients[0].notes).toBeUndefined();
    expect(dir.matters[0].summary).toBeUndefined();
    expect(
      (await req(`practice/matters/${matterId}`, "GET", undefined, session))
        .status,
    ).toBe(403);
    expect(
      (await req(`finance/invoices/${invoiceId}/issue`, "POST", {}, session))
        .status,
    ).toBe(403);
    expect(
      (await req("finance/invoices", "GET", undefined, foreign)).status,
    ).toBe(200);
    expect(
      (await (await req("finance/invoices", "GET", undefined, foreign)).json())
        .total,
    ).toBe(0);
  });
  it("records fee agreements and exact time values, denies foreign references", async () => {
    await post("finance/fees", {
      clientId,
      matterId,
      kind: "HOURLY",
      amountMinor: 12000,
      terms: "Hourly legal services",
      agreedAt: new Date().toISOString(),
    });
    const t = await post("finance/time", {
      matterId,
      memberId,
      description: "Research",
      minutes: 30,
      hourlyRateMinor: 12001,
      workedAt: new Date().toISOString(),
    });
    expect(t.amountMinor).toBe(6001);
    expect(
      (
        await req(
          "finance/invoices",
          "POST",
          {
            clientId,
            description: "Foreign billing",
            quantity: 1,
            unitPriceMinor: 1000,
            dueAt: new Date().toISOString(),
          },
          foreign,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await req("finance/invoices", "POST", {
          clientId,
          description: "Negative net",
          quantity: 1,
          unitPriceMinor: 100,
          discountMinor: 200,
          dueAt: new Date().toISOString(),
        })
      ).status,
    ).toBe(400);
  });
});
