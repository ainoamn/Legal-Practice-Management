import { z } from "zod";
export const platformPermissions = [
  "overview:read",
  "tenants:read",
  "tenants:manage",
  "users:read",
  "users:manage",
  "plans:read",
  "plans:manage",
  "subscriptions:read",
  "subscriptions:manage",
  "finance:read",
  "finance:manage",
  "content:read",
  "content:manage",
  "settings:read",
  "settings:manage",
  "security:read",
  "admins:manage",
] as const;
export type PlatformPermission = (typeof platformPermissions)[number];
const name = z.string().trim().min(2).max(120),
  email = z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase());
export const adminLoginSchema = z.strictObject({
  email,
  password: z.string().min(1).max(128),
  factor: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export const adminCreateSchema = z.strictObject({
  email,
  name,
  password: z.string().min(16).max(128),
  permissions: z
    .array(z.enum(platformPermissions))
    .max(platformPermissions.length),
});
export const adminPatchSchema = z.strictObject({
  active: z.boolean(),
  permissions: z
    .array(z.enum(platformPermissions))
    .max(platformPermissions.length),
});
export const adminSetupSchema = z.strictObject({
  password: z.string().min(1).max(128),
});
export const adminConfirmSchema = z.strictObject({
  code: z.string().regex(/^\d{6}$/),
});
export const planSchema = z.strictObject({
  name,
  price: z.string().regex(/^\d{1,8}(?:\.\d{1,4})?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  currencyDecimals: z.number().int().min(0).max(4),
  interval: z.enum(["MONTHLY", "YEARLY"]),
  maxUsers: z.number().int().min(1).max(100000),
  maxMatters: z.number().int().min(0).max(10000000),
  maxBranches: z.number().int().min(1).max(10000),
  maxStorageMiB: z.number().int().min(0).max(1000000000),
  maxAiOperations: z.number().int().min(0).max(1000000000),
  active: z.boolean(),
});
export const subscriptionSchema = z.strictObject({
  tenantId: z.uuid(),
  planId: z.uuid(),
  status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"]),
  currentPeriodEnd: z.iso.datetime(),
});
export const invoiceSchema = z.strictObject({
  tenantId: z.uuid(),
  description: z.string().trim().min(2).max(500),
  amount: z.string().regex(/^\d{1,8}(?:\.\d{1,4})?$/),
  dueAt: z.iso.datetime(),
});
export const paymentSchema = z.strictObject({
  invoiceId: z.uuid(),
  amount: z.string().regex(/^\d{1,8}(?:\.\d{1,4})?$/),
  reference: z.string().trim().min(3).max(100),
  method: z.enum(["BANK_TRANSFER", "CASH", "EXTERNAL_CARD_RECEIPT"]),
});
export const sitePageSchema = z.strictObject({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(80),
  title: name,
  body: z.string().min(1).max(50000),
  status: z.enum(["DRAFT", "PUBLISHED"]),
});
export const settingsSchema = z.strictObject({
  brandName: name,
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  supportEmail: z.union([z.email(), z.literal("")]),
  registrationOpen: z.boolean(),
});
export const countrySchema = z.strictObject({
  code: z.string().regex(/^[A-Z]{2}$/),
  nameAr: name,
  nameEn: name,
  currency: z.string().regex(/^[A-Z]{3}$/),
  currencyDecimals: z.number().int().min(0).max(4),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }),
  enabled: z.boolean(),
});
export function parseMinor(value: string, decimals: number) {
  if (
    !/^\d{1,8}(?:\.\d{1,4})?$/.test(value) ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 4
  )
    throw new Error("INVALID_AMOUNT");
  const [integer, fraction = ""] = value.split(".");
  if (!/^\d+$/.test(integer ?? "") || fraction.length > decimals)
    throw new Error("INVALID_AMOUNT");
  const result = Number(`${integer}${fraction.padEnd(decimals, "0")}`);
  if (!Number.isSafeInteger(result) || result < 0 || result > 1000000000)
    throw new Error("INVALID_AMOUNT");
  return result;
}
export function displayMoney(minor: number, decimals: number) {
  return (minor / 10 ** decimals).toFixed(decimals);
}
