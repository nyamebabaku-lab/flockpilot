import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { formatDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { heading, money, pdfResponse, row, startDocument } from "@/lib/pdf";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || !can(user.role, "sales.manage")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const order = await db.order.findUnique({ where: { id: (await params).id }, include: { customer: true, lines: true, payments: { where: { status: "SUCCESS" } } } });
  if (!order) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const settings = await getSettings();
  const { doc, pen } = await startDocument(settings.businessName, `Invoice #${order.number}`, `${order.customer.name} · ${formatDay(order.date)}`);
  heading(pen, "Items");
  for (const line of order.lines) row(pen, `${line.quantity} x ${line.description}`, money(line.total));
  row(pen, "Total", money(order.total), true);
  if (order.payments.length) {
    heading(pen, "Payments received");
    for (const payment of order.payments) row(pen, payment.method, money(payment.amount));
  }
  row(pen, "Balance due", money(order.total - order.paid), true);
  return pdfResponse(await doc.save(), `invoice-${order.number}.pdf`);
}
