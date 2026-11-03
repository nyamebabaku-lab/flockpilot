/** Parses a cedi amount typed by a user into whole pesewas. Returns null if invalid. */
export function toPesewas(input: string | number | null | undefined): number | null {
  const text = String(input ?? "").replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(value) ? value : null;
}

export function formatGHS(pesewas: number, symbol = "GH₵"): string {
  const sign = pesewas < 0 ? "-" : "";
  const cedis = (Math.abs(pesewas) / 100).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${symbol} ${cedis}`;
}

/** Basis-point percentage of an amount, rounded to the nearest pesewa. */
export function percentOf(pesewas: number, basisPoints: number): number {
  return Math.round((pesewas * basisPoints) / 10000);
}
