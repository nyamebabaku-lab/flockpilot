import { paystack } from "./paystack";
import { simulator } from "./simulator";
import type { PaymentProvider } from "./types";

export function getProvider(): PaymentProvider {
  return process.env.PAYSTACK_SECRET_KEY ? paystack : simulator;
}
