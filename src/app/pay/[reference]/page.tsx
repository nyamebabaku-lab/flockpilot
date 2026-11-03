import { notFound } from "next/navigation";
import { finishSimulatedPayment } from "@/app/actions/sales";
import { db } from "@/lib/db";
import { formatGHS } from "@/lib/money";
import { getProvider } from "@/lib/payments";
import { METHOD_LABELS } from "@/lib/payments/types";

export const metadata = { title: "Payment simulator", robots: { index: false } };

export default async function SimulatorPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  if (getProvider().name !== "simulator") notFound();
  const payment = await db.payment.findUnique({ where: { reference } });
  if (!payment) notFound();

  return (
    <main className="mx-auto max-w-md p-5">
      <section className="card space-y-4">
        <p className="rounded-2xl bg-warn-soft p-3 text-sm font-medium text-warn">Payment simulator. No real money moves.</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">{formatGHS(payment.amount)}</h1>
        <p className="text-sm text-ink-soft">{METHOD_LABELS[payment.method]}</p>
        <div className="grid grid-cols-2 gap-2">
          <form action={finishSimulatedPayment.bind(null, reference, false)}><button className="btn-danger w-full">Decline</button></form>
          <form action={finishSimulatedPayment.bind(null, reference, true)}><button className="btn-primary w-full">Approve</button></form>
        </div>
      </section>
    </main>
  );
}
