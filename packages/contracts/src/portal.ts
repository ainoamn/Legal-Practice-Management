import { z } from "zod";
export const clientAccessSchema = z.strictObject({
  memberId: z.uuid(),
  active: z.boolean().default(true),
});
export const portalMessageSchema = z.strictObject({
  body: z.string().trim().min(1).max(5000),
});
export const portalRequestSchema = z.strictObject({
  kind: z.enum(["APPOINTMENT", "CONTACT_UPDATE", "DOCUMENT_REQUEST", "OTHER"]),
  body: z.string().trim().min(2).max(5000),
  preferredAt: z.iso
    .datetime({ offset: true })
    .transform((v) => new Date(v))
    .optional(),
});
export const portalResponseSchema = z.strictObject({
  status: z.enum(["OPEN", "ACCEPTED", "REJECTED", "COMPLETED"]),
  response: z.string().trim().max(5000),
});
export const matterPublicationSchema = z.strictObject({
  clientVisible: z.boolean(),
  version: z.number().int().positive(),
});
