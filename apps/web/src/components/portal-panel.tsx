"use client";
import { useState, useEffect, useCallback, type FormEvent } from "react";
import { api, ApiError, type Me, type Page, type Member } from "../lib/api";
import { MfaPanel } from "./mfa-panel";
import { recordLabel } from "../lib/record-labels";
type Message = { id: string; sender: string; body: string; createdAt: string };
type Request = {
  id: string;
  kind: string;
  body: string;
  status: string;
  response: string;
  preferredAt: string | null;
};
type Inbox = {
  messages: Message[];
  requests: Request[];
  access?: { id: string; memberId: string; active: boolean }[];
};
type Snapshot = {
  client: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  matters: { id: string; reference: string; title: string; status: string }[];
  hearings: {
    id: string;
    startsAt: string;
    status: string;
    room: string;
    outcome: string;
  }[];
  documents: {
    id: string;
    versionId: string;
    title: string;
    filename: string;
  }[];
  invoices: {
    id: string;
    sequence: number;
    description: string;
    totalMinor: number;
    paidMinor: number;
    dueAt: string;
  }[];
};
export function StaffPortalPanel({
  clientId,
  locale,
  me,
}: {
  clientId: string;
  locale: "ar" | "en";
  me: Me;
}) {
  const tr = (a: string, e: string) => (locale === "ar" ? a : e);
  const [inbox, setInbox] = useState<Inbox | null>(null),
    [members, setMembers] = useState<Member[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  const fail = useCallback(
    (e: unknown) =>
      setError(
        e instanceof ApiError
          ? e.code
          : locale === "ar"
            ? "تعذرت العملية"
            : "Request failed",
      ),
    [locale],
  );
  useEffect(() => {
    let live = true;
    Promise.all([
      api<Inbox>(`practice/clients/${clientId}/portal`),
      me.role.permissions.includes("team:read")
        ? api<Page<Member>>("users?pageSize=100")
        : Promise.resolve(null),
    ])
      .then(([i, m]) => {
        if (live) {
          setInbox(i);
          setMembers(
            m?.items.filter((u) => u.active && u.role.key === "CLIENT") ?? [],
          );
        }
      })
      .catch((e) => {
        if (live) fail(e);
      });
    return () => {
      live = false;
    };
  }, [clientId, version, me.role.permissions, fail]);
  async function act(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, "POST", body);
      setVersion((v) => v + 1);
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h3>{tr("بوابة الموكل والتواصل", "Client portal & communication")}</h3>
      {error && <p role="alert">{error}</p>}
      <p className="muted">
        {tr(
          "أنشئ حساباً بدور «الموكل» من فريق المكتب، ثم اربطه هنا. تُنشر القضايا والمستندات من صفحاتها بشكل مستقل.",
          "Create a Client account from the firm team, then link it here. Publish matters and documents independently from their detail pages.",
        )}
      </p>
      <form
        className="practice-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          void act(`practice/clients/${clientId}/portal-access`, {
            memberId: fd.get("memberId"),
            active: true,
          });
        }}
      >
        <label>
          {tr("حساب الموكل", "Client account")}
          <select
            name="memberId"
            aria-label={tr("حساب الموكل", "Client account")}
            required
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.user.fullName} · {m.user.email}
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy || !members.length} type="submit">
          {tr("ربط الحساب", "Link account")}
        </button>
      </form>
      {inbox?.access?.map((a) => (
        <div key={a.id} className="practice-toolbar">
          <span>
            {members.find((m) => m.id === a.memberId)?.user.fullName ??
              tr("حساب مرتبط", "Linked account")}{" "}
            · {a.active ? tr("مفعّل", "Enabled") : tr("معطّل", "Disabled")}
          </span>
          <button
            disabled={busy}
            onClick={() =>
              void act(`practice/clients/${clientId}/portal-access`, {
                memberId: a.memberId,
                active: !a.active,
              })
            }
          >
            {a.active
              ? tr("إيقاف الوصول", "Revoke access")
              : tr("تفعيل الوصول", "Enable access")}
          </button>
        </div>
      ))}
      <h4>{tr("الرسائل", "Messages")}</h4>
      <form
        className="practice-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const body = new FormData(form).get("body");
          void act(`practice/clients/${clientId}/portal-messages`, {
            body,
          }).then((ok) => {
            if (ok) form.reset();
          });
        }}
      >
        <label className="wide">
          {tr("رسالة للموكل", "Message to client")}
          <textarea name="body" required maxLength={5000} />
        </label>
        <button type="submit" disabled={busy}>
          {tr("إرسال", "Send")}
        </button>
      </form>
      {inbox?.messages.map((m) => (
        <article className="portal-message" key={m.id}>
          <small>
            {m.sender === "STAFF"
              ? tr("المكتب", "Firm")
              : tr("الموكل", "Client")}
          </small>
          <p>{m.body}</p>
        </article>
      ))}
      <h4>{tr("الطلبات", "Requests")}</h4>
      {inbox?.requests.map((r) => (
        <form
          key={r.id}
          className="portal-message practice-form"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void act(`practice/portal-requests/${r.id}/respond`, {
              status: fd.get("status"),
              response: fd.get("response"),
            });
          }}
        >
          <p className="wide">
            {recordLabel(r.kind, locale)} · {r.body}
            {r.preferredAt &&
              ` · ${new Date(r.preferredAt).toLocaleString(locale)}`}
          </p>
          <label>
            {tr("الحالة", "Status")}
            <select name="status" defaultValue={r.status}>
              <option value="OPEN">{tr("مفتوح", "Open")}</option>
              <option value="ACCEPTED">{tr("مقبول", "Accepted")}</option>
              <option value="REJECTED">{tr("مرفوض", "Rejected")}</option>
              <option value="COMPLETED">{tr("مكتمل", "Completed")}</option>
            </select>
          </label>
          <label>
            {tr("رد المكتب", "Firm response")}
            <textarea
              name="response"
              maxLength={5000}
              defaultValue={r.response}
            />
          </label>
          <button disabled={busy} type="submit">
            {tr("تحديث الطلب", "Update request")}
          </button>
        </form>
      ))}
    </section>
  );
}
export function ClientPortal() {
  const [locale, setLocale] = useState<"ar" | "en">("ar"),
    [me, setMe] = useState<Me | null>(null),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [inbox, setInbox] = useState<Inbox | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0),
    [decimals, setDecimals] = useState(3);
  const tr = (a: string, e: string) => (locale === "ar" ? a : e);
  const fail = useCallback(
    (e: unknown) => {
      const code = e instanceof ApiError ? e.code : "FAILED";
      if (
        ["UNAUTHENTICATED", "PORTAL_ACCESS_UNAVAILABLE", "FORBIDDEN"].includes(
          code,
        )
      ) {
        setSnapshot(null);
        setInbox(null);
        setMe(null);
      }
      setError(
        code === "PORTAL_ACCESS_UNAVAILABLE"
          ? locale === "ar"
            ? "لم يربط المكتب حسابك بملف موكل نشط بعد. يرجى التواصل مع المكتب."
            : "The firm has not linked your account to an active client profile. Contact the firm."
          : code === "UNAUTHENTICATED"
            ? locale === "ar"
              ? "يرجى تسجيل الدخول بحساب الموكل"
              : "Sign in with your client account"
            : code,
      );
    },
    [locale],
  );
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);
  useEffect(() => {
    let live = true;
    Promise.all([
      api<Me>("auth/me"),
      api<Snapshot>("portal"),
      api<Inbox>("portal/messages"),
      api<{ code: string; currencyDecimals: number }[]>("countries"),
    ])
      .then(([m, s, i, c]) => {
        if (live) {
          setMe(m);
          setSnapshot(s);
          setInbox(i);
          setDecimals(
            c.find((v) => v.code === m.tenant.countryCode)?.currencyDecimals ??
              3,
          );
          setError("");
        }
      })
      .catch((e) => {
        if (live) fail(e);
      });
    return () => {
      live = false;
    };
  }, [version, fail]);
  const money = (n: number) =>
    `${(n / 10 ** decimals).toFixed(decimals)} ${me?.tenant.currency ?? ""}`;
  async function submit(e: FormEvent<HTMLFormElement>, path: string) {
    e.preventDefault();
    const form = e.currentTarget,
      fd = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = { body: fd.get("body") };
      if (path === "requests") {
        body.kind = fd.get("kind");
        if (fd.get("preferredAt"))
          body.preferredAt = new Date(
            String(fd.get("preferredAt")),
          ).toISOString();
      }
      await api(`portal/${path}`, "POST", body);
      form.reset();
      setVersion((v) => v + 1);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="client-portal">
      <header className="practice-toolbar">
        <div>
          <small>{tr("بوابة الموكل", "Client portal")}</small>
          <h1>{me?.tenant.name ?? tr("مساحة الموكل", "Client workspace")}</h1>
        </div>
        <button onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>
          {tr("English", "العربية")}
        </button>
        {me && (
          <button
            onClick={async () => {
              await api("auth/logout", "POST", {});
              window.location.assign("/");
            }}
          >
            {tr("تسجيل الخروج", "Sign out")}
          </button>
        )}
      </header>
      {error && (
        <div className="alert error" role="alert">
          {error}
          <p>
            <a href="/">{tr("صفحة تسجيل الدخول", "Sign-in page")}</a>
          </p>
        </div>
      )}
      {!snapshot && !error && (
        <p role="status">{tr("جارٍ التحميل…", "Loading…")}</p>
      )}
      {snapshot && (
        <>
          <details className="panel">
            <summary>
              {tr(
                "أمان الحساب والمصادقة الثنائية",
                "Account security & two-factor authentication",
              )}
            </summary>
            <MfaPanel
              locale={locale}
              onChange={async () => {
                setVersion((v) => v + 1);
              }}
            />
          </details>
          <article className="panel">
            <h2>{snapshot.client.name}</h2>
            {(snapshot.client.email || snapshot.client.phone) && (
              <p>
                {[snapshot.client.email, snapshot.client.phone]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <p>{snapshot.client.address}</p>
          </article>
          <h2>{tr("القضايا المنشورة لك", "Matters shared with you")}</h2>
          <div className="practice-records">
            {snapshot.matters.map((m) => (
              <article className="panel" key={m.id}>
                <small>{m.reference}</small>
                <h3>{m.title}</h3>
                <p>{recordLabel(m.status, locale)}</p>
              </article>
            ))}
            {!snapshot.matters.length && (
              <p>
                {tr(
                  "لا توجد قضايا منشورة لك حالياً",
                  "No matters are currently shared with you",
                )}
              </p>
            )}
          </div>
          <h2>{tr("الجلسات", "Hearings")}</h2>
          <div className="practice-records">
            {snapshot.hearings.map((h) => (
              <article className="panel" key={h.id}>
                <h3>
                  {new Date(h.startsAt).toLocaleString(locale, {
                    timeZone: me?.tenant.timezone,
                  })}
                </h3>
                <p>
                  {h.room} · {recordLabel(h.status, locale)}
                </p>
                <p>{h.outcome}</p>
              </article>
            ))}
          </div>
          <h2>{tr("المستندات المعتمدة", "Approved documents")}</h2>
          <div className="practice-records">
            {snapshot.documents.map((d) => (
              <article className="panel" key={d.id}>
                <h3>{d.title}</h3>
                <a href={`/api/v1/portal/files/${d.versionId}`}>
                  {tr("تنزيل المستند", "Download document")} · {d.filename}
                </a>
              </article>
            ))}
          </div>
          <h2>{tr("الفواتير", "Invoices")}</h2>
          <div className="practice-records">
            {snapshot.invoices.map((i) => (
              <article className="panel" key={i.id}>
                <h3>
                  #{i.sequence} · {i.description}
                </h3>
                <p>
                  {tr("الإجمالي", "Total")}: {money(i.totalMinor)}
                </p>
                <p>
                  {tr("المدفوع", "Paid")}: {money(i.paidMinor)}
                </p>
                <strong>
                  {tr("المتبقي", "Outstanding")}:{" "}
                  {money(i.totalMinor - i.paidMinor)}
                </strong>
                <p>{new Date(i.dueAt).toLocaleDateString(locale)}</p>
              </article>
            ))}
          </div>
          <div className="practice-records">
            <article className="panel">
              <h2>{tr("التواصل مع المكتب", "Contact the firm")}</h2>
              <form
                className="practice-form"
                onSubmit={(e) => void submit(e, "messages")}
              >
                <label className="wide">
                  {tr("رسالتك", "Your message")}
                  <textarea name="body" required maxLength={5000} />
                </label>
                <button type="submit" disabled={busy}>
                  {tr("إرسال الرسالة", "Send message")}
                </button>
              </form>
              {inbox?.messages.map((m) => (
                <article className="portal-message" key={m.id}>
                  <small>
                    {m.sender === "STAFF"
                      ? tr("المكتب", "Firm")
                      : tr("أنت", "You")}
                  </small>
                  <p>{m.body}</p>
                </article>
              ))}
            </article>
            <article className="panel">
              <h2>{tr("إرسال طلب", "Send a request")}</h2>
              <form
                className="practice-form"
                onSubmit={(e) => void submit(e, "requests")}
              >
                <label className="wide">
                  {tr("نوع الطلب", "Request type")}
                  <select name="kind">
                    <option value="APPOINTMENT">
                      {tr("طلب موعد", "Appointment")}
                    </option>
                    <option value="CONTACT_UPDATE">
                      {tr("طلب تحديث بيانات الاتصال", "Contact details update")}
                    </option>
                    <option value="DOCUMENT_REQUEST">
                      {tr("طلب مستند", "Document request")}
                    </option>
                    <option value="OTHER">
                      {tr("طلب آخر", "Other request")}
                    </option>
                  </select>
                </label>
                <label className="wide">
                  {tr("تفاصيل الطلب", "Request details")}
                  <textarea
                    name="body"
                    required
                    minLength={2}
                    maxLength={5000}
                  />
                </label>
                <label className="wide">
                  {tr(
                    "موعد مقترح بتوقيت جهازك (اختياري)",
                    "Preferred time in your device timezone (optional)",
                  )}
                  <input name="preferredAt" type="datetime-local" />
                </label>
                <button disabled={busy} type="submit">
                  {tr("إرسال الطلب", "Submit request")}
                </button>
              </form>
              {inbox?.requests.map((r) => (
                <article className="portal-message" key={r.id}>
                  <strong>
                    {recordLabel(r.kind, locale)} ·{" "}
                    {recordLabel(r.status, locale)}
                  </strong>
                  <p>{r.body}</p>
                  <p>{r.response}</p>
                </article>
              ))}
            </article>
          </div>
        </>
      )}
    </main>
  );
}
