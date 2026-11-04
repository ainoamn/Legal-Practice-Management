import { z } from "zod";
import { pageSchema } from "./index.js";
const short = z.string().trim().max(240);
const text = z.string().trim().max(20000);
const date = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const day = z.iso.date().transform((v) => new Date(v));
export const clientSchema = z.strictObject({
  name: short.min(2),
  kind: z
    .enum([
      "INDIVIDUAL",
      "COMPANY",
      "INSTITUTION",
      "GOVERNMENT",
      "ASSOCIATION",
      "OTHER",
    ])
    .default("INDIVIDUAL"),
  branchId: z.uuid(),
  identityNumber: short.min(1).nullable().optional(),
  registrationNumber: short.min(1).nullable().optional(),
  taxNumber: short.nullable().optional(),
  nationality: short.nullable().optional(),
  birthDate: day.nullable().optional(),
  email: z.email().max(254).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  address: short.nullable().optional(),
  representative: short.nullable().optional(),
  notes: text.default(""),
  tags: z.array(short.min(1)).max(30).default([]),
});
export const clientPatchSchema = clientSchema
  .partial()
  .extend({
    kind: clientSchema.shape.kind.removeDefault().optional(),
    notes: clientSchema.shape.notes.removeDefault().optional(),
    tags: clientSchema.shape.tags.removeDefault().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);
export const courtSchema = z.strictObject({
  name: short.min(2),
  countryCode: z.string().length(2),
  region: short.default(""),
  address: short.default(""),
});
export const matterSchema = z.strictObject({
  title: short.min(2),
  clientId: z.uuid(),
  branchId: z.uuid(),
  courtId: z.uuid().nullable().optional(),
  category: short.min(1),
  status: short.min(1).default("NEW"),
  countryCode: z.string().length(2),
  courtNumber: short.default(""),
  region: short.default(""),
  division: short.default(""),
  claimType: short.default(""),
  litigationLevel: short.default("FIRST_INSTANCE"),
  filedAt: day.nullable().optional(),
  registeredAt: day.nullable().optional(),
  claimMinor: z.number().int().min(0).max(2147483647).nullable().optional(),
  confidentiality: z
    .enum(["NORMAL", "CONFIDENTIAL", "RESTRICTED"])
    .default("NORMAL"),
  summary: text.default(""),
  currentPosition: text.default(""),
  nextStep: text.default(""),
});
export const matterPatchSchema = matterSchema
  .partial()
  .extend({
    status: matterSchema.shape.status.removeDefault().optional(),
    courtNumber: matterSchema.shape.courtNumber.removeDefault().optional(),
    region: matterSchema.shape.region.removeDefault().optional(),
    division: matterSchema.shape.division.removeDefault().optional(),
    claimType: matterSchema.shape.claimType.removeDefault().optional(),
    litigationLevel: matterSchema.shape.litigationLevel
      .removeDefault()
      .optional(),
    confidentiality: matterSchema.shape.confidentiality
      .removeDefault()
      .optional(),
    summary: matterSchema.shape.summary.removeDefault().optional(),
    currentPosition: matterSchema.shape.currentPosition
      .removeDefault()
      .optional(),
    nextStep: matterSchema.shape.nextStep.removeDefault().optional(),
    version: z.number().int().positive(),
  })
  .refine((v) => Object.keys(v).length > 1);
export const assignmentSchema = z
  .strictObject({
    memberIds: z
      .array(z.uuid())
      .min(1)
      .max(50)
      .refine((v) => new Set(v).size === v.length),
    leadId: z.uuid(),
  })
  .refine((v) => v.memberIds.includes(v.leadId));
export const partySchema = z.strictObject({
  name: short.min(2),
  kind: z.enum(["OPPONENT", "CO_CLIENT", "WITNESS", "RELATED"]),
  identityNumber: short.nullable().optional(),
  lawyer: short.default(""),
  contact: short.default(""),
});
export const hearingSchema = z
  .strictObject({
    matterId: z.uuid(),
    responsibleId: z.uuid(),
    startsAt: date,
    endsAt: date,
    room: short.default(""),
    preparation: text.default(""),
    reminderMinutes: z
      .array(z.number().int().min(1).max(525600))
      .max(10)
      .default([1440, 60]),
    createPreparationTask: z.boolean().default(false),
  })
  .refine((v) => v.endsAt > v.startsAt);
export const hearingPatchSchema = z.strictObject({
  status: z.enum([
    "SCHEDULED",
    "CONFIRMED",
    "HELD",
    "POSTPONED",
    "CANCELLED",
    "NOT_HELD",
    "AWAITING_RESULT",
    "COMPLETED",
  ]),
  outcome: text.optional(),
  decision: text.optional(),
  nextHearingAt: date.nullable().optional(),
  clientVisible: z.boolean().optional(),
});
export const taskSchema = z.strictObject({
  matterId: z.uuid(),
  assignedTo: z.uuid(),
  title: short.min(2),
  description: text.default(""),
  dueAt: date,
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
});
export const taskPatchSchema = z.strictObject({
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"]),
  description: text.optional(),
});
export const noteSchema = z.strictObject({ body: text.min(1) });
export const practiceQuery = pageSchema
  .extend({
    matterId: z.uuid().optional(),
    status: short.optional(),
    clientId: z.uuid().optional(),
    branchId: z.uuid().optional(),
    from: date.optional(),
    to: date.optional(),
    memberId: z.uuid().optional(),
  })
  .refine((v) => !v.from || !v.to || v.to > v.from);
export type ClientInput = z.infer<typeof clientSchema>;
export const calendarQuery = z
  .strictObject({
    from: date,
    to: date,
    memberId: z.uuid().optional(),
    search: z.string().trim().max(200).default(""),
  })
  .refine(
    (v) => v.to > v.from && v.to.getTime() - v.from.getTime() <= 63 * 86400000,
  );
export type MatterInput = z.infer<typeof matterSchema>;
export type HearingInput = z.infer<typeof hearingSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
