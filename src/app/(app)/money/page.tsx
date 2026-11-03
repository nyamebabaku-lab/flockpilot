import { randomUUID } from "node:crypto";
import { addPayoutAccount, withdraw } from "@/app/actions/finance";
import { ActionForm, ConfirmSubmit } from "@/components/action-form";
import { TrendChart } from "@/components/trend-chart";
import { Badge, Card, Empty, Field, PageHeader, StatusBadge } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { MOMO_NETWORKS } from "@/lib/constants";
import { addDays, shortDay, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatGHS } from "@/lib/money";
import { getProvider } from "@/lib/payments";
import { walletBalance } from "@/lib/payments/service";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Money" };

export default async function MoneyPage() {
  const user = await requirePage("finance.view");
  const day = today();
  const [balance, settings, accounts, ledger, withdrawals, sales, usedToday] = await Promise.all([
    walletBalance(db),
    getSettings(),
    db.payoutAccount.findMany({ where: { userId: user.id } }),
    db.ledgerEntry.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    db.withdrawal.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { payoutAccount: true } }),
    db.payment.findMany({ where: { status: "SUCCESS", method: { not: "CASH" }, paidAt: { gte: new Date(addDays(day, -29)) } } }),
    db.withdrawal.aggregate({ where: { date: day, status: { not: "FAILED" } }, _sum: { amount: true } }),
  ]);
  const left = Math.max(0, settings.dailyWithdrawalLimit - (usedToday._sum.amount ?? 0));

  const byDay = new Map<string, number>();
  for (let back = 29; back >= 0; back--) byDay.set(addDays(day, -back), 0);
  for (const payment of sales) {
    const date = today(payment.paidAt!);
    byDay.set(date, (byDay.get(date) ?? 0) + payment.amount);
  }
  const points = [...byDay].map(([date, value]) => ({ label: shortDay(date), value }));

  return (
    <>
      <PageHeader title="Money" subtitle="Online payments, withdrawals and your wallet" />
      {getProvider().name === "simulator" && (
        <p className="mb-5 rounded-2xl bg-warn-soft px-4 py-3 text-sm font-medium text-warn">Demo mode: no real money moves. Add a Paystack test key to use Paystack test mode.</p>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="relative overflow-hidden rounded-4xl bg-[#0D5C45] p-6 text-white">
          <div aria-hidden className="absolute -bottom-24 -right-12 h-44 w-32 rotate-12 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-[#F5B301]" />
          <p className="relative text-white/80">Wallet balance</p>
          <p className="relative mt-1 font-display text-4xl font-bold tracking-tight">{formatGHS(balance)}</p>
          <p className="relative mt-3 max-w-[70%] text-sm text-white/80">{formatGHS(left)} left of today&apos;s withdrawal limit</p>
        </section>
        <Card title="Online sales received, last 30 days" className="lg:col-span-2">
          <TrendChart kind="bar" points={points} label="Online payments received per day" unit="money" />
        </Card>

        <Card title="Withdraw">
          {accounts.length === 0 ? <Empty>Add a payout account first.</Empty> : (
            <ActionForm action={withdraw} resetOnSuccess>
              <input type="hidden" name="key" value={randomUUID()} />
              <Field label="Send to">
                <select className="input" name="payoutAccountId">
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.provider} {account.accountNumber}</option>)}
                </select>
              </Field>
              <Field label="Amount (GH₵)"><input className="input" name="amount" inputMode="decimal" required /></Field>
              <Field label="Your password" hint="Needed for every withdrawal"><input className="input" name="password" type="password" autoComplete="current-password" required /></Field>
              <ConfirmSubmit className="btn-yolk w-full" message="Send this money now?">Withdraw</ConfirmSubmit>
            </ActionForm>
          )}
        </Card>

        <Card title="Recent withdrawals">
          {withdrawals.length === 0 ? <Empty>No withdrawals yet.</Empty> : (
            <ul className="text-sm">
              {withdrawals.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 border-b border-line/60 py-2">
                  <span>{formatGHS(item.amount)}<span className="block text-xs text-ink-faint">{item.payoutAccount.provider} · {shortDay(item.date)}</span></span>
                  <StatusBadge status={item.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Add payout account">
          <ActionForm action={addPayoutAccount} resetOnSuccess className="space-y-3">
            <Field label="Type">
              <select className="input" name="kind"><option value="MOMO">Mobile Money</option><option value="BANK">Bank account</option></select>
            </Field>
            <Field label="Network or bank code">
              <input className="input" name="provider" list="networks" required />
              <datalist id="networks">{Object.keys(MOMO_NETWORKS).map((key) => <option key={key} value={key} />)}</datalist>
            </Field>
            <Field label="Account name"><input className="input" name="accountName" required /></Field>
            <Field label="Account or phone number"><input className="input" name="accountNumber" required /></Field>
            <button className="btn-ghost w-full">Add account</button>
          </ActionForm>
        </Card>

        <Card title="Wallet history" className="lg:col-span-3">
          {ledger.length === 0 ? <Empty>No activity yet.</Empty> : (
            <ul className="text-sm">
              {ledger.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 border-b border-line/60 py-2">
                  <span className="min-w-0">{entry.memo}<span className="ml-2"><Badge>{entry.kind.replace("_", " ").toLowerCase()}</Badge></span></span>
                  <span className={`shrink-0 font-semibold ${entry.amount < 0 ? "text-bad" : "text-good"}`}>{formatGHS(entry.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
