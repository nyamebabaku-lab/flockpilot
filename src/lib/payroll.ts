import { percentOf } from "./money";

/** One income tax band. `width` is null for the top band, which has no upper limit. */
export type TaxBand = { width: number | null; bps: number };

export function parseBands(json: string): TaxBand[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.filter((band) => typeof band.bps === "number") : [];
  } catch {
    return [];
  }
}

export function incomeTax(taxable: number, bands: TaxBand[]) {
  let left = Math.max(0, taxable);
  let tax = 0;
  for (const band of bands) {
    if (left <= 0) break;
    const slice = band.width === null ? left : Math.min(left, band.width);
    tax += percentOf(slice, band.bps);
    left -= slice;
  }
  return tax;
}

export type PayInput = { gross: number; advances: number; ssnitEmployeeBps: number; ssnitEmployerBps: number; bands: TaxBand[] };

/** Tax applies after the worker's SSNIT share. Advances recover from take-home pay, never below zero. */
export function calculatePay({ gross, advances, ssnitEmployeeBps, ssnitEmployerBps, bands }: PayInput) {
  const ssnit = percentOf(gross, ssnitEmployeeBps);
  const ssnitEmployer = percentOf(gross, ssnitEmployerBps);
  const paye = incomeTax(gross - ssnit, bands);
  const beforeAdvances = gross - ssnit - paye;
  const recovered = Math.min(advances, Math.max(0, beforeAdvances));
  return { gross, ssnit, ssnitEmployer, paye, advances: recovered, net: beforeAdvances - recovered };
}
