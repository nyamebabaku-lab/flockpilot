"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { attempt, optional, text, whole } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireAction } from "@/lib/auth";
import { EGGS_PER_CRATE, SALE_KINDS } from "@/lib/constants";
import { isDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { toPesewas } from "@/lib/money";
import { getProvider } from "@/lib/payments";
import { newReference, recordCashPayment } from "@/lib/payments/service";
import { sendSimulatorEvent } from "@/lib/payments/simulator";
import { METHOD_LABELS, type PaymentMethod } from "@/lib/payments/types";
import { eggStockItem } from "@/lib/records";

export async function createOrder(_state: unknown, data: FormData) {
  return attempt(async () => {
    const user = await requireAction("sales.manage");
    const farmId = text(data, "farmId");
    const date = text(data, "date");
    const kind = text(data, "kind");
    const quantity = whole(data, "quantity");
    const unitPrice = toPesewas(text(data, "unitPrice"));
    const flockId = optional(data, "flockId");
    if (!farmId || !isDay(date) || !SALE_KINDS[kind] || !quantity || !unitPrice) return { error: "Check the site, date, item, quantity and price." };
    if (kind === "BIRDS" && !flockId) return { error: "Choose which flock the birds come from." };

    let customerId = text(data, "customerId");
    if (!customerId) {
      const name = text(data, "customerName");
      if (!name) return { error: "Choose a customer or enter a new name." };
      customerId = (await db.customer.create({ data: { name, phone: optional(data, "customerPhone"), email: optional(data, "customerEmail") } })).id;
    }

    const total = quantity * unitPrice;
    const order = await db.$transaction(async (tx) => {
      const latest = await tx.order.aggregate({ _max: { number: true } });
      const number = (latest._max.number ?? 1000) + 1;
      const created = await tx.order.create({
        data: {
          number,
          payToken: randomBytes(16).toString("hex"),
          customerId,
          farmId,
          date,
          total,
          lines: { create: [{ kind, description: text(data, "description") || SALE_KINDS[kind], quantity, unitPrice, total, flockId }] },
        },
      });
      if (kind === "EGGS") {
        const item = await eggStockItem(tx, farmId);
        await tx.stockMovement.create({ data: { itemId: item.id, date, kind: "SOLD", delta: -quantity * EGGS_PER_CRATE * 1000, note: `Order #${number}` } });
      }
      if (kind === "BIRDS") await tx.birdMovement.create({ data: { flockId: flockId!, date, kind: "SALE", count: quantity, note: `Order #${number}` } });
      await audit(user.id, "ORDER_CREATED", `Order #${number}`, tx);
      return created;
    });
    redirect(`/sales/${order.id}`);
  });
}

export async function recordCash(orderId: string, _state: unknown, data: FormData) {
  return attempt(async () => {
    const user = await requireAction("sales.manage");
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    const amount = toPesewas(text(data, "amount"));
    if (!amount) return { error: "Enter the amount received." };
    if (amount > order.total - order.paid) return { error: "That is more than the balance due." };
    await recordCashPayment(orderId, amount, text(data, "key") || randomUUID(), user.id);
    revalidatePath(`/sales/${orderId}`);
    return { success: "Cash recorded." };
  });
}

export async function cancelOrder(orderId: string) {
  return attempt(async () => {
    const user = await requireAction("sales.manage");
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true } });
    if (order.paid > 0) return { error: "An order with payments cannot be cancelled." };
    if (order.status === "CANCELLED") return;
    await db.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
      for (const line of order.lines) {
        if (line.kind === "EGGS") {
          const item = await eggStockItem(tx, order.farmId);
          await tx.stockMovement.create({ data: { itemId: item.id, date: order.date, kind: "ADJUST", delta: line.quantity * EGGS_PER_CRATE * 1000, note: `Cancelled order #${order.number}` } });
        }
        if (line.kind === "BIRDS" && line.flockId) await tx.birdMovement.deleteMany({ where: { flockId: line.flockId, note: `Order #${order.number}` } });
      }
      await audit(user.id, "ORDER_CANCELLED", `Order #${order.number}`, tx);
    });
    revalidatePath(`/sales/${orderId}`);
  });
}

/** Called from the customer's payment page, which is reached by the order's secret link. */
export async function startPayment(token: string, _state: unknown, data: FormData) {
  const order = await db.order.findUnique({ where: { payToken: token }, include: { customer: true } });
  if (!order || order.status === "CANCELLED") return { error: "This payment link is no longer valid." };
  const amount = order.total - order.paid;
  if (amount <= 0) return { error: "This order is already paid." };
  const method = text(data, "method");
  if (!METHOD_LABELS[method] || method === "CASH") return { error: "Choose how to pay." };

  const reference = newReference("SALE");
  await db.payment.create({ data: { reference, orderId: order.id, amount, method } });
  let redirectUrl: string;
  try {
    ({ redirectUrl } = await getProvider().createCharge({
      reference,
      amount,
      method: method as PaymentMethod,
      email: order.customer.email ?? `customer-${order.customerId}@example.com`,
      returnUrl: `${process.env.APP_URL}/pay/return?reference=${reference}`,
    }));
  } catch (error) {
    await db.payment.update({ where: { reference }, data: { status: "FAILED" } });
    return { error: error instanceof Error ? error.message : "Payment could not start." };
  }
  redirect(redirectUrl);
}

/** Exists only for the built-in simulator; a live provider has its own payment page. */
export async function finishSimulatedPayment(reference: string, approved: boolean) {
  if (getProvider().name !== "simulator") throw new Error("Not available");
  const payment = await db.payment.findUnique({ where: { reference } });
  if (!payment) throw new Error("Unknown payment");
  await sendSimulatorEvent(approved ? { type: "payment.success", reference, amount: payment.amount } : { type: "payment.failed", reference });
  redirect(`/pay/return?reference=${reference}`);
}
