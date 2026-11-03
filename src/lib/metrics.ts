import { daysBetween } from "./dates";
import { EGGS_PER_CRATE } from "./constants";

/** Eggs laid per live hen per day, as a percentage. */
export function henDayPercent(eggsLaid: number, liveHens: number, days = 1) {
  if (liveHens <= 0 || days <= 0) return 0;
  return (eggsLaid / (liveHens * days)) * 100;
}

/** Kilograms of feed eaten per kilogram of live weight gained. Lower is better. */
export function feedConversion(feedKg: number, gainKg: number) {
  return gainKg > 0 ? feedKg / gainKg : null;
}

export function mortalityPercent(deaths: number, startCount: number) {
  return startCount > 0 ? (deaths / startCount) * 100 : 0;
}

export type Movement = { kind: string; count: number };

/** Birds still in the house. Transfers in add birds; every other movement removes them. */
export function liveBirds(startCount: number, deaths: number, movements: Movement[]) {
  const moved = movements.reduce((sum, item) => sum + (item.kind === "TRANSFER_IN" ? item.count : -item.count), 0);
  return Math.max(0, startCount - deaths + moved);
}

export function ageInDays(startDate: string, ageAtStart: number, on: string) {
  return ageAtStart + daysBetween(startDate, on);
}

export function crates(eggs: number) {
  return { crates: Math.floor(eggs / EGGS_PER_CRATE), loose: eggs % EGGS_PER_CRATE };
}

export function formatCrates(eggs: number) {
  const { crates: full, loose } = crates(eggs);
  const whole = `${full.toLocaleString()} ${full === 1 ? "crate" : "crates"}`;
  const extra = `${loose} ${loose === 1 ? "egg" : "eggs"}`;
  if (full === 0) return extra;
  return loose ? `${whole} + ${extra}` : whole;
}

/** Quantities are stored in thousandths, so 25.5 kg is 25500. */
export function toMilli(input: string | number | null | undefined): number | null {
  const text = String(input ?? "").replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
}

export function fromMilli(value: number) {
  return (value / 1000).toLocaleString("en-GH", { maximumFractionDigits: 2 });
}

export function stockLevel(movements: { delta: number }[]) {
  return movements.reduce((sum, item) => sum + item.delta, 0);
}

export function stockStatus(level: number, lowLevel: number) {
  if (level <= 0) return "OUT" as const;
  return level <= lowLevel ? ("LOW" as const) : ("OK" as const);
}
