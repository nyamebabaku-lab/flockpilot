// Run against a running server: node --env-file=.env tests/role-check.mjs
// Attacks the server directly as each role, so nothing here relies on hidden buttons.
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const BASE = process.env.APP_URL;
const db = new PrismaClient();
const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
let failed = 0;

function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} ${detail}`);
  if (!ok) failed++;
}

async function cookieFor(phone) {
  const user = await db.user.findUniqueOrThrow({ where: { phone } });
  const token = await new SignJWT({ sub: user.id }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(secret);
  return `flockpilot_session=${token}`;
}

const get = (path, cookie) => fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });
const redirectsTo = (response) => new URL(response.headers.get("location") ?? "/", BASE).pathname;

const owner = await cookieFor("0240000001");
const manager = await cookieFor("0240000002");
const worker = await cookieFor("0240000003");
const OWNER_PAGES = ["/money", "/reports", "/settings"];
const MANAGER_PAGES = ["/sales", "/sales/new", "/expenses", "/payroll"];

for (const page of OWNER_PAGES) {
  check(`owner opens ${page}`, (await get(page, owner)).status === 200);
  check(`manager blocked from ${page}`, redirectsTo(await get(page, manager)) === "/today");
  check(`worker blocked from ${page}`, redirectsTo(await get(page, worker)) === "/today");
}
for (const page of MANAGER_PAGES) {
  check(`manager opens ${page}`, (await get(page, manager)).status === 200);
  check(`worker blocked from ${page}`, redirectsTo(await get(page, worker)) === "/today");
}
for (const page of ["/today", "/money", "/flocks"]) check(`signed-out visitor blocked from ${page}`, redirectsTo(await get(page)) === "/signin");

for (const path of ["/api/reports/summary", "/api/reports/sales"]) {
  check(`manager denied ${path}`, (await get(path, manager)).status === 403);
  check(`worker denied ${path}`, (await get(path, worker)).status === 403);
}
const order = await db.order.findFirstOrThrow();
check("worker denied invoice", (await get(`/api/invoices/${order.id}`, worker)).status === 403);
check("signed-out visitor denied sync", (await fetch(`${BASE}/api/sync`, { method: "POST", body: "{}" })).status === 401);

// A worker at one site must not be able to write records for another site's flock.
const otherFlock = await db.flock.findFirstOrThrow({ where: { house: { farm: { name: "Nsawam Annex" } } } });
const before = await db.eggRecord.count();
const sync = await fetch(`${BASE}/api/sync`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: worker },
  body: JSON.stringify({ items: [{ clientId: `role-check-${Date.now()}`, type: "EGGS", payload: { flockId: otherFlock.id, date: "2026-01-01", large: 5 } }] }),
});
const { results } = await sync.json();
check("worker refused at another site", results[0].status === "rejected" && (await db.eggRecord.count()) === before, results[0].reason);
const bootstrap = await (await get("/api/bootstrap", worker)).json();
check("worker sees only own site's flocks", bootstrap.flocks.every((flock) => flock.farmName === "Dodowa Main Farm"));

// Forged payment confirmations must never reach the wallet.
const pending = await db.ledgerEntry.aggregate({ _sum: { amount: true } });
const forged = JSON.stringify({ type: "payment.success", reference: "DEMO_1001", amount: 999999 });
const webhook = await fetch(`${BASE}/api/webhooks/payments`, { method: "POST", headers: { "x-simulator-signature": createHmac("sha256", "wrong-secret").update(forged).digest("hex") }, body: forged });
check("forged webhook refused", webhook.status === 401);
check("wallet unchanged by forgery", (await db.ledgerEntry.aggregate({ _sum: { amount: true } }))._sum.amount === pending._sum.amount);

await db.$disconnect();
console.log(failed ? `\n${failed} FAILED` : "\nAll role checks passed");
process.exit(failed ? 1 : 0);
