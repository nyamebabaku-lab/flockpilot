"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { allowSignInAttempt, clearSignInAttempts, endSession, normalizePhone, requireUser, startSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { SITE_COOKIE } from "@/lib/site";

const FAILED = "That phone number or password is not right.";

export async function signIn(_state: unknown, data: FormData) {
  const phone = normalizePhone(String(data.get("phone") ?? ""));
  const password = String(data.get("password") ?? "");
  if (!phone) return { error: FAILED };
  if (!allowSignInAttempt(phone)) return { error: "Too many tries. Wait ten minutes and try again." };

  const user = await db.user.findUnique({ where: { phone } });
  if (!user?.active || !(await bcrypt.compare(password, user.passwordHash))) return { error: FAILED };

  clearSignInAttempts(phone);
  await startSession(user.id);
  await audit(user.id, "SIGNED_IN", user.name);
  redirect("/today");
}

export async function signOut() {
  await endSession();
  redirect("/signin");
}

export async function changeSite(data: FormData) {
  await requireUser();
  const farmId = String(data.get("farmId") ?? "");
  const store = await cookies();
  if (farmId) store.set(SITE_COOKIE, farmId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  else store.delete(SITE_COOKIE);
}
