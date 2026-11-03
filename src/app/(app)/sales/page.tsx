import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, Empty, LinkButton, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { formatDay, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatGHS } from "@/lib/money";
import { activeFarmIds } from "@/lib/site";

export const metadata = { title: "Sales" };

export default async function SalesPage() {
  const user = await requirePage("sales.manage");
  const orders = await db.order.findMany({ where: { farmId: { in: await activeFarmIds(user) } }, include: { customer: true }, orderBy: { number: "desc" }, take: 50 });
  const live = orders.filter((order) => order.status !== "CANCELLED");
  const month = today().slice(0, 7);
  const sold = live.filter((order) => order.date.startsWith(month)).reduce((sum, order) => sum + order.total, 0);
  const owed = live.reduce((sum, order) => sum + order.total - order.paid, 0);

  return (
    <>
      <PageHeader title="Sales" subtitle="Orders, invoices and customer payments" action={<LinkButton href="/sales/new"><Plus size={18} /> New order</LinkButton>} />
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Stat label="Sold this month" value={formatGHS(sold)} />
        <Stat label="Waiting to be paid" value={formatGHS(owed)} />
      </div>
      <Card>
        {orders.length === 0 ? <Empty>No orders yet.</Empty> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td><Link className="font-semibold text-brand" href={`/sales/${order.id}`}>#{order.number}</Link></td>
                    <td>{order.customer.name}</td>
                    <td className="text-ink-soft">{formatDay(order.date)}</td>
                    <td>{formatGHS(order.total)}</td>
                    <td><StatusBadge status={order.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
