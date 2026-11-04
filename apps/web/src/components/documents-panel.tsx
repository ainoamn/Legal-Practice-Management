"use client";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FormEvent,
} from "react";
import {
  FileText,
  Upload,
  Plus,
  Download,
  Check,
  ShieldCheck,
  RefreshCw,
  X,
} from "lucide-react";
import { api, ApiError, type Me, type Page } from "../lib/api";
type Version = {
  id: string;
  version: number;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
  state: string;
  extractedText: string;
  requiresReview: boolean;
  extractionMethod: string | null;
  failureCode: string | null;
  createdAt: string;
};
type LegalDocument = {
  id: string;
  matterId: string;
  title: string;
  kind: string;
  status: string;
  tags: string[];
  currentVersion: number;
  clientVisible: boolean;
  approvedAt: string | null;
  versions: Version[];
};
type Template = {
  id: string;
  title: string;
  kind: string;
  body: string;
  locale: string;
};
export function DocumentsPanel({
  me,
  locale,
  matterId,
}: {
  me: Me;
  locale: "ar" | "en";
  matterId: string;
}) {
  const tr = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const can = (p: string) => me.role.permissions.includes(p);
  const [items, setItems] = useState<LegalDocument[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const [selected, setSelected] = useState<LegalDocument | null>(null),
    [templates, setTemplates] = useState<Template[]>([]),
    [createOpen, setCreateOpen] = useState(false),
    [templateOpen, setTemplateOpen] = useState(false),
    [body, setBody] = useState("");
  const [compare, setCompare] = useState(""),
    [reviewText, setReviewText] = useState(""),
    [clientVisible, setClientVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null),
    templateDialog = useRef<HTMLDialogElement>(null);
  const fail = useCallback(
    (err: unknown) => {
      const code = err instanceof ApiError ? err.code : "FAILED";
      const messages: Record<string, [string, string]> = {
        DOCUMENT_STORAGE_UNAVAILABLE: [
          "خدمة تخزين المستندات غير متاحة؛ راجع إعدادات التخزين",
          "Document storage is unavailable",
        ],
        STORAGE_QUOTA_EXCEEDED: [
          "تم بلوغ حد التخزين في الباقة",
          "Storage plan limit reached",
        ],
        SCAN_REQUIRED: [
          "يجب اكتمال الفحص أولاً",
          "File scanning must finish first",
        ],
        REVIEW_REQUIRED: [
          "تجب مراجعة الإصدار الحالي قبل اعتماده",
          "Review the current version before approval",
        ],
        STALE_VERSION: [
          "أضيف إصدار أحدث؛ أعد فتح المستند",
          "A newer version exists; reopen the document",
        ],
        INVALID_DOCUMENT_FILE: [
          "نوع الملف أو محتواه غير صالح، أو يتجاوز 25 ميغابايت",
          "Unsupported or mismatched file, or larger than 25 MiB",
        ],
        DOCUMENT_LOCKED: [
          "هذا الإصدار مقفل؛ أنشئ إصداراً جديداً للتعديل",
          "This version is locked; create a new version",
        ],
        TENANT_READ_ONLY: ["المكتب في وضع القراءة فقط", "Firm is read-only"],
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
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const q = new URLSearchParams({
          matterId,
          page: String(page),
          pageSize: "12",
          search,
        });
        const [records, templateList] = await Promise.all([
          api<Page<LegalDocument>>(`practice/documents?${q}`),
          api<Template[]>("practice/documents/templates"),
        ]);
        if (live) {
          setItems(records.items);
          setTotal(records.total);
          setTemplates(templateList);
          setLoading(false);
        }
      } catch (e) {
        if (live) {
          fail(e);
          setLoading(false);
        }
      }
    };
    const timeout = setTimeout(() => void load(), 200);
    const timer = setInterval(() => void load(), 5000);
    return () => {
      live = false;
      clearTimeout(timeout);
      clearInterval(timer);
    };
  }, [matterId, page, search, revision, fail]);
  useEffect(() => {
    if (
      !selected?.versions.some((v) =>
        ["PENDING", "PROCESSING"].includes(v.state),
      )
    )
      return;
    let live = true;
    const timer = setInterval(() => {
      api<LegalDocument>(`practice/documents/${selected.id}`)
        .then((d) => {
          if (live) {
            setSelected(d);
            setReviewText(d.versions[0]?.extractedText ?? "");
            if (d.versions[0]?.state === "READY")
              setBody(d.versions[0].extractedText.slice(0, 40000));
          }
        })
        .catch((e) => {
          if (live) fail(e);
        });
    }, 3000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [selected?.id, selected?.versions, fail]);
  useEffect(() => {
    if (createOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [createOpen]);
  useEffect(() => {
    if (templateOpen) templateDialog.current?.showModal();
    else templateDialog.current?.close();
  }, [templateOpen]);
  const open = async (id: string) => {
    setError("");
    const d = await api<LegalDocument>(`practice/documents/${id}`);
    setSelected(d);
    setReviewText(d.versions[0]?.extractedText ?? "");
    setBody(d.versions[0]?.extractedText ?? "");
    setClientVisible(d.clientVisible);
    setCompare("");
  };
  const changed = () => {
    setRevision((v) => v + 1);
    setNotice(tr("تم الحفظ", "Saved"));
  };
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const d = await api<LegalDocument>("practice/documents", "POST", {
        matterId,
        title: fd.get("title"),
        kind: fd.get("kind"),
        tags: String(fd.get("tags") ?? "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        body,
      });
      setCreateOpen(false);
      changed();
      await open(d.id);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: FileList | File[], targetId?: string) {
    setBusy(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        if (file.size > 25 * 1024 * 1024)
          throw new ApiError("INVALID_DOCUMENT_FILE");
        let id = targetId;
        if (!id)
          id = (
            await api<LegalDocument>("practice/documents", "POST", {
              matterId,
              title: file.name.length > 1 ? file.name : "Document",
              kind: "SUPPORTING",
              body: "",
            })
          ).id;
        const form = new FormData();
        form.append("file", file);
        const response = await fetch(`/api/v1/practice/documents/${id}/files`, {
          method: "POST",
          credentials: "same-origin",
          body: form,
        });
        if (!response.ok) {
          const data = await response.json();
          throw new ApiError(data.error?.code ?? "FAILED");
        }
        if (targetId) await open(targetId);
      }
      changed();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }
  async function act(action: string, data: unknown = {}) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api(`practice/documents/${selected.id}/${action}`, "POST", data);
      changed();
      if (action === "archive") setSelected(null);
      else await open(selected.id);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const latest = selected?.versions[0];
  const state = (v: string) =>
    ({
      PENDING: tr("بانتظار الفحص", "Awaiting scan"),
      PROCESSING: tr("جارٍ الفحص والاستخراج", "Scanning and extracting"),
      READY: tr("اكتمل الفحص", "Scan complete"),
      REJECTED: tr("مرفوض: تهديد مكتشف", "Rejected: threat detected"),
      FAILED: tr("تعذرت المعالجة", "Processing failed"),
      DRAFT: tr("مسودة", "Draft"),
      IN_REVIEW: tr("تمت المراجعة", "Reviewed"),
      APPROVED: tr("معتمد", "Approved"),
      ARCHIVED: tr("مؤرشف", "Archived"),
    })[v] ?? v;
  return (
    <section className="documents-panel">
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {notice && (
        <p role="status" className="alert success">
          {notice}
        </p>
      )}
      {selected ? (
        <>
          <div className="practice-toolbar">
            <button onClick={() => setSelected(null)}>
              {tr("قائمة المستندات", "Document list")}
            </button>
            <span className="badge">{state(selected.status)}</span>
            <strong>{selected.title}</strong>
            {can("documents:manage") && (
              <button disabled={busy} onClick={() => void act("archive")}>
                {tr("أرشفة", "Archive")}
              </button>
            )}
          </div>
          <div className="practice-records">
            <article className="panel">
              <h3>{tr("الإصدارات", "Versions")}</h3>
              {selected.versions.map((v) => (
                <div className="document-version" key={v.id}>
                  <strong>
                    {tr("إصدار", "Version")} {v.version} · {v.filename}
                  </strong>
                  <span className="badge">{state(v.state)}</span>
                  <small>
                    {(v.size / 1024).toFixed(1)} KB ·{" "}
                    {new Date(v.createdAt).toLocaleString(locale)}
                  </small>
                  {v.failureCode && (
                    <p role="status">
                      {v.failureCode === "MALWARE_DETECTED"
                        ? tr(
                            "تعذر قبول الملف بعد الفحص الأمني",
                            "The file was rejected by security scanning",
                          )
                        : v.failureCode === "SCANNER_UNAVAILABLE"
                          ? tr(
                              "خدمة فحص الملفات غير متاحة حالياً",
                              "File scanning is currently unavailable",
                            )
                          : tr(
                              "تعذرت معالجة الملف؛ يمكن إعادة المحاولة",
                              "File processing failed; you can retry",
                            )}
                    </p>
                  )}
                  {v.state === "FAILED" &&
                    v.version === selected.currentVersion &&
                    can("documents:manage") && (
                      <button
                        disabled={busy}
                        onClick={() => void act(`versions/${v.id}/retry`)}
                      >
                        {tr("إعادة معالجة الملف", "Retry file processing")}
                      </button>
                    )}
                  {v.state === "READY" && can("documents:download") && (
                    <a
                      href={`/api/v1/practice/documents/${selected.id}/versions/${v.id}/download`}
                    >
                      <Download size={15} />
                      {tr("تنزيل الأصل", "Download original")}
                    </a>
                  )}
                </div>
              ))}
            </article>
            <article className="panel">
              <h3>{tr("الفحص والمراجعة", "Scanning & review")}</h3>
              {latest ? (
                <>
                  <p>{state(latest.state)}</p>
                  <p className="muted">{latest.extractionMethod}</p>
                  {latest.requiresReview && (
                    <p>
                      {tr(
                        "النص المستخرج يحتاج مراجعة بشرية وقد يحتوي على أخطاء أو صفحات غير مستخرجة.",
                        "Extracted text requires human review and may contain errors or unprocessed pages.",
                      )}
                    </p>
                  )}
                  <label>
                    {tr("النص المستخرج للمراجعة", "Extracted text for review")}
                    <textarea
                      aria-label={tr(
                        "النص المستخرج للمراجعة",
                        "Extracted text for review",
                      )}
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value)}
                      disabled={
                        latest.state !== "READY" ||
                        selected.status === "APPROVED" ||
                        !can("documents:review")
                      }
                      dir="auto"
                      rows={12}
                      maxLength={200000}
                    />
                  </label>
                  {can("documents:review") && (
                    <button
                      disabled={
                        busy ||
                        latest.state !== "READY" ||
                        selected.status === "APPROVED"
                      }
                      onClick={() =>
                        void act("review", {
                          expectedVersion: selected.currentVersion,
                          reviewedText: reviewText,
                        })
                      }
                    >
                      <Check size={16} />
                      {tr("تأكيد المراجعة البشرية", "Confirm human review")}
                    </button>
                  )}
                  {can("documents:approve") && (
                    <>
                      <label className="document-check">
                        <input
                          type="checkbox"
                          checked={clientVisible}
                          disabled={busy || selected.status === "APPROVED"}
                          onChange={(e) => setClientVisible(e.target.checked)}
                        />
                        {tr(
                          "إتاحة الإصدار المعتمد للموكل",
                          "Make approved version visible to client",
                        )}
                      </label>
                      <button
                        disabled={
                          busy ||
                          selected.status !== "IN_REVIEW" ||
                          latest.requiresReview
                        }
                        onClick={() =>
                          void act("approve", {
                            expectedVersion: selected.currentVersion,
                            clientVisible,
                          })
                        }
                      >
                        <ShieldCheck size={16} />
                        {tr("اعتماد الإصدار", "Approve version")}
                      </button>
                    </>
                  )}
                </>
              ) : (
                <p>
                  {tr(
                    "ارفع ملفاً أو احفظ مسودة لإنشاء الإصدار الأول",
                    "Upload a file or save a draft to create the first version",
                  )}
                </p>
              )}
            </article>
          </div>
          {latest?.state === "READY" && can("documents:download") && (
            <div className="practice-toolbar">
              <a
                href={`/api/v1/practice/documents/${selected.id}/preview`}
                target="_blank"
                rel="noreferrer"
              >
                {tr("معاينة وتصدير PDF", "Preview and export PDF")}
              </a>
              <a href={`/api/v1/practice/documents/${selected.id}/export/docx`}>
                {tr("تصدير Word", "Export Word")}
              </a>
            </div>
          )}
          {selected.versions.length > 1 && (
            <article className="panel">
              <h3>{tr("مقارنة الإصدارات", "Compare versions")}</h3>
              <select
                aria-label={tr(
                  "الإصدار السابق للمقارنة",
                  "Previous version to compare",
                )}
                value={compare}
                onChange={(e) => setCompare(e.target.value)}
              >
                <option value="">{tr("اختر إصداراً", "Choose version")}</option>
                {selected.versions
                  .slice(1)
                  .filter((v) => v.state === "READY")
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.version} · {v.filename}
                    </option>
                  ))}
              </select>
              {compare && (
                <div className="document-comparison">
                  <pre dir="auto">
                    {
                      selected.versions.find((v) => v.id === compare)
                        ?.extractedText
                    }
                  </pre>
                  <pre dir="auto">{latest?.extractedText}</pre>
                </div>
              )}
            </article>
          )}
          {can("documents:manage") && (
            <article className="panel">
              <h3>{tr("إنشاء إصدار جديد", "Create new version")}</h3>
              <p className="muted">
                {tr(
                  "حفظ إصدار جديد يلغي الاعتماد والنشر حتى مراجعته واعتماده مجدداً.",
                  "A new version revokes approval and publication until reviewed and approved again.",
                )}
              </p>
              <textarea
                aria-label={tr("نص المسودة", "Draft text")}
                dir="auto"
                rows={14}
                value={body}
                disabled={
                  busy ||
                  latest?.state === "PENDING" ||
                  latest?.state === "PROCESSING"
                }
                maxLength={40000}
                onChange={(e) => setBody(e.target.value)}
              />
              <div className="practice-toolbar">
                <button
                  className="primary"
                  disabled={busy || !body.trim()}
                  onClick={() =>
                    void act("drafts", {
                      body,
                      expectedVersion: selected.currentVersion,
                    })
                  }
                >
                  {tr("حفظ إصدار جديد", "Save new version")}
                </button>
                <label className="document-upload">
                  <Upload size={16} />
                  {tr("رفع إصدار ملف", "Upload file version")}
                  <input
                    type="file"
                    aria-label={tr("رفع إصدار ملف", "Upload file version")}
                    disabled={busy}
                    accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.tif,.tiff,.txt"
                    onChange={(e) => {
                      if (e.target.files)
                        void upload(e.target.files, selected.id);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </article>
          )}
        </>
      ) : (
        <>
          <div className="practice-toolbar">
            <input
              aria-label={tr(
                "بحث المستندات بالعنوان أو المحتوى",
                "Search document title or content",
              )}
              placeholder={tr(
                "بحث بالعنوان أو النص المستخرج…",
                "Search title or extracted text…",
              )}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            {can("documents:manage") && (
              <>
                <button
                  className="primary"
                  onClick={() => {
                    setBody("");
                    setCreateOpen(true);
                  }}
                >
                  <Plus size={16} />
                  {tr("مستند جديد", "New document")}
                </button>
                <button onClick={() => setTemplateOpen(true)}>
                  {tr("إضافة قالب", "Add template")}
                </button>
                <label className="document-upload">
                  <Upload size={16} />
                  {tr("رفع ملفات", "Upload files")}
                  <input
                    type="file"
                    aria-label={tr("رفع ملفات", "Upload files")}
                    multiple
                    disabled={busy}
                    accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.tif,.tiff,.txt"
                    onChange={(e) => {
                      if (e.target.files) void upload(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </>
            )}
            <button
              aria-label={tr("تحديث المستندات", "Refresh documents")}
              onClick={() => setRevision((v) => v + 1)}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <div
            className="document-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (can("documents:manage") && !busy)
                void upload(e.dataTransfer.files);
            }}
          >
            <FileText size={26} />
            <p>
              {tr(
                "اسحب الملفات هنا لرفعها إلى القضية. الحد 25 ميغابايت لكل ملف.",
                "Drop files to upload to this matter. Maximum 25 MiB per file.",
              )}
            </p>
            <small>
              {tr(
                "الملفات خاصة ولا تتاح للتنزيل قبل اجتياز الفحص.",
                "Files stay private and cannot be downloaded before scanning.",
              )}
            </small>
          </div>
          {loading ? (
            <p role="status">
              {tr("جارٍ تحميل المستندات…", "Loading documents…")}
            </p>
          ) : (
            <div className="practice-records">
              {items.map((d) => (
                <article key={d.id} className="panel">
                  <span className="badge">{state(d.status)}</span>
                  <h3>
                    <button
                      className="text-button"
                      onClick={() => void open(d.id).catch(fail)}
                    >
                      {d.title}
                    </button>
                  </h3>
                  <p>
                    {d.kind} · {tr("إصدار", "Version")} {d.currentVersion}
                  </p>
                  {d.versions[0] && <p>{state(d.versions[0].state)}</p>}
                  <p>{d.tags.join(" · ")}</p>
                </article>
              ))}
            </div>
          )}
          <div className="practice-toolbar">
            <span>
              {total} {tr("مستند", "documents")}
            </span>
            <button disabled={page === 1} onClick={() => setPage((v) => v - 1)}>
              {tr("السابق", "Previous")}
            </button>
            <span>{page}</span>
            <button
              disabled={page * 12 >= total}
              onClick={() => setPage((v) => v + 1)}
            >
              {tr("التالي", "Next")}
            </button>
          </div>
        </>
      )}
      <dialog
        ref={dialog}
        className="practice-dialog panel"
        onCancel={() => setCreateOpen(false)}
      >
        <div className="practice-toolbar">
          <h2>{tr("مستند قانوني جديد", "New legal document")}</h2>
          <button
            aria-label={tr("إغلاق", "Close")}
            onClick={() => setCreateOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        <form className="practice-form" onSubmit={(e) => void create(e)}>
          <label>
            {tr("عنوان المستند", "Document title")}
            <input name="title" required minLength={2} maxLength={240} />
          </label>
          <label>
            {tr("نوع المستند", "Document kind")}
            <select name="kind">
              <option value="PLEADING">{tr("مذكرة", "Pleading")}</option>
              <option value="CONTRACT">{tr("عقد", "Contract")}</option>
              <option value="POWER_OF_ATTORNEY">
                {tr("وكالة", "Power of attorney")}
              </option>
              <option value="JUDGMENT">{tr("حكم", "Judgment")}</option>
              <option value="LETTER">{tr("خطاب", "Letter")}</option>
              <option value="OTHER">{tr("آخر", "Other")}</option>
            </select>
          </label>
          <label className="wide">
            {tr("الوسوم (مفصولة بفواصل)", "Tags (comma separated)")}
            <input name="tags" />
          </label>
          <label className="wide">
            {tr("استخدام قالب", "Use template")}
            <select
              onChange={(e) =>
                setBody(
                  templates.find((v) => v.id === e.target.value)?.body ?? "",
                )
              }
              defaultValue=""
            >
              <option value="">{tr("دون قالب", "No template")}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            {tr("النص القانوني", "Legal text")}
            <textarea
              dir="auto"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              maxLength={40000}
            />
          </label>
          <p className="wide muted">
            {tr(
              "حقول القالب: {{office_name}}، {{case_reference}}، {{case_title}}",
              "Template fields: {{office_name}}, {{case_reference}}, {{case_title}}",
            )}
          </p>
          <button type="submit" className="primary" disabled={busy}>
            {tr("إنشاء المستند", "Create document")}
          </button>
        </form>
      </dialog>
      <dialog
        ref={templateDialog}
        className="practice-dialog panel"
        onCancel={() => setTemplateOpen(false)}
      >
        <h2>{tr("قالب خاص بالمكتب", "Firm document template")}</h2>
        {error && <p role="alert">{error}</p>}
        <form
          className="practice-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setBusy(true);
            try {
              await api("practice/documents/templates", "POST", {
                title: fd.get("title"),
                kind: "PLEADING",
                locale,
                body: fd.get("body"),
              });
              setTemplateOpen(false);
              changed();
            } catch (err) {
              fail(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="wide">
            {tr("اسم القالب", "Template name")}
            <input name="title" required minLength={2} maxLength={240} />
          </label>
          <label className="wide">
            {tr("محتوى القالب", "Template body")}
            <textarea
              name="body"
              required
              dir="auto"
              maxLength={40000}
              rows={14}
            />
          </label>
          <button className="primary" disabled={busy} type="submit">
            {tr("حفظ القالب", "Save template")}
          </button>
          <button type="button" onClick={() => setTemplateOpen(false)}>
            {tr("إلغاء", "Cancel")}
          </button>
        </form>
      </dialog>
    </section>
  );
}
