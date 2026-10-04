export function formatMoney(amount: number, currency = "UZS") {
  const n = amount.toLocaleString("ru-RU").replace(/ /g, " ");
  return currency === "UZS" ? `${n} so'm` : `${n} ${currency}`;
}

export function formatDateTime(value: Date | string, timeZone = "Asia/Tashkent") {
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function formatDate(value: Date | string, timeZone = "Asia/Tashkent") {
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export function timeAgo(value: Date | string) {
  const s = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Converts a Date to the value of an <input type="datetime-local"> in a time zone. */
export function toLocalInput(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const g = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

/** Interprets a datetime-local value as wall-clock time in `timeZone` and returns an ISO string. */
export function fromLocalInput(value: string, timeZone: string) {
  const asUtc = new Date(`${value}:00Z`);
  const tzWall = new Date(toLocalInput(asUtc, timeZone) + ":00Z");
  const offset = tzWall.getTime() - asUtc.getTime();
  return new Date(asUtc.getTime() - offset).toISOString();
}
