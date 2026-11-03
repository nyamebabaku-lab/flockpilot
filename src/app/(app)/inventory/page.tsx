import { createItem, createSupplier, moveStock } from "@/app/actions/inventory";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, Field, PageHeader, StatusBadge } from "@/components/ui";
import { farmIdsFor, requireUser } from "@/lib/auth";
import { ITEM_CATEGORIES } from "@/lib/constants";
import { formatDay, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatCrates, fromMilli } from "@/lib/metrics";
import { formatGHS } from "@/lib/money";
import { can } from "@/lib/permissions";
import { stockSummaries } from "@/lib/queries";
import { activeFarmIds } from "@/lib/site";

export const metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const user = await requireUser();
  const [items, suppliers, farms] = await Promise.all([
    stockSummaries(await activeFarmIds(user)),
    db.supplier.findMany({ orderBy: { name: "asc" } }),
    db.farm.findMany({ where: { id: { in: await farmIdsFor(user) } }, orderBy: { name: "asc" } }),
  ]);
  const manage = can(user.role, "inventory.manage");
  const groups = Object.entries(ITEM_CATEGORIES).map(([key, label]) => ({ key, label, items: items.filter((item) => item.category === key) })).filter((group) => group.items.length);

  return (
    <>
      <PageHeader title="Inventory" subtitle="Stock drops automatically as feed and eggs are recorded" />
      <div className="space-y-5">
        {groups.length === 0 && <Empty>No stock items yet.</Empty>}
        {groups.map((group) => (
          <Card key={group.key} title={group.label}>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Item</th><th>Site</th><th>In stock</th><th>Unit cost</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {group.items.map((item) => (
                    <tr key={item.id}>
                      <td className="font-medium">
                        {item.name}
                        {item.expiresOn && <span className="block text-xs font-normal text-ink-faint">Expires {formatDay(item.expiresOn)}</span>}
                      </td>
                      <td className="text-ink-soft">{item.farm.name}</td>
                      <td>{item.category === "EGGS" ? formatCrates(Math.round(item.level / 1000)) : `${fromMilli(item.level)} ${item.unit}`}</td>
                      <td>{formatGHS(item.unitCost)}</td>
                      <td><StatusBadge status={item.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}

        {manage && (
          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Receive or correct stock">
              <ActionForm action={moveStock} resetOnSuccess>
                <Field label="Item">
                  <select className="input" name="itemId" required>
                    {items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.farm.name}</option>)}
                  </select>
                </Field>
                <Field label="Type">
                  <select className="input" name="kind">
                    <option value="PURCHASE">Bought</option>
                    <option value="ADJUST_UP">Count correction, add</option>
                    <option value="ADJUST_DOWN">Count correction, remove</option>
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Quantity"><input className="input" name="quantity" inputMode="decimal" required /></Field>
                  <Field label="Unit cost (GH₵)"><input className="input" name="unitCost" inputMode="decimal" /></Field>
                </div>
                <Field label="Supplier">
                  <select className="input" name="supplierId">
                    <option value="">None</option>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                </Field>
                <input type="hidden" name="date" value={today()} />
                <SubmitButton className="btn-primary w-full">Update stock</SubmitButton>
              </ActionForm>
            </Card>
            <Card title="New item">
              <ActionForm action={createItem} resetOnSuccess>
                <Field label="Name"><input className="input" name="name" required /></Field>
                <Field label="Site">
                  <select className="input" name="farmId">
                    {farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Category">
                    <select className="input" name="category">
                      {Object.entries(ITEM_CATEGORIES).filter(([key]) => key !== "EGGS").map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="Unit"><input className="input" name="unit" required placeholder="kg" /></Field>
                  <Field label="Low-stock level"><input className="input" name="lowLevel" inputMode="decimal" /></Field>
                  <Field label="Unit cost (GH₵)"><input className="input" name="unitCost" inputMode="decimal" /></Field>
                </div>
                <Field label="Expiry date (optional)"><input className="input" name="expiresOn" type="date" /></Field>
                <SubmitButton className="btn-ghost w-full">Add item</SubmitButton>
              </ActionForm>
            </Card>
            <Card title="Suppliers">
              {suppliers.length === 0 ? <Empty>No suppliers yet.</Empty> : (
                <ul className="mb-4 space-y-1 text-sm">
                  {suppliers.map((supplier) => (
                    <li key={supplier.id} className="flex justify-between gap-2 border-b border-line/60 py-2">
                      <span>{supplier.name}</span><span className="text-ink-soft">{supplier.phone}</span>
                    </li>
                  ))}
                </ul>
              )}
              <ActionForm action={createSupplier} resetOnSuccess className="space-y-3">
                <Field label="Name"><input className="input" name="name" required /></Field>
                <Field label="Phone"><input className="input" name="phone" type="tel" /></Field>
                <SubmitButton className="btn-ghost w-full">Add supplier</SubmitButton>
              </ActionForm>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
