import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { audit } from "../audit";
import { today } from "../dates";
import { db, type Tx } from "../db";
import { formatGHS, percentOf } from "../money";
import { getSettings } from "../settings";
import { getProvider } from ".";
import type { ProviderEvent } from "./types";

// Default estimate of provider charges when the provider does not report them.
const PROVIDER_FEE_BPS = 195;

export function newReference(prefix: string) {
  return `${prefix}_${randomBytes(9).toString("hex")}`;
}

export async function walletBalance(client: Pick<PrismaClient, "ledgerEntry"> | Tx) {
  const result = await client.ledgerEntry.aggregate({ _sum: { amount: true } });
  return result._sum.amount ?? 0;
}

export async function applyToOrder(tx: Tx, orderId: string, amount: number) {
  const order = await tx.order.update({ where: { id: orderId }, data: { paid: { increment: amount } } });
  const status = order.paid >= order.total ? "PAID" : "PART";
  await tx.order.update({ where: { id: orderId }, data: { status } });
}

/** Marks a pending payment paid. Runs at most once per payment, however often it is called. */
export async function confirmPayment(reference: string, paidAmount: number, providerFee?: number, client: PrismaClient = db) {
  return client.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { reference }, include: { order: true } });
    if (!payment || payment.status !== "PENDING") return false;

    if (payment.amount !== paidAmount) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", note: `Provider reported ${paidAmount}, expected ${payment.amount}` },
      });
      return false;
    }

    const fee = providerFee ?? percentOf(payment.amount, PROVIDER_FEE_BPS);
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "SUCCESS", paidAt: new Date(), providerFee: fee },
    });
    if (claimed.count !== 1) return false;

    await applyToOrder(tx, payment.orderId, payment.amount);
    await tx.ledgerEntry.create({
      data: { kind: "SALE", amount: payment.amount, dedupeKey: `sale:${payment.id}`, memo: `Payment for order #${payment.order.number}` },
    });
    if (fee > 0) {
      await tx.ledgerEntry.create({
        data: { kind: "PROVIDER_FEE", amount: -fee, dedupeKey: `provider-fee:${payment.id}`, memo: `Payment charges, ${payment.reference}` },
      });
    }
    await audit(null, "PAYMENT_RECEIVED", `${formatGHS(payment.amount)} for order #${payment.order.number}`, tx);
    return true;
  });
}

/** Cash has already reached the farm, so it updates the order but never the wallet. */
export async function recordCashPayment(orderId: string, amount: number, idempotencyKey: string, actorId: string, client: PrismaClient = db) {
  return client.$transaction(async (tx) => {
    const existing = await tx.payment.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    const payment = await tx.payment.create({
      data: { reference: newReference("CASH"), idempotencyKey, orderId, amount, method: "CASH", status: "SUCCESS", paidAt: new Date() },
    });
    await applyToOrder(tx, orderId, amount);
    await audit(actorId, "CASH_RECEIVED", `${formatGHS(amount)} cash on order ${orderId}`, tx);
    return payment;
  });
}

export async function failPayment(reference: string, client: PrismaClient = db) {
  await client.payment.updateMany({ where: { reference, status: "PENDING" }, data: { status: "FAILED" } });
}

export class MoneyError extends Error {}

// Updating the settings row first makes concurrent money requests take turns,
// so two of them cannot both spend the same balance.
function lockWallet(tx: Tx) {
  return tx.settings.update({ where: { id: "main" }, data: { walletVersion: { increment: 1 } } });
}

/** Reserves the money first, then asks the provider to send it. */
export async function requestWithdrawal(actorId: string, payoutAccountId: string, amount: number, idempotencyKey: string, client: PrismaClient = db) {
  await getSettings(client);
  const withdrawal = await client.$transaction(async (tx) => {
    const existing = await tx.withdrawal.findUnique({ where: { idempotencyKey } });
    if (existing) return { ...existing, repeat: true };

    const settings = await lockWallet(tx);
    const account = await tx.payoutAccount.findFirst({ where: { id: payoutAccountId, userId: actorId } });
    if (!account) throw new MoneyError("Choose a payout account.");
    if (amount <= 0) throw new MoneyError("Enter an amount above zero.");
    if (amount > (await walletBalance(tx))) throw new MoneyError("That is more than your available balance.");

    const date = today();
    const used = await tx.withdrawal.aggregate({ where: { date, status: { not: "FAILED" } }, _sum: { amount: true } });
    if ((used._sum.amount ?? 0) + amount > settings.dailyWithdrawalLimit) {
      throw new MoneyError(`That is over the daily limit of ${formatGHS(settings.dailyWithdrawalLimit)}.`);
    }

    const created = await tx.withdrawal.create({
      data: { reference: newReference("WD"), idempotencyKey, payoutAccountId, amount, date },
    });
    await tx.ledgerEntry.create({
      data: { kind: "WITHDRAWAL", amount: -amount, dedupeKey: `withdrawal:${created.id}`, memo: `Withdrawal to ${account.provider} ${account.accountNumber}` },
    });
    await audit(actorId, "WITHDRAWAL_REQUESTED", `${formatGHS(amount)} to ${account.provider} ${account.accountNumber}`, tx);
    return { ...created, repeat: false };
  });

  if (withdrawal.repeat) return withdrawal;

  try {
    const account = await client.payoutAccount.findUniqueOrThrow({ where: { id: payoutAccountId } });
    const { recipientCode } = await getProvider().createTransfer({ reference: withdrawal.reference, amount, ...account });
    if (recipientCode && !account.recipientCode) {
      await client.payoutAccount.update({ where: { id: account.id }, data: { recipientCode } });
    }
  } catch (error) {
    await settleTransfer(withdrawal.reference, false, error instanceof Error ? error.message : "Transfer failed", client);
  }
  return withdrawal;
}

/** Finishes a withdrawal or wage payment once. A failure returns the reserved money to the wallet. */
export async function settleTransfer(reference: string, success: boolean, reason?: string, client: PrismaClient = db) {
  return reference.startsWith("WD_") ? settleWithdrawal(reference, success, reason, client) : settlePayslip(reference, success, reason, client);
}

async function settleWithdrawal(reference: string, success: boolean, reason: string | undefined, client: PrismaClient) {
  return client.$transaction(async (tx) => {
    const withdrawal = await tx.withdrawal.findUnique({ where: { reference } });
    if (!withdrawal) return false;
    const claimed = await tx.withdrawal.updateMany({
      where: { id: withdrawal.id, status: "PROCESSING" },
      data: success
        ? { status: "COMPLETED", completedAt: new Date() }
        : { status: "FAILED", failureReason: reason ?? "Transfer failed", completedAt: new Date() },
    });
    if (claimed.count !== 1) return false;

    if (!success) {
      await tx.ledgerEntry.create({
        data: { kind: "WITHDRAWAL_RETURN", amount: withdrawal.amount, dedupeKey: `withdrawal-return:${withdrawal.id}`, memo: `Returned from failed withdrawal ${reference}` },
      });
    }
    await audit(null, success ? "WITHDRAWAL_SENT" : "WITHDRAWAL_FAILED", `${formatGHS(withdrawal.amount)}, ${reference}`, tx);
    return true;
  });
}

async function settlePayslip(reference: string, success: boolean, reason: string | undefined, client: PrismaClient) {
  return client.$transaction(async (tx) => {
    const slip = await tx.payslip.findUnique({ where: { reference }, include: { user: true } });
    if (!slip) return false;
    const claimed = await tx.payslip.updateMany({
      where: { id: slip.id, status: "PROCESSING" },
      data: success ? { status: "PAID" } : { status: "FAILED", failureReason: reason ?? "Transfer failed" },
    });
    if (claimed.count !== 1) return false;

    if (!success) {
      await tx.ledgerEntry.create({
        data: { kind: "WAGES_RETURN", amount: slip.net, dedupeKey: `wages-return:${slip.id}:${reference}`, memo: `Returned from failed wage payment to ${slip.user.name}` },
      });
    }
    const open = await tx.payslip.count({ where: { runId: slip.runId, status: { in: ["PROCESSING", "FAILED", "DRAFT"] } } });
    if (open === 0) await tx.payrollRun.update({ where: { id: slip.runId }, data: { status: "PAID" } });
    await audit(null, success ? "WAGES_SENT" : "WAGES_FAILED", `${formatGHS(slip.net)} to ${slip.user.name}`, tx);
    return true;
  });
}

/** Approves a run: reserves every wage from the wallet, then sends each one. */
export async function approvePayroll(runId: string, actorId: string, client: PrismaClient = db) {
  await getSettings(client);
  const slips = await client.$transaction(async (tx) => {
    await lockWallet(tx);
    const claimed = await tx.payrollRun.updateMany({
      where: { id: runId, status: "DRAFT" },
      data: { status: "APPROVED", approvedById: actorId, approvedAt: new Date() },
    });
    if (claimed.count !== 1) throw new MoneyError("This payroll has already been approved.");

    const run = await tx.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: { payslips: { include: { user: { include: { payoutAccounts: true } } } } } });
    if (run.preparedById === actorId && run.payslips.length === 0) throw new MoneyError("This payroll has no workers.");
    const payable = run.payslips.filter((slip) => slip.net > 0);
    const missing = payable.find((slip) => slip.user.payoutAccounts.length === 0);
    if (missing) throw new MoneyError(`${missing.user.name} has no payout account yet.`);

    const total = payable.reduce((sum, slip) => sum + slip.net, 0);
    if (total > (await walletBalance(tx))) throw new MoneyError(`This payroll needs ${formatGHS(total)}, which is more than the wallet balance.`);

    for (const slip of run.payslips) {
      await tx.payslip.update({ where: { id: slip.id }, data: { status: slip.net > 0 ? "PROCESSING" : "PAID" } });
      const owed = await tx.advance.aggregate({ where: { userId: slip.userId, payslipId: null }, _sum: { amount: true } });
      await tx.advance.updateMany({ where: { userId: slip.userId, payslipId: null }, data: { payslipId: slip.id } });
      // Whatever this pay could not cover stays owed for the next run.
      const remainder = (owed._sum.amount ?? 0) - slip.advances;
      if (remainder > 0) await tx.advance.create({ data: { userId: slip.userId, date: today(), amount: remainder, note: `Carried forward from ${run.period}` } });
    }
    await tx.ledgerEntry.create({ data: { kind: "WAGES", amount: -total, dedupeKey: `wages:${runId}`, memo: `Wages for ${run.period}` } });
    await audit(actorId, "PAYROLL_APPROVED", `${run.period}: ${formatGHS(total)} to ${payable.length} workers`, tx);
    return payable;
  });

  for (const slip of slips) await sendWage(slip.reference, client);
}

async function sendWage(reference: string, client: PrismaClient) {
  const slip = await client.payslip.findUniqueOrThrow({ where: { reference }, include: { user: { include: { payoutAccounts: true } } } });
  const account = slip.user.payoutAccounts[0];
  try {
    await getProvider().createTransfer({ reference, amount: slip.net, ...account });
  } catch (error) {
    await settleTransfer(reference, false, error instanceof Error ? error.message : "Transfer failed", client);
  }
}

/** Sends a failed wage again under a new reference, reserving the money afresh. */
export async function retryPayslip(payslipId: string, actorId: string, client: PrismaClient = db) {
  const reference = await client.$transaction(async (tx) => {
    await lockWallet(tx);
    const slip = await tx.payslip.findUniqueOrThrow({ where: { id: payslipId }, include: { user: true } });
    if (slip.status !== "FAILED") throw new MoneyError("Only failed payments can be sent again.");
    if (slip.net > (await walletBalance(tx))) throw new MoneyError("The wallet balance is too low.");
    const next = newReference("PAY");
    await tx.payslip.update({ where: { id: slip.id }, data: { status: "PROCESSING", reference: next, failureReason: null } });
    await tx.ledgerEntry.create({ data: { kind: "WAGES", amount: -slip.net, dedupeKey: `wages-retry:${slip.id}:${next}`, memo: `Wage resent to ${slip.user.name}` } });
    await audit(actorId, "WAGES_RETRIED", `${formatGHS(slip.net)} to ${slip.user.name}`, tx);
    return next;
  });
  await sendWage(reference, client);
}

export async function handleProviderEvent(event: ProviderEvent) {
  switch (event.type) {
    case "payment.success":
      return confirmPayment(event.reference, event.amount, event.fee);
    case "payment.failed":
      return failPayment(event.reference);
    case "transfer.success":
      return settleTransfer(event.reference, true);
    case "transfer.failed":
      return settleTransfer(event.reference, false, event.reason);
  }
}
