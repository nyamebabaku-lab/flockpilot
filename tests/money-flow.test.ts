import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const file = path.join(__dirname, "test.db");
const url = `file:${file}`;
process.env.DATABASE_URL = url;

const transfer = vi.fn(async () => ({}));
vi.mock("@/lib/payments", () => ({
  getProvider: () => ({ createTransfer: transfer }),
}));

const db = new PrismaClient({ datasources: { db: { url } } });
const { approvePayroll, confirmPayment, MoneyError, requestWithdrawal, retryPayslip, settleTransfer, walletBalance } = await import("@/lib/payments/service");
const { saveRecord } = await import("@/lib/records");

let ownerId: string;
let accountId: string;
let orderId: string;
let flockId: string;
let farmId: string;

async function pendingPayment(reference: string, amount: number) {
  await db.payment.create({ data: { reference, orderId, amount, method: "MTN" } });
}

beforeAll(() => {
  rmSync(file, { force: true });
  execSync("npx prisma db push --skip-generate", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
});

afterAll(async () => {
  await db.$disconnect();
  rmSync(file, { force: true });
});

beforeEach(async () => {
  transfer.mockReset();
  transfer.mockResolvedValue({});
  for (const table of ["auditLog", "syncReceipt", "ledgerEntry", "advance", "payslip", "payrollRun", "withdrawal", "payoutAccount", "payment", "orderLine", "order", "customer", "stockMovement", "eggRecord", "feedRecord", "mortalityRecord", "inventoryItem", "flock", "house", "farm", "user", "settings"] as const) {
    await (db[table] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await db.settings.create({ data: { id: "main", dailyWithdrawalLimit: 500000 } });
  const owner = await db.user.create({ data: { name: "Owner", phone: "0200000001", passwordHash: "x", role: "OWNER" } });
  ownerId = owner.id;
  accountId = (await db.payoutAccount.create({ data: { userId: owner.id, kind: "MOMO", provider: "MTN", accountName: "Owner", accountNumber: "0200000001" } })).id;
  const farm = await db.farm.create({ data: { name: "Farm" } });
  farmId = farm.id;
  const house = await db.house.create({ data: { farmId, name: "A" } });
  flockId = (await db.flock.create({ data: { houseId: house.id, name: "F1", birdType: "LAYER", startDate: "2026-01-01", startCount: 100 } })).id;
  const customer = await db.customer.create({ data: { name: "Buyer" } });
  orderId = (await db.order.create({ data: { number: 1, payToken: "t", customerId: customer.id, farmId, date: "2026-01-02", total: 100000 } })).id;
});

describe("customer payments", () => {
  it("credits the wallet once however often it is confirmed", async () => {
    await pendingPayment("P1", 100000);
    expect(await confirmPayment("P1", 100000, 2000, db)).toBe(true);
    expect(await confirmPayment("P1", 100000, 2000, db)).toBe(false);
    expect(await walletBalance(db)).toBe(98000);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("PAID");
    expect(order.paid).toBe(100000);
  });

  it("rejects a payment whose amount does not match", async () => {
    await pendingPayment("P2", 100000);
    expect(await confirmPayment("P2", 5000, 0, db)).toBe(false);
    expect((await db.payment.findUniqueOrThrow({ where: { reference: "P2" } })).status).toBe("FAILED");
    expect(await walletBalance(db)).toBe(0);
  });

  it("marks a part payment", async () => {
    await pendingPayment("P3", 40000);
    await confirmPayment("P3", 40000, 0, db);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PART");
  });
});

describe("withdrawals", () => {
  beforeEach(async () => {
    await db.ledgerEntry.create({ data: { kind: "SALE", amount: 400000, dedupeKey: "seed", memo: "seed" } });
  });

  it("reserves money and ignores a repeated request", async () => {
    await requestWithdrawal(ownerId, accountId, 100000, "k1", db);
    await requestWithdrawal(ownerId, accountId, 100000, "k1", db);
    expect(await walletBalance(db)).toBe(300000);
    expect(transfer).toHaveBeenCalledTimes(1);
  });

  it("refuses more than the balance", async () => {
    await expect(requestWithdrawal(ownerId, accountId, 400001, "k2", db)).rejects.toBeInstanceOf(MoneyError);
    expect(await walletBalance(db)).toBe(400000);
  });

  it("enforces the daily limit", async () => {
    await db.ledgerEntry.create({ data: { kind: "SALE", amount: 400000, dedupeKey: "seed2", memo: "seed" } });
    await requestWithdrawal(ownerId, accountId, 400000, "k3", db);
    await expect(requestWithdrawal(ownerId, accountId, 100001, "k4", db)).rejects.toThrow(/daily limit/);
  });

  it("returns the money once when a transfer fails", async () => {
    const withdrawal = await requestWithdrawal(ownerId, accountId, 100000, "k5", db);
    expect(await settleTransfer(withdrawal.reference, false, "Declined", db)).toBe(true);
    expect(await settleTransfer(withdrawal.reference, false, "Declined", db)).toBe(false);
    expect(await settleTransfer(withdrawal.reference, true, undefined, db)).toBe(false);
    expect(await walletBalance(db)).toBe(400000);
  });

  it("returns the money if the provider refuses at once", async () => {
    transfer.mockRejectedValueOnce(new Error("Provider down"));
    await requestWithdrawal(ownerId, accountId, 100000, "k6", db);
    expect(await walletBalance(db)).toBe(400000);
  });
});

describe("payroll", () => {
  async function run(walletAmount: number) {
    await db.ledgerEntry.create({ data: { kind: "SALE", amount: walletAmount, dedupeKey: "seed-pay", memo: "seed" } });
    const worker = await db.user.create({ data: { name: "Worker", phone: "0200000002", passwordHash: "x", role: "WORKER" } });
    await db.payoutAccount.create({ data: { userId: worker.id, kind: "MOMO", provider: "MTN", accountName: "Worker", accountNumber: "0200000002" } });
    const payroll = await db.payrollRun.create({ data: { period: "2026-10", preparedById: ownerId } });
    const slip = await db.payslip.create({ data: { runId: payroll.id, userId: worker.id, gross: 100000, net: 90000, reference: "PAY_1" } });
    return { payroll, slip };
  }

  it("pays once and cannot be approved twice", async () => {
    const { payroll, slip } = await run(200000);
    await approvePayroll(payroll.id, ownerId, db);
    await expect(approvePayroll(payroll.id, ownerId, db)).rejects.toBeInstanceOf(MoneyError);
    expect(await walletBalance(db)).toBe(110000);
    expect(transfer).toHaveBeenCalledTimes(1);
    await settleTransfer(slip.reference, true, undefined, db);
    expect((await db.payrollRun.findUniqueOrThrow({ where: { id: payroll.id } })).status).toBe("PAID");
  });

  it("refuses when the wallet cannot cover it, leaving the run a draft", async () => {
    const { payroll } = await run(50000);
    await expect(approvePayroll(payroll.id, ownerId, db)).rejects.toBeInstanceOf(MoneyError);
    expect((await db.payrollRun.findUniqueOrThrow({ where: { id: payroll.id } })).status).toBe("DRAFT");
    expect(await walletBalance(db)).toBe(50000);
  });

  it("returns failed wages and can resend them once", async () => {
    const { payroll, slip } = await run(200000);
    await approvePayroll(payroll.id, ownerId, db);
    await settleTransfer(slip.reference, false, "Wrong number", db);
    expect(await walletBalance(db)).toBe(200000);
    await retryPayslip(slip.id, ownerId, db);
    expect(await walletBalance(db)).toBe(110000);
    await expect(retryPayslip(slip.id, ownerId, db)).rejects.toBeInstanceOf(MoneyError);
  });
});

describe("offline sync", () => {
  const item = (clientId: string, broken = 1) => ({ clientId, type: "EGGS" as const, payload: { flockId, date: "2026-02-01", large: 10, medium: 5, small: 0, broken } });

  it("saves a retried record once and adds it to stock once", async () => {
    const user = { id: ownerId };
    expect((await saveRecord(user, [farmId], item("c1"), db)).status).toBe("saved");
    expect((await saveRecord(user, [farmId], item("c1"), db)).status).toBe("saved");
    expect(await db.eggRecord.count()).toBe(1);
    expect((await db.stockMovement.aggregate({ _sum: { delta: true } }))._sum.delta).toBe(15000);
  });

  it("refuses a flock at a site the worker is not assigned to", async () => {
    const result = await saveRecord({ id: ownerId }, ["another-farm"], item("c2"), db);
    expect(result.status).toBe("rejected");
    expect(await db.eggRecord.count()).toBe(0);
  });

  it("refuses bad values without saving anything", async () => {
    const result = await saveRecord({ id: ownerId }, [farmId], { clientId: "c3", type: "EGGS", payload: { flockId, date: "2026-02-01", large: -4 } }, db);
    expect(result.status).toBe("rejected");
    expect(await db.syncReceipt.count()).toBe(0);
  });
});
