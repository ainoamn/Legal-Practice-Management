const formatters = new Map<string, Intl.DateTimeFormat>();
export function officeDay(instant: Date | string, timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      calendar: "iso8601",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  const parts = f.formatToParts(new Date(instant)),
    part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function addCalendarDays(day: string, amount: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}
export function calendarDays(
  anchor: string,
  view: "DAY" | "WEEK" | "MONTH" | "BOARD",
) {
  if (view === "DAY") return [anchor];
  const d = new Date(`${anchor}T12:00:00Z`),
    first = anchor.slice(0, 7) + "-01";
  let start: string, count: number;
  if (view === "WEEK") {
    start = addCalendarDays(anchor, -((d.getUTCDay() + 6) % 7));
    count = 7;
  } else if (view === "MONTH") {
    start = addCalendarDays(
      first,
      -((new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7),
    );
    count = 42;
  } else {
    start = first;
    count = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
  }
  return Array.from({ length: count }, (_, i) => addCalendarDays(start, i));
}
// Locate the first instant of a civil date, including days with midnight DST jumps.
// A fixed UTC offset or adding 24 hours would lose or duplicate events at transitions.
export function officeDayStart(day: string, timeZone: string) {
  const center = new Date(`${day}T00:00:00Z`).getTime();
  let low = center - 36 * 3600000,
    high = center + 36 * 3600000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (officeDay(new Date(middle), timeZone) < day) low = middle;
    else high = middle;
  }
  return new Date(high).toISOString();
}
