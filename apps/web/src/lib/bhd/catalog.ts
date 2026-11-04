import { DEFAULT_IDENTITY_ISSUER } from "../identity/issuer";
import { BHD_APPS_FALLBACK, type BhdApp, type BhdAppMode } from "./apps";

export const IDENTITY_CATALOG_URL = `${DEFAULT_IDENTITY_ISSUER}/api/bhd/catalog`;
export const BHD_CATALOG_EVENT = "bhd-catalog";

export type BhdCatalogPayload = {
  spec?: string;
  live?: boolean;
  apps?: unknown;
  hops?: string[];
};

let cache: BhdApp[] | null = null;

function asMode(value: unknown): BhdAppMode {
  return value === "identity" || value === "browse" || value === "sso" ? value : "sso";
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNullableString(value: unknown) {
  const text = asString(value);
  return text || null;
}

export function normalizeCatalogApps(raw: unknown): BhdApp[] {
  if (!Array.isArray(raw)) return [];
  const apps: BhdApp[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const id = asString(item.id);
    const origin = asString(item.origin).replace(/\/$/, "");
    if (!id || !origin) continue;
    const workspacePath = asString(item.workspacePath, "/") || "/";
    const path = workspacePath.startsWith("/") ? workspacePath : `/${workspacePath}`;
    const startUrl =
      asNullableString(item.startUrl) ||
      (asMode(item.mode) === "sso" ? `${origin}/api/auth/bhd/start?returnTo=${encodeURIComponent(path)}` : null);
    apps.push({
      id,
      clientId: asNullableString(item.clientId),
      nameAr: asString(item.nameAr, id),
      nameEn: asString(item.nameEn, id),
      origin,
      workspacePath: path,
      homePath: asNullableString(item.homePath) || undefined,
      startUrl,
      mode: asMode(item.mode),
      enabled: item.enabled !== false,
      mark: asString(item.mark, id.slice(0, 2).toUpperCase()),
      accent: asString(item.accent, "#075c45"),
      soft: asString(item.soft, "#e6f1ec"),
      logoUrl: asNullableString(item.logoUrl),
      homeUrl: asNullableString(item.homeUrl) || undefined,
      workspaceUrl: asNullableString(item.workspaceUrl) || undefined,
      sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : apps.length,
    });
  }
  return apps.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export function getCachedCatalogApps(): BhdApp[] {
  return cache && cache.length ? cache : BHD_APPS_FALLBACK;
}

export function setCachedCatalogApps(apps: BhdApp[]) {
  if (!apps.length) return;
  cache = apps;
}

export function applyCatalogPayload(payload: unknown): BhdApp[] {
  const apps = Array.isArray(payload)
    ? normalizeCatalogApps(payload)
    : normalizeCatalogApps((payload as BhdCatalogPayload | null)?.apps);
  if (apps.length) setCachedCatalogApps(apps);
  return apps;
}

export async function fetchIdentityCatalog(): Promise<BhdApp[]> {
  try {
    const response = await fetch(IDENTITY_CATALOG_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`catalog ${response.status}`);
    const body = (await response.json()) as BhdCatalogPayload;
    const apps = applyCatalogPayload(body);
    return apps.length ? apps : getCachedCatalogApps();
  } catch {
    return getCachedCatalogApps();
  }
}
