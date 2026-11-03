"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { attempt, optional, text } from "@/lib/action";
import { audit } from "@/lib/audit";
import { normalizePhone, requireAction } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { isDay, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { toPesewas } from "@/lib/money";

const MIN_PASSWORD = 8;

export async function createUser(_state: unknown, data: FormData) {
  return attempt(async () => {
    const actor = await requireAction("users.manage");
    const name = text(data, "name");
    const phone = normalizePhone(text(data, "phone"));
    const role = text(data, "role");
    const password = text(data, "password");
    const monthlyPay = toPesewas(text(data, "monthlyPay") || "0");
    if (!name || !phone || !ROLES[role] || role === "OWNER" || monthlyPay === null) return { error: "Check the name, phone number and role." };
    if (password.length < MIN_PASSWORD) return { error: `Use a password of at least ${MIN_PASSWORD} characters.` };
    if (await db.user.findUnique({ where: { phone } })) return { error: "Someone already uses that phone number." };

    const user = await db.user.create({
      data: { name, phone, role, monthlyPay, jobTitle: optional(data, "jobTitle"), passwordHash: await bcrypt.hash(password, 10) },
    });
    const farmIds = data.getAll("farmIds").map(String);
    if (farmIds.length) await db.siteAssignment.createMany({ data: farmIds.map((farmId) => ({ userId: user.id, farmId })) });
    const accountNumber = normalizePhone(text(data, "momoNumber"));
    if (accountNumber) {
      await db.payoutAccount.create({ data: { userId: user.id, kind: "MOMO", provider: text(data, "momoNetwork") || "MTN", accountName: name, accountNumber } });
    }
    await audit(actor.id, "USER_ADDED", `${name} (${role})`);
    revalidatePath("/team");
    return { success: `${name} can now sign in.` };
  });
}

export async function setUserActive(userId: string, active: boolean) {
  const actor = await requireAction("users.manage");
  if (userId === actor.id) return;
  const user = await db.user.update({ where: { id: userId }, data: { active } });
  await audit(actor.id, active ? "USER_ENABLED" : "USER_DISABLED", user.name);
  revalidatePath("/team");
}

export async function createTask(_state: unknown, data: FormData) {
  return attempt(async () => {
    await requireAction("team.manage");
    const title = text(data, "title");
    const farmId = text(data, "farmId");
    const dueDate = text(data, "dueDate");
    if (!title || !farmId || !isDay(dueDate)) return { error: "Enter the task, site and due date." };
    await db.task.create({ data: { title, farmId, dueDate, assigneeId: optional(data, "assigneeId") } });
    revalidatePath("/team");
    revalidatePath("/today");
    return { success: "Task added." };
  });
}

export async function markAttendance(userId: string, status: string) {
  await requireAction("team.manage");
  const date = today();
  await db.attendance.upsert({ where: { userId_date: { userId, date } }, update: { status }, create: { userId, date, status } });
  revalidatePath("/team");
}

export async function addAdvance(_state: unknown, data: FormData) {
  return attempt(async () => {
    const actor = await requireAction("payroll.prepare");
    const userId = text(data, "userId");
    const amount = toPesewas(text(data, "amount"));
    if (!userId || !amount) return { error: "Choose a worker and enter an amount." };
    await db.advance.create({ data: { userId, amount, date: today(), note: optional(data, "note") } });
    await audit(actor.id, "ADVANCE_RECORDED", `${text(data, "amount")} for ${userId}`);
    revalidatePath("/payroll");
    return { success: "Advance recorded. It will come off the next payroll." };
  });
}
