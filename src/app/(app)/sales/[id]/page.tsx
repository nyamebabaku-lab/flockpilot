import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { cancelOrder, recordCash } from "@/app/actions/sales";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/action-form";
import { Card, Empty, Field, PageHeader, StatusBadge } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { formatDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatGHS } from "@/lib/money";
import { METHOD_LABELS } from "@/lib/payments/types";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePage("sales.manage");
  const order = await db.order.findUnique({ where: { id }, include: { customer: true, farm: true, lines: true, payments: { orderBy: { createdAt: "desc" } } } });
  if (!order) notFound();
  const due = order.total - order.paid;
  const open = order.status !== "CANCELLED" && due > 0;
  const link = `${process.env.APP_URL}/o/${order.payToken}`;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={`Order #${order.number}`} subtitle={`${order.customer.name} · ${formatDay(order.date)} · ${order.farm.name}`} action={<StatusBadge status={order.status} />} />
      <Card title="Items" action={<a className="text-sm font-semibold text-brand" href={`/api/invoices/${order.id}`}>Download invoice</a>}>
        <ul className="text-sm">
          {order.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-3 border-b border-line/60 py-2">
              <span>{line.quantity} × {line.description} at {formatGHS(line.unitPrice)}</span>
              <span className="font-semibold">{formatGHS(line.total)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between font-display text-lg font-bold"><span>Balance due</span><span>{formatGHS(due)}</span></div>
      </Card>
      {open && (
        <div className="grid gap-5 md:grid-cols-2">
          <Card title="Customer payment link">
            <p className="mb-3 text-sm text-ink-soft">Send this to the customer to pay by Mobile Money or card.</p>
            <a href={link} className="block break-all rounded-2xl bg-raised p-3 text-sm text-brand">{link}</a>
          </Card>
          <Card title="Record cash">
            <ActionForm action={recordCash.bind(null, order.id)} resetOnSuccess>
              <input type="hidden" name="key" value={randomUUID()} />
              <Field label="Amount received (GH₵)"><input className="input" name="amount" inputMode="decimal" defaultValue={(due / 100).toFixed(2)} required /></Field>
              <SubmitButton className="btn-ghost w-full">Record cash</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      )}
      <Card title="Payments">
        {order.payments.length === 0 ? <Empty>No payments yet.</Empty> : (
          <ul className="text-sm">
            {order.payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-3 border-b border-line/60 py-2">
                <span>{METHOD_LABELS[payment.method]} · {formatGHS(payment.amount)}</span>
                <StatusBadge status={payment.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {order.status === "OPEN" && (
        <ActionForm action={async () => cancelOrder(order.id)}>
          <ConfirmSubmit message="Cancel this order and put the stock back?">Cancel order</ConfirmSubmit>
        </ActionForm>
      )}
    </div>
  );
}
