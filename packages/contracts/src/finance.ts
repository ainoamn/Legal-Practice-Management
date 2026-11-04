import { z } from "zod";
const minor = z.number().int().min(0).max(2147483647);
const text = z.string().trim().min(1).max(5000);
const date = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const links = { clientId: z.uuid(), matterId: z.uuid().nullable().optional() };
export const officeInvoiceSchema = z.strictObject({
  ...links,
  description: text,
  quantity: z.number().int().min(1).max(10000),
  unitPriceMinor: minor,
  discountMinor: minor.default(0),
  taxBasisPoints: z.number().int().min(0).max(10000).default(0),
  dueAt: date,
});
export const invoiceIssueSchema = z.strictObject({
  clientVisible: z.boolean().default(false),
});
export const officeReceiptSchema = z.strictObject({
  invoiceId: z.uuid(),
  reference: z.string().trim().min(3).max(120),
  amountMinor: minor.positive(),
  method: z.enum(["CASH", "BANK", "CARD", "PAYMENT_LINK", "OTHER"]),
  paidAt: date,
});
export const expenseSchema = z.strictObject({
  clientId: z.uuid().nullable().optional(),
  matterId: z.uuid().nullable().optional(),
  category: text.max(100),
  description: text,
  vendor: text.max(240),
  amountMinor: minor.positive(),
  incurredAt: date,
});
export const trustSchema = z.strictObject({
  clientId: z.uuid(),
  reference: z.string().trim().min(3).max(120),
  description: text,
  direction: z.enum(["DEPOSIT", "WITHDRAWAL"]),
  amountMinor: minor.positive(),
});
export const feeSchema = z.strictObject({
  ...links,
  kind: z.enum(["FIXED", "HOURLY", "STAGED", "RETAINER", "ADVANCE", "CUSTOM"]),
  amountMinor: minor,
  terms: text,
  agreedAt: date,
  documentId: z.uuid().nullable().optional(),
});
export const timeEntrySchema = z.strictObject({
  matterId: z.uuid(),
  memberId: z.uuid(),
  description: text,
  minutes: z.number().int().min(1).max(1440),
  hourlyRateMinor: minor,
  workedAt: date,
});
export const manualJournalSchema = z
  .strictObject({
    reference: z.string().trim().min(3).max(120),
    description: text,
    lines: z
      .array(
        z.strictObject({
          accountId: z.uuid(),
          debitMinor: minor,
          creditMinor: minor,
          clientId: z.uuid().nullable().optional(),
          matterId: z.uuid().nullable().optional(),
        }),
      )
      .min(2)
      .max(100),
  })
  .refine(
    (v) =>
      v.lines.every((l) => l.debitMinor > 0 !== l.creditMinor > 0) &&
      v.lines.reduce((sum, l) => sum + l.debitMinor - l.creditMinor, 0) === 0,
  );
