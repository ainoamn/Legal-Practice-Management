"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Plus,
  Search,
  ArrowRight,
  CalendarDays,
  Scale,
  Users,
  CheckSquare,
  Building2,
  ShieldCheck,
  Bell,
  X,
} from "lucide-react";
import {
  api,
  ApiError,
  type Me,
  type Page,
  type Member,
  type Branch,
} from "../lib/api";
import { parseMinor, displayMoney } from "@legal/contracts/platform";
import { DocumentsPanel } from "./documents-panel";
import { MatterAssistant } from "./matter-assistant";
import { StaffPortalPanel } from "./portal-panel";
import { recordLabel } from "../lib/record-labels";
type Client = {
  id: string;
  name: string;
  kind: string;
  branchId: string;
  phone: string | null;
  email: string | null;
  identityNumber: string | null;
  registrationNumber: string | null;
  address: string | null;
  nationality: string | null;
  representative: string | null;
  notes: string;
  tags: string[];
  matters?: Matter[];
};
type Court = {
  id: string;
  name: string;
  countryCode: string;
  region: string;
  address: string;
};
type Assignment = { memberId: string; lead: boolean };
type Hearing = {
  id: string;
  matterId: string;
  responsibleId: string;
  startsAt: string;
  endsAt: string;
  room: string;
  preparation: string;
  status: string;
  outcome: string;
  decision: string;
  clientVisible: boolean;
  matter?: { title: string; reference?: string };
};
type Task = {
  id: string;
  matterId: string;
  assignedTo: string;
  title: string;
  description: string;
  dueAt: string;
  priority: string;
  status: string;
};
type Matter = {
  id: string;
  reference: string;
  title: string;
  category: string;
  status: string;
  branchId: string;
  clientId: string;
  courtId: string | null;
  courtNumber: string;
  countryCode: string;
  claimMinor: number | null;
  summary: string;
  nextStep: string;
  currentPosition: string;
  confidentiality: string;
  clientVisible: boolean;
  division: string;
  region: string;
  litigationLevel: string;
  claimType: string;
  filedAt?: string | null;
  registeredAt?: string | null;
  version: number;
  client: Client;
  court: Court | null;
  assignments: Assignment[];
  parties?: { id: string; name: string; kind: string; lawyer: string }[];
  hearings?: Hearing[];
  tasks?: Task[];
  notes?: { id: string; body: string; createdAt: string }[];
  events?: { id: string; action: string; actorId: string; createdAt: string }[];
};
type Stats = {
  matters: number;
  active: number;
  clients: number;
  overdueTasks: number;
  byStatus: { status: string; _count: number }[];
  byCategory: { category: string; _count: number }[];
  upcomingHearings: Hearing[];
};
type Notification = {
  id: string;
  dueAt: string;
  hearing: Hearing & { matter: { title: string } };
};
type Section =
  | "overview"
  | "clients"
  | "matters"
  | "hearings"
  | "tasks"
  | "courts"
  | "conflicts"
  | "notifications";
type Modal = {
  kind:
    | "client"
    | "matter"
    | "court"
    | "hearing"
    | "task"
    | "party"
    | "note"
    | "assignment"
    | "hearingResult";
  edit?: Client | Matter | Hearing;
};
type Field = {
  key: string;
  ar: string;
  en: string;
  type?: string;
  required?: boolean;
  options?: [string, string][];
  value?: string;
  multiple?: boolean;
};
const categories = [
  "CIVIL",
  "COMMERCIAL",
  "LABOUR",
  "CRIMINAL",
  "ADMINISTRATIVE",
  "REAL_ESTATE",
  "FAMILY",
  "PERSONAL_STATUS",
  "ENFORCEMENT",
  "APPEAL",
  "CASSATION",
  "ARBITRATION",
  "CORPORATE",
  "CONTRACT",
  "INSURANCE",
  "BANKING",
  "TAX",
  "OTHER",
];
const statuses = [
  "NEW",
  "UNDER_REVIEW",
  "PREPARING_DOCUMENTS",
  "FILED",
  "IN_PROGRESS",
  "AWAITING_HEARING",
  "AWAITING_JUDGMENT",
  "JUDGED",
  "APPEAL",
  "ENFORCEMENT",
  "STOPPED",
  "SUSPENDED",
  "CLOSED",
  "ARCHIVED",
];
const labels: Record<string, string> = {
  INDIVIDUAL: "فرد",
  COMPANY: "شركة",
  INSTITUTION: "مؤسسة",
  GOVERNMENT: "جهة حكومية",
  ASSOCIATION: "جمعية",
  OTHER: "أخرى",
  CIVIL: "مدنية",
  COMMERCIAL: "تجارية",
  LABOUR: "عمالية",
  CRIMINAL: "جزائية",
  ADMINISTRATIVE: "إدارية",
  REAL_ESTATE: "عقارية",
  FAMILY: "أسرية",
  PERSONAL_STATUS: "أحوال شخصية",
  ENFORCEMENT: "تنفيذ",
  APPEAL: "استئناف",
  CASSATION: "نقض",
  ARBITRATION: "تحكيم",
  CORPORATE: "شركات",
  CONTRACT: "عقود",
  INSURANCE: "تأمين",
  BANKING: "مصرفية",
  TAX: "ضريبية",
  NEW: "جديدة",
  UNDER_REVIEW: "قيد الدراسة",
  PREPARING_DOCUMENTS: "إعداد المستندات",
  FILED: "تم رفع الدعوى",
  IN_PROGRESS: "قيد العمل",
  AWAITING_HEARING: "بانتظار الجلسة",
  AWAITING_JUDGMENT: "بانتظار الحكم",
  JUDGED: "محكوم فيها",
  STOPPED: "متوقفة",
  SUSPENDED: "معلقة",
  CLOSED: "منتهية",
  ARCHIVED: "مؤرشفة",
  NORMAL: "عادية",
  CONFIDENTIAL: "سرية",
  RESTRICTED: "مقيدة",
  FIRST_INSTANCE: "ابتدائي",
  SCHEDULED: "مجدولة",
  CONFIRMED: "مؤكدة",
  HELD: "انعقدت",
  POSTPONED: "تأجلت",
  CANCELLED: "ملغاة",
  NOT_HELD: "لم تنعقد",
  AWAITING_RESULT: "بانتظار النتيجة",
  COMPLETED: "انتهت",
  TODO: "لم تبدأ",
  BLOCKED: "متعطلة",
  DONE: "مكتملة",
  LOW: "منخفضة",
  HIGH: "عالية",
  URGENT: "عاجلة",
  OPPONENT: "خصم",
  CO_CLIENT: "موكل مشارك",
  WITNESS: "شاهد",
  RELATED: "طرف مرتبط",
};
export function PracticeConsole({
  me,
  locale,
}: {
  me: Me;
  locale: "ar" | "en";
}) {
  const ar = locale === "ar",
    tr = (a: string, b: string) => (ar ? a : b);
  const label = (v: string) =>
    ar ? (labels[v] ?? v) : v.replaceAll("_", " ").toLowerCase();
  const can = useCallback(
    (p: string) => me.role.permissions.includes(p),
    [me.role.permissions],
  );
  const [section, setSection] = useState<Section>("overview"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [clients, setClients] = useState<Client[]>([]),
    [matters, setMatters] = useState<Matter[]>([]),
    [courts, setCourts] = useState<Court[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [branches, setBranches] = useState<Branch[]>([me.branch]);
  const [rows, setRows] = useState<
      (Client | Matter | Hearing | Task | Court)[]
    >([]),
    [total, setTotal] = useState(0),
    [stats, setStats] = useState<Stats | null>(null),
    [notifications, setNotifications] = useState<Notification[]>([]);
  const [conflicts, setConflicts] = useState<{
    clients: Client[];
    parties: { id: string; name: string; kind: string; matterId: string }[];
  } | null>(null);
  const [detail, setDetail] = useState<Matter | null>(null),
    [clientDetail, setClientDetail] = useState<Client | null>(null),
    [detailTab, setDetailTab] = useState("overview"),
    [modal, setModal] = useState<Modal | null>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [decimals, setDecimals] = useState(3);
  const [calendarFrom, setCalendarFrom] = useState(""),
    [calendarTo, setCalendarTo] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const fail = useCallback(
    (err: unknown) => {
      const code = err instanceof ApiError ? err.code : "FAILED";
      const messages: Record<string, [string, string]> = {
        NOT_FOUND: [
          "السجل غير موجود أو غير مصرح بالوصول إليه",
          "Record unavailable",
        ],
        FORBIDDEN: ["لا تملك الصلاحية المطلوبة", "Permission denied"],
        CONFLICT: [
          "يوجد سجل بالهوية أو الرقم نفسه",
          "A record with this identifier already exists",
        ],
        STALE_VERSION: [
          "عُدلت القضية بواسطة مستخدم آخر؛ أعد فتحها قبل الحفظ",
          "Matter changed; reopen before saving",
        ],
        HEARING_TIME_CONFLICT: [
          "المحامي لديه جلسة متداخلة؛ اختر وقتاً آخر",
          "The lawyer has an overlapping hearing",
        ],
        ASSIGNEE_NOT_ON_MATTER: [
          "يجب تكليف المحامي بالقضية أولاً",
          "Assign this lawyer to the matter first",
        ],
        MATTER_QUOTA_EXCEEDED: [
          "تم بلوغ حد القضايا في الباقة",
          "Matter plan limit reached",
        ],
        TENANT_READ_ONLY: [
          "المكتب في وضع القراءة فقط؛ راجع الاشتراك أو مدير المنصة",
          "Firm is read-only; check subscription or contact the administrator",
        ],
        VALIDATION_ERROR: [
          "راجع الحقول والتواريخ المدخلة",
          "Check the supplied fields and dates",
        ],
        INVALID_ASSIGNEES: [
          "اختر مستخدمين نشطين لديهم صلاحية عرض القضايا",
          "Choose active users with matter access",
        ],
      };
      setError(
        messages[code]?.[locale === "ar" ? 0 : 1] ??
          (locale === "ar"
            ? `تعذر إتمام العملية (${code})`
            : `Unable to complete request (${code})`),
      );
    },
    [locale],
  );
  const refreshDetail = useCallback(
    async (id: string) =>
      setDetail(await api<Matter>(`practice/matters/${id}`)),
    [],
  );
  useEffect(() => {
    let live = true;
    Promise.all([
      can("clients:read")
        ? api<Page<Client>>("practice/clients?pageSize=100")
        : Promise.resolve(null),
      api<Page<Matter>>("practice/matters?pageSize=100"),
      api<Court[]>("practice/courts"),
      can("team:read")
        ? api<Page<Member>>("users?pageSize=100")
        : Promise.resolve(null),
      api<{ branches: Branch[] }>("tenants/current"),
      api<{ code: string; currencyDecimals: number }[]>("countries"),
    ])
      .then(([c, m, ct, users, w, countries]) => {
        if (!live) return;
        setClients(c?.items ?? []);
        setMatters(m.items);
        setCourts(ct);
        setMembers(users?.items ?? []);
        setBranches(w.branches);
        setDecimals(
          countries.find((v) => v.code === me.tenant.countryCode)
            ?.currencyDecimals ?? 3,
        );
      })
      .catch((e) => {
        if (live) fail(e);
      });
    return () => {
      live = false;
    };
  }, [revision, me.membership.id, me.tenant.countryCode, can, fail]);
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
        if (calendarFrom) q.set("from", new Date(calendarFrom).toISOString());
        if (calendarTo) q.set("to", new Date(calendarTo).toISOString());
        if (section === "overview") {
          const data = await api<Stats>("practice/overview");
          if (live) setStats(data);
        } else if (section === "conflicts") {
          if (search.trim().length >= 2) {
            const data = await api<NonNullable<typeof conflicts>>(
              `practice/conflicts?${q}`,
            );
            if (live) setConflicts(data);
          } else if (live) setConflicts(null);
        } else if (section === "notifications") {
          const data = await api<Notification[]>("practice/notifications");
          if (live) setNotifications(data);
        } else if (section === "courts") {
          const data = await api<Court[]>("practice/courts");
          if (live) {
            setRows(data);
            setTotal(data.length);
          }
        } else {
          const data = await api<Page<Client | Matter | Hearing | Task>>(
            `practice/${section}?${q}`,
          );
          if (live) {
            setRows(data.items);
            setTotal(data.total);
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
  }, [section, page, search, calendarFrom, calendarTo, revision, fail]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  const dt = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: me.tenant.timezone,
    }).format(new Date(value));
  const memberName = (id: string) =>
    id === me.membership.id
      ? me.user.fullName
      : (members.find((m) => m.id === id)?.user.fullName ??
        tr("عضو مكلف", "Assigned member"));
  const openMatter = async (id: string) => {
    setError("");
    setClientDetail(null);
    setBusy(true);
    try {
      await refreshDetail(id);
      setDetailTab("overview");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const openClient = async (id: string) => {
    try {
      setClientDetail(await api<Client>(`practice/clients/${id}`));
    } catch (e) {
      fail(e);
    }
  };
  const updated = () => {
    setRevision((v) => v + 1);
    setNotice(tr("تم الحفظ", "Saved"));
  };
  const options = (values: string[]) =>
    values.map((v): [string, string] => [v, label(v)]);
  const clientOptions = clients.map((c): [string, string] => [c.id, c.name]);
  const matterOptions = (detail ? [detail] : matters).map(
    (m): [string, string] => [m.id, `${m.reference} · ${m.title}`],
  );
  const branchOptions = branches
    .filter((b) => can("matters:read:all") || b.id === me.branch.id)
    .map((b): [string, string] => [b.id, b.name]);
  const memberOptions = members
    .filter((m) => m.active && m.role.permissions.includes("matters:read"))
    .map((m): [string, string] => [m.id, m.user.fullName]);
  if (!memberOptions.some(([id]) => id === me.membership.id))
    memberOptions.unshift([me.membership.id, me.user.fullName]);
  const assignedOptions = detail
    ? memberOptions.filter(([id]) =>
        detail.assignments.some((a) => a.memberId === id),
      )
    : memberOptions;
  const fields = (): Field[] => {
    const k = modal?.kind;
    if (k === "client")
      return [
        { key: "name", ar: "اسم الموكل", en: "Client name", required: true },
        {
          key: "kind",
          ar: "نوع الموكل",
          en: "Client type",
          options: options([
            "INDIVIDUAL",
            "COMPANY",
            "INSTITUTION",
            "GOVERNMENT",
            "ASSOCIATION",
            "OTHER",
          ]),
        },
        {
          key: "branchId",
          ar: "الفرع",
          en: "Branch",
          options: branchOptions,
          value: me.branch.id,
        },
        { key: "identityNumber", ar: "رقم الهوية", en: "Identity number" },
        {
          key: "registrationNumber",
          ar: "السجل التجاري",
          en: "Registration number",
        },
        { key: "phone", ar: "الهاتف", en: "Phone", type: "tel" },
        { key: "email", ar: "البريد الإلكتروني", en: "Email", type: "email" },
        { key: "address", ar: "العنوان", en: "Address" },
        { key: "nationality", ar: "الجنسية", en: "Nationality" },
        {
          key: "representative",
          ar: "الممثل المفوض",
          en: "Authorized representative",
        },
        {
          key: "notes",
          ar: "ملاحظات داخلية",
          en: "Internal notes",
          type: "textarea",
        },
      ];
    if (k === "matter")
      return [
        {
          key: "title",
          ar: "عنوان القضية",
          en: "Matter title",
          required: true,
        },
        {
          key: "clientId",
          ar: "الموكل",
          en: "Client",
          options: clientOptions,
          required: true,
        },
        {
          key: "branchId",
          ar: "الفرع",
          en: "Branch",
          options: branchOptions,
          value: me.branch.id,
        },
        {
          key: "category",
          ar: "التصنيف (يمكن إدخال تصنيف خاص)",
          en: "Category (custom values accepted)",
          type: "category",
          value: "CIVIL",
          required: true,
        },
        {
          key: "status",
          ar: "الحالة (يمكن إدخال حالة خاصة)",
          en: "Status (custom values accepted)",
          type: "status",
          value: "NEW",
          required: true,
        },
        {
          key: "countryCode",
          ar: "رمز الدولة",
          en: "Country code",
          value: me.tenant.countryCode,
          required: true,
        },
        {
          key: "courtId",
          ar: "المحكمة",
          en: "Court",
          options: [
            ["", tr("غير محددة", "Unspecified")],
            ...courts.map((c): [string, string] => [c.id, c.name]),
          ],
        },
        {
          key: "courtNumber",
          ar: "رقم القضية بالمحكمة",
          en: "Court case number",
        },
        { key: "region", ar: "المحافظة / المنطقة", en: "Region" },
        { key: "division", ar: "الدائرة", en: "Division" },
        { key: "claimType", ar: "نوع الدعوى", en: "Claim type" },
        {
          key: "litigationLevel",
          ar: "درجة التقاضي",
          en: "Litigation level",
          options: options([
            "FIRST_INSTANCE",
            "APPEAL",
            "CASSATION",
            "ENFORCEMENT",
          ]),
        },
        {
          key: "filedAt",
          ar: "تاريخ رفع الدعوى",
          en: "Filing date",
          type: "date",
        },
        {
          key: "registeredAt",
          ar: "تاريخ القيد",
          en: "Registration date",
          type: "date",
        },
        {
          key: "claim",
          ar: `قيمة المطالبة (${me.tenant.currency})`,
          en: `Claim amount (${me.tenant.currency})`,
        },
        {
          key: "confidentiality",
          ar: "السرية",
          en: "Confidentiality",
          options: options(["NORMAL", "CONFIDENTIAL", "RESTRICTED"]),
        },
        {
          key: "summary",
          ar: "الموضوع والملخص",
          en: "Subject and summary",
          type: "textarea",
        },
        {
          key: "currentPosition",
          ar: "الموقف الحالي",
          en: "Current position",
          type: "textarea",
        },
        {
          key: "nextStep",
          ar: "الخطوة التالية",
          en: "Next step",
          type: "textarea",
        },
      ];
    if (k === "court")
      return [
        { key: "name", ar: "اسم المحكمة", en: "Court name", required: true },
        {
          key: "countryCode",
          ar: "رمز الدولة",
          en: "Country code",
          value: me.tenant.countryCode,
          required: true,
        },
        { key: "region", ar: "المنطقة", en: "Region" },
        { key: "address", ar: "العنوان", en: "Address" },
      ];
    if (k === "hearing")
      return [
        {
          key: "matterId",
          ar: "القضية",
          en: "Matter",
          options: matterOptions,
          required: true,
        },
        {
          key: "responsibleId",
          ar: "محامي الحضور (يجب تكليفه بالقضية)",
          en: "Attending lawyer (must be assigned)",
          options: assignedOptions,
          required: true,
        },
        {
          key: "startsAt",
          ar: "البداية بتوقيت جهازك",
          en: "Starts at (device time)",
          type: "datetime-local",
          required: true,
        },
        {
          key: "endsAt",
          ar: "النهاية بتوقيت جهازك",
          en: "Ends at (device time)",
          type: "datetime-local",
          required: true,
        },
        {
          key: "room",
          ar: "القاعة أو رابط الجلسة",
          en: "Room or meeting link",
        },
        {
          key: "preparation",
          ar: "التحضير والمستندات المطلوبة",
          en: "Preparation and required documents",
          type: "textarea",
        },
        {
          key: "reminders",
          ar: "التذكير قبل الجلسة بالدقائق (مفصولة بفواصل)",
          en: "Reminder minutes before hearing (comma separated)",
          value: "1440,60",
        },
        {
          key: "createPreparationTask",
          ar: "إنشاء مهمة تحضير",
          en: "Create preparation task",
          type: "checkbox",
        },
      ];
    if (k === "task")
      return [
        {
          key: "matterId",
          ar: "القضية",
          en: "Matter",
          options: matterOptions,
          required: true,
        },
        {
          key: "assignedTo",
          ar: "المكلف (من فريق القضية)",
          en: "Assignee (matter team)",
          options: assignedOptions,
          required: true,
        },
        { key: "title", ar: "عنوان المهمة", en: "Task title", required: true },
        {
          key: "description",
          ar: "الوصف",
          en: "Description",
          type: "textarea",
        },
        {
          key: "dueAt",
          ar: "الموعد النهائي بتوقيت جهازك",
          en: "Due at (device time)",
          type: "datetime-local",
          required: true,
        },
        {
          key: "priority",
          ar: "الأولوية",
          en: "Priority",
          options: options(["NORMAL", "HIGH", "URGENT", "LOW"]),
        },
      ];
    if (k === "party")
      return [
        { key: "name", ar: "اسم الطرف", en: "Party name", required: true },
        {
          key: "kind",
          ar: "صفة الطرف",
          en: "Party type",
          options: options(["OPPONENT", "CO_CLIENT", "WITNESS", "RELATED"]),
        },
        { key: "identityNumber", ar: "رقم الهوية", en: "Identity number" },
        { key: "lawyer", ar: "محامي الطرف", en: "Party lawyer" },
        { key: "contact", ar: "التواصل", en: "Contact" },
      ];
    if (k === "note")
      return [
        {
          key: "body",
          ar: "ملاحظة داخلية",
          en: "Internal note",
          type: "textarea",
          required: true,
        },
      ];
    if (k === "assignment")
      return [
        {
          key: "memberIds",
          ar: "فريق القضية (يمكن اختيار عدة أعضاء)",
          en: "Matter team (multiple selection)",
          options: memberOptions,
          multiple: true,
          required: true,
        },
        {
          key: "leadId",
          ar: "المحامي المسؤول",
          en: "Lead lawyer",
          options: memberOptions,
          required: true,
        },
      ];
    if (k === "hearingResult")
      return [
        {
          key: "status",
          ar: "الحالة",
          en: "Status",
          options: options([
            "SCHEDULED",
            "CONFIRMED",
            "HELD",
            "POSTPONED",
            "CANCELLED",
            "NOT_HELD",
            "AWAITING_RESULT",
            "COMPLETED",
          ]),
        },
        { key: "outcome", ar: "نتيجة الجلسة", en: "Outcome", type: "textarea" },
        { key: "decision", ar: "القرار", en: "Decision", type: "textarea" },
        {
          key: "nextHearingAt",
          ar: "موعد مقترح للجلسة القادمة بتوقيت جهازك",
          en: "Next hearing date (device time)",
          type: "datetime-local",
        },
        {
          key: "clientVisible",
          ar: "السماح بعرض الجلسة للموكل",
          en: "Allow client to view hearing",
          type: "checkbox",
        },
      ];
    return [];
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    const fd = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const data: Record<string, unknown> = {};
      fields().forEach((f) => {
        const value = fd.get(f.key);
        if (f.type === "checkbox") data[f.key] = value === "on";
        else if (f.multiple) data[f.key] = fd.getAll(f.key);
        else if (typeof value === "string") data[f.key] = value;
      });
      const kind = modal.kind,
        edit = modal.edit;
      let path: string =
        kind === "client"
          ? "clients"
          : kind === "matter"
            ? "matters"
            : kind === "court"
              ? "courts"
              : kind === "hearing"
                ? "hearings"
                : kind === "task"
                  ? "tasks"
                  : `matters/${detail?.id}/${kind === "party" ? "parties" : kind === "note" ? "notes" : "assignments"}`;
      let method = "POST";
      if (edit && (kind === "client" || kind === "matter")) {
        path += `/${edit.id}`;
        method = "PATCH";
      }
      if (kind === "client")
        [
          "identityNumber",
          "registrationNumber",
          "email",
          "phone",
          "address",
          "nationality",
          "representative",
        ].forEach((k) => {
          if (!data[k]) data[k] = null;
        });
      if (kind === "matter") {
        data.claimMinor = data.claim
          ? parseMinor(String(data.claim), decimals)
          : null;
        delete data.claim;
        if (!data.courtId) data.courtId = null;
        for (const key of ["filedAt", "registeredAt"])
          if (!data[key]) data[key] = null;
        if (edit && "version" in edit) data.version = edit.version;
      }
      if (kind === "hearing") {
        data.reminderMinutes = String(data.reminders)
          .split(",")
          .map((v) => Number(v.trim()));
        delete data.reminders;
      }
      for (const key of ["startsAt", "endsAt", "dueAt", "nextHearingAt"])
        if (data[key]) data[key] = new Date(String(data[key])).toISOString();
        else delete data[key];
      if (kind === "hearingResult") {
        path = `hearings/${edit?.id}`;
        method = "PATCH";
      }
      const saved = await api<{ id: string }>(`practice/${path}`, method, data);
      setModal(null);
      updated();
      if (detail) await refreshDetail(detail.id);
      if (kind === "matter" && !edit) await openMatter(saved.id);
      if (kind === "client" && clientDetail) await openClient(saved.id);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }
  const nav: [Section, string, string, typeof Scale, string?][] = [
    ["overview", "المؤشرات", "Overview", Scale],
    ["clients", "الموكلون", "Clients", Users, "clients:read"],
    ["matters", "القضايا", "Matters", Scale],
    ["hearings", "الجلسات والتقويم", "Hearings & calendar", CalendarDays],
    ["tasks", "المهام", "Tasks", CheckSquare],
    ["courts", "المحاكم", "Courts", Building2],
    ["conflicts", "تعارض المصالح", "Conflicts", ShieldCheck, "conflicts:read"],
    ["notifications", "التذكيرات", "Reminders", Bell],
  ];
  const createPermission: Partial<Record<Section, [string, Modal["kind"]]>> = {
    clients: ["clients:manage", "client"],
    matters: ["matters:manage", "matter"],
    courts: ["courts:manage", "court"],
    hearings: ["hearings:manage", "hearing"],
    tasks: ["tasks:manage", "task"],
  };
  const creation = createPermission[section];
  const action = (
    kind: Modal["kind"],
    textAr: string,
    textEn: string,
    permission: string,
  ) =>
    can(permission) ? (
      <button
        type="button"
        onClick={() => {
          setError("");
          setModal({ kind });
        }}
      >
        <Plus size={15} />
        {tr(textAr, textEn)}
      </button>
    ) : null;
  const hearingList = (items: Hearing[]) =>
    items.length ? (
      <div className="practice-records">
        {items.map((h) => (
          <article className="panel" key={h.id}>
            <span className="badge">{label(h.status)}</span>
            <h3>{h.matter?.title ?? detail?.title}</h3>
            <p>
              {dt(h.startsAt)} — {dt(h.endsAt)}
            </p>
            <p>
              {memberName(h.responsibleId)} · {h.room}
            </p>
            <p>{h.outcome}</p>
            <p>{h.decision}</p>
            {can("hearings:manage") && (
              <button
                onClick={() => setModal({ kind: "hearingResult", edit: h })}
              >
                {tr("تسجيل النتيجة", "Record outcome")}
              </button>
            )}
          </article>
        ))}
      </div>
    ) : (
      <p className="empty">{tr("لا توجد جلسات", "No hearings")}</p>
    );
  const taskList = (items: Task[]) =>
    items.length ? (
      <div className="practice-records">
        {items.map((task) => (
          <article className="panel" key={task.id}>
            <span className="badge">{label(task.priority)}</span>
            <h3>{task.title}</h3>
            <p>{task.description}</p>
            <p>
              {memberName(task.assignedTo)} · {dt(task.dueAt)}
            </p>
            <label>
              {tr("الحالة", "Status")}
              <select
                aria-label={`${tr("حالة", "Status")} ${task.title}`}
                value={task.status}
                disabled={!can("tasks:manage") || busy}
                onChange={async (e) => {
                  setBusy(true);
                  try {
                    await api(`practice/tasks/${task.id}`, "PATCH", {
                      status: e.target.value,
                    });
                    updated();
                    if (detail) await refreshDetail(detail.id);
                  } catch (err) {
                    fail(err);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {options([
                  "TODO",
                  "IN_PROGRESS",
                  "BLOCKED",
                  "DONE",
                  "CANCELLED",
                ]).map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </article>
        ))}
      </div>
    ) : (
      <p className="empty">{tr("لا توجد مهام", "No tasks")}</p>
    );
  return (
    <section className="practice-console">
      <nav
        className="practice-nav"
        aria-label={tr("وحدات العمل القانوني", "Legal practice modules")}
      >
        {nav
          .filter(([, , , , p]) => !p || can(p))
          .map(([id, a, e, Icon]) => (
            <button
              key={id}
              className={section === id ? "active" : ""}
              onClick={() => {
                setSection(id);
                setRows([]);
                setTotal(0);
                setLoading(true);
                setDetail(null);
                setClientDetail(null);
                setSearch("");
                setPage(1);
                setError("");
                setNotice("");
              }}
            >
              <Icon size={17} />
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
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      {detail ? (
        <>
          <div className="practice-toolbar">
            <button onClick={() => setDetail(null)}>
              <ArrowRight size={16} />
              {tr("قائمة القضايا", "Matter list")}
            </button>
            <span className="badge">{detail.reference}</span>
            {can("matters:manage") && (
              <button
                className="primary"
                onClick={() => setModal({ kind: "matter", edit: detail })}
              >
                {tr("تعديل القضية", "Edit matter")}
              </button>
            )}
            {can("matters:manage") && (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`practice/matters/${detail.id}/portal`, "PATCH", {
                      clientVisible: !detail.clientVisible,
                      version: detail.version,
                    });
                    await refreshDetail(detail.id);
                    updated();
                  } catch (e) {
                    fail(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {detail.clientVisible
                  ? tr("سحب من بوابة الموكل", "Unshare from client portal")
                  : tr("نشر في بوابة الموكل", "Share in client portal")}
              </button>
            )}
          </div>
          <h2>{detail.title}</h2>
          <p className="muted">
            {detail.client.name} ·{" "}
            {detail.court?.name ?? tr("محكمة غير محددة", "Court unspecified")} ·{" "}
            {label(detail.confidentiality)}
          </p>
          <nav
            className="practice-nav"
            aria-label={tr("تفاصيل القضية", "Matter details")}
          >
            {[
              ["overview", "نظرة عامة", "Overview"],
              ["parties", "الأطراف", "Parties"],
              ["hearings", "الجلسات", "Hearings"],
              ["tasks", "المهام", "Tasks"],
              ["notes", "الملاحظات", "Notes"],
              ...(can("documents:read")
                ? [
                    ["documents", "المستندات", "Documents"],
                    ["assistant", "المساعد", "Assistant"],
                  ]
                : []),
              ["timeline", "الخط الزمني", "Timeline"],
            ].map(([id, a, e]) => (
              <button
                key={id}
                className={detailTab === id ? "active" : ""}
                onClick={() => setDetailTab(id!)}
              >
                {tr(a!, e!)}
              </button>
            ))}
          </nav>
          {detailTab === "overview" && (
            <div className="practice-records">
              <article className="panel">
                <h3>{tr("ملف القضية", "Matter profile")}</h3>
                <dl className="practice-facts">
                  {[
                    [tr("الحالة", "Status"), label(detail.status)],
                    [tr("التصنيف", "Category"), label(detail.category)],
                    [tr("رقم المحكمة", "Court number"), detail.courtNumber],
                    [tr("الدرجة", "Level"), label(detail.litigationLevel)],
                    [
                      tr("المطالبة", "Claim"),
                      detail.claimMinor === null
                        ? "—"
                        : `${displayMoney(detail.claimMinor, decimals)} ${me.tenant.currency}`,
                    ],
                    [tr("الدائرة", "Division"), detail.division],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
                <h4>{tr("الموضوع والملخص", "Summary")}</h4>
                <p className="practice-prose">{detail.summary || "—"}</p>
                <h4>{tr("الموقف الحالي", "Current position")}</h4>
                <p>{detail.currentPosition || "—"}</p>
                <h4>{tr("الخطوة القادمة", "Next step")}</h4>
                <p>{detail.nextStep || "—"}</p>
              </article>
              <article className="panel">
                <h3>{tr("فريق القضية", "Matter team")}</h3>
                {detail.assignments.map((a) => (
                  <p key={a.memberId}>
                    {memberName(a.memberId)}{" "}
                    {a.lead && (
                      <span className="badge">{tr("المسؤول", "Lead")}</span>
                    )}
                  </p>
                ))}
                {action(
                  "assignment",
                  "إدارة التكليف",
                  "Manage assignments",
                  "matters:assign",
                )}
              </article>
            </div>
          )}
          {detailTab === "assistant" && can("documents:read") && (
            <MatterAssistant locale={locale} matterId={detail.id} />
          )}
          {detailTab === "documents" && (
            <DocumentsPanel
              key={detail.id}
              me={me}
              locale={locale}
              matterId={detail.id}
            />
          )}
          {detailTab === "parties" && (
            <>
              {action("party", "إضافة طرف", "Add party", "matters:manage")}
              <div className="practice-records">
                {detail.parties?.map((p) => (
                  <article className="panel" key={p.id}>
                    <h3>{p.name}</h3>
                    <p>{label(p.kind)}</p>
                    <p>{p.lawyer}</p>
                  </article>
                ))}
              </div>
            </>
          )}
          {detailTab === "hearings" && (
            <>
              {action(
                "hearing",
                "إضافة جلسة",
                "Add hearing",
                "hearings:manage",
              )}
              {hearingList(detail.hearings ?? [])}
            </>
          )}
          {detailTab === "tasks" && (
            <>
              {action("task", "إضافة مهمة", "Add task", "tasks:manage")}
              {taskList(detail.tasks ?? [])}
            </>
          )}
          {detailTab === "notes" && (
            <>
              {action("note", "إضافة ملاحظة", "Add note", "matters:manage")}
              <div className="practice-records">
                {detail.notes?.map((n) => (
                  <article key={n.id} className="panel">
                    <small>{dt(n.createdAt)}</small>
                    <p className="practice-prose">{n.body}</p>
                  </article>
                ))}
              </div>
            </>
          )}
          {detailTab === "timeline" && (
            <ol className="practice-timeline">
              {detail.events?.map((e) => (
                <li key={e.id}>
                  <strong>{recordLabel(e.action, locale)}</strong>
                  <span>
                    {dt(e.createdAt)} · {memberName(e.actorId)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      ) : clientDetail ? (
        <>
          <div className="practice-toolbar">
            <button onClick={() => setClientDetail(null)}>
              {tr("قائمة الموكلين", "Client list")}
            </button>
            {can("clients:manage") && (
              <button
                onClick={() => setModal({ kind: "client", edit: clientDetail })}
              >
                {tr("تعديل الموكل", "Edit client")}
              </button>
            )}
          </div>
          <article className="panel">
            <h2>{clientDetail.name}</h2>
            <p>
              {label(clientDetail.kind)} · {clientDetail.phone} ·{" "}
              {clientDetail.email}
            </p>
            <p>{clientDetail.address}</p>
            <p>
              {clientDetail.identityNumber} {clientDetail.registrationNumber}
            </p>
            <p className="practice-prose">{clientDetail.notes}</p>
            {can("clients:manage") && (
              <StaffPortalPanel
                key={clientDetail.id}
                clientId={clientDetail.id}
                me={me}
                locale={locale}
              />
            )}
            <h3>{tr("قضايا الموكل", "Client matters")}</h3>
            {clientDetail.matters?.map((m) => (
              <button key={m.id} onClick={() => void openMatter(m.id)}>
                {m.reference} · {m.title}
              </button>
            ))}
          </article>
        </>
      ) : (
        <>
          {section !== "overview" && section !== "notifications" && (
            <div className="practice-toolbar">
              <label className="practice-search">
                <Search size={16} />
                <input
                  aria-label={tr("بحث في السجلات", "Search records")}
                  placeholder={tr(
                    "بحث بالاسم أو الرقم…",
                    "Search name or reference…",
                  )}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              {creation && can(creation[0]) && (
                <button
                  className="primary"
                  onClick={() => setModal({ kind: creation[1] })}
                >
                  <Plus size={16} />
                  {tr("إضافة", "Add")}
                </button>
              )}
            </div>
          )}
          {section === "hearings" && (
            <div className="practice-toolbar">
              <label>
                {tr("من (توقيت جهازك)", "From (device time)")}
                <input
                  type="datetime-local"
                  value={calendarFrom}
                  onChange={(e) => {
                    setCalendarFrom(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label>
                {tr("إلى", "To")}
                <input
                  type="datetime-local"
                  value={calendarTo}
                  onChange={(e) => {
                    setCalendarTo(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <small>
                {tr(
                  "تعرض المواعيد بتوقيت المكتب:",
                  "Times displayed in firm timezone:",
                )}{" "}
                {me.tenant.timezone}
              </small>
            </div>
          )}
          {loading ? (
            <p role="status">{tr("جارٍ تحميل السجلات…", "Loading records…")}</p>
          ) : (
            <>
              {section === "overview" && stats && (
                <>
                  <div className="stats-grid">
                    {[
                      ["القضايا", "Matters", stats.matters],
                      ["النشطة", "Active", stats.active],
                      ["الموكلون", "Clients", stats.clients],
                      ["المهام المتأخرة", "Overdue tasks", stats.overdueTasks],
                    ].map(([a, e, v]) => (
                      <article className="stat-card" key={String(e)}>
                        <span>{tr(String(a), String(e))}</span>
                        <strong>{v}</strong>
                      </article>
                    ))}
                  </div>
                  <div className="practice-records">
                    <article className="panel">
                      <h3>{tr("القضايا حسب الحالة", "Matters by status")}</h3>
                      {stats.byStatus.length ? (
                        stats.byStatus.map((s) => (
                          <div key={s.status} className="practice-bar">
                            <span>{label(s.status)}</span>
                            <meter
                              min={0}
                              max={Math.max(1, stats.matters)}
                              value={s._count}
                            />
                            {s._count}
                          </div>
                        ))
                      ) : (
                        <p>{tr("لم تسجل قضايا بعد", "No matters recorded")}</p>
                      )}
                    </article>
                    <article className="panel">
                      <h3>
                        {tr("القضايا حسب التصنيف", "Matters by category")}
                      </h3>
                      {stats.byCategory.map((s) => (
                        <div key={s.category} className="practice-bar">
                          <span>{label(s.category)}</span>
                          <meter
                            min={0}
                            max={Math.max(1, stats.matters)}
                            value={s._count}
                          />
                          {s._count}
                        </div>
                      ))}
                    </article>
                  </div>
                  <h3>{tr("الجلسات القادمة", "Upcoming hearings")}</h3>
                  {hearingList(stats.upcomingHearings)}
                </>
              )}
              {section === "clients" && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {[
                          tr("الاسم", "Name"),
                          tr("النوع", "Type"),
                          tr("الاتصال", "Contact"),
                          tr("الهوية / السجل", "Identity / registration"),
                        ].map((v) => (
                          <th key={v}>{v}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(rows as Client[]).map((c) => (
                        <tr key={c.id}>
                          <td>
                            <button
                              className="text-button"
                              onClick={() => void openClient(c.id)}
                            >
                              {c.name}
                            </button>
                          </td>
                          <td>{label(c.kind)}</td>
                          <td>
                            {c.phone}
                            <br />
                            {c.email}
                          </td>
                          <td>
                            {c.identityNumber || c.registrationNumber || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {section === "matters" && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {[
                          tr("المرجع", "Reference"),
                          tr("القضية", "Matter"),
                          tr("الموكل", "Client"),
                          tr("الحالة", "Status"),
                          tr("السرية", "Confidentiality"),
                        ].map((v) => (
                          <th key={v}>{v}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(rows as Matter[]).map((m) => (
                        <tr key={m.id}>
                          <td>{m.reference}</td>
                          <td>
                            <button
                              className="text-button"
                              onClick={() => void openMatter(m.id)}
                            >
                              {m.title}
                            </button>
                          </td>
                          <td>{m.client.name}</td>
                          <td>
                            <span className="badge">{label(m.status)}</span>
                          </td>
                          <td>{label(m.confidentiality)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {section === "hearings" && hearingList(rows as Hearing[])}
              {section === "tasks" && taskList(rows as Task[])}
              {section === "courts" && (
                <div className="practice-records">
                  {(rows as Court[]).map((c) => (
                    <article className="panel" key={c.id}>
                      <h3>{c.name}</h3>
                      <p>
                        {c.countryCode} · {c.region}
                      </p>
                      <p>{c.address}</p>
                    </article>
                  ))}
                </div>
              )}
              {section === "conflicts" && (
                <article className="panel">
                  <h3>
                    {tr("فحص تعارض المصالح", "Conflict of interest check")}
                  </h3>
                  <p className="muted">
                    {tr(
                      "النتائج ضمن السجلات المصرح لك بها فقط. عدم ظهور نتيجة لا يعني اكتمال فحص المكتب.",
                      "Results include authorized records only. No matches does not constitute a complete firm conflict check.",
                    )}
                  </p>
                  {conflicts ? (
                    <>
                      {[...conflicts.clients, ...conflicts.parties].map((p) => (
                        <p key={p.id}>
                          <strong>{p.name}</strong> · {label(p.kind)}
                        </p>
                      ))}
                      {!conflicts.clients.length &&
                        !conflicts.parties.length && (
                          <p>
                            {tr(
                              "لا توجد مطابقات ضمن صلاحياتك",
                              "No matches within your access",
                            )}
                          </p>
                        )}
                    </>
                  ) : (
                    <p>
                      {tr(
                        "أدخل حرفين على الأقل من الاسم أو رقم الهوية",
                        "Enter at least two characters of a name or identifier",
                      )}
                    </p>
                  )}
                </article>
              )}
              {section === "notifications" && (
                <div className="practice-records">
                  {notifications.map((n) => (
                    <article className="panel" key={n.id}>
                      <h3>{n.hearing.matter.title}</h3>
                      <p>{dt(n.hearing.startsAt)}</p>
                      <button
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await api(
                              `practice/notifications/${n.id}/read`,
                              "POST",
                              {},
                            );
                            updated();
                          } catch (e) {
                            fail(e);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {tr("تعليم كمقروء", "Mark read")}
                      </button>
                    </article>
                  ))}
                  {!notifications.length && (
                    <p>{tr("لا توجد تذكيرات مستحقة", "No reminders due")}</p>
                  )}
                </div>
              )}
              {["clients", "matters", "hearings", "tasks", "courts"].includes(
                section,
              ) && (
                <div className="practice-toolbar">
                  <span>
                    {total} {tr("سجل", "records")}
                  </span>
                  {section !== "courts" && (
                    <>
                      <button
                        disabled={page === 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        {tr("السابق", "Previous")}
                      </button>
                      <span>
                        {page} / {Math.max(1, Math.ceil(total / 12))}
                      </span>
                      <button
                        disabled={page * 12 >= total}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        {tr("التالي", "Next")}
                      </button>
                    </>
                  )}
                </div>
              )}
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
            {tr(
              modal?.edit ? "تعديل السجل" : "إضافة سجل",
              modal?.edit ? "Edit record" : "Add record",
            )}
          </h2>
          <button
            aria-label={tr("إغلاق", "Close")}
            onClick={() => setModal(null)}
          >
            <X size={18} />
          </button>
        </div>
        {error && (
          <div role="alert" className="alert error">
            {error}
          </div>
        )}
        <form
          key={`${modal?.kind}-${modal?.edit?.id ?? "new"}`}
          onSubmit={(e) => void submit(e)}
          className="practice-form"
        >
          {fields().map((f) => {
            const edit = modal?.edit;
            let value: string | string[] = f.value ?? "";
            if (edit && f.key in edit) {
              const raw = edit[f.key as keyof typeof edit];
              value = raw === null ? "" : String(raw);
            }
            if (
              f.key === "claim" &&
              edit &&
              "claimMinor" in edit &&
              edit.claimMinor !== null
            )
              value = displayMoney(edit.claimMinor, decimals);
            if (f.type === "date") value = String(value).slice(0, 10);
            if (f.key === "memberIds" && detail)
              value = detail.assignments.map((a) => a.memberId);
            if (f.key === "leadId" && detail)
              value = detail.assignments.find((a) => a.lead)?.memberId ?? "";
            return (
              <label
                key={f.key}
                className={f.type === "textarea" ? "wide" : ""}
              >
                {tr(f.ar, f.en)}
                {f.required ? " *" : ""}
                {f.options ? (
                  <select
                    aria-label={tr(f.ar, f.en)}
                    name={f.key}
                    required={f.required}
                    multiple={f.multiple}
                    defaultValue={value || undefined}
                  >
                    {f.options.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea
                    aria-label={tr(f.ar, f.en)}
                    name={f.key}
                    defaultValue={value}
                    maxLength={20000}
                    required={f.required}
                  />
                ) : f.type === "checkbox" ? (
                  <input
                    type="checkbox"
                    aria-label={tr(f.ar, f.en)}
                    name={f.key}
                    defaultChecked={
                      edit && f.key in edit
                        ? Boolean(edit[f.key as keyof typeof edit])
                        : false
                    }
                  />
                ) : (
                  <input
                    aria-label={tr(f.ar, f.en)}
                    type={
                      f.type === "category" || f.type === "status"
                        ? "text"
                        : (f.type ?? "text")
                    }
                    list={
                      f.type === "category" || f.type === "status"
                        ? `practice-${f.type}`
                        : undefined
                    }
                    name={f.key}
                    defaultValue={value}
                    maxLength={240}
                    required={f.required}
                  />
                )}
              </label>
            );
          })}
          <datalist id="practice-category">
            {categories.map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </datalist>
          <datalist id="practice-status">
            {statuses.map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </datalist>
          <div className="wide practice-toolbar">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? tr("جارٍ الحفظ…", "Saving…") : tr("حفظ", "Save")}
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
