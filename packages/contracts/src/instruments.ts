import { z } from "zod";
import { practiceQuery } from "./practice.js";
const minor = z
  .union([
    z
      .string()
      .trim()
      .regex(/^\d{1,20}$/),
    z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  ])
  .transform((v) => BigInt(v).toString());
export {
  parseInstrumentMinor,
  formatInstrumentMinor,
} from "./instrument-money.js";
const short = z.string().trim().max(240),
  text = z.string().trim().max(20000),
  day = z.iso.date().transform((v) => new Date(v)),
  date = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const fields = {
  title: short.min(2),
  category: short.min(2),
  matterId: z.uuid().nullable().optional(),
  documentId: z.uuid().nullable().optional(),
  responsibleId: z.uuid(),
  referenceNumber: short.min(1).nullable().optional(),
  partyOne: short.min(2),
  partyTwo: short.default(""),
  agent: short.default(""),
  issuingAuthority: short.default(""),
  issuedAt: day,
  startsAt: day.nullable().optional(),
  endsAt: day.nullable().optional(),
  renewalAt: day.nullable().optional(),
  amountMinor: minor.nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  terms: text.default(""),
  notes: text.default(""),
  confidentiality: z
    .enum(["NORMAL", "CONFIDENTIAL", "RESTRICTED"])
    .default("NORMAL"),
  reminderDays: z
    .array(z.number().int().min(0).max(3650))
    .max(12)
    .refine((v) => new Set(v).size === v.length)
    .default([30, 7, 1, 0]),
};
export const instrumentSchema = z
  .strictObject({
    ...fields,
    kind: z.enum(["CONTRACT", "POWER_OF_ATTORNEY", "LICENCE"]),
    clientId: z.uuid(),
  })
  .superRefine((v, c) => {
    if (v.startsAt && v.endsAt && v.endsAt < v.startsAt)
      c.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "END_BEFORE_START",
      });
    if (v.kind === "CONTRACT" && !v.partyTwo.trim())
      c.addIssue({
        code: "custom",
        path: ["partyTwo"],
        message: "COUNTERPARTY_REQUIRED",
      });
    if (
      v.kind === "POWER_OF_ATTORNEY" &&
      (!v.agent.trim() || !v.issuingAuthority.trim() || !v.referenceNumber)
    )
      c.addIssue({ code: "custom", message: "AGENCY_DETAILS_REQUIRED" });
  });
export const instrumentPatchSchema = z
  .strictObject(fields)
  .partial()
  .extend({
    partyTwo: fields.partyTwo.removeDefault().optional(),
    agent: fields.agent.removeDefault().optional(),
    issuingAuthority: fields.issuingAuthority.removeDefault().optional(),
    terms: fields.terms.removeDefault().optional(),
    notes: fields.notes.removeDefault().optional(),
    confidentiality: fields.confidentiality.removeDefault().optional(),
    reminderDays: fields.reminderDays.removeDefault().optional(),
    version: z.number().int().positive(),
    status: z.enum(["DRAFT", "CLOSED", "CANCELLED", "ARCHIVED"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 1);
export const instrumentApprovalSchema = z.strictObject({
  version: z.number().int().positive(),
});
export const obligationSchema = z.strictObject({
  title: short.min(2),
  description: text.default(""),
  dueAt: date,
  amountMinor: minor.nullable().optional(),
});
export const obligationPatchSchema = z.strictObject({
  version: z.number().int().positive(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]),
  dueAt: date.optional(),
});
export const instrumentQuery = practiceQuery.safeExtend({
  kind: z.enum(["CONTRACT", "POWER_OF_ATTORNEY", "LICENCE"]).optional(),
  expiringWithinDays: z.coerce.number().int().min(0).max(3650).optional(),
});
export type InstrumentInput = z.infer<typeof instrumentSchema>;
