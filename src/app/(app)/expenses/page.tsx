import { addExpense } from "@/app/actions/finance";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, Field, PageHeader } from "@/components/ui";
import { farmIdsFor, requirePage } from "@/lib/auth";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { formatDay, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatGHS } from "@/lib/money";
import { activeFarmIds } from "@/lib/site";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage() {
  const user = await requirePage("expenses.manage");
  const farmIds = await farmIdsFor(user);
  const [expenses, farms, flocks] = await Promise.all([
    db.expense.findMany({ where: { farmId: { in: await activeFarmIds(user) } }, include: { farm: true, flock: true }, orderBy: { date: "desc" }, take: 50 }),
    db.farm.findMany({ where: { id: { in: farmIds } }, orderBy: { name: "asc" } }),
    db.flock.findMany({ where: { status: "ACTIVE", house: { farmId: { in: farmIds } } }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader title="Expenses" subtitle="Feed used is costed automatically, so log only other spending." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {expenses.length === 0 ? <Empty>No expenses yet.</Empty> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Site</th><th>Amount</th></tr></thead>
                <tbody>
                  {expenses.map((item) => (
                    <tr key={item.id}>
                      <td className="text-ink-soft">{formatDay(item.date)}</td>
                      <td className="font-medium">{item.description}{item.flock && <span className="block text-xs font-normal text-ink-faint">{item.flock.name}</span>}</td>
                      <td>{item.category}</td>
                      <td>{item.farm.name}</td>
                      <td>{formatGHS(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Add expense">
          <ActionForm action={addExpense} resetOnSuccess>
            <Field label="Description"><input className="input" name="description" required /></Field>
            <Field label="Amount (GH₵)"><input className="input" name="amount" inputMode="decimal" required /></Field>
            <Field label="Category">
              <select className="input" name="category">{EXPENSE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
            </Field>
            <Field label="Site">
              <select className="input" name="farmId">{farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select>
            </Field>
            <Field label="Flock (optional)">
              <select className="input" name="flockId">
                <option value="">Whole site</option>
                {flocks.map((flock) => <option key={flock.id} value={flock.id}>{flock.name}</option>)}
              </select>
            </Field>
            <Field label="Date"><input className="input" name="date" type="date" defaultValue={today()} required /></Field>
            <SubmitButton className="btn-primary w-full">Save expense</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
