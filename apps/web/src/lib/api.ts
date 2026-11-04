export class ApiError extends Error {
  constructor(
    public code: string,
    public requestId?: string,
  ) {
    super(code);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    let data: { error?: { code?: string; requestId?: string } };
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    throw new ApiError(
      data.error?.code ?? "INTERNAL_ERROR",
      data.error?.requestId,
    );
  }
  return response.json() as Promise<T>;
}
export type Role = {
  id: string;
  key: string;
  name: string;
  permissions: string[];
};
export type Branch = { id: string; name: string };
export type Tenant = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  countryCode: string;
};
export type Me = {
  user: { id: string; fullName: string; email: string };
  role: Role;
  tenant: Tenant;
  branch: Branch;
  membership: { id: string; branchId: string; roleId: string };
};
export type Member = {
  id: string;
  user: { id: string; fullName: string; email: string };
  role: Role;
  branch: Branch;
  active: boolean;
};
export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
export type Session = {
  id: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
};
export type Audit = {
  id: string;
  action: string;
  actorId: string | null;
  resourceId: string | null;
  createdAt: string;
};
export type Country = { code: string; nameAr: string; nameEn: string };
