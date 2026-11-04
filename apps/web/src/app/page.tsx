"use client";
import {
  useState,
  useEffect,
  useCallback,
  useId,
  isValidElement,
  cloneElement,
} from "react";
import { useForm } from "react-hook-form";
import {
  Scale,
  LayoutDashboard,
  Users,
  ShieldCheck,
  Settings,
  Monitor,
  ScrollText,
  CalendarDays,
  LogOut,
  ArrowUpLeft,
  Plus,
  Search,
  Moon,
  Sun,
  Globe,
  Building2,
  Check,
  X,
  KeyRound,
} from "lucide-react";
import {
  permissions,
  registerSchema,
  loginSchema,
  memberSchema,
  memberPatchSchema,
  roleSchema,
  tenantPatchSchema,
  canDelegate,
} from "@legal/contracts";
import { ar, en } from "../lib/messages";
import { MfaPanel } from "../components/mfa-panel";
import { PasswordRecovery } from "../components/password-recovery";
import { PracticeConsole } from "../components/practice-console";
import { FinanceConsole } from "../components/finance-console";
import { InstrumentsConsole } from "../components/instruments-console";
import { CalendarConsole } from "../components/calendar-console";
import {
  api,
  ApiError,
  type Me,
  type Role,
  type Branch,
  type Member,
  type Page,
  type Session,
  type Audit,
  type Country,
} from "../lib/api";
type Tab =
  | "overview"
  | "practice"
  | "finance"
  | "instruments"
  | "calendar"
  | "team"
  | "roles"
  | "settings"
  | "sessions"
  | "audit";
type FormValues = Record<string, string>;
type Modal =
  { type: "member"; member?: Member } | { type: "role"; role?: Role } | null;
export default function Home() {
  const [branding, setBranding] = useState<{
    brandName: string;
    primaryColor: string;
    registrationOpen: boolean;
  } | null>(null);
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [locale, setLocale] = useState<"ar" | "en">("ar"),
    [dark, setDark] = useState(false),
    [me, setMe] = useState<Me | null>(null),
    [booting, setBooting] = useState(true),
    [mode, setMode] = useState<"login" | "register">("login"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [tab, setTab] = useState<Tab>("overview"),
    [version, setVersion] = useState(0),
    [loading, setLoading] = useState(false),
    [modal, setModal] = useState<Modal>(null),
    [confirmAction, setConfirmAction] = useState<null | (() => Promise<void>)>(
      null,
    );
  const [countries, setCountries] = useState<Country[]>([]),
    [roles, setRoles] = useState<Role[]>([]),
    [branches, setBranches] = useState<Branch[]>([]),
    [members, setMembers] = useState<Page<Member>>({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
    }),
    [sessions, setSessions] = useState<Session[]>([]),
    [audit, setAudit] = useState<Page<Audit>>({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
    }),
    [stats, setStats] = useState<{
      activeMembers: number | null;
      branches: number;
      roles: number | null;
    } | null>(null);
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("createdAt"),
    [direction, setDirection] = useState("desc");
  const baseMessages = locale === "ar" ? ar : en;
  const t = {
    ...baseMessages,
    brand: branding?.brandName ?? baseMessages.brand,
  };
  const { register, handleSubmit, reset } = useForm<FormValues>({
    shouldUnregister: true,
  });
  const can = (permission: string) =>
    me?.role.permissions.includes(permission) ?? false;
  useEffect(() => {
    if (
      me?.role.key === "CLIENT" &&
      me.role.permissions.includes("portal:read")
    )
      window.location.replace("/portal");
  }, [me]);
  const roleName = (role: Role) =>
    t.roleNames[role.key as keyof typeof t.roleNames] ?? role.name;
  const errorText = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError) {
        return (
          baseMessages.errors[err.code as keyof typeof baseMessages.errors] ??
          `${baseMessages.failed}${err.requestId ? ` (${err.requestId})` : ""}`
        );
      }
      return baseMessages.failed;
    },
    [baseMessages],
  );
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    let live = true;
    Promise.allSettled([
      api<Me>("auth/me"),
      api<Country[]>("countries"),
      api<{
        brandName: string;
        primaryColor: string;
        registrationOpen: boolean;
      }>("public/settings"),
    ]).then(([profile, catalog, brand]) => {
      if (!live) return;
      if (profile.status === "fulfilled") setMe(profile.value);
      else if (!(
        profile.reason instanceof ApiError &&
        profile.reason.code === "UNAUTHENTICATED"
      ))
        setError(errorText(profile.reason));
      if (catalog.status === "fulfilled") setCountries(catalog.value);
      else setError(errorText(catalog.reason));
      if (brand.status === "fulfilled") setBranding(brand.value);
      else setError(errorText(brand.reason));
      setBooting(false);
      if (window.location.hash.startsWith("#reset=")) {
        setMe(null);
        setRecoverOpen(true);
      }
    });
    return () => {
      live = false;
    };
  }, [errorText]);
  useEffect(() => {
    if (!branding) return;
    document.title = branding.brandName;
    document.documentElement.style.setProperty("--teal", branding.primaryColor);
    const channels = [1, 3, 5]
      .map((i) => parseInt(branding.primaryColor.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    const lum =
      channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
    document.documentElement.style.setProperty(
      "--on-primary",
      lum > 0.179 ? "#102426" : "#ffffff",
    );
  }, [branding]);
  useEffect(() => {
    if (!me) return;
    let live = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (tab === "overview") {
          const data = await api<typeof stats>("dashboard");
          if (live) setStats(data);
        }
        if (tab === "team") {
          const [users, workspace, available] = await Promise.all([
            api<Page<Member>>(
              `users?page=${page}&pageSize=10&search=${encodeURIComponent(search)}&sort=${sort}&direction=${direction}`,
            ),
            api<{ branches: Branch[] }>("tenants/current"),
            me!.role.permissions.includes("roles:read")
              ? api<Role[]>("roles")
              : Promise.resolve([]),
          ]);
          if (live) {
            setMembers(users);
            setBranches(workspace.branches);
            setRoles(available);
          }
        }
        if (tab === "roles") {
          const data = await api<Role[]>("roles");
          if (live) setRoles(data);
        }
        if (tab === "sessions") {
          const data = await api<Session[]>("auth/sessions");
          if (live) setSessions(data);
        }
        if (tab === "audit") {
          const data = await api<Page<Audit>>(`audit?page=${page}&pageSize=10`);
          if (live) setAudit(data);
        }
      } catch (err) {
        if (live) setError(errorText(err));
      } finally {
        if (live) setLoading(false);
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [me, tab, page, search, sort, direction, version, errorText]);
  async function mutate(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(t.saved);
      setVersion((v) => v + 1);
      setModal(null);
      setConfirmAction(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  async function auth(values: FormValues) {
    setBusy(true);
    setError("");
    try {
      if (values.factor === "") delete values.factor;
      const result = (
        mode === "register" ? registerSchema : loginSchema
      ).safeParse(values);
      if (!result.success) {
        setError(t.errors.VALIDATION_ERROR);
        return;
      }
      await api(`auth/${mode}`, "POST", result.data);
      setMe(await api<Me>("auth/me"));
      reset();
      setTab("overview");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api("auth/logout", "POST", {});
      setMe(null);
      setTab("overview");
      setNotice("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  const controls = (
    <div className="utility">
      <button
        className="icon-button"
        onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
        title={locale === "ar" ? "English" : "العربية"}
        aria-label={locale === "ar" ? "English" : "العربية"}
      >
        <Globe size={17} />
        <span>{locale === "ar" ? "EN" : "ع"}</span>
      </button>
      <button
        className="icon-button"
        onClick={() => setDark(!dark)}
        aria-label={dark ? t.light : t.dark}
      >
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      {me && (
        <button
          className="icon-button"
          onClick={logout}
          disabled={busy}
          aria-label={t.logout}
        >
          <LogOut size={18} />
        </button>
      )}
    </div>
  );
  const feedback = (
    <>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="alert success">
          <Check size={16} />
          {notice}
        </div>
      )}
    </>
  );
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: me?.tenant.timezone ?? "Asia/Muscat",
    }).format(new Date(value));
  if (booting)
    return (
      <main className="boot" aria-busy="true">
        <Scale size={40} />
        <p>{t.loading}</p>
      </main>
    );
  if (!me)
    return (
      <main className="auth-shell">
        <section className="auth-story">
          <div className="brand">
            <span className="brand-icon">
              <Scale />
            </span>
            <span>
              {t.brand}
              <small>{t.tagline}</small>
            </span>
          </div>
          <div className="story-copy">
            <span className="eyebrow">{t.phase}</span>
            <h1>{t.intro}</h1>
            <p>{t.introText}</p>
            <div className="story-line" />
            <div className="secure-note">
              <ShieldCheck size={30} />
              <div>
                <strong>{t.secureTitle}</strong>
                <p>{t.secureText}</p>
              </div>
            </div>
          </div>
          <p className="phase-note">{t.notReady}</p>
        </section>
        <section className="auth-panel">
          {controls}
          <div className="auth-card">
            {recoverOpen ? (
              <PasswordRecovery
                locale={locale}
                onBack={() => {
                  setRecoverOpen(false);
                  setMode("login");
                  reset();
                }}
              />
            ) : (
              <>
                <div className="auth-icon">
                  <Building2 />
                </div>
                <h2>{mode === "login" ? t.login : t.register}</h2>
                <p className="muted">{t.foundation}</p>
                <div className="segmented">
                  <button
                    className={mode === "login" ? "selected" : ""}
                    onClick={() => {
                      setMode("login");
                      reset();
                      setError("");
                    }}
                  >
                    {t.login}
                  </button>
                  <button
                    className={mode === "register" ? "selected" : ""}
                    onClick={() => {
                      setMode("register");
                      reset();
                      setError("");
                    }}
                  >
                    {t.register}
                  </button>
                </div>
                {feedback}
                <form key={mode} onSubmit={handleSubmit(auth)}>
                  {mode === "register" && (
                    <>
                      <Field label={t.fullName}>
                        <input
                          {...register("fullName", { required: true })}
                          autoComplete="name"
                          required
                          minLength={2}
                          maxLength={120}
                        />
                      </Field>
                      <Field label={t.office}>
                        <input
                          {...register("officeName", { required: true })}
                          required
                          minLength={2}
                          maxLength={120}
                        />
                      </Field>
                    </>
                  )}
                  <Field
                    label={t.slug}
                    hint={mode === "register" ? t.slugHelp : undefined}
                  >
                    <input
                      {...register("slug", { required: true })}
                      dir="ltr"
                      autoCapitalize="none"
                      required
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      minLength={3}
                      maxLength={60}
                    />
                  </Field>
                  <Field label={t.email}>
                    <input
                      {...register("email", { required: true })}
                      type="email"
                      dir="ltr"
                      autoComplete="username"
                      required
                      maxLength={254}
                    />
                  </Field>
                  <Field
                    label={t.password}
                    hint={mode === "register" ? t.passwordHelp : undefined}
                  >
                    <input
                      {...register("password", { required: true })}
                      type="password"
                      dir="ltr"
                      autoComplete={
                        mode === "register"
                          ? "new-password"
                          : "current-password"
                      }
                      required
                      minLength={mode === "register" ? 12 : 1}
                      maxLength={128}
                    />
                  </Field>
                  {mode === "login" && (
                    <Field label={t.mfaCode} hint={t.mfaLoginHelp}>
                      <input
                        {...register("factor")}
                        autoComplete="one-time-code"
                        dir="ltr"
                        maxLength={16}
                        pattern="([0-9]{6}|[a-fA-F0-9]{16})"
                      />
                    </Field>
                  )}
                  {mode === "register" && (
                    <Field label={t.country}>
                      <select
                        {...register("countryCode")}
                        defaultValue="OM"
                        required
                      >
                        {countries.map((c) => (
                          <option key={c.code} value={c.code}>
                            {locale === "ar" ? c.nameAr : c.nameEn}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <button
                    className="primary full"
                    disabled={
                      busy || (mode === "register" && countries.length === 0)
                    }
                  >
                    {busy
                      ? t.wait
                      : mode === "login"
                        ? t.submitLogin
                        : t.submitRegister}
                    <ArrowUpLeft size={17} />
                  </button>
                </form>
                {mode === "login" && (
                  <button
                    className="icon-button full"
                    onClick={() => {
                      setRecoverOpen(true);
                      setError("");
                    }}
                  >
                    {t.forgotPassword}
                  </button>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    );
  const nav: [Tab, typeof Users, string?][] = [
    ["overview", LayoutDashboard],
    ["practice", Scale, "matters:read"],
    ["finance", ScrollText, "finance:read"],
    ["instruments", ScrollText, "instruments:read"],
    ["calendar", CalendarDays, "matters:read"],
    ["team", Users, "team:read"],
    ["roles", ShieldCheck, "roles:read"],
    ["audit", ScrollText, "audit:read"],
    ["sessions", Monitor],
    ["settings", Settings],
  ];
  const currentList = tab === "team" ? members : audit;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <Scale />
          </span>
          <span>
            {t.brand}
            <small>{t.tagline}</small>
          </span>
        </div>
        <div className="office-switch">
          <Building2 size={20} />
          <div>
            <small>{t.currentOffice}</small>
            <strong>{me.tenant.name}</strong>
          </div>
          <span className="live-dot" />
        </div>
        <div className="nav-label">{t.workspace}</div>
        <nav aria-label={t.workspace}>
          {nav
            .filter(([, , permission]) => !permission || can(permission))
            .map(([id, Icon]) => (
              <button
                key={id}
                className={`nav-item ${tab === id ? "active" : ""}`}
                onClick={() => {
                  setTab(id);
                  setPage(1);
                  setNotice("");
                  setError("");
                }}
              >
                <Icon size={19} />
                {t[id]}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="secure-box">
            <ShieldCheck size={20} />
            <span>{t.secureTitle}</span>
          </div>
          <div className="profile">
            <span className="avatar">{me.user.fullName.slice(0, 1)}</span>
            <div>
              <strong>{me.user.fullName}</strong>
              <small>{roleName(me.role)}</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header>
          <div className="breadcrumb">
            {t.workspace}
            <span>/</span>
            <strong>{t[tab]}</strong>
          </div>
          {controls}
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">{t.phase}</span>
              <h1>
                {tab === "overview"
                  ? `${t.welcome}، ${me.user.fullName.split(" ")[0]}`
                  : t[tab]}
              </h1>
              <p className="muted">
                {tab === "overview" ? t.realData : me.tenant.name}
              </p>
            </div>
            {tab === "team" && can("team:manage") && can("roles:read") && (
              <button
                className="primary"
                onClick={() => setModal({ type: "member" })}
              >
                <Plus size={17} />
                {t.addMember}
              </button>
            )}
            {tab === "roles" && can("roles:manage") && (
              <button
                className="primary"
                onClick={() => setModal({ type: "role" })}
              >
                <Plus size={17} />
                {t.addRole}
              </button>
            )}
          </div>
          {feedback}
          {loading ? (
            <div className="skeleton" aria-label={t.loading} aria-busy="true">
              <div />
              <div />
              <div />
            </div>
          ) : (
            <>
              {tab === "practice" && (
                <PracticeConsole
                  key={me.membership.id}
                  me={me}
                  locale={locale}
                />
              )}
              {tab === "finance" && (
                <FinanceConsole
                  key={me.membership.id}
                  me={me}
                  locale={locale}
                />
              )}
              {tab === "instruments" && (
                <InstrumentsConsole
                  key={me.membership.id}
                  me={me}
                  locale={locale}
                />
              )}
              {tab === "calendar" && (
                <CalendarConsole
                  key={me.membership.id}
                  me={me}
                  locale={locale}
                />
              )}
              {tab === "overview" && (
                <>
                  <div className="stats-grid">
                    {[
                      [t.activeMembers, stats?.activeMembers, Users, "team"],
                      [t.branches, stats?.branches, Building2, "settings"],
                      [t.roleCount, stats?.roles, ShieldCheck, "roles"],
                    ].map(([label, value, Icon, target], i) => {
                      const Symbol = Icon as typeof Users;
                      return (
                        <button
                          className="stat-card"
                          key={i}
                          onClick={() => {
                            if (value !== null) {
                              setTab(target as Tab);
                              setPage(1);
                            }
                          }}
                          disabled={value === null}
                        >
                          <div>
                            <span>{label as string}</span>
                            <Symbol size={21} />
                          </div>
                          <strong>
                            {value === null ? "—" : ((value as number) ?? "—")}
                          </strong>
                          <small>
                            {value === null ? t.unavailable : t.realData}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                  <section className="onboarding">
                    <div className="onboarding-icon">
                      <Scale size={40} />
                    </div>
                    <div>
                      <span className="eyebrow">{t.foundation}</span>
                      <h2>{t.gettingStarted}</h2>
                      <p>{t.startText}</p>
                      {can("team:read") && (
                        <button
                          className="primary"
                          onClick={() => setTab("team")}
                        >
                          {t.team}
                          <ArrowUpLeft size={17} />
                        </button>
                      )}
                    </div>
                  </section>
                  <div className="bottom-grid">
                    <section className="panel">
                      <h3>
                        <KeyRound size={19} />
                        {t.permissionsLabel}
                      </h3>
                      <div className="grant-list">
                        {me.role.permissions.map((p) => (
                          <span className="tag" key={p}>
                            <Check size={13} />
                            {
                              t.permissionNames[
                                p as keyof typeof t.permissionNames
                              ]
                            }
                          </span>
                        ))}
                      </div>
                    </section>
                    <section className="panel quiet">
                      <span className="eyebrow">{t.phase}</span>
                      <p>{t.notReady}</p>
                    </section>
                  </div>
                </>
              )}
              {tab === "team" && (
                <section className="panel">
                  <form
                    className="table-toolbar"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      setSearch(String(data.get("search") ?? ""));
                      setPage(1);
                    }}
                  >
                    <div className="search">
                      <Search size={17} />
                      <input
                        name="search"
                        placeholder={t.search}
                        aria-label={t.search}
                      />
                    </div>
                    <button className="secondary">
                      {t.search.split(" ")[0]}
                    </button>
                    <select
                      aria-label={t.name}
                      value={sort}
                      onChange={(e) => {
                        setSort(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="createdAt">{t.created}</option>
                      <option value="name">{t.name}</option>
                    </select>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setDirection(direction === "asc" ? "desc" : "asc")
                      }
                    >
                      {direction === "asc" ? "↑" : "↓"}
                    </button>
                  </form>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t.name}</th>
                          <th>{t.role}</th>
                          <th>{t.branch}</th>
                          <th>{t.status}</th>
                          <th>{t.edit}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.items.map((m) => (
                          <tr key={m.id}>
                            <td>
                              <strong>{m.user.fullName}</strong>
                              <small dir="ltr">{m.user.email}</small>
                            </td>
                            <td>{roleName(m.role)}</td>
                            <td>{m.branch.name}</td>
                            <td>
                              <span
                                className={`badge ${m.active ? "green" : "gray"}`}
                              >
                                {m.active ? t.active : t.suspended}
                              </span>
                            </td>
                            <td>
                              {m.role.key === "OWNER" ? (
                                <small>{t.ownerProtected}</small>
                              ) : (
                                can("team:manage") &&
                                can("roles:read") &&
                                m.id !== me.membership.id && (
                                  <button
                                    className="secondary"
                                    onClick={() =>
                                      setModal({ type: "member", member: m })
                                    }
                                  >
                                    {t.edit}
                                  </button>
                                )
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {members.items.length === 0 && (
                      <p className="empty">{t.empty}</p>
                    )}
                  </div>
                </section>
              )}
              {tab === "roles" && (
                <div className="roles-grid">
                  {roles.map((role) => (
                    <section className="panel role-card" key={role.id}>
                      <div className="role-head">
                        <ShieldCheck size={22} />
                        <h3>{roleName(role)}</h3>
                      </div>
                      <code>{role.key}</code>
                      <div className="grant-list">
                        {role.permissions.map((p) => (
                          <span key={p} className="tag">
                            {
                              t.permissionNames[
                                p as keyof typeof t.permissionNames
                              ]
                            }
                          </span>
                        ))}
                      </div>
                      {can("roles:manage") &&
                        role.key !== "OWNER" &&
                        role.id !== me.role.id && (
                          <button
                            className="secondary"
                            onClick={() => setModal({ type: "role", role })}
                          >
                            {t.edit}
                          </button>
                        )}
                    </section>
                  ))}
                </div>
              )}
              {tab === "settings" && (
                <section className="panel settings-panel">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      const parsed = tenantPatchSchema.safeParse({
                        name: data.get("name"),
                        timezone: data.get("timezone"),
                      });
                      if (!parsed.success) {
                        setError(t.errors.VALIDATION_ERROR);
                        return;
                      }
                      void mutate(async () => {
                        await api("tenants/current", "PATCH", parsed.data);
                        setMe(await api<Me>("auth/me"));
                      });
                    }}
                  >
                    <Field label={t.office}>
                      <input
                        name="name"
                        defaultValue={me.tenant.name}
                        disabled={!can("workspace:manage")}
                        required
                        minLength={2}
                        maxLength={120}
                      />
                    </Field>
                    <Field label={t.timezone}>
                      <input
                        name="timezone"
                        dir="ltr"
                        defaultValue={me.tenant.timezone}
                        disabled={!can("workspace:manage")}
                        required
                      />
                    </Field>
                    <Field label={t.slugReadonly}>
                      <input value={me.tenant.slug} readOnly dir="ltr" />
                    </Field>
                    <Field label={t.currency}>
                      <input value={me.tenant.currency} readOnly />
                    </Field>
                    {can("workspace:manage") && (
                      <button className="primary" disabled={busy}>
                        {busy ? t.wait : t.save}
                      </button>
                    )}
                  </form>
                </section>
              )}
              {tab === "sessions" && (
                <>
                  <MfaPanel
                    locale={locale}
                    onChange={() =>
                      api<Session[]>("auth/sessions").then(setSessions)
                    }
                  />
                  <section className="panel">
                    <div className="section-head">
                      <h3>{t.sessions}</h3>
                      <button
                        className="secondary"
                        onClick={() =>
                          setConfirmAction(() => async () => {
                            await api("auth/revoke-others", "POST", {});
                          })
                        }
                      >
                        {t.revokeOthers}
                      </button>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{t.device}</th>
                            <th>{t.created}</th>
                            <th>{t.expires}</th>
                            <th>{t.revoke}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sessions.map((s) => (
                            <tr key={s.id}>
                              <td className="device">{s.userAgent || "—"}</td>
                              <td>{date(s.createdAt)}</td>
                              <td>{date(s.expiresAt)}</td>
                              <td>
                                <button
                                  className="secondary"
                                  onClick={() =>
                                    setConfirmAction(() => async () => {
                                      await api(
                                        `auth/sessions/${s.id}`,
                                        "DELETE",
                                      );
                                      try {
                                        setMe(await api<Me>("auth/me"));
                                      } catch (err) {
                                        if (
                                          err instanceof ApiError &&
                                          err.code === "UNAUTHENTICATED"
                                        )
                                          setMe(null);
                                        else throw err;
                                      }
                                    })
                                  }
                                >
                                  {t.revoke}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!sessions.length && <p className="empty">{t.empty}</p>}
                    </div>
                  </section>
                </>
              )}
              {tab === "audit" && (
                <section className="panel">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t.action}</th>
                          <th>{t.created}</th>
                          <th>{t.actor}</th>
                          <th>{t.resource}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audit.items.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <code>{a.action}</code>
                            </td>
                            <td>{date(a.createdAt)}</td>
                            <td>
                              <code>{a.actorId?.slice(0, 8) ?? "—"}</code>
                            </td>
                            <td>
                              <code>{a.resourceId?.slice(0, 8) ?? "—"}</code>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!audit.items.length && <p className="empty">{t.empty}</p>}
                  </div>
                </section>
              )}
              {(tab === "team" || tab === "audit") && (
                <div className="pagination">
                  <span>
                    {t.total}: {currentList.total}
                  </span>
                  <div>
                    <button
                      className="secondary"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      {t.prev}
                    </button>
                    <span>{page}</span>
                    <button
                      className="secondary"
                      disabled={page * 10 >= currentList.total}
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
          {t.brand}
          <span>{t.foundation}</span>
        </footer>
      </div>
      {modal && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <div className="section-head">
              <h2 id="dialog-title">
                {modal.type === "member"
                  ? modal.member
                    ? t.edit
                    : t.addMember
                  : modal.role
                    ? t.edit
                    : t.addRole}
              </h2>
              <button
                className="icon-button"
                onClick={() => setModal(null)}
                aria-label={t.cancel}
              >
                <X />
              </button>
            </div>
            {feedback}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                if (modal.type === "member") {
                  const input = modal.member
                    ? memberPatchSchema.safeParse({
                        roleId: data.get("roleId"),
                        branchId: data.get("branchId"),
                        active: data.get("active") === "true",
                      })
                    : memberSchema.safeParse(Object.fromEntries(data));
                  if (!input.success) {
                    setError(t.errors.VALIDATION_ERROR);
                    return;
                  }
                  void mutate(async () => {
                    await api(
                      modal.member ? `users/${modal.member.id}` : "users",
                      modal.member ? "PATCH" : "POST",
                      input.data,
                    );
                  });
                } else {
                  const input = roleSchema.safeParse({
                    name: data.get("name"),
                    key: data.get("key"),
                    permissions: data.getAll("permissions"),
                  });
                  if (!input.success) {
                    setError(t.errors.VALIDATION_ERROR);
                    return;
                  }
                  void mutate(async () => {
                    await api(
                      modal.role ? `roles/${modal.role.id}` : "roles",
                      modal.role ? "PATCH" : "POST",
                      input.data,
                    );
                  });
                }
              }}
            >
              {modal.type === "member" ? (
                <>
                  {!modal.member && (
                    <>
                      <p className="muted small-text">{t.memberNote}</p>
                      <Field label={t.fullName}>
                        <input
                          name="fullName"
                          required
                          minLength={2}
                          maxLength={120}
                        />
                      </Field>
                      <Field label={t.email}>
                        <input name="email" type="email" dir="ltr" required />
                      </Field>
                      <Field label={t.password} hint={t.passwordHelp}>
                        <input
                          name="password"
                          type="password"
                          dir="ltr"
                          autoComplete="new-password"
                          required
                          minLength={12}
                          maxLength={128}
                        />
                      </Field>
                    </>
                  )}
                  <Field label={t.role}>
                    <select
                      name="roleId"
                      defaultValue={modal.member?.role.id}
                      required
                    >
                      {roles
                        .filter(
                          (r) =>
                            r.key !== "OWNER" &&
                            canDelegate(me.role.permissions, r.permissions),
                        )
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {roleName(r)}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label={t.branch}>
                    <select
                      name="branchId"
                      defaultValue={modal.member?.branch.id}
                      required
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {modal.member && (
                    <Field label={t.status}>
                      <select
                        name="active"
                        defaultValue={String(modal.member.active)}
                      >
                        <option value="true">{t.active}</option>
                        <option value="false">{t.suspended}</option>
                      </select>
                    </Field>
                  )}
                </>
              ) : (
                <>
                  <Field label={t.name}>
                    <input
                      name="name"
                      defaultValue={modal.role?.name}
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </Field>
                  <Field label={t.key}>
                    <input
                      name="key"
                      dir="ltr"
                      defaultValue={modal.role?.key}
                      required
                      pattern="[A-Z][A-Z0-9_]{1,40}"
                    />
                  </Field>
                  <fieldset>
                    <legend>{t.grants}</legend>
                    {permissions
                      .filter((p) => can(p))
                      .map((p) => (
                        <label className="checkbox" key={p}>
                          <input
                            type="checkbox"
                            name="permissions"
                            value={p}
                            defaultChecked={
                              modal.role?.permissions.includes(p) ?? false
                            }
                          />
                          {t.permissionNames[p]}
                        </label>
                      ))}
                  </fieldset>
                </>
              )}
              <div className="form-actions">
                <button className="primary" disabled={busy}>
                  {busy ? t.wait : t.save}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => setModal(null)}
                >
                  {t.cancel}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {confirmAction && (
        <div className="modal-backdrop">
          <section
            className="modal confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h2 id="confirm-title">{t.confirm}</h2>
            <p>{t.confirmText}</p>
            {feedback}
            <div className="form-actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() => void mutate(confirmAction)}
              >
                {t.confirm}
              </button>
              <button
                className="secondary"
                onClick={() => setConfirmAction(null)}
              >
                {t.cancel}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const control = isValidElement<{ id?: string; "aria-describedby"?: string }>(
    children,
  )
    ? cloneElement(children, {
        id,
        "aria-describedby": hint ? `${id}-hint` : undefined,
      })
    : children;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {control}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
