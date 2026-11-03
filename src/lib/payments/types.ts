export type PaymentMethod = "MTN" | "TELECEL" | "AT" | "CARD" | "BANK";

export const METHOD_LABELS: Record<string, string> = {
  MTN: "MTN Mobile Money",
  TELECEL: "Telecel Cash",
  AT: "AT Money",
  CARD: "Bank card",
  BANK: "Bank transfer",
  CASH: "Cash",
};

export type ChargeRequest = {
  reference: string;
  amount: number;
  method: PaymentMethod;
  email: string;
  returnUrl: string;
};

export type TransferRequest = {
  reference: string;
  amount: number;
  kind: string;
  provider: string;
  accountName: string;
  accountNumber: string;
  recipientCode?: string | null;
};

export type ProviderEvent =
  | { type: "payment.success"; reference: string; amount: number; fee?: number }
  | { type: "payment.failed"; reference: string }
  | { type: "transfer.success"; reference: string }
  | { type: "transfer.failed"; reference: string; reason?: string };

export interface PaymentProvider {
  name: "simulator" | "paystack";
  /** Starts a charge and returns where to send the customer to approve it. */
  createCharge(request: ChargeRequest): Promise<{ redirectUrl: string }>;
  /** Starts a payout. Success arrives later as a provider event. */
  createTransfer(request: TransferRequest): Promise<{ recipientCode?: string }>;
  /** Asks the provider directly about a payment. Used when a webhook cannot reach this machine. */
  verify(reference: string): Promise<ProviderEvent | null>;
  /** Checks the signature on a webhook. Returns null if it is forged or not relevant. */
  parseWebhook(rawBody: string, headers: Headers): ProviderEvent | null;
}
