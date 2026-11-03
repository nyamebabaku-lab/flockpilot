import { db } from "./db";

export const currentMonth = () => new Date().toISOString().slice(0, 7);
export const isMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/** Income is what was sold in the month. Feed counts when eaten, so buying stock is not double counted. */
export async function monthlySummary(month: string) {
  const inMonth = { startsWith: month };
  const [orders, expenses, feed, payslips, farms] = await Promise.all([
    db.order.findMany({ where: { date: inMonth, status: { not: "CANCELLED" } }, select: { farmId: true, total: true } }),
    db.expense.findMany({ where: { date: inMonth }, select: { farmId: true, amount: true, category: true } }),
    db.feedRecord.findMany({ where: { date: inMonth }, select: { quantity: true, unitCost: true, flock: { select: { house: { select: { farmId: true } } } } } }),
    db.payslip.findMany({ where: { run: { period: month, status: { not: "DRAFT" } } }, select: { gross: true, ssnitEmployer: true } }),
    db.farm.findMany({ orderBy: { name: "asc" } }),
  ]);

  const feedCostOf = (row: { quantity: number; unitCost: number }) => Math.round((row.quantity / 1000) * row.unitCost);
  const sites = farms.map((farm) => {
    const income = orders.filter((row) => row.farmId === farm.id).reduce((sum, row) => sum + row.total, 0);
    const spent = expenses.filter((row) => row.farmId === farm.id).reduce((sum, row) => sum + row.amount, 0);
    const feedCost = feed.filter((row) => row.flock.house.farmId === farm.id).reduce((sum, row) => sum + feedCostOf(row), 0);
    return { id: farm.id, name: farm.name, income, expenses: spent, feedCost, profit: income - spent - feedCost };
  });

  const income = sites.reduce((sum, site) => sum + site.income, 0);
  const expenseTotal = sites.reduce((sum, site) => sum + site.expenses, 0);
  const feedCost = sites.reduce((sum, site) => sum + site.feedCost, 0);
  const wages = payslips.reduce((sum, slip) => sum + slip.gross + slip.ssnitEmployer, 0);
  return { month, sites, income, expenses: expenseTotal, feedCost, wages, profit: income - expenseTotal - feedCost - wages };
}

export async function flockProfit() {
  const flocks = await db.flock.findMany({
    include: { feed: { select: { quantity: true, unitCost: true } }, expenses: { select: { amount: true } }, orderLines: { select: { total: true } } },
    orderBy: { startDate: "desc" },
  });
  return flocks.map((flock) => {
    const income = flock.orderLines.reduce((sum, line) => sum + line.total, 0);
    const feedCost = flock.feed.reduce((sum, row) => sum + Math.round((row.quantity / 1000) * row.unitCost), 0);
    const direct = flock.expenses.reduce((sum, row) => sum + row.amount, 0) + flock.startCount * flock.costPerBird;
    return { id: flock.id, name: flock.name, income, feedCost, direct, profit: income - feedCost - direct };
  });
}

export function csv(rows: (string | number)[][]) {
  // A leading = + - or @ would run as a formula when opened in a spreadsheet.
  const cell = (value: string | number) => {
    const text = String(value);
    const safe = typeof value === "string" && /^[=+\-@]/.test(text) ? `'${text}` : text;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
