"use client";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
} from "react";
import {
  Plus,
  X,
  FileText,
  Bell,
  Check,
  Download,
  ArrowRight,
} from "lucide-react";
import { api, ApiError, type Me, type Member, type Page } from "../lib/api";
import {
  parseInstrumentMinor,
  formatInstrumentMinor,
} from "@legal/contracts/instrument-money";
type Kind = "CONTRACT" | "POWER_OF_ATTORNEY" | "LICENCE";
type Instrument = {
  id: string;
  kind: Kind;
  title: string;
  reference: string;
  referenceNumber: string | null;
  category: string;
  clientId: string;
  matterId: string | null;
  documentId: string | null;
  documentVersionId: string | null;
  responsibleId: string;
  partyOne: string;
  partyTwo: string;
  agent: string;
  issuingAuthority: string;
  issuedAt: string;
  startsAt: string | null;
  endsAt: string | null;
  renewalAt: string | null;
  amountMinor: string | null;
  currency: string;
  currencyDecimals: number;
  terms: string;
  notes: string;
  reminderDays: number[];
  status: string;
  effectiveStatus: string;
  confidentiality: string;
  version: number;
  approvedAt: string | null;
};
type Obligation = {
  id: string;
  title: string;
  description: string;
  dueAt: string;
  status: string;
  amountMinor: string | null;
  currency: string;
  currencyDecimals: number;
  version: number;
};
type Detail = Instrument & {
  client: { id: string; name: string } | null;
  matter: { id: string; reference: string } | null;
  responsible: { id: string; user: { fullName: string } } | null;
  document: { id: string; title: string; status: string } | null;
  obligations: Obligation[];
  reminders: {
    id: string;
    kind: string;
    dueAt: string;
    readAt: string | null;
  }[];
  events: {
    id: string;
    action: string;
    createdAt: string;
    details?: { before?: Partial<Instrument>; after?: Partial<Instrument> };
  }[];
};
type Reminder = {
  id: string;
  kind: string;
  dueAt: string;
  instrument: { id: string; title: string; reference: string };
};
type Choice = { id: string; name: string };
type Catalog = {
  currencies: { currency: string; currencyDecimals: number }[];
  timezone: string;
  today: string;
};
export function InstrumentsConsole({
  me,
  locale,
}: {
  me: Me;
  locale: "ar" | "en";
}) {
  const tr = (a: string, e: string) => (locale === "ar" ? a : e),
    can = useCallback(
      (p: string) => me.role.permissions.includes(p),
      [me.role.permissions],
    );
  const [kind, setKind] = useState<Kind | "REMINDERS">("CONTRACT"),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [expiry, setExpiry] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<Page<Instrument>>({
      items: [],
      total: 0,
      page: 1,
      pageSize: 12,
    }),
    [detail, setDetail] = useState<Detail | null>(null),
    [reminders, setReminders] = useState<Reminder[]>([]),
    [catalog, setCatalog] = useState<Catalog | null>(null);
  const [clients, setClients] = useState<Choice[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [matters, setMatters] = useState<{ id: string; reference: string }[]>([]),
    [documents, setDocuments] = useState<{ id: string; title: string }[]>([]);
  const [clientSearch, setClientSearch] = useState(""),
    [memberSearch, setMemberSearch] = useState(""),
    [matterSearch, setMatterSearch] = useState(""),
    [documentSearch, setDocumentSearch] = useState("");
  const [clientId, setClientId] = useState(""),
    [clientLabel, setClientLabel] = useState(""),
    [responsibleId, setResponsibleId] = useState(me.membership.id),
    [responsibleLabel, setResponsibleLabel] = useState(me.user.fullName),
    [matterId, setMatterId] = useState(""),
    [documentId, setDocumentId] = useState(""),
    [currency, setCurrency] = useState(me.tenant.currency);
  const [modal, setModal] = useState<"record" | "obligation" | null>(null),
    [editor, setEditor] = useState<Detail | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const fail = useCallback(
    (e: unknown) => {
      const code =
        e instanceof ApiError
          ? e.code
          : e instanceof Error
            ? e.message
            : "FAILED";
      const messages: Record<string, [string, string]> = {
        INSTRUMENT_READ_REQUIRED: [
          "يلزم منح صلاحيات قراءة العقود والموكلين",
          "Contract and client read permissions are required",
        ],
        INVALID_RESPONSIBLE: [
          "اختر مسؤولاً نشطاً لديه صلاحيات قراءة العقود والموكلين",
          "Choose an active responsible member with contract and client access",
        ],
        INSTRUMENT_DETAILS_REQUIRED: [
          "راجع الأطراف وبيانات الوكالة وتسلسل التواريخ",
          "Check parties, agency details and date order",
        ],
        VALIDATION_ERROR: [
          "راجع الحقول الإلزامية والتواريخ وفترات التذكير",
          "Check required fields, dates and reminders",
        ],
        STALE_VERSION: [
          "عدّل مستخدم آخر هذا السجل؛ أعد فتحه قبل الحفظ",
          "This record changed; reopen before saving",
        ],
        CONFLICT: [
          "رقم المرجع الخارجي مستخدم في سجل آخر من النوع نفسه",
          "External reference is already used for this record type",
        ],
        MATTER_CLIENT_MISMATCH: [
          "القضية أو المستند لا يتطابق مع الموكل المحدد",
          "Matter or document does not match the selected client",
        ],
        REVIEW_REQUIRED: [
          "اعتمد الإصدار الحالي للمستند أولاً وتحقق من صلاحية الاطلاع عليه",
          "Approve the current source document first and check access",
        ],
        CLIENT_ARCHIVED: [
          "أعد تفعيل ملف الموكل قبل اعتماد سجل جديد له",
          "Reactivate the client profile before approval",
        ],
        INSTRUMENT_CLOSED: [
          "أعد السجل إلى المسودة قبل إضافة التزامات",
          "Return the record to draft before adding obligations",
        ],
        UNKNOWN_CURRENCY: [
          "العملة غير مهيأة؛ راجع إعدادات الدول والعملات",
          "Currency is not configured",
        ],
        INVALID_AMOUNT: [
          "راجع المبلغ ودقته وفترات التذكير",
          "Check amount precision and reminder periods",
        ],
        TENANT_READ_ONLY: ["المكتب في وضع القراءة فقط", "Firm is read-only"],
        NOT_FOUND: ["السجل غير موجود أو غير مصرح به", "Record unavailable"],
        FORBIDDEN: ["لا تملك الصلاحية المطلوبة", "Permission denied"],
      };
      setError(
        messages[code]?.[locale === "ar" ? 0 : 1] ??
          (locale === "ar"
            ? "تعذر إتمام العملية"
            : "Unable to complete request"),
      );
    },
    [locale],
  );
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      Promise.all([
        api<Catalog>("instruments/catalog"),
        api<Page<Choice>>(
          `practice/clients?pageSize=100&search=${encodeURIComponent(clientSearch)}`,
        ),
        can("team:read")
          ? api<Page<Member>>(
              `users?pageSize=100&search=${encodeURIComponent(memberSearch)}`,
            )
          : Promise.resolve(null),
      ])
        .then(([c, cl, m]) => {
          if (live) {
            setCatalog(c);
            setClients(cl.items);
            setMembers(
              m?.items.filter(
                (v) =>
                  v.active &&
                  v.role.permissions.includes("instruments:read") &&
                  v.role.permissions.includes("clients:read"),
              ) ?? [],
            );
          }
        })
        .catch((e) => {
          if (live) fail(e);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [clientSearch, memberSearch, revision, can, fail]);
  useEffect(() => {
    if (!modal || !clientId) return;
    let live = true;
    const timer = setTimeout(() => {
      const query = new URLSearchParams({
          clientId,
          pageSize: "100",
          search: matterSearch,
        }),
        dq = new URLSearchParams({
          clientId,
          pageSize: "100",
          search: documentSearch,
        });
      if (matterId) dq.set("matterId", matterId);
      Promise.all([
        can("matters:read")
          ? api<Page<{ id: string; reference: string }>>(
              `practice/matters?${query}`,
            )
          : Promise.resolve(null),
        can("documents:read")
          ? api<Page<{ id: string; title: string }>>(`practice/documents?${dq}`)
          : Promise.resolve(null),
      ])
        .then(([m, d]) => {
          if (live) {
            setMatters(m?.items ?? []);
            setDocuments(d?.items ?? []);
          }
        })
        .catch((e) => {
          if (live) fail(e);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [modal, clientId, matterId, matterSearch, documentSearch, can, fail]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        if (kind === "REMINDERS") {
          const r = await api<Reminder[]>("instruments/notifications");
          if (live) setReminders(r);
        } else {
          const q = new URLSearchParams({
            kind,
            search,
            page: String(page),
            pageSize: "12",
          });
          if (status) q.set("status", status);
          if (expiry) q.set("expiringWithinDays", expiry);
          const r = await api<Page<Instrument>>(`instruments?${q}`);
          if (live) setRows(r);
        }
      } catch (e) {
        if (live) fail(e);
      } finally {
        if (live) setLoading(false);
      }
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kind, search, status, expiry, page, revision, fail]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  const label = (s: string) => {
    const a: Record<string, string> = {
      CONTRACT: "العقود",
      POWER_OF_ATTORNEY: "الوكالات",
      LICENCE: "التراخيص",
      REMINDERS: "التذكيرات",
      DRAFT: "مسودة",
      ACTIVE: "معتمد",
      EXPIRED: "منتهي حسب التاريخ المسجل",
      CLOSED: "مغلق",
      CANCELLED: "ملغى",
      ARCHIVED: "مؤرشف",
      NORMAL: "عادي",
      CONFIDENTIAL: "سري",
      RESTRICTED: "مقيد",
      TODO: "لم يبدأ",
      IN_PROGRESS: "قيد التنفيذ",
      DONE: "مكتمل",
      EXPIRY: "تذكير الانتهاء",
      RENEWAL: "تذكير التجديد",
      OBLIGATION: "تذكير الالتزام",
      "instrument.created": "إنشاء السجل",
      "instrument.updated": "تعديل السجل",
      "instrument.approved": "اعتماد السجل",
      "instrument.obligation_created": "إضافة التزام",
      "instrument.obligation_updated": "تحديث التزام",
    };
    return locale === "ar"
      ? (a[s] ?? s)
      : s.replaceAll("_", " ").replaceAll(".", " ").toLowerCase();
  };
  const day = (s: string | null) =>
      s ? new Date(s).toLocaleDateString(locale, { timeZone: "UTC" }) : "—",
    dt = (s: string) =>
      new Date(s).toLocaleString(locale, { timeZone: me.tenant.timezone });
  const money = (v: string | null, c: string, d: number) =>
    v === null ? "—" : `${formatInstrumentMinor(v, d)} ${c}`;
  const open = async (id: string) => {
    setError("");
    try {
      setDetail(await api<Detail>(`instruments/${id}`));
    } catch (e) {
      fail(e);
    }
  };
  const changed = () => {
    setRevision((v) => v + 1);
    setNotice(
      tr("تم حفظ السجل وتوثيق التغيير", "Record saved and change audited"),
    );
  };
  async function act(path: string, method = "POST", body: unknown = {}) {
    setBusy(true);
    setError("");
    try {
      await api(path, method, body);
      changed();
      if (detail) await open(detail.id);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  function edit(d: Detail | null) {
    setEditor(d);
    setClientId(d?.clientId ?? clients[0]?.id ?? "");
    setClientLabel(d?.client?.name ?? clients[0]?.name ?? "");
    setResponsibleId(d?.responsibleId ?? me.membership.id);
    setResponsibleLabel(d?.responsible?.user.fullName ?? me.user.fullName);
    setMatterId(d?.matterId ?? "");
    setDocumentId(d?.documentId ?? "");
    setCurrency(d?.currency ?? me.tenant.currency);
    setClientSearch("");
    setMemberSearch("");
    setMatterSearch("");
    setDocumentSearch("");
    setError("");
    setModal("record");
  }
  const precision = () => {
    if (editor?.currency === currency) return editor.currencyDecimals;
    const p = catalog?.currencies.find(
      (c) => c.currency === currency,
    )?.currencyDecimals;
    if (p === undefined) throw new Error("UNKNOWN_CURRENCY");
    return p;
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (modal === "obligation" && detail) {
        const raw = String(fd.get("amount") ?? "");
        await api(`instruments/${detail.id}/obligations`, "POST", {
          title: fd.get("title"),
          description: fd.get("description"),
          dueAt: new Date(String(fd.get("dueAt"))).toISOString(),
          amountMinor: raw
            ? parseInstrumentMinor(raw, detail.currencyDecimals)
            : null,
        });
        await open(detail.id);
      } else {
        const data: Record<string, unknown> = {};
        for (const key of [
          "title",
          "category",
          "referenceNumber",
          "partyOne",
          "partyTwo",
          "agent",
          "issuingAuthority",
          "issuedAt",
          "startsAt",
          "endsAt",
          "renewalAt",
          "terms",
          "notes",
          "confidentiality",
        ])
          data[key] = fd.get(key) ?? "";
        for (const key of [
          "referenceNumber",
          "startsAt",
          "endsAt",
          "renewalAt",
        ])
          if (!data[key]) data[key] = null;
        data.currency = currency;
        data.responsibleId = responsibleId;
        data.reminderDays = String(fd.get("reminderDays") ?? "")
          .split(/[,،]/)
          .map((v) => v.trim())
          .filter(Boolean)
          .map((v) => Number(parseInstrumentMinor(v, 0)));
        data.amountMinor = fd.get("amount")
          ? parseInstrumentMinor(String(fd.get("amount")), precision())
          : null;
        if (can("matters:read") || !editor) data.matterId = matterId || null;
        if (can("documents:read") || !editor)
          data.documentId = documentId || null;
        if (editor) data.version = editor.version;
        else {
          data.clientId = clientId;
          data.kind = kind;
        }
        const d = await api<Instrument>(
          editor ? `instruments/${editor.id}` : "instruments",
          editor ? "PATCH" : "POST",
          data,
        );
        await open(d.id);
      }
      setModal(null);
      changed();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }
  const clientChoices =
    clients.some((c) => c.id === clientId) || !clientId
      ? clients
      : [{ id: clientId, name: clientLabel }, ...clients];
  const memberChoices = [
    { id: me.membership.id, name: me.user.fullName },
    ...members
      .filter((m) => m.id !== me.membership.id)
      .map((m) => ({ id: m.id, name: m.user.fullName })),
  ];
  if (responsibleId && !memberChoices.some((m) => m.id === responsibleId))
    memberChoices.unshift({ id: responsibleId, name: responsibleLabel });
  const recordKind = editor?.kind ?? (kind === "REMINDERS" ? "CONTRACT" : kind);
  const textField = (
    key: string,
    a: string,
    en: string,
    required = false,
    area = false,
  ) => (
    <label key={key} className={area ? "wide" : ""}>
      {tr(a, en)}
      {area ? (
        <textarea
          name={key}
          aria-label={tr(a, en)}
          required={required}
          maxLength={20000}
          defaultValue={String(editor?.[key as keyof Instrument] ?? "")}
        />
      ) : (
        <input
          name={key}
          aria-label={tr(a, en)}
          required={required}
          maxLength={240}
          defaultValue={String(editor?.[key as keyof Instrument] ?? "")}
        />
      )}
    </label>
  );
  async function download() {
    if (!detail?.documentId) return;
    setBusy(true);
    try {
      const d = await api<{
          currentVersion: number;
          versions: { id: string; version: number; state: string }[];
        }>(`practice/documents/${detail.documentId}`),
        v = detail.documentVersionId
          ? d.versions.find((v) => v.id === detail.documentVersionId)
          : d.versions.find((v) => v.version === d.currentVersion);
      if (!v || v.state !== "READY") throw new ApiError("REVIEW_REQUIRED");
      window.location.assign(
        `/api/v1/practice/documents/${detail.documentId}/versions/${v.id}/download`,
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="instruments-console">
      <nav
        className="practice-nav"
        aria-label={tr(
          "العقود والوكالات والالتزامات",
          "Contracts, powers and obligations",
        )}
      >
        {(
          ["CONTRACT", "POWER_OF_ATTORNEY", "LICENCE", "REMINDERS"] as const
        ).map((k) => (
          <button
            key={k}
            className={kind === k ? "active" : ""}
            onClick={() => {
              setKind(k);
              setDetail(null);
              setStatus("");
              setExpiry("");
              setPage(1);
              setSearch("");
              setError("");
            }}
          >
            {k === "REMINDERS" ? <Bell size={16} /> : <FileText size={16} />}{" "}
            {label(k)}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="alert success">
          {notice}
        </p>
      )}
      {detail ? (
        <>
          <div className="practice-toolbar">
            <button onClick={() => setDetail(null)}>
              <ArrowRight size={16} />
              {tr("العودة للقائمة", "Back to list")}
            </button>
            <bdi>{detail.reference}</bdi>
            <span className="badge">{label(detail.effectiveStatus)}</span>
            {can("instruments:manage") && (
              <button onClick={() => edit(detail)}>
                {tr("تعديل السجل", "Edit record")}
              </button>
            )}
            {can("instruments:approve") && detail.status === "DRAFT" && (
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void act(`instruments/${detail.id}/approve`, "POST", {
                    version: detail.version,
                  })
                }
              >
                <Check size={16} />
                {tr("اعتماد السجل", "Approve record")}
              </button>
            )}
            {can("instruments:manage") && (
              <>
                {["DRAFT", "ACTIVE"].includes(detail.status) ? (
                  <>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(`instruments/${detail.id}`, "PATCH", {
                          version: detail.version,
                          status: "CLOSED",
                        })
                      }
                    >
                      {tr("إغلاق السجل", "Close record")}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(`instruments/${detail.id}`, "PATCH", {
                          version: detail.version,
                          status: "CANCELLED",
                        })
                      }
                    >
                      {tr("إلغاء السجل", "Cancel record")}
                    </button>
                  </>
                ) : (
                  detail.status !== "ARCHIVED" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(`instruments/${detail.id}`, "PATCH", {
                          version: detail.version,
                          status: "DRAFT",
                        })
                      }
                    >
                      {tr("إعادة للمسودة", "Return to draft")}
                    </button>
                  )
                )}
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(`instruments/${detail.id}`, "PATCH", {
                      version: detail.version,
                      status:
                        detail.status === "ARCHIVED" ? "DRAFT" : "ARCHIVED",
                    })
                  }
                >
                  {detail.status === "ARCHIVED"
                    ? tr("إعادة للمسودة", "Return to draft")
                    : tr("أرشفة السجل", "Archive record")}
                </button>
              </>
            )}
          </div>
          <h2>{detail.title}</h2>
          <p className="muted">
            {detail.client?.name} · {detail.responsible?.user.fullName}
          </p>
          <div className="practice-records">
            <article className="panel">
              <h3>{tr("بيانات السجل", "Record details")}</h3>
              <dl className="practice-facts">
                {[
                  [tr("النوع", "Type"), label(detail.kind)],
                  [tr("التصنيف", "Category"), detail.category],
                  [
                    tr("الرقم الخارجي", "External reference"),
                    detail.referenceNumber,
                  ],
                  [
                    tr("الطرف الأول / الموكل", "First party / principal"),
                    detail.partyOne,
                  ],
                  [tr("الطرف الثاني", "Counterparty"), detail.partyTwo],
                  [tr("الوكيل", "Agent"), detail.agent],
                  [
                    tr("الجهة المصدرة", "Issuing authority"),
                    detail.issuingAuthority,
                  ],
                  [tr("الإصدار", "Issued"), day(detail.issuedAt)],
                  [tr("البداية", "Start"), day(detail.startsAt)],
                  [
                    tr("الانتهاء المسجل", "Recorded expiry"),
                    day(detail.endsAt),
                  ],
                  [tr("التجديد", "Renewal"), day(detail.renewalAt)],
                  [
                    tr("القيمة", "Value"),
                    money(
                      detail.amountMinor,
                      detail.currency,
                      detail.currencyDecimals,
                    ),
                  ],
                  [
                    tr("السرية", "Confidentiality"),
                    label(detail.confidentiality),
                  ],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>
                        <bdi>{v}</bdi>
                      </dd>
                    </div>
                  ))}
              </dl>
              {detail.documentId &&
                can("documents:download") &&
                can("documents:read") && (
                  <button disabled={busy} onClick={() => void download()}>
                    <Download size={15} />
                    {detail.documentVersionId
                      ? tr(
                          "تنزيل الإصدار المعتمد المرتبط",
                          "Download pinned approved source",
                        )
                      : tr("تنزيل المستند المرتبط", "Download linked document")}
                  </button>
                )}
            </article>
            <article className="panel">
              <h3>{tr("الشروط والملاحظات", "Terms and notes")}</h3>
              <p className="instrument-prose">{detail.terms || "—"}</p>
              <h4>{tr("ملاحظات داخلية", "Internal notes")}</h4>
              <p className="instrument-prose">{detail.notes || "—"}</p>
              <p className="muted">
                {tr(
                  "حالة الانتهاء محسوبة من التاريخ المسجل، واعتماد السجل إجراء داخلي للمكتب.",
                  "Expiry reflects the recorded date. Approval is an internal firm workflow.",
                )}
              </p>
            </article>
          </div>
          <div className="practice-toolbar">
            <h3>{tr("الالتزامات", "Obligations")}</h3>
            {can("instruments:manage") &&
              !["ARCHIVED", "CLOSED", "CANCELLED"].includes(detail.status) && (
                <button
                  onClick={() => {
                    setError("");
                    setModal("obligation");
                  }}
                >
                  <Plus size={16} />
                  {tr("إضافة التزام", "Add obligation")}
                </button>
              )}
          </div>
          <div className="practice-records">
            {detail.obligations.map((o) => (
              <article key={o.id} className="panel">
                <h4>{o.title}</h4>
                <p className="instrument-prose">{o.description}</p>
                <p>{dt(o.dueAt)}</p>
                {o.amountMinor !== null && (
                  <strong>
                    <bdi>
                      {money(o.amountMinor, o.currency, o.currencyDecimals)}
                    </bdi>
                  </strong>
                )}
                <label>
                  {tr("حالة الالتزام", "Obligation status")}
                  <select
                    aria-label={`${tr("حالة", "Status")} ${o.title}`}
                    value={o.status}
                    disabled={busy || !can("instruments:manage")}
                    onChange={(e) =>
                      void act(
                        `instruments/${detail.id}/obligations/${o.id}`,
                        "PATCH",
                        { version: o.version, status: e.target.value },
                      )
                    }
                  >
                    {["TODO", "IN_PROGRESS", "DONE", "CANCELLED"].map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            ))}
            {!detail.obligations.length && (
              <p>{tr("لا توجد التزامات مسجلة", "No obligations recorded")}</p>
            )}
          </div>
          <div className="practice-records">
            <article className="panel">
              <h3>{tr("التذكيرات المسجلة", "Scheduled reminders")}</h3>
              <p className="muted">
                {tr(
                  "تذكيرات الانتهاء والتجديد في التاسعة صباحاً بتوقيت المكتب. إنجاز الالتزام لا يسجل دفعة مالية.",
                  "Expiry and renewal reminders use 09:00 firm time. Completing an obligation does not record a payment.",
                )}
              </p>
              {detail.reminders.map((r) => (
                <p key={r.id}>
                  {label(r.kind)} · {dt(r.dueAt)} ·{" "}
                  {r.readAt
                    ? tr("مقروء", "Read")
                    : tr("بانتظار القراءة", "Unread")}
                </p>
              ))}
            </article>
            <article className="panel">
              <h3>{tr("سجل النشاط", "Activity history")}</h3>
              {detail.events.map((e) => (
                <details key={e.id} className="portal-message">
                  <summary>
                    {label(e.action)} · {dt(e.createdAt)}
                  </summary>
                  {e.details?.before &&
                    e.details.after &&
                    (
                      [
                        "title",
                        "endsAt",
                        "renewalAt",
                        "status",
                        "currency",
                        "amountMinor",
                        "terms",
                        "notes",
                      ] as const
                    )
                      .filter(
                        (k) =>
                          String(e.details!.before![k]) !==
                          String(e.details!.after![k]),
                      )
                      .map((k) => (
                        <p className="instrument-prose" key={k}>
                          {
                            {
                              title: tr("العنوان", "Title"),
                              endsAt: tr("الانتهاء", "Expiry"),
                              renewalAt: tr("التجديد", "Renewal"),
                              status: tr("الحالة", "Status"),
                              currency: tr("العملة", "Currency"),
                              amountMinor: tr(
                                "القيمة بالوحدة الصغرى",
                                "Value in minor units",
                              ),
                              terms: tr("الشروط", "Terms"),
                              notes: tr("الملاحظات", "Notes"),
                            }[k]
                          }
                          : {String(e.details!.before![k] ?? "—")} ←{" "}
                          {String(e.details!.after![k] ?? "—")}
                        </p>
                      ))}
                </details>
              ))}
            </article>
          </div>
        </>
      ) : (
        <>
          <div className="practice-toolbar">
            {kind !== "REMINDERS" && (
              <>
                <input
                  aria-label={tr(
                    "بحث العقود والوكالات",
                    "Search contracts and powers",
                  )}
                  placeholder={tr(
                    "بحث بالعنوان أو الرقم أو الأطراف…",
                    "Search title, reference or parties…",
                  )}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
                <select
                  aria-label={tr("تصفية الحالة", "Filter status")}
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    if (e.target.value === "EXPIRED") setExpiry("");
                    setPage(1);
                  }}
                >
                  <option value="">
                    {tr("جميع الحالات غير المؤرشفة", "All unarchived states")}
                  </option>
                  {[
                    "DRAFT",
                    "ACTIVE",
                    "EXPIRED",
                    "CLOSED",
                    "CANCELLED",
                    "ARCHIVED",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={tr("قرب الانتهاء", "Expiry window")}
                  value={expiry}
                  onChange={(e) => {
                    setExpiry(e.target.value);
                    if (e.target.value) setStatus("ACTIVE");
                    setPage(1);
                  }}
                >
                  <option value="">
                    {tr("كل تواريخ الانتهاء", "All expiry dates")}
                  </option>
                  {[7, 30, 90].map((d) => (
                    <option value={d} key={d}>
                      {tr(`خلال ${d} يوماً`, `Within ${d} days`)}
                    </option>
                  ))}
                </select>
                {can("instruments:manage") && (
                  <button
                    className="primary"
                    onClick={() => edit(null)}
                    disabled={!catalog}
                  >
                    <Plus size={16} />
                    {tr("إضافة سجل", "Add record")}
                  </button>
                )}
              </>
            )}
          </div>
          {loading ? (
            <p role="status">{tr("جارٍ تحميل السجلات…", "Loading records…")}</p>
          ) : kind === "REMINDERS" ? (
            <>
              <div className="practice-records">
                {reminders.map((r) => (
                  <article className="panel" key={r.id}>
                    <h3>
                      <button onClick={() => void open(r.instrument.id)}>
                        {r.instrument.title}
                      </button>
                    </h3>
                    <p>
                      {label(r.kind)} · {dt(r.dueAt)}
                    </p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(`instruments/notifications/${r.id}/read`)
                      }
                    >
                      {tr("تعليم كمقروء", "Mark read")}
                    </button>
                  </article>
                ))}
              </div>
              <p className="muted">
                {tr(
                  "أحدث 100 تذكير مستحق لحسابك",
                  "Latest 100 due reminders for your account",
                )}
              </p>
            </>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        tr("المرجع والعنوان", "Reference & title"),
                        tr("الأطراف", "Parties"),
                        tr("الانتهاء", "Expiry"),
                        tr("القيمة", "Value"),
                        tr("الحالة", "Status"),
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.items.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <bdi>{d.reference}</bdi>
                          <br />
                          <button
                            className="text-button"
                            onClick={() => void open(d.id)}
                          >
                            {d.title}
                          </button>
                        </td>
                        <td>
                          {d.partyOne}
                          <br />
                          {d.kind === "POWER_OF_ATTORNEY"
                            ? d.agent
                            : d.partyTwo}
                        </td>
                        <td>{day(d.endsAt)}</td>
                        <td>
                          <bdi>
                            {money(
                              d.amountMinor,
                              d.currency,
                              d.currencyDecimals,
                            )}
                          </bdi>
                        </td>
                        <td>
                          <span className="badge">
                            {label(d.effectiveStatus)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="practice-toolbar">
                <span>
                  {rows.total} {tr("سجل", "records")}
                </span>
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {tr("السابق", "Previous")}
                </button>
                <span>{page}</span>
                <button
                  disabled={page * 12 >= rows.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {tr("التالي", "Next")}
                </button>
              </div>
            </>
          )}
        </>
      )}
      <dialog
        ref={dialog}
        className="practice-dialog panel"
        onCancel={() => setModal(null)}
      >
        <div className="practice-toolbar">
          <h2>
            {modal === "obligation"
              ? tr("التزام جديد", "New obligation")
              : editor
                ? tr("تعديل السجل", "Edit record")
                : tr("سجل جديد", "New record")}
          </h2>
          <button
            aria-label={tr("إغلاق", "Close")}
            onClick={() => setModal(null)}
          >
            <X size={18} />
          </button>
        </div>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <form
          className="practice-form"
          key={`${modal}-${editor?.id ?? "new"}-${recordKind}`}
          onSubmit={(e) => void submit(e)}
        >
          {modal === "obligation" ? (
            <>
              <label>
                {tr("عنوان الالتزام", "Obligation title")}
                <input name="title" required minLength={2} maxLength={240} />
              </label>
              <label>
                {tr("الموعد بتوقيت جهازك", "Due at in device time")}
                <input name="dueAt" required type="datetime-local" />
              </label>
              <label>
                {tr("القيمة (اختيارية)", "Value (optional)")}
                <input name="amount" inputMode="decimal" />
              </label>
              <label className="wide">
                {tr("وصف الالتزام", "Obligation description")}
                <textarea name="description" maxLength={20000} />
              </label>
            </>
          ) : (
            <>
              <label>
                {tr("الموكل", "Client")}
                <input
                  aria-label={tr("بحث اسم الموكل", "Search client name")}
                  disabled={!!editor}
                  value={clientSearch}
                  placeholder={tr("ابحث بالاسم", "Search name")}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
                <select
                  aria-label={tr("الموكل", "Client")}
                  value={clientId}
                  disabled={!!editor}
                  required
                  onChange={(e) => {
                    setClientId(e.target.value);
                    setClientLabel(
                      clients.find((c) => c.id === e.target.value)?.name ?? "",
                    );
                    setMatterId("");
                    setDocumentId("");
                  }}
                >
                  {clientChoices.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr("المسؤول عن السجل", "Responsible member")}
                {can("team:read") && (
                  <input
                    aria-label={tr("بحث المسؤول", "Search responsible member")}
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                  />
                )}
                <select
                  aria-label={tr("المسؤول عن السجل", "Responsible member")}
                  value={responsibleId}
                  onChange={(e) => {
                    setResponsibleId(e.target.value);
                    setResponsibleLabel(
                      memberChoices.find((m) => m.id === e.target.value)
                        ?.name ?? "",
                    );
                  }}
                >
                  {memberChoices.map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              {textField("title", "عنوان السجل", "Record title", true)}
              {textField(
                "category",
                "نوع العقد أو الوكالة",
                "Contract or agency type",
                true,
              )}
              {textField(
                "referenceNumber",
                "الرقم الخارجي / رقم الوكالة",
                "External reference / power number",
                recordKind === "POWER_OF_ATTORNEY",
              )}
              {textField(
                "partyOne",
                "الطرف الأول / الموكل",
                "First party / principal",
                true,
              )}
              {textField(
                "partyTwo",
                "الطرف الثاني",
                "Counterparty",
                recordKind === "CONTRACT",
              )}
              {textField(
                "agent",
                "الوكيل",
                "Agent",
                recordKind === "POWER_OF_ATTORNEY",
              )}
              {textField(
                "issuingAuthority",
                "الجهة المصدرة",
                "Issuing authority",
                recordKind === "POWER_OF_ATTORNEY",
              )}
              {can("matters:read") && (
                <label>
                  {tr("القضية المرتبطة (اختيارية)", "Linked matter (optional)")}
                  <input
                    aria-label={tr("بحث رقم القضية", "Search matter reference")}
                    value={matterSearch}
                    onChange={(e) => setMatterSearch(e.target.value)}
                  />
                  <select
                    aria-label={tr(
                      "القضية المرتبطة (اختيارية)",
                      "Linked matter (optional)",
                    )}
                    value={matterId}
                    onChange={(e) => {
                      setMatterId(e.target.value);
                      setDocumentId("");
                    }}
                  >
                    <option value="">{tr("دون قضية", "No matter")}</option>
                    {matterId && !matters.some((m) => m.id === matterId) && (
                      <option value={matterId}>
                        {editor?.matter?.reference ??
                          tr("قضية مرتبطة", "Linked matter")}
                      </option>
                    )}
                    {matters.map((m) => (
                      <option value={m.id} key={m.id}>
                        {m.reference}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {can("documents:read") && (
                <label>
                  {tr(
                    "المستند المرتبط (اختياري)",
                    "Linked document (optional)",
                  )}
                  <input
                    aria-label={tr(
                      "بحث عنوان المستند",
                      "Search document title",
                    )}
                    value={documentSearch}
                    onChange={(e) => setDocumentSearch(e.target.value)}
                  />
                  <select
                    aria-label={tr(
                      "المستند المرتبط (اختياري)",
                      "Linked document (optional)",
                    )}
                    value={documentId}
                    onChange={(e) => setDocumentId(e.target.value)}
                  >
                    <option value="">{tr("دون مستند", "No document")}</option>
                    {documentId &&
                      !documents.some((d) => d.id === documentId) && (
                        <option value={documentId}>
                          {editor?.document?.title ??
                            tr("مستند مرتبط", "Linked document")}
                        </option>
                      )}
                    {documents.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(["issuedAt", "startsAt", "endsAt", "renewalAt"] as const).map(
                (k, i) => (
                  <label key={k}>
                    {
                      [
                        tr("تاريخ الإصدار", "Issue date"),
                        tr("تاريخ البداية", "Start date"),
                        tr("تاريخ الانتهاء المسجل", "Recorded expiry date"),
                        tr("تاريخ التجديد", "Renewal date"),
                      ][i]
                    }
                    <input
                      aria-label={
                        [
                          tr("تاريخ الإصدار", "Issue date"),
                          tr("تاريخ البداية", "Start date"),
                          tr("تاريخ الانتهاء المسجل", "Recorded expiry date"),
                          tr("تاريخ التجديد", "Renewal date"),
                        ][i]
                      }
                      name={k}
                      type="date"
                      required={k === "issuedAt"}
                      defaultValue={editor?.[k]?.slice(0, 10) ?? ""}
                    />
                  </label>
                ),
              )}
              <label>
                {tr("العملة", "Currency")}
                <select
                  aria-label={tr("العملة", "Currency")}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {editor &&
                    !catalog?.currencies.some(
                      (c) => c.currency === editor.currency,
                    ) && (
                      <option value={editor.currency}>{editor.currency}</option>
                    )}
                  {catalog?.currencies.map((c) => (
                    <option key={c.currency} value={c.currency}>
                      {c.currency}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr("قيمة السجل (اختيارية)", "Record value (optional)")}
                <input
                  name="amount"
                  inputMode="decimal"
                  aria-label={tr(
                    "قيمة السجل (اختيارية)",
                    "Record value (optional)",
                  )}
                  defaultValue={
                    editor?.amountMinor
                      ? formatInstrumentMinor(
                          editor.amountMinor,
                          editor.currencyDecimals,
                        )
                      : ""
                  }
                />
              </label>
              <label>
                {tr("مستوى السرية", "Confidentiality")}
                <select
                  name="confidentiality"
                  defaultValue={editor?.confidentiality ?? "NORMAL"}
                >
                  {["NORMAL", "CONFIDENTIAL", "RESTRICTED"].map((v) => (
                    <option key={v} value={v}>
                      {label(v)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr(
                  "أيام التذكير قبل الانتهاء والتجديد (0 يوم الموعد)",
                  "Days before expiry/renewal (0 on the date)",
                )}
                <input
                  name="reminderDays"
                  defaultValue={(editor?.reminderDays ?? [30, 7, 1, 0]).join(
                    ",",
                  )}
                />
              </label>
              {textField(
                "terms",
                "شروط العقد أو نطاق الوكالة",
                "Contract terms or scope of authority",
                false,
                true,
              )}
              {textField(
                "notes",
                "ملاحظات داخلية",
                "Internal notes",
                false,
                true,
              )}
              {editor?.status === "ACTIVE" && (
                <p className="wide muted">
                  {tr(
                    "حفظ تعديل يعيد السجل للمسودة؛ تُحدّث التذكيرات بعد اعتماده مجدداً.",
                    "Saving changes returns this record to draft. Reminders resume after approval.",
                  )}
                </p>
              )}
            </>
          )}
          <div className="wide practice-toolbar">
            <button
              className="primary"
              type="submit"
              disabled={busy || (modal === "record" && (!catalog || !clientId))}
            >
              {tr("حفظ", "Save")}
            </button>
            <button type="button" onClick={() => setModal(null)}>
              {tr("إلغاء", "Cancel")}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
