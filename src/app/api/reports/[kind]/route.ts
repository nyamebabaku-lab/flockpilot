import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { heading, money, pdfResponse, row, startDocument } from "@/lib/pdf";
import { can } from "@/lib/permissions";
import { csv, currentMonth, isMonth, monthlySummary } from "@/lib/reports";
import { getSettings } from "@/lib/settings";

const cedis = (pesewas: number) => (pesewas / 100).toFixed(2);

async function rowsFor(kind: string, month: string) {
  const date = { startsWith: month };
  switch (kind) {
    case "sales": {
      const orders = await db.order.findMany({ where: { date }, include: { customer: true, farm: true }, orderBy: { number: "asc" } });
      return [["Order", "Date", "Customer", "Site", "Total GHS", "Paid GHS", "Status"], ...orders.map((o) => [o.number, o.date, o.customer.name, o.farm.name, cedis(o.total), cedis(o.paid), o.status])];
    }
    case "expenses": {
      const items = await db.expense.findMany({ where: { date }, include: { farm: true }, orderBy: { date: "asc" } });
      return [["Date", "Description", "Category", "Site", "Amount GHS"], ...items.map((e) => [e.date, e.description, e.category, e.farm.name, cedis(e.amount)])];
    }
    case "eggs": {
      const items = await db.eggRecord.findMany({ where: { date }, include: { flock: true }, orderBy: { date: "asc" } });
      return [["Date", "Flock", "Large", "Medium", "Small", "Broken"], ...items.map((e) => [e.date, e.flock.name, e.large, e.medium, e.small, e.broken])];
    }
    case "feed": {
      const items = await db.feedRecord.findMany({ where: { date }, include: { flock: true, item: true }, orderBy: { date: "asc" } });
      return [["Date", "Flock", "Feed", "Kg", "Cost per kg GHS"], ...items.map((f) => [f.date, f.flock.name, f.item.name, f.quantity / 1000, cedis(f.unitCost)])];
    }
    default:
      return null;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await currentUser();
  if (!user || !can(user.role, "finance.view")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { kind } = await params;
  const asked = new URL(request.url).searchParams.get("month") ?? "";
  const month = isMonth(asked) ? asked : currentMonth();

  if (kind === "summary") {
    const summary = await monthlySummary(month);
    const settings = await getSettings();
    const { doc, pen } = await startDocument(settings.businessName, "Monthly report", month);
    heading(pen, "Summary");
    row(pen, "Income", money(summary.income));
    row(pen, "Feed used", money(summary.feedCost));
    row(pen, "Other expenses", money(summary.expenses));
    row(pen, "Wages with employer SSNIT", money(summary.wages));
    row(pen, "Profit", money(summary.profit), true);
    heading(pen, "Profit by site, before wages");
    for (const site of summary.sites) row(pen, site.name, money(site.profit));
    return pdfResponse(await doc.save(), `report-${month}.pdf`);
  }

  const rows = await rowsFor(kind, month);
  if (!rows) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return new Response(csv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${kind}-${month}.csv"` },
  });
}
