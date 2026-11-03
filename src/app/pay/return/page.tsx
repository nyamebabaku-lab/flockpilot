import { CheckCircle2, CircleAlert, Clock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatGHS } from "@/lib/money";
import { getProvider } from "@/lib/payments";
import { handleProviderEvent } from "@/lib/payments/service";

export const metadata = { title: "Payment", robots: { index: false } };

export default async function ReturnPage({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  const reference = (await searchParams).reference ?? "";

  // Asking the provider directly means a payment still lands if its webhook cannot reach this server.
  const before = await db.payment.findUnique({ where: { reference } });
  if (!before) notFound();
  if (before.status === "PENDING") {
    const event = await getProvider().verify(reference);
    if (event) await handleProviderEvent(event);
  }
  const payment = await db.payment.findUniqueOrThrow({ where: { reference }, include: { order: true } });

  const view =
    payment.status === "SUCCESS"
      ? { icon: CheckCircle2, tone: "text-good", title: "Payment received", text: `${formatGHS(payment.amount)} for order #${payment.order.number}. Thank you.` }
      : payment.status === "FAILED"
        ? { icon: CircleAlert, tone: "text-bad", title: "Payment failed", text: "No money was taken. You can try again." }
        : { icon: Clock, tone: "text-warn", title: "Payment processing", text: "This can take a moment. Refresh this page to check." };

  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center p-5">
      <section className="card w-full text-center">
        <view.icon size={44} className={`mx-auto ${view.tone}`} aria-hidden />
        <h1 className="mt-3 font-display text-2xl font-bold">{view.title}</h1>
        <p className="mt-1 text-ink-soft">{view.text}</p>
        <Link href={`/o/${payment.order.payToken}`} className="btn-ghost mt-5 w-full">Back to order</Link>
      </section>
    </main>
  );
}
