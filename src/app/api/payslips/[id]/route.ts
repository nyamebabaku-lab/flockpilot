import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { heading, money, pdfResponse, row, startDocument } from "@/lib/pdf";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const slip = await db.payslip.findUnique({ where: { id: (await params).id }, include: { user: true, run: true } });
  if (!slip) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (slip.userId !== user.id && !can(user.role, "payroll.prepare")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const settings = await getSettings();
  const { doc, pen } = await startDocument(settings.businessName, "Payslip", `${slip.user.name} · ${slip.run.period}`);
  heading(pen, "Earnings");
  row(pen, "Gross pay", money(slip.gross));
  heading(pen, "Deductions");
  row(pen, "SSNIT", money(slip.ssnit));
  row(pen, "PAYE", money(slip.paye));
  row(pen, "Advances recovered", money(slip.advances));
  row(pen, "Take-home pay", money(slip.net), true);
  return pdfResponse(await doc.save(), `payslip-${slip.run.period}-${slip.user.name.replace(/\W+/g, "-")}.pdf`);
}
