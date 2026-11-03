import { notFound } from "next/navigation";
import { startPayment } from "@/app/actions/sales";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Logo } from "@/components/logo";
import { db } from "@/lib/db";
import { formatGHS } from "@/lib/money";
import { METHOD_LABELS } from "@/lib/payments/types";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Pay your order", robots: { index: false } };

export default async function CustomerPayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [order, settings] = await Promise.all([db.order.findUnique({ where: { payToken: token }, include: { lines: true, customer: true } }), getSettings()]);
  if (!order) notFound();
  const due = order.total - order.paid;

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-6"><Logo /></div>
      <section className="card space-y-4">
        <div>
          <p className="text-sm text-ink-soft">{settings.businessName} · Order #{order.number}</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">{formatGHS(due)}</h1>
          <p className="text-sm text-ink-soft">for {order.customer.name}</p>
        </div>
        <ul className="text-sm">
          {order.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-3 border-b border-line/60 py-2">
              <span>{line.quantity} × {line.description}</span><span>{formatGHS(line.total)}</span>
            </li>
          ))}
        </ul>
        {order.status === "CANCELLED" ? (
          <p className="rounded-2xl bg-bad-soft p-3 text-sm text-bad">This order was cancelled.</p>
        ) : due <= 0 ? (
          <p className="rounded-2xl bg-good-soft p-3 text-sm font-medium text-good">Paid in full. Thank you.</p>
        ) : (
          <ActionForm action={startPayment.bind(null, token)}>
            <fieldset className="space-y-2">
              <legend className="label">Pay with</legend>
              {["MTN", "TELECEL", "AT", "CARD"].map((method, index) => (
                <label key={method} className="flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-raised px-4 text-sm font-medium">
                  <input type="radio" name="method" value={method} defaultChecked={index === 0} /> {METHOD_LABELS[method]}
                </label>
              ))}
            </fieldset>
            <SubmitButton className="btn-yolk w-full">Pay {formatGHS(due)}</SubmitButton>
          </ActionForm>
        )}
      </section>
    </main>
  );
}
