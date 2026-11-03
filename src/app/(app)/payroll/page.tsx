import { approveRun, preparePayroll, retryWage } from "@/app/actions/finance";
import { addAdvance } from "@/app/actions/team";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/action-form";
import { Card, Empty, Field, PageHeader, StatusBadge } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatGHS } from "@/lib/money";
import { can } from "@/lib/permissions";
import { currentMonth } from "@/lib/reports";

export const metadata = { title: "Payroll" };

export default async function PayrollPage() {
  const user = await requirePage("payroll.prepare");
  const owner = can(user.role, "payroll.approve");
  const [runs, staff, advances] = await Promise.all([
    db.payrollRun.findMany({ include: { payslips: { include: { user: true }, orderBy: { net: "desc" } } }, orderBy: { period: "desc" }, take: 6 }),
    db.user.findMany({ where: { active: true, monthlyPay: { gt: 0 } }, orderBy: { name: "asc" } }),
    db.advance.findMany({ where: { payslipId: null }, include: { user: true }, orderBy: { date: "desc" } }),
  ]);

  return (
    <>
      <PageHeader title="Payroll" subtitle={owner ? "Review and approve wages" : "Prepare wages for the owner to approve"} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Prepare a month">
          <ActionForm action={preparePayroll}>
            <Field label="Month"><input className="input" name="period" type="month" defaultValue={currentMonth()} required /></Field>
            <SubmitButton className="btn-primary w-full">Calculate wages</SubmitButton>
          </ActionForm>
          <p className="mt-3 text-xs text-ink-faint">SSNIT and PAYE use the rates in Settings. Have an accountant confirm them before real payroll.</p>
        </Card>
        <Card title="Advances to recover">
          {advances.length > 0 && (
            <ul className="mb-4 text-sm">
              {advances.map((item) => (
                <li key={item.id} className="flex justify-between gap-2 border-b border-line/60 py-2">
                  <span>{item.user.name}{item.note && ` · ${item.note}`}</span><span className="font-semibold">{formatGHS(item.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={addAdvance} resetOnSuccess className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Worker">
                <select className="input" name="userId">{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
              </Field>
              <Field label="Amount (GH₵)"><input className="input" name="amount" inputMode="decimal" required /></Field>
            </div>
            <SubmitButton className="btn-ghost w-full">Record advance</SubmitButton>
          </ActionForm>
        </Card>

        {runs.length === 0 && <div className="lg:col-span-2"><Empty>No payroll prepared yet.</Empty></div>}
        {runs.map((run) => {
          const total = run.payslips.reduce((sum, slip) => sum + slip.net, 0);
          return (
            <Card key={run.id} title={run.period} action={<StatusBadge status={run.status} />} className="lg:col-span-2">
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Worker</th><th>Gross</th><th>SSNIT</th><th>PAYE</th><th>Advances</th><th>Take-home</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {run.payslips.map((slip) => (
                      <tr key={slip.id}>
                        <td className="font-medium">{slip.user.name}</td>
                        <td>{formatGHS(slip.gross)}</td>
                        <td>{formatGHS(slip.ssnit)}</td>
                        <td>{formatGHS(slip.paye)}</td>
                        <td>{formatGHS(slip.advances)}</td>
                        <td className="font-semibold">{formatGHS(slip.net)}</td>
                        <td>
                          <StatusBadge status={slip.status} />
                          {slip.failureReason && <span className="block text-xs text-bad">{slip.failureReason}</span>}
                        </td>
                        <td className="whitespace-nowrap">
                          <a className="text-sm font-semibold text-brand" href={`/api/payslips/${slip.id}`}>Payslip</a>
                          {owner && slip.status === "FAILED" && (
                            <form action={async () => { await retryWage(slip.id); }} className="mt-1"><button className="text-sm font-semibold text-bad">Send again</button></form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-between font-display text-lg font-bold"><span>Total take-home</span><span>{formatGHS(total)}</span></div>
              {owner && run.status === "DRAFT" && (
                <ActionForm action={approveRun.bind(null, run.id)} className="mt-4 max-w-md space-y-3">
                  <Field label="Your password" hint="Approving sends these wages immediately"><input className="input" name="password" type="password" autoComplete="current-password" required /></Field>
                  <ConfirmSubmit className="btn-yolk w-full" message={`Send ${formatGHS(total)} in wages now?`}>Approve and pay</ConfirmSubmit>
                </ActionForm>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
