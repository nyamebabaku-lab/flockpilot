import { afterEach, describe, expect, it } from "vitest";
import { simulator, signSimulatorBody } from "@/lib/payments/simulator";
import { can } from "@/lib/permissions";
import { crates, feedConversion, formatCrates, henDayPercent, liveBirds, mortalityPercent, stockLevel, stockStatus, toMilli } from "@/lib/metrics";
import { formatGHS, toPesewas } from "@/lib/money";
import { calculatePay, incomeTax } from "@/lib/payroll";

describe("flock calculations", () => {
  it("works out hen-day percentage", () => {
    expect(henDayPercent(900, 1000)).toBe(90);
    expect(henDayPercent(7000, 1000, 7)).toBe(100);
    expect(henDayPercent(100, 0)).toBe(0);
  });

  it("works out feed conversion and refuses a zero gain", () => {
    expect(feedConversion(1800, 1000)).toBe(1.8);
    expect(feedConversion(100, 0)).toBeNull();
  });

  it("works out mortality percentage", () => {
    expect(mortalityPercent(30, 1200)).toBe(2.5);
    expect(mortalityPercent(1, 0)).toBe(0);
  });

  it("counts live birds across deaths and movements", () => {
    expect(liveBirds(1000, 20, [{ kind: "SALE", count: 100 }, { kind: "TRANSFER_IN", count: 50 }, { kind: "CULL", count: 5 }])).toBe(925);
    expect(liveBirds(10, 50, [])).toBe(0);
  });

  it("splits eggs into crates of 30", () => {
    expect(crates(95)).toEqual({ crates: 3, loose: 5 });
  });
});

describe("crate wording", () => {
  it("reads naturally at every size", () => {
    expect(formatCrates(12)).toBe("12 eggs");
    expect(formatCrates(1)).toBe("1 egg");
    expect(formatCrates(30)).toBe("1 crate");
    expect(formatCrates(31)).toBe("1 crate + 1 egg");
    expect(formatCrates(95)).toBe("3 crates + 5 eggs");
    expect(formatCrates(0)).toBe("0 eggs");
  });
});

describe("payment simulator", () => {
  const request = { reference: "R", amount: 100, method: "MTN" as const, email: "a@example.com", returnUrl: "/" };
  const original = process.env.APP_URL;

  afterEach(() => {
    process.env.APP_URL = original;
  });

  it("works locally", async () => {
    process.env.APP_URL = "http://localhost:3000";
    await expect(simulator.createCharge(request)).resolves.toEqual({ redirectUrl: "/pay/R" });
  });

  it("refuses everything on a public server, even a correctly signed event", async () => {
    process.env.APP_URL = "https://farm.example.com";
    process.env.SIMULATOR_SECRET = "test-secret";
    const body = JSON.stringify({ type: "payment.success", reference: "R", amount: 100 });
    const headers = new Headers({ "x-simulator-signature": signSimulatorBody(body) });
    await expect(simulator.createCharge(request)).rejects.toThrow(/Paystack/);
    await expect(simulator.createTransfer({ reference: "R", amount: 1, kind: "MOMO", provider: "MTN", accountName: "A", accountNumber: "1" })).rejects.toThrow(/Paystack/);
    expect(simulator.parseWebhook(body, headers)).toBeNull();
  });
});

describe("stock", () => {
  it("adds up movements and flags status", () => {
    const level = stockLevel([{ delta: 100000 }, { delta: -40000 }]);
    expect(level).toBe(60000);
    expect(stockStatus(level, 80000)).toBe("LOW");
    expect(stockStatus(0, 80000)).toBe("OUT");
    expect(stockStatus(-5, 80000)).toBe("OUT");
    expect(stockStatus(level, 10000)).toBe("OK");
  });

  it("parses quantities without floating point error", () => {
    expect(toMilli("25.5")).toBe(25500);
    expect(toMilli("0.001")).toBe(1);
    expect(toMilli("abc")).toBeNull();
    expect(toMilli("1.2345")).toBeNull();
  });
});

describe("money", () => {
  it("parses cedis into pesewas exactly", () => {
    expect(toPesewas("1,234.56")).toBe(123456);
    expect(toPesewas("0.1")).toBe(10);
    expect(toPesewas("-5")).toBeNull();
    expect(formatGHS(123456)).toBe("GH₵ 1,234.56");
  });
});

describe("payroll", () => {
  const bands = [{ width: 50000, bps: 0 }, { width: 50000, bps: 1000 }, { width: null, bps: 2000 }];
  const rates = { ssnitEmployeeBps: 550, ssnitEmployerBps: 1300, bands };

  it("applies tax bands in order", () => {
    expect(incomeTax(40000, bands)).toBe(0);
    expect(incomeTax(80000, bands)).toBe(3000);
    expect(incomeTax(200000, bands)).toBe(25000);
  });

  it("calculates take-home pay", () => {
    const pay = calculatePay({ gross: 200000, advances: 20000, ...rates });
    expect(pay.ssnit).toBe(11000);
    expect(pay.ssnitEmployer).toBe(26000);
    expect(pay.paye).toBe(22800);
    expect(pay.net).toBe(146200);
    expect(pay.gross - pay.ssnit - pay.paye - pay.advances).toBe(pay.net);
  });

  it("never recovers more advance than the worker earns", () => {
    const pay = calculatePay({ gross: 10000, advances: 50000, ...rates });
    expect(pay.net).toBe(0);
    expect(pay.advances).toBe(9450);
  });
});

describe("permissions", () => {
  it("keeps money with the owner", () => {
    expect(can("OWNER", "money.withdraw")).toBe(true);
    expect(can("MANAGER", "money.withdraw")).toBe(false);
    expect(can("WORKER", "money.withdraw")).toBe(false);
    expect(can("MANAGER", "payroll.prepare")).toBe(true);
    expect(can("MANAGER", "payroll.approve")).toBe(false);
    expect(can("MANAGER", "finance.view")).toBe(false);
  });

  it("limits workers to daily records", () => {
    expect(can("WORKER", "records.write")).toBe(true);
    for (const permission of ["farm.manage", "inventory.manage", "sales.manage", "expenses.manage", "payroll.prepare"] as const) {
      expect(can("WORKER", permission)).toBe(false);
    }
  });

  it("denies unknown roles", () => {
    expect(can("VISITOR", "records.write")).toBe(false);
  });
});
