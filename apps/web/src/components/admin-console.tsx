"use client";
import { useState, useEffect, useRef, useId } from "react";
import {
  ShieldCheck,
  LayoutDashboard,
  Building2,
  Users,
  Package,
  CalendarClock,
  Receipt,
  Wallet,
  FileText,
  Globe,
  Settings,
  KeyRound,
  Activity,
  Plus,
  LogOut,
  Search,
  X,
  Scale,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { adminAr, adminEn } from "../lib/admin-messages";
import {
  platformPermissions,
  displayMoney,
  type PlatformPermission,
} from "@legal/contracts/platform";
type Row = Record<string, unknown>;
type Section =
  | "overview"
  | "tenants"
  | "users"
  | "plans"
  | "subscriptions"
  | "invoices"
  | "payments"
  | "pages"
  | "countries"
  | "settings"
  | "admins"
  | "security";
type Admin = {
  id: string;
  name: string;
  email: string;
  kind: string;
  permissions: string[];
  mfaReady: boolean;
  mfaConfigured: boolean;
};
type Listing = { items: Row[]; total: number; page: number; pageSize: number };
type Lookups = {
  ownerId: string | null;
  tenants: Row[];
  plans: Row[];
  invoices: Row[];
  countries: Row[];
};
const emptyLookups: Lookups = {
  ownerId: null,
  tenants: [],
  plans: [],
  invoices: [],
  countries: [],
};
type Option = { value: string; label: string };
type Field = {
  key: keyof typeof adminAr.fields;
  type?:
    | "number"
    | "password"
    | "email"
    | "datetime-local"
    | "checkbox"
    | "textarea"
    | "select"
    | "permissions";
  options?: Option[];
  minLength?: number;
};
type Editor = { section: Section; row: Row; id?: string };
const nav: {
  id: Section;
  permission: PlatformPermission;
  icon: typeof Users;
}[] = [
  { id: "overview", permission: "overview:read", icon: LayoutDashboard },
  { id: "tenants", permission: "tenants:read", icon: Building2 },
  { id: "users", permission: "users:read", icon: Users },
  { id: "plans", permission: "plans:read", icon: Package },
  {
    id: "subscriptions",
    permission: "subscriptions:read",
    icon: CalendarClock,
  },
  { id: "invoices", permission: "finance:read", icon: Receipt },
  { id: "payments", permission: "finance:read", icon: Wallet },
  { id: "pages", permission: "content:read", icon: FileText },
  { id: "countries", permission: "settings:read", icon: Globe },
  { id: "settings", permission: "settings:read", icon: Settings },
  { id: "admins", permission: "admins:manage", icon: KeyRound },
  { id: "security", permission: "security:read", icon: Activity },
];
const management: Partial<Record<Section, PlatformPermission>> = {
  tenants: "tenants:manage",
  plans: "plans:manage",
  subscriptions: "subscriptions:manage",
  invoices: "finance:manage",
  payments: "finance:manage",
  pages: "content:manage",
  countries: "settings:manage",
  settings: "settings:manage",
  admins: "admins:manage",
};
function row(value: unknown): Row {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Row)
    : {};
}
function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}
function records(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(row) : [];
}
function listing(value: unknown): Listing {
  if (Array.isArray(value))
    return {
      items: records(value),
      total: value.length,
      page: 1,
      pageSize: 100,
    };
  const data = row(value);
  return {
    items: records(data.items),
    total: Number(data.total ?? 0),
    page: Number(data.page ?? 1),
    pageSize: Number(data.pageSize ?? 20),
  };
}
function money(data: Row, key = "amountMinor") {
  return `${displayMoney(Number(data[key] ?? 0), Number(data.currencyDecimals ?? 3))} ${text(data.currency)}`;
}
export function AdminConsole() {
  const [locale, setLocale] = useState<"ar" | "en">("ar"),
    [me, setMe] = useState<Admin | null>(null),
    [booting, setBooting] = useState(true),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(false),
    [tab, setTab] = useState<Section>("overview"),
    [version, setVersion] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [data, setData] = useState<Listing>({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    }),
    [overview, setOverview] = useState<Row>({}),
    [monitor, setMonitor] = useState<Row>({}),
    [editor, setEditor] = useState<Editor | null>(null),
    [secret, setSecret] = useState(""),
    [lookupQuery, setLookupQuery] = useState(""),
    [lookups, setLookups] = useState<Lookups>(emptyLookups);
  const scopedLookups = lookups.ownerId === me?.id ? lookups : emptyLookups;
  const [sessionPage, setSessionPage] = useState(1),
    [adminSessionData, setAdminSessionData] = useState<Listing>({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  const t = locale === "ar" ? adminAr : adminEn;
  const can = (permission: string) =>
    me?.permissions.includes(permission) ?? false;
  const shown = nav.filter((n) => can(n.permission));
  function fail(err: unknown) {
    setError(err instanceof ApiError ? err.code : "INTERNAL_ERROR");
    if (err instanceof ApiError && err.code === "UNAUTHENTICATED") {
      setMe(null);
      setSecret("");
    }
  }
  function permissionLabel(permission: string) {
    const [resource, action] = permission.split(":");
    const names: Record<string, string> = {
      overview: t.overview,
      tenants: t.tenants,
      users: t.users,
      plans: t.plans,
      subscriptions: t.subscriptions,
      finance: t.payments,
      content: t.pages,
      settings: t.settings,
      security: t.security,
      admins: t.admins,
    };
    return `${names[resource!] ?? resource} · ${locale === "ar" ? (action === "manage" ? "إدارة" : "عرض") : action === "manage" ? "manage" : "view"}`;
  }
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.title = locale === "ar" ? adminAr.title : adminEn.title;
  }, [locale]);
  useEffect(() => {
    let live = true;
    api<Admin>("platform/auth/me")
      .then((value) => {
        if (!live) return;
        setMe(value);
        setTab(
          nav.find((n) => value.permissions.includes(n.permission))?.id ??
            "overview",
        );
      })
      .catch((err) => {
        if (
          live &&
          !(err instanceof ApiError && err.code === "UNAUTHENTICATED")
        )
          setError(err instanceof ApiError ? err.code : "INTERNAL_ERROR");
      })
      .finally(() => {
        if (live) setBooting(false);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!me?.mfaReady) return;
    let live = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (tab === "overview") {
          const result = await api<Row>("platform/overview");
          if (live) setOverview(result);
        } else if (tab === "security") {
          const [audit, health, sessions] = await Promise.all([
            api<unknown>(`platform/audit?page=${page}&pageSize=20`),
            api<Row>("platform/monitoring"),
            api<unknown>(`platform/sessions?page=${sessionPage}&pageSize=20`),
          ]);
          if (live) {
            setData(listing(audit));
            setMonitor(health);
            setAdminSessionData(listing(sessions));
          }
        } else if (tab === "settings") {
          const result = await api<Row | null>("platform/settings");
          if (live)
            setData({
              items: result ? [result] : [],
              total: result ? 1 : 0,
              page: 1,
              pageSize: 20,
            });
        } else {
          const result = await api<unknown>(
            `platform/${tab}?page=${page}&pageSize=20&search=${encodeURIComponent(search)}`,
          );
          if (live) setData(listing(result));
        }
      } catch (err) {
        if (live)
          setError(err instanceof ApiError ? err.code : "INTERNAL_ERROR");
        if (live && err instanceof ApiError && err.code === "UNAUTHENTICATED")
          setMe(null);
      } finally {
        if (live) setLoading(false);
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [me, tab, page, search, version, sessionPage]);
  async function mutate(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice(false);
    try {
      await work();
      setNotice(true);
      setEditor(null);
      setVersion((v) => v + 1);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }
  async function refreshMe() {
    const value = await api<Admin>("platform/auth/me");
    setMe(value);
    setTab(
      nav.find((n) => value.permissions.includes(n.permission))?.id ??
        "overview",
    );
  }
  function clearClient() {
    setLookups(emptyLookups);
    setEditor(null);
    setSecret("");
    setData({ items: [], total: 0, page: 1, pageSize: 20 });
    setOverview({});
    setMonitor({});
    setAdminSessionData({ items: [], total: 0, page: 1, pageSize: 20 });
    setPage(1);
    setSessionPage(1);
    setSearch("");
  }
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await mutate(async () => {
      const factor = text(values.get("factor"));
      await api("platform/auth/login", "POST", {
        email: values.get("email"),
        password: values.get("password"),
        ...(factor ? { factor } : {}),
      });
      clearClient();
      await refreshMe();
    });
  }
  async function logout() {
    await mutate(async () => {
      await api("platform/auth/logout", "POST", {});
      clearClient();
      setMe(null);
      setSecret("");
    });
  }
  async function loadLookups(query = "") {
    const ownerId = me?.id;
    if (!ownerId) return;
    const update = (
      key: "tenants" | "plans" | "invoices" | "countries",
      items: Row[],
    ) =>
      setLookups((current) => ({
        ...(current.ownerId === ownerId ? current : emptyLookups),
        ownerId,
        [key]: items,
      }));
    const tasks: Promise<void>[] = [];
    if (can("tenants:read"))
      tasks.push(
        api<unknown>(
          `platform/tenants?pageSize=100&search=${encodeURIComponent(query)}`,
        ).then((value) => update("tenants", listing(value).items)),
      );
    if (can("plans:read"))
      tasks.push(
        api<unknown>("platform/plans?pageSize=100").then((value) =>
          update("plans", listing(value).items),
        ),
      );
    if (can("finance:read"))
      tasks.push(
        api<unknown>("platform/invoices?pageSize=100").then((value) =>
          update("invoices", listing(value).items),
        ),
      );
    tasks.push(
      api<Row[]>("countries").then((value) => update("countries", value)),
    );
    try {
      await Promise.all(tasks);
    } catch (err) {
      fail(err);
    }
  }
  function open(section: Section, entry: Row = {}) {
    setError("");
    setNotice(false);
    const defaults: Row = {
      active: true,
      enabled: true,
      maxUsers: 1,
      maxMatters: 0,
      maxBranches: 1,
      maxStorageMiB: 0,
      maxAiOperations: 0,
      currency: "OMR",
      currencyDecimals: 3,
      interval: "MONTHLY",
      price: "0",
      status: section === "pages" ? "DRAFT" : "ACTIVE",
      method: "BANK_TRANSFER",
      timezone: "Asia/Muscat",
      brandName: "LEGAL OFFICE AI",
      primaryColor: "#087e83",
      registrationOpen: true,
      countryCode: "OM",
    };
    const values = { ...defaults, ...entry };
    if (section === "plans" && entry.priceMinor !== undefined)
      values.price = displayMoney(
        Number(entry.priceMinor),
        Number(entry.currencyDecimals),
      );
    setEditor({
      section,
      row: values,
      ...(entry.id ? { id: text(entry.id) } : {}),
    });
    void loadLookups();
  }
  function options(values: string[]): Option[] {
    return values.map((value) => ({
      value,
      label: t.values[value as keyof typeof t.values] ?? value,
    }));
  }
  function fields(section: Section): Field[] {
    switch (section) {
      case "tenants":
        return [
          { key: "officeName" },
          { key: "slug" },
          { key: "fullName" },
          { key: "email", type: "email" },
          { key: "password", type: "password", minLength: 12 },
          {
            key: "countryCode",
            type: "select",
            options: scopedLookups.countries.map((c) => ({
              value: text(c.code),
              label: text(locale === "ar" ? c.nameAr : c.nameEn),
            })),
          },
        ];
      case "plans":
        return [
          { key: "name" },
          { key: "price" },
          { key: "currency" },
          { key: "currencyDecimals", type: "number" },
          {
            key: "interval",
            type: "select",
            options: options(["MONTHLY", "YEARLY"]),
          },
          ...(
            [
              "maxUsers",
              "maxMatters",
              "maxBranches",
              "maxStorageMiB",
              "maxAiOperations",
            ] as const
          ).map((key) => ({ key, type: "number" as const })),
          { key: "active", type: "checkbox" },
        ];
      case "subscriptions":
        return [
          {
            key: "tenantId",
            type: "select",
            options: scopedLookups.tenants.map((v) => ({
              value: text(v.id),
              label: `${text(v.name)} · ${text(v.slug)}`,
            })),
          },
          {
            key: "planId",
            type: "select",
            options: scopedLookups.plans.map((v) => ({
              value: text(v.id),
              label: text(v.name),
            })),
          },
          {
            key: "status",
            type: "select",
            options: options([
              "TRIAL",
              "ACTIVE",
              "PAST_DUE",
              "SUSPENDED",
              "CANCELLED",
            ]),
          },
          { key: "currentPeriodEnd", type: "datetime-local" },
        ];
      case "invoices":
        return [
          {
            key: "tenantId",
            type: "select",
            options: scopedLookups.tenants.map((v) => ({
              value: text(v.id),
              label: `${text(v.name)} · ${text(v.currency)}`,
            })),
          },
          { key: "description" },
          { key: "amount" },
          { key: "dueAt", type: "datetime-local" },
        ];
      case "payments":
        return [
          {
            key: "invoiceId",
            type: "select",
            options: scopedLookups.invoices
              .filter((v) => !v.voidedAt && Number(v.remainingMinor) > 0)
              .map((v) => ({
                value: text(v.id),
                label: `#${text(v.number)} · ${money(v, "remainingMinor")}`,
              })),
          },
          { key: "amount" },
          { key: "reference" },
          {
            key: "method",
            type: "select",
            options: options([
              "BANK_TRANSFER",
              "CASH",
              "EXTERNAL_CARD_RECEIPT",
            ]),
          },
        ];
      case "pages":
        return [
          { key: "title" },
          { key: "slug" },
          { key: "body", type: "textarea" },
          {
            key: "status",
            type: "select",
            options: options(["DRAFT", "PUBLISHED"]),
          },
        ];
      case "countries":
        return [
          { key: "code" },
          { key: "nameAr" },
          { key: "nameEn" },
          { key: "currency" },
          { key: "currencyDecimals", type: "number" },
          { key: "timezone" },
          { key: "enabled", type: "checkbox" },
        ];
      case "settings":
        return [
          { key: "brandName" },
          { key: "primaryColor" },
          { key: "supportEmail", type: "email" },
          { key: "registrationOpen", type: "checkbox" },
        ];
      case "admins":
        return editor?.id
          ? [
              { key: "active", type: "checkbox" },
              { key: "permissions", type: "permissions" },
            ]
          : [
              { key: "name" },
              { key: "email", type: "email" },
              { key: "password", type: "password", minLength: 16 },
              { key: "permissions", type: "permissions" },
            ];
      default:
        return [];
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const form = new FormData(event.currentTarget),
      body: Row = {};
    for (const field of fields(editor.section)) {
      const value = form.get(field.key);
      body[field.key] =
        field.type === "checkbox"
          ? form.has(field.key)
          : field.type === "number"
            ? Number(value)
            : field.type === "datetime-local"
              ? new Date(text(value)).toISOString()
              : field.type === "permissions"
                ? form.getAll(field.key)
                : text(value);
    }
    await mutate(async () => {
      let endpoint = `platform/${editor.section}`,
        method = "POST";
      if (editor.id && ["plans", "pages", "admins"].includes(editor.section)) {
        endpoint += `/${editor.id}`;
        method = "PATCH";
      }
      await api(endpoint, method, body);
    });
  }
  const feedback = (
    <>
      {error && (
        <div className="alert error" role="alert">
          {t.errors[error as keyof typeof t.errors] ?? `${t.failed} (${error})`}
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {t.saved}
        </div>
      )}
    </>
  );
  const language = (
    <button
      className="icon-button"
      aria-label={locale === "ar" ? "English" : "العربية"}
      onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
    >
      <Globe size={17} />
      {locale === "ar" ? "EN" : "ع"}
    </button>
  );
  const stamp = (value: unknown) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Dubai",
        }).format(new Date(text(value)))
      : "—";
  if (booting)
    return (
      <main className="boot">
        <ShieldCheck size={38} />
        {t.loading}
      </main>
    );
  if (!me)
    return (
      <main className="admin-login">
        <div className="admin-auth-card panel">
          <div className="section-head">
            <span className="brand-icon">
              <ShieldCheck />
            </span>
            {language}
          </div>
          <span className="eyebrow">LEGAL OFFICE AI</span>
          <h1>{t.login}</h1>
          <p className="muted small-text">{t.loginNote}</p>
          {feedback}
          <form onSubmit={login}>
            <label className="field">
              <span>{t.email}</span>
              <input
                name="email"
                type="email"
                autoComplete="username"
                dir="ltr"
                required
              />
            </label>
            <label className="field">
              <span>{t.password}</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                dir="ltr"
                required
                maxLength={128}
              />
            </label>
            <div className="field">
              <label htmlFor="platform-login-factor">{t.factor}</label>
              <input
                id="platform-login-factor"
                aria-describedby="platform-login-factor-help"
                name="factor"
                autoComplete="one-time-code"
                dir="ltr"
                pattern="[0-9]{6}"
                maxLength={6}
              />
              <small id="platform-login-factor-help">{t.optionalFactor}</small>
            </div>
            <button className="primary full" disabled={busy}>
              {busy ? t.saving : t.signIn}
            </button>
          </form>
          <a className="admin-back" href="/app">
            {t.workspaces}
          </a>
        </div>
      </main>
    );
  if (!me.mfaReady)
    return (
      <main className="admin-login">
        <section className="admin-auth-card panel">
          <div className="section-head">
            <ShieldCheck size={30} />
            {language}
            <button
              className="icon-button"
              aria-label={t.signOut}
              onClick={logout}
            >
              <LogOut size={18} />
            </button>
          </div>
          <h1>{t.mfaTitle}</h1>
          <p className="muted small-text">{t.mfaText}</p>
          {feedback}
          {!me.mfaConfigured ? (
            <p className="alert error">{t.mfaMissing}</p>
          ) : secret ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                void mutate(async () => {
                  await api("platform/auth/mfa/confirm", "POST", {
                    code: values.get("code"),
                  });
                  setSecret("");
                  await refreshMe();
                });
              }}
            >
              <label className="field">
                <span>{t.mfaSecret}</span>
                <input value={secret} readOnly dir="ltr" />
              </label>
              <label className="field">
                <span>{t.factor}</span>
                <input
                  name="code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  required
                  pattern="[0-9]{6}"
                  maxLength={6}
                />
              </label>
              <button className="primary full" disabled={busy}>
                {t.mfaConfirm}
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                void mutate(async () => {
                  const result = await api<{ secret: string }>(
                    "platform/auth/mfa/setup",
                    "POST",
                    { password: values.get("password") },
                  );
                  setSecret(result.secret);
                });
              }}
            >
              <label className="field">
                <span>{t.currentPassword}</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <button className="primary full" disabled={busy}>
                {t.mfaBegin}
              </button>
            </form>
          )}
        </section>
      </main>
    );
  const tenantStats = row(overview.tenants),
    userStats = row(overview.users);
  function rowAction(entry: Row) {
    if (tab === "tenants" && can("tenants:manage"))
      return (
        <button
          className="secondary"
          onClick={() => {
            if (window.confirm(t.confirm))
              void mutate(async () => {
                await api(
                  `platform/tenants/${text(entry.id)}/access`,
                  "PATCH",
                  {
                    status:
                      entry.accessStatus === "ACTIVE" ? "READ_ONLY" : "ACTIVE",
                  },
                );
              });
          }}
        >
          {entry.accessStatus === "ACTIVE" ? t.restrict : t.unrestrict}
        </button>
      );
    if (tab === "users" && can("users:manage"))
      return (
        <button
          className="secondary"
          onClick={() => {
            if (window.confirm(t.confirm))
              void mutate(async () => {
                await api(`platform/users/${text(entry.userId)}`, "PATCH", {
                  enabled: !entry.enabled,
                });
              });
          }}
        >
          {entry.enabled ? t.disable : t.enable}
        </button>
      );
    if (
      tab === "invoices" &&
      can("finance:manage") &&
      !entry.voidedAt &&
      Number(entry.paidMinor) === 0
    )
      return (
        <button
          className="secondary"
          onClick={() => {
            if (window.confirm(t.confirm))
              void mutate(async () => {
                await api(
                  `platform/invoices/${text(entry.id)}/void`,
                  "POST",
                  {},
                );
              });
          }}
        >
          {t.void}
        </button>
      );
    if (
      ["plans", "subscriptions", "pages", "countries"].includes(tab) &&
      can(management[tab]!)
    )
      return (
        <button className="secondary" onClick={() => open(tab, entry)}>
          {t.edit}
        </button>
      );
    if (tab === "admins" && can("admins:manage"))
      return entry.kind === "OWNER" ? (
        <small>{t.owner}</small>
      ) : entry.id !== me?.id ? (
        <button className="secondary" onClick={() => open("admins", entry)}>
          {t.edit}
        </button>
      ) : null;
    return null;
  }
  const columns: Record<
    Exclude<Section, "overview" | "security" | "settings">,
    { label: string; render: (entry: Row) => React.ReactNode }[]
  > = {
    tenants: [
      {
        label: t.name,
        render: (v) => (
          <>
            <strong>{text(v.name)}</strong>
            <small>{text(v.slug)}</small>
          </>
        ),
      },
      { label: t.fields.countryCode, render: (v) => text(v.countryCode) },
      { label: t.users, render: (v) => text(v.memberCount) },
      {
        label: t.status,
        render: (v) => (v.accessStatus === "ACTIVE" ? t.active : t.readOnly),
      },
    ],
    users: [
      {
        label: t.name,
        render: (v) => (
          <>
            <strong>{text(v.fullName)}</strong>
            <small dir="ltr">{text(v.email)}</small>
          </>
        ),
      },
      { label: t.office, render: (v) => text(v.tenantName) },
      { label: t.role, render: (v) => <code>{text(v.roleKey)}</code> },
      { label: t.status, render: (v) => (v.enabled ? t.active : t.disabled) },
    ],
    plans: [
      { label: t.name, render: (v) => text(v.name) },
      { label: t.fields.price, render: (v) => money(v, "priceMinor") },
      { label: t.fields.maxUsers, render: (v) => text(v.maxUsers) },
      {
        label: t.fields.interval,
        render: (v) => t.values[text(v.interval) as keyof typeof t.values],
      },
      { label: t.status, render: (v) => (v.active ? t.active : t.disabled) },
    ],
    subscriptions: [
      {
        label: t.office,
        render: (v) => text(v.tenantName) || text(v.tenantId).slice(0, 8),
      },
      { label: t.plan, render: (v) => text(row(v.plan).name) },
      {
        label: t.status,
        render: (v) => t.values[text(v.status) as keyof typeof t.values],
      },
      { label: t.period, render: (v) => stamp(v.currentPeriodEnd) },
    ],
    invoices: [
      { label: t.number, render: (v) => `#${text(v.number)}` },
      {
        label: t.office,
        render: (v) => text(v.tenantName) || text(v.tenantId).slice(0, 8),
      },
      { label: t.fields.description, render: (v) => text(v.description) },
      { label: t.amount, render: (v) => money(v) },
      { label: t.paid, render: (v) => money(v, "paidMinor") },
      {
        label: t.remaining,
        render: (v) => (v.voidedAt ? t.void : money(v, "remainingMinor")),
      },
    ],
    payments: [
      {
        label: t.fields.invoiceId,
        render: (v) => `#${text(row(v.invoice).number)}`,
      },
      { label: t.reference, render: (v) => text(v.reference) },
      {
        label: t.amount,
        render: (v) => money({ ...row(v.invoice), amountMinor: v.amountMinor }),
      },
      {
        label: t.method,
        render: (v) => t.values[text(v.method) as keyof typeof t.values],
      },
      { label: t.created, render: (v) => stamp(v.createdAt) },
    ],
    pages: [
      {
        label: t.fields.title,
        render: (v) => (
          <>
            {text(v.title)}
            {v.status === "PUBLISHED" && (
              <small>
                <a
                  href={`/pages/${text(v.slug)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t.view}
                </a>
              </small>
            )}
          </>
        ),
      },
      { label: t.fields.slug, render: (v) => text(v.slug) },
      {
        label: t.status,
        render: (v) => (v.status === "PUBLISHED" ? t.published : t.draft),
      },
    ],
    countries: [
      { label: t.fields.code, render: (v) => text(v.code) },
      {
        label: t.name,
        render: (v) => text(locale === "ar" ? v.nameAr : v.nameEn),
      },
      { label: t.fields.currency, render: (v) => text(v.currency) },
      {
        label: t.fields.currencyDecimals,
        render: (v) => text(v.currencyDecimals),
      },
      { label: t.fields.timezone, render: (v) => text(v.timezone) },
      { label: t.status, render: (v) => (v.enabled ? t.active : t.disabled) },
    ],
    admins: [
      {
        label: t.name,
        render: (v) => (
          <>
            <strong>{text(v.name)}</strong>
            <small>{text(v.email)}</small>
          </>
        ),
      },
      { label: t.role, render: (v) => text(v.kind) },
      {
        label: t.fields.permissions,
        render: (v) =>
          Array.isArray(v.permissions) ? v.permissions.length : 0,
      },
      { label: t.status, render: (v) => (v.active ? t.active : t.disabled) },
    ],
  };
  return (
    <div className="app-shell admin-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <ShieldCheck />
          </span>
          <span>
            LEGAL OFFICE AI<small>{t.title}</small>
          </span>
        </div>
        <div className="office-switch">
          <Scale size={21} />
          <div>
            <small>{t.subtitle}</small>
            <strong>{me.name}</strong>
          </div>
        </div>
        <nav aria-label={t.title}>
          {shown.map(({ id, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${tab === id ? "active" : ""}`}
              onClick={() => {
                setTab(id);
                setPage(1);
                setSearch("");
                setError("");
                setNotice(false);
              }}
            >
              <Icon size={18} />
              {t[id]}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="secure-box">
            <ShieldCheck size={19} />
            {t.metadataNotice}
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header>
          <div className="breadcrumb">
            {t.title}
            <span>/</span>
            <strong>{t[tab]}</strong>
          </div>
          <div className="utility">
            {language}
            <a className="icon-button" href="/app" title={t.workspaces}>
              <Building2 size={18} />
            </a>
            <button
              className="icon-button"
              aria-label={t.endOthers}
              title={t.endOthers}
              disabled={busy}
              onClick={() => {
                if (window.confirm(t.confirm))
                  void mutate(async () => {
                    await api("platform/auth/revoke-others", "POST", {});
                  });
              }}
            >
              <KeyRound size={18} />
            </button>
            <button
              className="icon-button"
              aria-label={t.signOut}
              onClick={logout}
              disabled={busy}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">{t.live}</span>
              <h1>{t[tab]}</h1>
              <p className="muted">{t.metadataNotice}</p>
            </div>
            {management[tab] && can(management[tab]!) && (
              <button
                className="primary"
                onClick={() =>
                  open(tab, tab === "settings" ? (data.items[0] ?? {}) : {})
                }
              >
                <Plus size={18} />
                {tab === "settings" ? t.edit : t.add}
              </button>
            )}
          </div>
          {feedback}
          {!shown.length ? (
            <p>{t.noAccess}</p>
          ) : loading ? (
            <div className="skeleton" aria-label={t.loading}>
              <div />
              <div />
              <div />
            </div>
          ) : (
            <>
              {tab === "overview" && (
                <>
                  <div className="stats-grid">
                    {[
                      [t.tenantTotal, tenantStats.total],
                      [t.userTotal, userStats.total],
                      [t.subscriptionTotal, overview.activeSubscriptions],
                      [t.invoiceTotal, overview.invoices],
                      [t.pageTotal, overview.publishedPages],
                      [t.clientTotal, row(overview.practice).clients],
                      [t.matterTotal, row(overview.practice).matters],
                      [t.hearingTotal, row(overview.practice).hearings],
                      [t.taskTotal, row(overview.practice).tasks],
                      [t.documentTotal, row(overview.practice).documents],
                      [t.contractTotal, row(overview.practice).contracts],
                      [t.powerTotal, row(overview.practice).powersOfAttorney],
                      [t.licenceTotal, row(overview.practice).licences],
                      [
                        t.storageTotal,
                        Number(row(overview.practice).storageMiB ?? 0).toFixed(
                          2,
                        ),
                      ],
                    ].map(([label, value], i) => (
                      <div className="stat-card" key={i}>
                        <div>
                          <span>{text(label)}</span>
                          <ShieldCheck size={19} />
                        </div>
                        <strong>{text(value ?? "—")}</strong>
                        <small>{t.live}</small>
                      </div>
                    ))}
                  </div>
                  <section className="panel">
                    <h3>{t.receipts}</h3>
                    {records(overview.receipts).length ? (
                      records(overview.receipts).map((v) => (
                        <p key={text(v.currency)}>{money(v, "totalMinor")}</p>
                      ))
                    ) : (
                      <p className="muted">{t.empty}</p>
                    )}
                  </section>
                </>
              )}
              {tab === "settings" && (
                <section className="panel settings-panel">
                  {data.items.length ? (
                    <dl className="settings-summary">
                      {(
                        [
                          "brandName",
                          "primaryColor",
                          "supportEmail",
                          "registrationOpen",
                        ] as const
                      ).map((key) => (
                        <div key={key}>
                          <dt>{t.fields[key]}</dt>
                          <dd>
                            {key === "registrationOpen"
                              ? data.items[0]?.[key]
                                ? t.active
                                : t.disabled
                              : text(data.items[0]?.[key]) || "—"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p>{t.empty}</p>
                  )}
                </section>
              )}
              {tab === "security" && (
                <>
                  <div className="stats-grid">
                    {(
                      ["platformDatabase", "appDatabase", "redis"] as const
                    ).map((key) => (
                      <div className="stat-card" key={key}>
                        <div>{t[key]}</div>
                        <strong className="health-value">
                          {text(monitor[key])}
                        </strong>
                        {key === "platformDatabase" && (
                          <small>
                            {t.latency}: {text(monitor.platformMs)}
                          </small>
                        )}
                      </div>
                    ))}
                  </div>
                  <section className="panel monitor-panel">
                    <p>
                      {t.adminSessions}: {text(monitor.activeAdminSessions)}
                    </p>
                    <p>
                      {t.ai}:{" "}
                      {monitor.aiConfigured ? t.active : t.notConfigured}
                    </p>
                    <p>
                      {t.gateway}:{" "}
                      {monitor.paymentGatewayConfigured
                        ? t.active
                        : t.notConfigured}
                    </p>
                    <p>
                      {t.workers}:{" "}
                      {monitor.documentWorkersConfigured
                        ? t.active
                        : t.notConfigured}
                    </p>
                  </section>
                  <section className="panel monitor-panel">
                    <h3>{t.adminSessions}</h3>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{t.actor}</th>
                            <th>{t.status}</th>
                            <th>{t.sessionExpiry}</th>
                            <th>{t.action}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminSessionData.items.map((entry) => (
                            <tr key={text(entry.id)}>
                              <td>
                                <strong>{text(row(entry.admin).name)}</strong>
                                <small>{text(row(entry.admin).email)}</small>
                              </td>
                              <td>
                                {entry.verified
                                  ? t.verified
                                  : t.pendingVerification}
                              </td>
                              <td>{stamp(entry.expiresAt)}</td>
                              <td>
                                {entry.current ? (
                                  <small>{t.currentSession}</small>
                                ) : (
                                  can("admins:manage") &&
                                  (row(entry.admin).kind !== "OWNER" ||
                                    entry.adminId === me.id) && (
                                    <button
                                      className="secondary"
                                      onClick={() => {
                                        if (window.confirm(t.confirm))
                                          void mutate(async () => {
                                            await api(
                                              `platform/sessions/${text(entry.id)}/revoke`,
                                              "POST",
                                              {},
                                            );
                                          });
                                      }}
                                    >
                                      {t.endSession}
                                    </button>
                                  )
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="pagination">
                      <span>
                        {t.total}: {adminSessionData.total}
                      </span>
                      <div>
                        <button
                          className="secondary"
                          disabled={sessionPage <= 1}
                          onClick={() => setSessionPage(sessionPage - 1)}
                        >
                          {t.previous}
                        </button>
                        <span>{sessionPage}</span>
                        <button
                          className="secondary"
                          disabled={sessionPage * 20 >= adminSessionData.total}
                          onClick={() => setSessionPage(sessionPage + 1)}
                        >
                          {t.next}
                        </button>
                      </div>
                    </div>
                  </section>
                  <section className="panel">
                    <h3>{t.auditTitle}</h3>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{t.action}</th>
                            <th>{t.actor}</th>
                            <th>{t.created}</th>
                            <th>{t.target}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.items.map((v) => (
                            <tr key={text(v.id)}>
                              <td>
                                <code>{text(v.action)}</code>
                              </td>
                              <td>{text(row(v.admin).name) || "—"}</td>
                              <td>{stamp(v.createdAt)}</td>
                              <td>
                                <code>
                                  {text(v.targetId).slice(0, 12) || "—"}
                                </code>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!data.items.length && <p className="empty">{t.empty}</p>}
                    </div>
                  </section>
                </>
              )}
              {!["overview", "security", "settings"].includes(tab) && (
                <section className="panel">
                  {["tenants", "users"].includes(tab) && (
                    <form
                      className="table-toolbar"
                      onSubmit={(e) => {
                        e.preventDefault();
                        setSearch(
                          text(new FormData(e.currentTarget).get("search")),
                        );
                        setPage(1);
                      }}
                    >
                      <div className="search">
                        <Search size={18} />
                        <input
                          name="search"
                          placeholder={t.searchHint}
                          aria-label={t.searchHint}
                        />
                      </div>
                      <button className="secondary">{t.search}</button>
                    </form>
                  )}
                  {["invoices", "payments"].includes(tab) && (
                    <p className="muted small-text">{t.financeNotice}</p>
                  )}
                  {tab === "plans" && (
                    <p className="muted small-text">{t.quotaNotice}</p>
                  )}
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {columns[tab as keyof typeof columns].map(
                            (col, i) => (
                              <th key={i}>{col.label}</th>
                            ),
                          )}
                          <th>{t.action}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((entry, index) => (
                          <tr
                            key={text(
                              entry.id ??
                                entry.membershipId ??
                                entry.code ??
                                index,
                            )}
                          >
                            {columns[tab as keyof typeof columns].map(
                              (col, i) => (
                                <td key={i}>{col.render(entry)}</td>
                              ),
                            )}
                            <td>{rowAction(entry)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!data.items.length && <p className="empty">{t.empty}</p>}
                  </div>
                </section>
              )}
              {tab !== "overview" && tab !== "settings" && (
                <div className="pagination">
                  <span>
                    {t.total}: {data.total}
                  </span>
                  <div>
                    <button
                      className="secondary"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      {t.previous}
                    </button>
                    <span>{page}</span>
                    <button
                      className="secondary"
                      disabled={page * data.pageSize >= data.total}
                      onClick={() => setPage(page + 1)}
                    >
                      {t.next}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {error && (
            <button
              className="secondary"
              onClick={() => setVersion((v) => v + 1)}
            >
              {t.retry}
            </button>
          )}
        </main>
        <footer>
          LEGAL OFFICE AI<span>{t.title}</span>
        </footer>
      </div>
      {editor && (
        <AdminDialog
          editor={editor}
          fields={fields(editor.section)}
          title={`${editor.id ? t.edit : t.add} · ${t[editor.section]}`}
          labels={t.fields}
          cancel={t.cancel}
          save={busy ? t.saving : t.save}
          busy={busy}
          close={() => setEditor(null)}
          onSubmit={save}
          error={
            error ? (t.errors[error as keyof typeof t.errors] ?? t.failed) : ""
          }
          permissionLabel={permissionLabel}
          availablePermissions={me.permissions}
          lookup={
            ["subscriptions", "invoices"].includes(editor.section) ? (
              <div className="table-toolbar">
                <input
                  aria-label={t.lookup}
                  value={lookupQuery}
                  onChange={(e) => setLookupQuery(e.target.value)}
                  placeholder={t.lookup}
                />
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void loadLookups(lookupQuery)}
                >
                  {t.search}
                </button>
              </div>
            ) : null
          }
        />
      )}
    </div>
  );
}
function AdminDialog({
  editor,
  fields,
  title,
  labels,
  cancel,
  save,
  busy,
  close,
  onSubmit,
  error,
  permissionLabel,
  availablePermissions,
  lookup,
}: {
  editor: Editor;
  fields: Field[];
  title: string;
  labels: typeof adminAr.fields;
  cancel: string;
  save: string;
  busy: boolean;
  close: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  error: string;
  permissionLabel: (p: string) => string;
  availablePermissions: string[];
  lookup: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    prefix = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      className="modal admin-dialog"
      ref={dialog}
      onCancel={close}
      aria-labelledby={`${prefix}-dialog-heading`}
    >
      <div className="section-head">
        <h2 id={`${prefix}-dialog-heading`}>{title}</h2>
        <button className="icon-button" onClick={close} aria-label={cancel}>
          <X size={19} />
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {lookup}
      <form onSubmit={onSubmit}>
        {fields.map((field) => {
          const id = `${prefix}-${field.key}`,
            value = editor.row[field.key];
          if (field.type === "permissions")
            return (
              <fieldset key={id}>
                <legend>{labels.permissions}</legend>
                {platformPermissions
                  .filter((p) => availablePermissions.includes(p))
                  .map((permission) => (
                    <label className="checkbox" key={permission}>
                      <input
                        type="checkbox"
                        name="permissions"
                        value={permission}
                        defaultChecked={
                          Array.isArray(value) && value.includes(permission)
                        }
                      />
                      {permissionLabel(permission)}
                    </label>
                  ))}
              </fieldset>
            );
          if (field.type === "checkbox")
            return (
              <label className="checkbox" key={id}>
                <input
                  type="checkbox"
                  name={field.key}
                  defaultChecked={Boolean(value)}
                />
                {labels[field.key]}
              </label>
            );
          let defaultValue = text(value);
          if (field.type === "datetime-local" && value) {
            const d = new Date(text(value));
            defaultValue = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
              .toISOString()
              .slice(0, 16);
          }
          return (
            <div className="field" key={id}>
              <label htmlFor={id}>{labels[field.key]}</label>
              {field.type === "textarea" ? (
                <textarea
                  id={id}
                  name={field.key}
                  defaultValue={defaultValue}
                  required
                  maxLength={50000}
                  rows={8}
                />
              ) : field.type === "select" ? (
                <select
                  id={id}
                  name={field.key}
                  defaultValue={defaultValue}
                  required
                >
                  <option value="">—</option>
                  {defaultValue &&
                    !field.options?.some((v) => v.value === defaultValue) && (
                      <option value={defaultValue}>{defaultValue}</option>
                    )}
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  name={field.key}
                  type={field.type ?? "text"}
                  defaultValue={
                    field.type === "password" ? undefined : defaultValue
                  }
                  autoComplete={
                    field.type === "password" ? "new-password" : undefined
                  }
                  required={field.key !== "supportEmail"}
                  minLength={field.minLength}
                  min={field.type === "number" ? 0 : undefined}
                  maxLength={field.type === "password" ? 128 : undefined}
                  step={field.type === "number" ? 1 : undefined}
                  dir={
                    [
                      "email",
                      "slug",
                      "password",
                      "currency",
                      "primaryColor",
                      "code",
                      "reference",
                    ].includes(field.key)
                      ? "ltr"
                      : undefined
                  }
                />
              )}
            </div>
          );
        })}
        <div className="form-actions">
          <button className="primary" disabled={busy}>
            {save}
          </button>
          <button className="secondary" type="button" onClick={close}>
            {cancel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
