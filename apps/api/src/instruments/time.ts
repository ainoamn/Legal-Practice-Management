function partsAt(date: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(p.find((v) => v.type === type)!.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}
export function officeToday(timeZone: string, now = new Date()) {
  const p = partsAt(now, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
export function officeReminderTime(day: Date, timeZone: string) {
  const target = Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    9,
  );
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = partsAt(new Date(guess), timeZone),
      offset =
        Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
        guess;
    guess = target - offset;
  }
  return new Date(guess);
}
