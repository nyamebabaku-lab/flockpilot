import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider, ProviderEvent } from "./types";

const API = "https://api.paystack.co";

// Transfer recipient codes for Ghana mobile money networks.
const MOMO_BANK_CODES: Record<string, string> = { MTN: "MTN", TELECEL: "VOD", AT: "ATL" };

function key() {
  return process.env.PAYSTACK_SECRET_KEY ?? "";
}

async function call(path: string, body?: unknown) {
  const response = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${key()}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  if (!response.ok || !json.status) throw new Error(json.message ?? "Paystack request failed");
  return json.data;
}

function toEvent(eventName: string, data: any): ProviderEvent | null {
  switch (eventName) {
    case "charge.success":
      return { type: "payment.success", reference: data.reference, amount: data.amount, fee: data.fees ?? undefined };
    case "transfer.success":
      return { type: "transfer.success", reference: data.reference };
    case "transfer.failed":
    case "transfer.reversed":
      return { type: "transfer.failed", reference: data.reference, reason: data.reason ?? "Transfer failed" };
    default:
      return null;
  }
}

export const paystack: PaymentProvider = {
  name: "paystack",

  async createCharge({ reference, amount, method, email, returnUrl }) {
    const channels = method === "CARD" ? ["card"] : method === "BANK" ? ["bank_transfer", "bank"] : ["mobile_money"];
    const data = await call("/transaction/initialize", {
      reference,
      amount,
      email,
      currency: "GHS",
      channels,
      callback_url: returnUrl,
    });
    return { redirectUrl: data.authorization_url };
  },

  async createTransfer({ reference, amount, kind, provider, accountName, accountNumber, recipientCode }) {
    let code = recipientCode ?? undefined;
    if (!code) {
      const recipient = await call("/transferrecipient", {
        type: kind === "MOMO" ? "mobile_money" : "ghipss",
        name: accountName,
        account_number: accountNumber,
        bank_code: MOMO_BANK_CODES[provider] ?? provider,
        currency: "GHS",
      });
      code = recipient.recipient_code as string;
    }
    await call("/transfer", { source: "balance", amount, recipient: code, reference, currency: "GHS" });
    return { recipientCode: code };
  },

  async verify(reference) {
    const data = await call(`/transaction/verify/${encodeURIComponent(reference)}`);
    if (data.status === "success") return toEvent("charge.success", data);
    if (data.status === "failed" || data.status === "abandoned") return { type: "payment.failed", reference };
    return null;
  },

  parseWebhook(rawBody, headers) {
    const given = Buffer.from(headers.get("x-paystack-signature") ?? "");
    const expected = Buffer.from(createHmac("sha512", key()).update(rawBody).digest("hex"));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const { event, data } = JSON.parse(rawBody);
    return toEvent(event, data);
  },
};
