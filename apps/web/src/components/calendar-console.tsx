"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { api, ApiError, type Me } from "../lib/api";
import { recordLabel } from "../lib/record-labels";
import {
  officeDay,
  officeDayStart,
  addCalendarDays,
  calendarDays,
} from "@legal/contracts/calendar-time";
type Matter = { id: string; title: string; reference: string };
type Hearing = {
  id: string;
  matterId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  room: string;
  responsibleId: string;
  matter: Matter;
};
type Task = {
  id: string;
  matterId: string;
  title: string;
  dueAt: string;
  status: string;
  priority: string;
  assignedTo: string;
  matter: Matter;
};
type CalendarData = { hearings: Hearing[]; tasks: Task[] };
type View = "DAY" | "WEEK" | "MONTH" | "BOARD";
export function CalendarConsole({
  me,
  locale,
}: {
  me: Me;
  locale: "ar" | "en";
}) {
  const tr = (ar: string, en: string) => (locale === "ar" ? ar : en),
    timeZone = me.tenant.timezone;
  const [view, setView] = useState<View>("MONTH"),
    [anchor, setAnchor] = useState(() => officeDay(new Date(), timeZone)),
    [mine, setMine] = useState(false),
    [search, setSearch] = useState(""),
    [revision, setRevision] = useState(0);
  const [data, setData] = useState<CalendarData>({ hearings: [], tasks: [] }),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<
    { kind: "HEARING"; record: Hearing } | { kind: "TASK"; record: Task } | null
  >(null);
  const [showHearings, setShowHearings] = useState(true),
    [showTasks, setShowTasks] = useState(true),
    [showCancelled, setShowCancelled] = useState(false);
  const days = useMemo(() => calendarDays(anchor, view), [anchor, view]),
    start = days[0]!,
    end = addCalendarDays(days.at(-1)!, 1);
  const fail = useCallback(
    (e: unknown) =>
      setError(
        e instanceof ApiError && e.code === "CALENDAR_WINDOW_TOO_BUSY"
          ? locale === "ar"
            ? "الفترة تضم أكثر من 2000 موعد؛ اختر اليوم أو الأسبوع أو رشّح مواعيدك."
            : "More than 2000 entries: choose day/week or filter your appointments."
          : locale === "ar"
            ? "تعذر تحديث التقويم. أعد المحاولة."
            : "Unable to update calendar. Please retry.",
      ),
    [locale],
  );
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      setSelected(null);
      try {
        const q = new URLSearchParams({
          from: officeDayStart(start, timeZone),
          to: officeDayStart(end, timeZone),
          search,
        });
        if (mine) q.set("memberId", me.membership.id);
        const r = await api<CalendarData>(`practice/calendar?${q}`);
        if (live) setData(r);
      } catch (e) {
        if (live) {
          setData({ hearings: [], tasks: [] });
          fail(e);
        }
      } finally {
        if (live) setLoading(false);
      }
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [start, end, timeZone, search, mine, me.membership.id, revision, fail]);
  const time = (instant: string) =>
    new Date(instant).toLocaleTimeString(locale, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
    });
  const date = (day: string, weekday = false) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      ...(weekday ? { weekday: "short" as const } : {}),
      year: "numeric",
    });
  const hearings = data.hearings.filter(
      (h) => showHearings && (showCancelled || h.status !== "CANCELLED"),
    ),
    tasks = data.tasks.filter(
      (t) =>
        (showTasks || view === "BOARD") &&
        (showCancelled || t.status !== "CANCELLED"),
    );
  const byDay = new Map(
    days.map((day) => [
      day,
      { hearings: [] as Hearing[], tasks: [] as Task[] },
    ]),
  );
  for (const h of hearings) {
    const first = officeDay(h.startsAt, timeZone),
      last = officeDay(new Date(new Date(h.endsAt).getTime() - 1), timeZone);
    for (const day of days)
      if (day >= first && day <= last) byDay.get(day)!.hearings.push(h);
  }
  for (const t of tasks) byDay.get(officeDay(t.dueAt, timeZone))?.tasks.push(t);
  function move(direction: number) {
    if (view === "MONTH" || view === "BOARD") {
      const d = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + direction);
      setAnchor(d.toISOString().slice(0, 10));
    } else
      setAnchor(addCalendarDays(anchor, direction * (view === "WEEK" ? 7 : 1)));
  }
  async function taskStatus(task: Task, status: string) {
    setBusy(true);
    setError("");
    try {
      await api(`practice/tasks/${task.id}`, "PATCH", { status });
      setRevision((v) => v + 1);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  function event(h: Hearing) {
    return (
      <button
        key={h.id}
        className={`calendar-event hearing ${h.status === "CANCELLED" ? "cancelled" : ""}`}
        onClick={() => setSelected({ kind: "HEARING", record: h })}
      >
        <span>
          {tr("جلسة", "Hearing")} · {time(h.startsAt)}–{time(h.endsAt)}
        </span>
        <bdi>{h.matter.reference}</bdi>
        <strong>{h.matter.title}</strong>
        <small>
          {recordLabel(h.status, locale)}
          {h.room ? ` · ${h.room}` : ""}
        </small>
      </button>
    );
  }
  function task(t: Task) {
    return (
      <button
        key={t.id}
        className={`calendar-event task ${t.status === "CANCELLED" ? "cancelled" : ""}`}
        onClick={() => setSelected({ kind: "TASK", record: t })}
      >
        <span>
          {tr("مهمة", "Task")} · {time(t.dueAt)}
        </span>
        <strong>{t.title}</strong>
        <bdi>{t.matter.reference}</bdi>
        <small>
          {recordLabel(t.status, locale)} · {recordLabel(t.priority, locale)}
        </small>
      </button>
    );
  }
  return (
    <section className="calendar-console">
      <nav
        className="practice-nav"
        aria-label={tr("عروض التقويم", "Calendar views")}
      >
        {(["MONTH", "WEEK", "DAY", "BOARD"] as View[]).map((v, i) => (
          <button
            key={v}
            className={view === v ? "active" : ""}
            onClick={() => setView(v)}
          >
            {
              [
                tr("شهر", "Month"),
                tr("أسبوع", "Week"),
                tr("يوم", "Day"),
                tr("لوحة المهام", "Task board"),
              ][i]
            }
          </button>
        ))}
      </nav>
      <div className="calendar-toolbar">
        <button
          aria-label={tr("الفترة السابقة", "Previous period")}
          onClick={() => move(-1)}
        >
          <ChevronRight size={18} />
        </button>
        <button onClick={() => setAnchor(officeDay(new Date(), timeZone))}>
          {tr("اليوم", "Today")}
        </button>
        <button
          aria-label={tr("الفترة التالية", "Next period")}
          onClick={() => move(1)}
        >
          <ChevronLeft size={18} />
        </button>
        <label>
          {tr("التاريخ المختار بتوقيت المكتب", "Selected date in firm time")}
          <input
            type="date"
            value={anchor}
            onChange={(e) => {
              if (e.target.value) setAnchor(e.target.value);
            }}
          />
        </label>
        <button
          aria-label={tr("تحديث التقويم", "Refresh calendar")}
          onClick={() => setRevision((v) => v + 1)}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      <div className="calendar-toolbar">
        <input
          aria-label={tr("بحث في التقويم", "Search calendar")}
          value={search}
          maxLength={200}
          placeholder={tr(
            "القضية أو رقمها أو المهمة…",
            "Matter, reference or task…",
          )}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => setMine(e.target.checked)}
          />
          {tr("مواعيدي وتكليفاتي", "My appointments and assignments")}
        </label>
        {view !== "BOARD" && (
          <>
            <label>
              <input
                type="checkbox"
                checked={showHearings}
                onChange={(e) => setShowHearings(e.target.checked)}
              />
              {tr("الجلسات", "Hearings")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={showTasks}
                onChange={(e) => setShowTasks(e.target.checked)}
              />
              {tr("المهام", "Tasks")}
            </label>
          </>
        )}
        <label>
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
          />
          {tr("إظهار الملغى", "Show cancelled")}
        </label>
      </div>
      <p className="muted">
        {date(start)} — {date(addCalendarDays(end, -1))} · {timeZone} ·{" "}
        {tr("بداية الأسبوع: الاثنين", "Week starts Monday")}
      </p>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">
          {tr("جارٍ تحميل مواعيد الفترة…", "Loading period entries…")}
        </p>
      ) : (
        !error && (
          <>
            {view !== "DAY" && (
              <p className="calendar-scroll-hint muted">
                {tr(
                  "مرّر الجدول أفقياً لعرض بقية الأيام أو حالات المهام.",
                  "Scroll horizontally to see the remaining days or task states.",
                )}
              </p>
            )}
            <p role="status">
              {tr(
                `الجلسات: ${hearings.length} · المهام: ${tasks.length}`,
                `Hearings: ${hearings.length} · Tasks: ${tasks.length}`,
              )}
            </p>
            {view === "BOARD" ? (
              <div
                className="calendar-scroll"
                role="region"
                aria-label={tr("أعمدة حالات المهام", "Task status columns")}
                tabIndex={0}
              >
                <div className="calendar-board">
                  {[
                    "TODO",
                    "IN_PROGRESS",
                    "BLOCKED",
                    "DONE",
                    ...(showCancelled ? ["CANCELLED"] : []),
                  ].map((status) => (
                    <section key={status} className="calendar-column">
                      <h3>
                        {recordLabel(status, locale)}{" "}
                        <span className="badge">
                          {tasks.filter((t) => t.status === status).length}
                        </span>
                      </h3>
                      {tasks
                        .filter((t) => t.status === status)
                        .map((t) => (
                          <article key={t.id}>
                            {task(t)}
                            {me.role.permissions.includes("tasks:manage") && (
                              <label>
                                {tr("نقل المهمة", "Move task")}
                                <select
                                  disabled={busy}
                                  aria-label={`${tr("نقل", "Move")} ${t.title}`}
                                  value={t.status}
                                  onChange={(e) =>
                                    void taskStatus(t, e.target.value)
                                  }
                                >
                                  {[
                                    "TODO",
                                    "IN_PROGRESS",
                                    "BLOCKED",
                                    "DONE",
                                    "CANCELLED",
                                  ].map((s) => (
                                    <option key={s} value={s}>
                                      {recordLabel(s, locale)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </article>
                        ))}
                    </section>
                  ))}
                </div>
              </div>
            ) : (
              <div
                className="calendar-scroll"
                role="region"
                aria-label={tr("جدول مواعيد الفترة", "Period schedule")}
                tabIndex={0}
              >
                <div className={`calendar-grid view-${view.toLowerCase()}`}>
                  {days.map((day) => {
                    const { hearings: dh, tasks: dt } = byDay.get(day)!;
                    return (
                      <section
                        key={day}
                        className={`calendar-day ${day.slice(0, 7) !== anchor.slice(0, 7) ? "adjacent" : ""} ${day === officeDay(new Date(), timeZone) ? "today" : ""}`}
                        aria-label={day}
                      >
                        <button
                          className="calendar-date"
                          onClick={() => {
                            setAnchor(day);
                            setView("DAY");
                          }}
                        >
                          {date(day, true)}
                        </button>
                        {dh.map(event)}
                        {dt.map(task)}
                        {!dh.length && !dt.length && view === "DAY" && (
                          <p>
                            {tr(
                              "لا توجد مواعيد في هذا اليوم ضمن صلاحياتك",
                              "No entries on this date within your permissions",
                            )}
                          </p>
                        )}
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
            {selected && (
              <article className="panel calendar-selected" aria-live="polite">
                <button onClick={() => setSelected(null)}>
                  {tr("إغلاق التفاصيل", "Close details")}
                </button>
                <h3>
                  {selected.kind === "TASK"
                    ? selected.record.title
                    : selected.record.matter.title}
                </h3>
                <p>
                  <bdi>{selected.record.matter.reference}</bdi> ·{" "}
                  {recordLabel(selected.record.status, locale)}
                </p>
                {selected.kind === "HEARING" ? (
                  <>
                    <p>
                      {date(officeDay(selected.record.startsAt, timeZone))}{" "}
                      {time(selected.record.startsAt)} —{" "}
                      {date(officeDay(selected.record.endsAt, timeZone))}{" "}
                      {time(selected.record.endsAt)}
                    </p>
                    <p>{selected.record.room}</p>
                  </>
                ) : (
                  <>
                    <p>
                      {date(officeDay(selected.record.dueAt, timeZone))}{" "}
                      {time(selected.record.dueAt)}
                    </p>
                    <p>{recordLabel(selected.record.priority, locale)}</p>
                  </>
                )}
                <p className="muted">
                  {tr(
                    "التفاصيل والتحرير في وحدة العمل القانوني؛ التقويم يعرض السجلات المحفوظة.",
                    "Details and editing are available in Legal practice; this calendar shows saved records.",
                  )}
                </p>
              </article>
            )}
          </>
        )
      )}
    </section>
  );
}
