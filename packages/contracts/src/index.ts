import { z } from "zod";

export const permissions = [
  "workspace:read",
  "workspace:manage",
  "team:read",
  "team:manage",
  "roles:read",
  "roles:manage",
  "audit:read",
  "clients:read",
  "clients:manage",
  "matters:read",
  "matters:manage",
  "matters:read:all",
  "matters:read:branch",
  "matters:assign",
  "hearings:manage",
  "tasks:manage",
  "courts:manage",
  "conflicts:read",
  "documents:read",
  "documents:manage",
  "documents:review",
  "documents:approve",
  "documents:download",
  "finance:read",
  "finance:manage",
  "finance:approve",
  "portal:read",
  "instruments:read",
  "instruments:manage",
  "instruments:approve",
] as const;
export type Permission = (typeof permissions)[number];
const email = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());
const password = z.string().min(12).max(128);
const name = z.string().trim().min(2).max(120);
export const registerSchema = z.strictObject({
  email,
  password,
  fullName: name,
  officeName: name,
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  countryCode: z.string().length(2).default("OM"),
});
export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1).max(128),
  slug: z.string().min(3).max(60),
  factor: z
    .string()
    .trim()
    .regex(/^(?:\d{6}|[a-fA-F0-9]{16})$/)
    .optional(),
});
export const mfaSetupSchema = z.strictObject({
  password: z.string().min(1).max(128),
});
export const forgotPasswordSchema = z.strictObject({
  email,
  slug: z.string().min(3).max(60),
});
export const resetPasswordSchema = z.strictObject({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password,
});
export const mfaConfirmSchema = z.strictObject({
  code: z.string().regex(/^\d{6}$/),
});
export const mfaDisableSchema = z.strictObject({
  password: z.string().min(1).max(128),
  factor: z.string().regex(/^(?:\d{6}|[a-fA-F0-9]{16})$/),
});
export const memberSchema = z.strictObject({
  email,
  password,
  fullName: name,
  roleId: z.uuid(),
  branchId: z.uuid(),
});
export const memberPatchSchema = z
  .strictObject({
    roleId: z.uuid().optional(),
    branchId: z.uuid().optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);
export const roleSchema = z.strictObject({
  name,
  key: z.string().regex(/^[A-Z][A-Z0-9_]{1,40}$/),
  permissions: z
    .array(z.enum(permissions))
    .max(permissions.length)
    .refine((v) => new Set(v).size === v.length),
});
export const tenantPatchSchema = z.strictObject({
  name,
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }),
});
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(""),
  sort: z.enum(["createdAt", "name"]).default("createdAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type MemberInput = z.infer<typeof memberSchema>;
export type MemberPatch = z.infer<typeof memberPatchSchema>;
export type RoleInput = z.infer<typeof roleSchema>;
export function canDelegate(
  actor: readonly string[],
  target: readonly string[],
): boolean {
  return target.every((p) => actor.includes(p));
}
export const initialRoles = [
  { key: "OWNER", name: "مالك المكتب", permissions: [...permissions] },
  {
    key: "MANAGING_PARTNER",
    name: "الشريك الإداري",
    permissions: ["workspace:read", "team:read", "team:manage", "roles:read"],
  },
  {
    key: "CLIENT",
    name: "الموكل",
    permissions: ["workspace:read", "portal:read"],
  },
  ...[
    "PARTNER_LAWYER",
    "SENIOR_LAWYER",
    "LAWYER",
    "JUNIOR_LAWYER",
    "LEGAL_RESEARCHER",
    "PARALEGAL",
    "SECRETARY",
    "RECEPTIONIST",
    "ACCOUNTANT",
    "FINANCE_MANAGER",
    "HR_MANAGER",
    "DOCUMENT_CONTROLLER",
    "EXTERNAL_AUDITOR",
  ].map((key) => ({ key, name: key, permissions: ["workspace:read"] })),
];
