import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { can, type Permission } from "./permissions";

const COOKIE = "flockpilot_session";
const MAX_AGE = 60 * 60 * 24 * 14;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(value);
}

export { normalizePhone } from "./phone";

export async function startSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.APP_URL?.startsWith("https"),
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const user = payload.sub ? await db.user.findUnique({ where: { id: payload.sub } }) : null;
    return user?.active ? user : null;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  return user;
}

/** Use on pages. Sends anyone without the permission back to their home screen. */
export async function requirePage(permission: Permission) {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/today");
  return user;
}

export class NotAllowed extends Error {
  constructor() {
    super("You do not have permission to do that.");
  }
}

/** Use in actions and API routes. Throws, so the change never happens. */
export async function requireAction(permission: Permission) {
  const user = await currentUser();
  if (!user || !can(user.role, permission)) throw new NotAllowed();
  return user;
}

/** Checks the password again before a money action. */
export async function confirmPassword(userId: string, password: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  if (!allowSignInAttempt(`confirm:${userId}`)) return false;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (ok) clearSignInAttempts(`confirm:${userId}`);
  return ok;
}

/** Owners and managers see every site. Workers see only their assigned sites. */
export async function farmIdsFor(user: { id: string; role: string }) {
  if (user.role !== "WORKER") {
    return (await db.farm.findMany({ where: { active: true }, select: { id: true } })).map((farm) => farm.id);
  }
  return (await db.siteAssignment.findMany({ where: { userId: user.id } })).map((site) => site.farmId);
}

const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

/** Slows repeated password guessing against one account. */
export function allowSignInAttempt(key: string) {
  const entry = attempts.get(key);
  if (!entry || entry.until < Date.now()) {
    attempts.set(key, { count: 1, until: Date.now() + WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= MAX_ATTEMPTS;
}

export function clearSignInAttempts(key: string) {
  attempts.delete(key);
}
