import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider, ProviderEvent } from "./types";

const SIGNATURE_HEADER = "x-simulator-signature";

function secret() {
  const value = process.env.SIMULATOR_SECRET;
  if (!value) throw new Error("SIMULATOR_SECRET is not set");
  return value;
}

export function signSimulatorBody(rawBody: string) {
  return createHmac("sha256", secret()).update(rawBody).digest("hex");
}

/** Delivers an event through the real webhook route, so simulated payments take the same path as live ones. */
export async function sendSimulatorEvent(event: ProviderEvent) {
  const rawBody = JSON.stringify(event);
  const response = await fetch(`${process.env.APP_URL}/api/webhooks/payments`, {
    method: "POST",
    headers: { "content-type": "application/json", [SIGNATURE_HEADER]: signSimulatorBody(rawBody) },
    body: rawBody,
  });
  if (!response.ok) throw new Error(`Simulator webhook failed: ${response.status}`);
}

/** The simulator can mark payments paid, so it refuses to run on a public https address. */
function refuseOnPublicServer() {
  if (process.env.APP_URL?.startsWith("https")) throw new Error("Payments are not set up yet. Add a Paystack key.");
}

export const simulator: PaymentProvider = {
  name: "simulator",

  async createCharge({ reference }) {
    refuseOnPublicServer();
    return { redirectUrl: `/pay/${reference}` };
  },

  // An account number ending in 99 fails, so the failed-transfer path can be tried by hand.
  async createTransfer({ reference, accountNumber }) {
    refuseOnPublicServer();
    await sendSimulatorEvent(accountNumber.endsWith("99") ? { type: "transfer.failed", reference, reason: "Simulated failure" } : { type: "transfer.success", reference });
    return {};
  },

  async verify() {
    return null;
  },

  parseWebhook(rawBody, headers) {
    if (process.env.APP_URL?.startsWith("https")) return null;
    const given = Buffer.from(headers.get(SIGNATURE_HEADER) ?? "");
    const expected = Buffer.from(signSimulatorBody(rawBody));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    return JSON.parse(rawBody) as ProviderEvent;
  },
};
