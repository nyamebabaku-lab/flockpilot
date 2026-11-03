import { NotAllowed } from "./auth";
import { MoneyError } from "./payments/service";
import { RecordError } from "./records";

export type Result = { error?: string; success?: string } | undefined;

/** Turns expected refusals into a message on the form. Anything else, including redirects, passes through. */
export async function attempt(work: () => Promise<Result | void>): Promise<Result> {
  try {
    return (await work()) ?? undefined;
  } catch (error) {
    if (error instanceof NotAllowed || error instanceof MoneyError || error instanceof RecordError) return { error: error.message };
    throw error;
  }
}

export function text(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

export function optional(data: FormData, name: string) {
  return text(data, name) || null;
}

export function whole(data: FormData, name: string) {
  const value = Number(text(data, name) || 0);
  return Number.isInteger(value) && value >= 0 ? value : null;
}
