import { createOrder } from "@/app/actions/sales";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageHeader } from "@/components/ui";
import { farmIdsFor, requirePage } from "@/lib/auth";
import { SALE_KINDS } from "@/lib/constants";
import { today } from "@/lib/dates";
import { db } from "@/lib/db";

export const metadata = { title: "New order" };

export default async function NewOrderPage() {
  const user = await requirePage("sales.manage");
  const farmIds = await farmIdsFor(user);
  const [customers, farms, flocks] = await Promise.all([
    db.customer.findMany({ orderBy: { name: "asc" } }),
    db.farm.findMany({ where: { id: { in: farmIds } }, orderBy: { name: "asc" } }),
    db.flock.findMany({ where: { status: "ACTIVE", house: { farmId: { in: farmIds } } }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="New order" subtitle="Egg and bird sales update stock and flock counts automatically." />
      <Card>
        <ActionForm action={createOrder}>
          <Field label="Customer">
            <select className="input" name="customerId">
              <option value="">New customer</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </Field>
          <div className="grid gap-3 rounded-2xl bg-raised p-3 sm:grid-cols-3">
            <Field label="New customer name"><input className="input" name="customerName" /></Field>
            <Field label="Phone"><input className="input" name="customerPhone" type="tel" /></Field>
            <Field label="Email"><input className="input" name="customerEmail" type="email" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Site">
              <select className="input" name="farmId">
                {farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
              </select>
            </Field>
            <Field label="Date"><input className="input" name="date" type="date" defaultValue={today()} required /></Field>
            <Field label="Selling">
              <select className="input" name="kind">
                {Object.entries(SALE_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </Field>
            <Field label="Flock (for bird sales)">
              <select className="input" name="flockId">
                <option value="">Not applicable</option>
                {flocks.map((flock) => <option key={flock.id} value={flock.id}>{flock.name}</option>)}
              </select>
            </Field>
            <Field label="Quantity"><input className="input" name="quantity" type="number" min="1" required /></Field>
            <Field label="Price each (GH₵)"><input className="input" name="unitPrice" inputMode="decimal" required /></Field>
          </div>
          <Field label="Description (optional)"><input className="input" name="description" /></Field>
          <SubmitButton className="btn-primary w-full">Create order</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
