"use client";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FormEvent,
} from "react";
import {
  Plus,
  X,
  Check,
  ReceiptText,
  Wallet,
  BookOpen,
  Clock,
  FileText,
  BarChart3,
} from "lucide-react";
import { api, ApiError, type Me, type Page, type Member } from "../lib/api";
import { parseMinor } from "@legal/contracts/platform";
import { recordLabel } from "../lib/record-labels";
type Row = { id: string; [key: string]: unknown };
type Account = {
  id: string;
  code: string;
  name: string;
  kind: string;
  fund: string;
};
type Directory = {
  clients: { id: string; name: string }[];
  matters: { id: string; reference: string; clientId: string }[];
  accounts: Account[];
};
type Report = {
  balances: (Account & { debit: string; credit: string; balance: string })[];
  trustBalances: { clientId: string; name: string; balance: string }[];
  overdue: {
    id: string;
    sequence: number;
    outstandingMinor: number;
    dueAt: string;
  }[];
  revenueMinor: string;
  expenseMinor: string;
  netIncomeMinor: string;
};
type Tab =
  "reports" | "invoices" | "expenses" | "trust" | "fees" | "time" | "journals";
type Kind =
  "invoice" | "receipt" | "expense" | "trust" | "fee" | "time" | "journal";
type Field = {
  key: string;
  ar: string;
  en: string;
  type?: string;
  options?: [string, string][];
  required?: boolean;
  value?: string;
};
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
export function FinanceConsole({
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
  const [tab, setTab] = useState<Tab>("reports"),
    [rows, setRows] = useState<Row[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const [directory, setDirectory] = useState<Directory>({
      clients: [],
      matters: [],
      accounts: [],
    }),
    [members, setMembers] = useState<Member[]>([]),
    [report, setReport] = useState<Report | null>(null),
    [decimals, setDecimals] = useState(3);
  const [modal, setModal] = useState<{ kind: Kind; invoiceId?: string } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0);
  const [lines, setLines] = useState([
      { accountId: "", debit: "", credit: "" },
      { accountId: "", debit: "", credit: "" },
    ]),
    [lookup, setLookup] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const fail = useCallback(
    (err: unknown) => {
      const code = err instanceof ApiError ? err.code : "FAILED";
      const messages: Record<string, [string, string]> = {
        OVERPAYMENT: [
          "الدفعة تتجاوز المتبقي على الفاتورة",
          "Payment exceeds invoice balance",
        ],
        INSUFFICIENT_CLIENT_FUNDS: [
          "رصيد أمانات الموكل غير كافٍ",
          "Insufficient client funds",
        ],
        CONFLICT: ["رقم المرجع مستخدم مسبقاً", "Reference already exists"],
        MATTER_CLIENT_MISMATCH: [
          "القضية لا تخص الموكل المحدد",
          "Matter does not belong to selected client",
        ],
        INVALID_AMOUNT: [
          "راجع المبالغ والخصم والدقة العشرية",
          "Check amounts, discount and decimal precision",
        ],
        FORBIDDEN: ["الصلاحية المطلوبة غير متاحة", "Permission denied"],
        TENANT_READ_ONLY: ["المكتب في وضع القراءة فقط", "Firm is read-only"],
        NOT_FOUND: ["السجل غير موجود أو غير مصرح به", "Record unavailable"],
        VALIDATION_ERROR: [
          "راجع الحقول والمبالغ والتواريخ",
          "Check fields, amounts and dates",
        ],
        OPERATING_ACCOUNTS_ONLY: [
          "القيود اليدوية مخصصة لحسابات التشغيل؛ استخدم سجل الأمانات لأموال الموكلين",
          "Manual journals use operating accounts; use client funds for trust transactions",
        ],
      };
      setError(
        messages[code]?.[locale === "ar" ? 0 : 1] ??
          (locale === "ar"
            ? `تعذر تنفيذ العملية (${code})`
            : `Unable to complete request (${code})`),
      );
    },
    [locale],
  );
  const money = (value: unknown) => {
    try {
      const n = BigInt(str(value) || "0"),
        scale = BigInt(10) ** BigInt(decimals),
        abs = n < BigInt(0) ? -n : n;
      return `${n < BigInt(0) ? "−" : ""}${abs / scale}${decimals ? "." + (abs % scale).toString().padStart(decimals, "0") : ""} ${me.tenant.currency}`;
    } catch {
      return "—";
    }
  };
  const changed = () => {
    setRevision((v) => v + 1);
    setNotice(
      tr(
        "تم التسجيل في السجل المالي والتدقيق",
        "Recorded in the financial ledger and audit log",
      ),
    );
  };
  useEffect(() => {
    let live = true;
    Promise.all([
      api<Directory>(`finance/directory?search=${encodeURIComponent(lookup)}`),
      api<{ code: string; currencyDecimals: number }[]>("countries"),
      can("team:read")
        ? api<Page<Member>>("users?pageSize=100")
        : Promise.resolve(null),
    ])
      .then(([d, c, m]) => {
        if (live) {
          setDirectory(d);
          setDecimals(
            c.find((v) => v.code === me.tenant.countryCode)?.currencyDecimals ??
              3,
          );
          setMembers(m?.items ?? []);
        }
      })
      .catch((e) => {
        if (live) fail(e);
      });
    return () => {
      live = false;
    };
  }, [revision, lookup, can, me.tenant.countryCode, fail]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const q = new URLSearchParams({
          page: String(page),
          pageSize: "12",
          search,
        });
        if (from) q.set("from", new Date(from).toISOString());
        if (to) q.set("to", new Date(to).toISOString());
        if (tab === "reports" || tab === "trust") {
          const r = await api<Report>(`finance/reports?${q}`);
          if (live) setReport(r);
        } else if (tab === "fees" || tab === "time") {
          const r = await api<Row[]>(`finance/${tab}`);
          if (live) {
            setRows(r);
            setTotal(r.length);
          }
        } else {
          const r = await api<Page<Row>>(`finance/${tab}?${q}`);
          if (live) {
            setRows(r.items);
            setTotal(r.total);
          }
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
  }, [tab, page, search, revision, from, to, fail]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  const clientName = (id: unknown) =>
    directory.clients.find((c) => c.id === id)?.name ?? str(id);
  const clientField: Field = {
    key: "clientId",
    ar: "الموكل",
    en: "Client",
    required: true,
    options: directory.clients.map((c) => [c.id, c.name]),
  };
  const matterField: Field = {
    key: "matterId",
    ar: "القضية (اختيارية)",
    en: "Matter (optional)",
    options: [
      ["", tr("دون قضية", "No matter")],
      ...directory.matters.map((m): [string, string] => [m.id, m.reference]),
    ],
  };
  const amount: Field = {
    key: "amount",
    ar: `المبلغ (${me.tenant.currency})`,
    en: `Amount (${me.tenant.currency})`,
    required: true,
  };
  const desc: Field = {
    key: "description",
    ar: "الوصف",
    en: "Description",
    type: "textarea",
    required: true,
  };
  const reference: Field = {
    key: "reference",
    ar: "رقم المرجع الفريد",
    en: "Unique reference",
    required: true,
  };
  const date = (key: string, ar: string, en: string): Field => ({
    key,
    ar,
    en,
    type: "datetime-local",
    required: true,
  });
  const fields = (): Field[] => {
    switch (modal?.kind) {
      case "invoice":
        return [
          clientField,
          matterField,
          desc,
          {
            key: "quantity",
            ar: "الكمية",
            en: "Quantity",
            type: "number",
            value: "1",
            required: true,
          },
          {
            key: "unitPrice",
            ar: `سعر الوحدة (${me.tenant.currency})`,
            en: `Unit price (${me.tenant.currency})`,
            required: true,
          },
          {
            key: "discount",
            ar: "الخصم على الإجمالي",
            en: "Total discount",
            value: "0",
          },
          {
            key: "taxPercent",
            ar: "الضريبة (%) وفق إعداد المكتب",
            en: "Tax (%) as configured by the firm",
            value: "0",
          },
          date(
            "dueAt",
            "تاريخ الاستحقاق بتوقيت جهازك",
            "Due date (device time)",
          ),
        ];
      case "receipt":
        return [
          reference,
          amount,
          {
            key: "method",
            ar: "طريقة التحصيل المسجلة",
            en: "Recorded payment method",
            options: [
              ["BANK", tr("تحويل بنكي", "Bank transfer")],
              ["CASH", tr("نقداً", "Cash")],
              ["CARD", tr("بطاقة (تسجيل فقط)", "Card (record only)")],
              ["OTHER", tr("أخرى", "Other")],
            ],
          },
          date(
            "paidAt",
            "تاريخ الدفع بتوقيت جهازك",
            "Payment date (device time)",
          ),
        ];
      case "expense":
        return [
          {
            ...clientField,
            required: false,
            options: [
              ["", tr("مصروف مكتب", "Office expense")],
              ...clientField.options!,
            ],
          },
          matterField,
          desc,
          { key: "category", ar: "التصنيف", en: "Category", required: true },
          { key: "vendor", ar: "المورد / الجهة", en: "Vendor", required: true },
          amount,
          date(
            "incurredAt",
            "تاريخ المصروف بتوقيت جهازك",
            "Expense date (device time)",
          ),
        ];
      case "trust":
        return [
          clientField,
          reference,
          desc,
          {
            key: "direction",
            ar: "الحركة",
            en: "Movement",
            options: [
              ["DEPOSIT", tr("إيداع أمانة", "Client funds deposit")],
              ["WITHDRAWAL", tr("صرف أمانة", "Client funds withdrawal")],
            ],
          },
          amount,
        ];
      case "fee":
        return [
          clientField,
          matterField,
          {
            key: "kind",
            ar: "نموذج الأتعاب",
            en: "Fee model",
            options: [
              ["FIXED", tr("ثابتة", "Fixed")],
              ["HOURLY", tr("بالساعة", "Hourly")],
              ["STAGED", tr("على مراحل", "Staged")],
              ["RETAINER", tr("اشتراك", "Retainer")],
              ["ADVANCE", tr("مقدمة", "Advance")],
              ["CUSTOM", tr("مخصصة", "Custom")],
            ],
          },
          amount,
          {
            key: "terms",
            ar: "شروط الاتفاق",
            en: "Agreement terms",
            type: "textarea",
            required: true,
          },
          date(
            "agreedAt",
            "تاريخ الاتفاق بتوقيت جهازك",
            "Agreement date (device time)",
          ),
        ];
      case "time":
        return [
          {
            ...matterField,
            required: true,
            options: matterField.options!.filter(([v]) => v !== ""),
          },
          {
            key: "memberId",
            ar: "المحامي / الموظف",
            en: "Lawyer / team member",
            options: [
              [me.membership.id, me.user.fullName],
              ...members
                .filter((m) => m.id !== me.membership.id && m.active)
                .map((m): [string, string] => [m.id, m.user.fullName]),
            ],
          },
          desc,
          {
            key: "minutes",
            ar: "المدة بالدقائق",
            en: "Duration in minutes",
            type: "number",
            required: true,
          },
          {
            key: "hourlyRate",
            ar: `سعر الساعة (${me.tenant.currency})`,
            en: `Hourly rate (${me.tenant.currency})`,
            required: true,
          },
          date(
            "workedAt",
            "تاريخ العمل بتوقيت جهازك",
            "Work date (device time)",
          ),
        ];
      case "journal":
        return [reference, desc];
      default:
        return [];
    }
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;
    const fd = new FormData(e.currentTarget),
      data: Record<string, unknown> = {};
    fields().forEach((f) => (data[f.key] = fd.get(f.key)));
    setBusy(true);
    setError("");
    try {
      if (data.clientId === "") data.clientId = null;
      if (data.matterId === "") data.matterId = null;
      for (const key of [
        "dueAt",
        "paidAt",
        "incurredAt",
        "agreedAt",
        "workedAt",
      ])
        if (data[key]) data[key] = new Date(str(data[key])).toISOString();
      if (data.amount !== undefined) {
        data.amountMinor = parseMinor(str(data.amount), decimals);
        delete data.amount;
      }
      if (modal.kind === "invoice") {
        data.quantity = Number(data.quantity);
        data.unitPriceMinor = parseMinor(str(data.unitPrice), decimals);
        data.discountMinor = parseMinor(str(data.discount) || "0", decimals);
        data.taxBasisPoints = parseMinor(str(data.taxPercent) || "0", 2);
        delete data.unitPrice;
        delete data.discount;
        delete data.taxPercent;
      }
      if (modal.kind === "receipt") data.invoiceId = modal.invoiceId;
      if (modal.kind === "time") {
        data.minutes = Number(data.minutes);
        data.hourlyRateMinor = parseMinor(str(data.hourlyRate), decimals);
        delete data.hourlyRate;
      }
      if (modal.kind === "journal")
        data.lines = lines.map((l) => ({
          accountId: l.accountId,
          debitMinor: parseMinor(l.debit || "0", decimals),
          creditMinor: parseMinor(l.credit || "0", decimals),
        }));
      const paths: Record<Kind, string> = {
        invoice: "invoices",
        receipt: "receipts",
        expense: "expenses",
        trust: "trust",
        fee: "fees",
        time: "time",
        journal: "journals",
      };
      await api(`finance/${paths[modal.kind]}`, "POST", data);
      setModal(null);
      changed();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }
  async function act(path: string, data: unknown = {}) {
    setBusy(true);
    setError("");
    try {
      await api(`finance/${path}`, "POST", data);
      changed();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const nav: [Tab, string, string, typeof Wallet][] = [
    ["reports", "التقارير", "Reports", BarChart3],
    ["invoices", "الفواتير والتحصيل", "Invoices & receipts", ReceiptText],
    ["expenses", "المصروفات", "Expenses", Wallet],
    ["trust", "أمانات الموكلين", "Client funds", Wallet],
    ["fees", "اتفاقات الأتعاب", "Fee agreements", FileText],
    ["time", "سجل الوقت", "Time entries", Clock],
    ["journals", "القيود اليومية", "Journal", BookOpen],
  ];
  const kind: Partial<Record<Tab, Kind>> = {
    invoices: "invoice",
    expenses: "expense",
    trust: "trust",
    fees: "fee",
    time: "time",
    journals: "journal",
  };
  return (
    <section className="finance-console">
      <nav
        className="practice-nav"
        aria-label={tr("وحدات المالية", "Finance modules")}
      >
        {nav.map(([id, a, e, Icon]) => (
          <button
            key={id}
            className={id === tab ? "active" : ""}
            onClick={() => {
              setTab(id);
              setRows([]);
              setLoading(true);
              setPage(1);
              setSearch("");
              setError("");
              setNotice("");
            }}
          >
            <Icon size={16} />
            {tr(a, e)}
          </button>
        ))}
      </nav>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <p className="alert success" role="status">
          {notice}
        </p>
      )}
      <div className="practice-toolbar">
        {!["reports", "trust", "fees", "time", "journals"].includes(tab) && (
          <input
            aria-label={tr("بحث مالي", "Search financial records")}
            placeholder={tr("بحث بالوصف…", "Search description…")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        )}
        {kind[tab] && can("finance:manage") && (
          <button
            className="primary"
            onClick={() => {
              setError("");
              setModal({ kind: kind[tab]! });
              setLines([
                { accountId: "", debit: "", credit: "" },
                { accountId: "", debit: "", credit: "" },
              ]);
            }}
          >
            <Plus size={16} />
            {tr("إضافة", "Add")}
          </button>
        )}
        {!directory.accounts.length && can("finance:manage") && (
          <button
            disabled={busy}
            onClick={() => void act("accounts/initialize")}
          >
            {tr("تهيئة دليل الحسابات", "Initialize chart of accounts")}
          </button>
        )}
      </div>
      {loading ? (
        <p role="status">
          {tr("جارٍ تحميل السجل المالي…", "Loading financial records…")}
        </p>
      ) : (
        <>
          {tab === "reports" && report && (
            <>
              <div className="practice-toolbar">
                <label>
                  {tr("من تاريخ", "From date")}
                  <input
                    type="datetime-local"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label>
                  {tr("إلى تاريخ", "To date")}
                  <input
                    type="datetime-local"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </div>
              <div className="stats-grid">
                {[
                  [tr("الإيرادات", "Revenue"), report.revenueMinor],
                  [tr("المصروفات", "Expenses"), report.expenseMinor],
                  [tr("صافي الدخل", "Net income"), report.netIncomeMinor],
                ].map(([label, value]) => (
                  <article className="stat-card" key={label}>
                    <span>{label}</span>
                    <strong>{money(value)}</strong>
                  </article>
                ))}
              </div>
              <h3>{tr("ميزان المراجعة", "Trial balance")}</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        tr("الحساب", "Account"),
                        tr("الصندوق", "Fund"),
                        tr("مدين", "Debit"),
                        tr("دائن", "Credit"),
                        tr("الرصيد", "Balance"),
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.balances.map((a) => (
                      <tr key={a.id}>
                        <td>
                          {a.code} · {a.name}
                        </td>
                        <td>
                          {a.fund === "TRUST"
                            ? tr("أمانات", "Client funds")
                            : tr("تشغيل", "Operating")}
                        </td>
                        <td>{money(a.debit)}</td>
                        <td>{money(a.credit)}</td>
                        <td>{money(a.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3>
                {tr("الفواتير المتأخرة غير المسددة", "Unpaid overdue invoices")}
              </h3>
              {report.overdue.map((i) => (
                <p key={i.id}>
                  #{i.sequence} · {money(i.outstandingMinor)} ·{" "}
                  {new Date(i.dueAt).toLocaleDateString(locale)}
                </p>
              ))}
            </>
          )}
          {tab === "trust" && report && (
            <article className="panel">
              <h3>{tr("أرصدة الأمانات لكل موكل", "Client funds balances")}</h3>
              <p className="muted">
                {tr(
                  "سجل مستقل عن أموال تشغيل المكتب. الإيداع والصرف هنا يسجلان الحركة بعد تنفيذها خارج النظام.",
                  "Separate from operating funds. Deposits and disbursements record transactions completed outside the system.",
                )}
              </p>
              {report.trustBalances.length ? (
                report.trustBalances.map((b) => (
                  <div className="finance-balance" key={b.clientId}>
                    <strong>{b.name}</strong>
                    <span>{money(b.balance)}</span>
                  </div>
                ))
              ) : (
                <p>
                  {tr("لم تسجل حركات أمانات", "No client funds transactions")}
                </p>
              )}
            </article>
          )}
          {tab === "invoices" && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      tr("الرقم والموكل", "Number & client"),
                      tr("الخدمة", "Service"),
                      tr("الإجمالي", "Total"),
                      tr("المدفوع", "Paid"),
                      tr("المتبقي", "Outstanding"),
                      tr("الحالة", "Status"),
                      tr("الإجراء", "Action"),
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        #{str(r.sequence)}
                        <br />
                        {clientName(r.clientId)}
                      </td>
                      <td>{str(r.description)}</td>
                      <td>{money(r.totalMinor)}</td>
                      <td>{money(r.paidMinor)}</td>
                      <td>{money(r.outstandingMinor)}</td>
                      <td>{recordLabel(r.paymentStatus, locale)}</td>
                      <td>
                        {r.status === "DRAFT" && can("finance:approve") && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    tr(
                                      "إصدار الفاتورة وترحيل قيدها؟ ستصبح غير قابلة للتعديل.",
                                      "Issue and post this invoice? It will become immutable.",
                                    ),
                                  )
                                )
                                  void act(`invoices/${r.id}/issue`, {
                                    clientVisible: false,
                                  });
                              }}
                            >
                              <Check size={15} />
                              {tr("إصدار", "Issue")}
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => void act(`invoices/${r.id}/void`)}
                            >
                              {tr("إلغاء المسودة", "Void draft")}
                            </button>
                          </>
                        )}
                        {r.status === "ISSUED" &&
                          Number(r.outstandingMinor) > 0 &&
                          can("finance:manage") && (
                            <button
                              onClick={() =>
                                setModal({ kind: "receipt", invoiceId: r.id })
                              }
                            >
                              {tr("تسجيل دفعة", "Record receipt")}
                            </button>
                          )}
                        {Array.isArray(r.receipts) && r.receipts.length > 0 && (
                          <details>
                            <summary>{tr("الدفعات", "Receipts")}</summary>
                            {(r.receipts as Row[]).map((p) => (
                              <p key={p.id}>
                                {str(p.reference)} · {money(p.amountMinor)}
                              </p>
                            ))}
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab === "expenses" && (
            <div className="practice-records">
              {rows.map((r) => (
                <article className="panel" key={r.id}>
                  <h3>{str(r.description)}</h3>
                  <p>
                    {str(r.category)} · {str(r.vendor)}
                  </p>
                  <strong>{money(r.amountMinor)}</strong>
                  <p>
                    {r.approvedAt
                      ? tr(
                          "معتمد ومسجل كمصروف مدفوع",
                          "Approved and recorded as paid",
                        )
                      : tr(
                          "بانتظار الاعتماد والصرف",
                          "Awaiting approval and disbursement",
                        )}
                  </p>
                  {!r.approvedAt && can("finance:approve") && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            tr(
                              "تأكيد اعتماد المصروف وتسجيل صرفه من النقد التشغيلي؟",
                              "Approve and record disbursement from operating cash?",
                            ),
                          )
                        )
                          void act(`expenses/${r.id}/approve`);
                      }}
                    >
                      {tr("اعتماد وتسجيل الصرف", "Approve and record payment")}
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
          {(tab === "fees" || tab === "time") && (
            <div className="practice-records">
              {rows.map((r) => (
                <article className="panel" key={r.id}>
                  <h3>
                    {tab === "fees"
                      ? clientName(r.clientId)
                      : str(r.description)}
                  </h3>
                  <p>
                    {tab === "fees"
                      ? recordLabel(r.kind, locale)
                      : `${str(r.minutes)} ${tr("دقيقة", "minutes")}`}
                  </p>
                  <strong>{money(r.amountMinor)}</strong>
                  <p>{str(r.terms)}</p>
                </article>
              ))}
              <p className="muted">
                {tr(
                  "أحدث 100 سجل. تسجيل الأتعاب أو الوقت لا يصدر فاتورة تلقائياً.",
                  "Latest 100 records. Fee agreements and time entries do not automatically issue invoices.",
                )}
              </p>
            </div>
          )}
          {tab === "journals" && (
            <div className="practice-records">
              {rows.map((r) => (
                <article className="panel" key={r.id}>
                  <h3>{str(r.description)}</h3>
                  <small>
                    {str(r.reference)} · {str(r.fund)}
                  </small>
                  <table>
                    <thead>
                      <tr>
                        <th>{tr("الحساب", "Account")}</th>
                        <th>{tr("مدين", "Debit")}</th>
                        <th>{tr("دائن", "Credit")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.isArray(r.lines) &&
                        (r.lines as Row[]).map((l) => (
                          <tr key={l.id}>
                            <td>{str((l.account as Account).name)}</td>
                            <td>{money(l.debitMinor)}</td>
                            <td>{money(l.creditMinor)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </article>
              ))}
            </div>
          )}
          {!["reports", "trust", "fees", "time"].includes(tab) && (
            <div className="practice-toolbar">
              <span>
                {total} {tr("سجل", "records")}
              </span>
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {tr("السابق", "Previous")}
              </button>
              <span>{page}</span>
              <button
                disabled={page * 12 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                {tr("التالي", "Next")}
              </button>
            </div>
          )}
        </>
      )}
      <dialog
        ref={dialog}
        className="practice-dialog panel"
        onCancel={() => setModal(null)}
      >
        <div className="practice-toolbar">
          <h2>{tr("تسجيل عملية مالية", "Record financial transaction")}</h2>
          <button
            aria-label={tr("إغلاق", "Close")}
            onClick={() => setModal(null)}
          >
            <X size={18} />
          </button>
        </div>
        {error && (
          <p role="alert" className="alert error">
            {error}
          </p>
        )}
        <label>
          {tr(
            "بحث قوائم الموكلين والقضايا",
            "Search client and matter choices",
          )}
          <input value={lookup} onChange={(e) => setLookup(e.target.value)} />
        </label>
        <form
          className="practice-form"
          onSubmit={(e) => void submit(e)}
          key={`${modal?.kind}-${modal?.invoiceId ?? "new"}`}
        >
          {fields().map((f) => (
            <label key={f.key} className={f.type === "textarea" ? "wide" : ""}>
              {tr(f.ar, f.en)}
              {f.options ? (
                <select
                  name={f.key}
                  aria-label={tr(f.ar, f.en)}
                  required={f.required}
                >
                  {f.options.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  name={f.key}
                  aria-label={tr(f.ar, f.en)}
                  required={f.required}
                  maxLength={5000}
                />
              ) : (
                <input
                  name={f.key}
                  aria-label={tr(f.ar, f.en)}
                  type={f.type ?? "text"}
                  required={f.required}
                  defaultValue={f.value}
                  maxLength={240}
                  min={f.type === "number" ? 1 : undefined}
                />
              )}
            </label>
          ))}
          {modal?.kind === "journal" && (
            <div className="wide">
              <h3>{tr("أطراف القيد المتوازن", "Balanced journal lines")}</h3>
              {lines.map((l, index) => (
                <div className="finance-line" key={index}>
                  <select
                    aria-label={`${tr("حساب", "Account")} ${index + 1}`}
                    value={l.accountId}
                    required
                    onChange={(e) =>
                      setLines((v) =>
                        v.map((a, i) =>
                          i === index ? { ...a, accountId: e.target.value } : a,
                        ),
                      )
                    }
                  >
                    <option value="">
                      {tr("اختر حساب تشغيل", "Choose operating account")}
                    </option>
                    {directory.accounts
                      .filter((a) => a.fund === "OPERATING")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                  </select>
                  <input
                    aria-label={`${tr("مدين", "Debit")} ${index + 1}`}
                    placeholder={tr("مدين", "Debit")}
                    value={l.debit}
                    onChange={(e) =>
                      setLines((v) =>
                        v.map((a, i) =>
                          i === index ? { ...a, debit: e.target.value } : a,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label={`${tr("دائن", "Credit")} ${index + 1}`}
                    placeholder={tr("دائن", "Credit")}
                    value={l.credit}
                    onChange={(e) =>
                      setLines((v) =>
                        v.map((a, i) =>
                          i === index ? { ...a, credit: e.target.value } : a,
                        ),
                      )
                    }
                  />
                  {lines.length > 2 && (
                    <button
                      type="button"
                      onClick={() =>
                        setLines((v) => v.filter((_, i) => i !== index))
                      }
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setLines((v) => [
                    ...v,
                    { accountId: "", debit: "", credit: "" },
                  ])
                }
              >
                {tr("إضافة طرف", "Add line")}
              </button>
            </div>
          )}
          <div className="wide practice-toolbar">
            <button className="primary" type="submit" disabled={busy}>
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
