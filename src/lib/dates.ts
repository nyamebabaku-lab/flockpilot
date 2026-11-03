const DAY_MS = 86_400_000;

/** Ghana is on UTC all year, so calendar days can be read straight from UTC. */
export function today(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function addDays(day: string, days: number) {
  return today(new Date(Date.parse(day) + days * DAY_MS));
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

export function formatDay(day: string) {
  return new Date(day).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function shortDay(day: string) {
  return new Date(day).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
