import { z } from "zod";
export const documentSchema = z.strictObject({
  matterId: z.uuid(),
  title: z.string().trim().min(2).max(240),
  kind: z.string().trim().min(1).max(100),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  body: z.string().max(40000).default(""),
});
export const draftSchema = z.strictObject({
  body: z.string().min(1).max(40000),
  expectedVersion: z.number().int().min(0),
});
export const reviewDocumentSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  reviewedText: z.string().max(200000).optional(),
});
export const publishDocumentSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  clientVisible: z.boolean(),
});
export const templateSchema = z.strictObject({
  title: z.string().trim().min(2).max(240),
  kind: z.string().trim().min(1).max(100),
  body: z.string().min(1).max(40000),
  locale: z.enum(["ar", "en"]).default("ar"),
});
