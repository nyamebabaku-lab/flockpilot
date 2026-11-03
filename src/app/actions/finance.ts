"use server";

import { revalidatePath } from "next/cache";
import { attempt, optional, text } from "@/lib/action";
import { audit } from "@/lib/audit";
import { confirmPassword, normalizePhone, requireAction } from "@/lib/auth";
import { isDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { toPesewas } from "@/lib/money";
import { approvePayroll, newReference, requestWithdrawal, retryPayslip } from "@/lib/payments/service";
import { calculatePay, parseBands } from "@/lib/payroll";
import { isMonth } from "@/lib/reports";
import { getSettings } from "@/lib/settings";

const BAD_PASSWORD = { error: "That password is not right." };

export async function addExpense(_state: unknown, data: FormData) {
  return attempt(async () => {
    const user = await requireAction("expenses.manage");
    const amount = toPesewas(text(data, "amount"));
    const date = text(data, "date");
    const description = text(data, "description");
    const farmId = text(data, "farmId");
    if (!amount || !isDay(date) || !description || !farmId) return { error: "Enter the site, date, description and amount." };
    await db.expense.create({ data: { amount, date, description, farmId, category: text(data, "category"), flockId: optional(data, "flockId") } });
    await audit(user.id, "EXPENSE_ADDED", `${description}: ${text(data, "amount")}`);
    revalidatePath("/expenses");
    return { success: "Expense saved." };
  });
}

export async function addPayoutAccount(_state: unknown, data: FormData) {
  return attempt(async () => {
    const user = await requireAction("money.withdraw");
    const kind = text(data, "kind");
    const provider = text(data, "provider");
    const accountName = text(data, "accountName");
    const accountNumber = kind === "MOMO" ? normalizePhone(text(data, "accountNumber")) : text(data, "accountNumber");
    if (!["MOMO", "BANK"].includes(kind) || !provider || !accountName || !accountNumber) return { error: "Check the account details." };
    await db.payoutAccount.create({ data: { userId: user.id, kind, provider, accountName, accountNumber } });
    await audit(user.id, "PAYOUT_ACCOUNT_ADDED", `${provider} ${accountNumber}`);
    revalidatePath("/money");
    return { success: "Account added." };
  });
}

export async function withdraw(_state: unknown, data: FormData) {
  return attempt(async () => {
    const user = await requireAction("money.withdraw");
    if (!(await confirmPassword(user.id, text(data, "password")))) return BAD_PASSWORD;
    const amount = toPesewas(text(data, "amount"));
    if (!amount) return { error: "Enter an amount above zero." };
    const result = await requestWithdrawal(user.id, text(data, "payoutAccountId"), amount, text(data, "key"));
    revalidatePath("/money");
    const after = await db.withdrawal.findUnique({ where: { id: result.id } });
    return after?.status === "FAILED" ? { error: `Withdrawal failed: ${after.failureReason}. The money is back in your wallet.` } : { success: "Withdrawal sent." };
  });
}

export async function preparePayroll(_state: unknown, data: FormData) {
  return attempt(async () => {
    const user = await requireAction("payroll.prepare");
    const period = text(data, "period");
    if (!isMonth(period)) return { error: "Choose a month." };
    const existing = await db.payrollRun.findUnique({ where: { period } });
    if (existing && existing.status !== "DRAFT") return { error: "This month has already been approved." };

    const settings = await getSettings();
    const bands = parseBands(settings.payeBandsJson);
    const staff = await db.user.findMany({ where: { active: true, monthlyPay: { gt: 0 } }, include: { advances: { where: { payslipId: null } } } });
    if (staff.length === 0) return { error: "No staff have a monthly pay set." };

    await db.$transaction(async (tx) => {
      if (existing) await tx.payrollRun.delete({ where: { id: existing.id } });
      const run = await tx.payrollRun.create({ data: { period, preparedById: user.id } });
      for (const person of staff) {
        const pay = calculatePay({
          gross: person.monthlyPay,
          advances: person.advances.reduce((sum, item) => sum + item.amount, 0),
          ssnitEmployeeBps: settings.ssnitEmployeeBps,
          ssnitEmployerBps: settings.ssnitEmployerBps,
          bands,
        });
        await tx.payslip.create({ data: { runId: run.id, userId: person.id, reference: newReference("PAY"), ...pay } });
      }
      await audit(user.id, "PAYROLL_PREPARED", period, tx);
    });
    revalidatePath("/payroll");
    return { success: "Payroll prepared. The owner can now approve it." };
  });
}

export async function approveRun(runId: string, _state: unknown, data: FormData) {
  return attempt(async () => {
    const user = await requireAction("payroll.approve");
    if (!(await confirmPassword(user.id, text(data, "password")))) return BAD_PASSWORD;
    await approvePayroll(runId, user.id);
    revalidatePath("/payroll");
    revalidatePath("/money");
    return { success: "Payroll approved and wages sent." };
  });
}

export async function retryWage(payslipId: string) {
  return attempt(async () => {
    const user = await requireAction("payroll.approve");
    await retryPayslip(payslipId, user.id);
    revalidatePath("/payroll");
  });
}

export async function saveSettings(_state: unknown, data: FormData) {
  return attempt(async () => {
    const user = await requireAction("settings.manage");
    const limit = toPesewas(text(data, "dailyWithdrawalLimit"));
    const percent = (name: string) => toPesewas(text(data, name));
    const [employee, employer, henDay] = [percent("ssnitEmployee"), percent("ssnitEmployer"), percent("henDayTarget")];
    const bands = parseBands(text(data, "payeBands"));
    if (!text(data, "businessName") || limit === null || employee === null || employer === null || henDay === null) return { error: "Check the values." };
    if (text(data, "payeBands") !== "[]" && bands.length === 0) return { error: "The tax bands are not valid." };
    await db.settings.update({
      where: { id: "main" },
      data: { businessName: text(data, "businessName"), dailyWithdrawalLimit: limit, ssnitEmployeeBps: employee, ssnitEmployerBps: employer, henDayTargetBps: henDay, payeBandsJson: JSON.stringify(bands) },
    });
    await audit(user.id, "SETTINGS_CHANGED", "Business settings updated");
    revalidatePath("/settings");
    return { success: "Settings saved." };
  });
}
