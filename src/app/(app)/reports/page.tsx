import { Card, PageHeader, Stat } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { formatGHS } from "@/lib/money";
import { currentMonth, flockProfit, isMonth, monthlySummary } from "@/lib/reports";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePage("finance.view");
  const requested = (await searchParams).month ?? "";
  const month = isMonth(requested) ? requested : currentMonth();
  const [summary, flocks] = await Promise.all([monthlySummary(month), flockProfit()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle="Income is what was sold; feed counts when it is eaten."
        action={
          <form className="flex gap-2">
            <input className="input" name="month" type="month" defaultValue={month} aria-label="Month" />
            <button className="btn-ghost">View</button>
          </form>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Income" value={formatGHS(summary.income)} />
        <Stat label="Feed used" value={formatGHS(summary.feedCost)} />
        <Stat label="Expenses" value={formatGHS(summary.expenses)} />
        <Stat label="Wages" value={formatGHS(summary.wages)} hint="With employer SSNIT" />
        <Stat label="Profit" value={formatGHS(summary.profit)} />
      </div>
      <Card title="Profit by site" action={<a className="text-sm font-semibold text-brand" href={`/api/reports/summary?month=${month}`}>Download PDF</a>}>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Site</th><th>Income</th><th>Feed</th><th>Expenses</th><th>Profit before wages</th></tr></thead>
            <tbody>
              {summary.sites.map((site) => (
                <tr key={site.id}>
                  <td className="font-medium">{site.name}</td>
                  <td>{formatGHS(site.income)}</td>
                  <td>{formatGHS(site.feedCost)}</td>
                  <td>{formatGHS(site.expenses)}</td>
                  <td className="font-semibold">{formatGHS(site.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Profit by flock, all time">
        <p className="-mt-2 mb-3 text-sm text-ink-soft">Counts only sales linked to a flock, such as bird sales. Egg sales are per site.</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Flock</th><th>Linked sales</th><th>Feed</th><th>Birds and direct costs</th><th>Result</th></tr></thead>
            <tbody>
              {flocks.map((flock) => (
                <tr key={flock.id}>
                  <td className="font-medium">{flock.name}</td>
                  <td>{formatGHS(flock.income)}</td>
                  <td>{formatGHS(flock.feedCost)}</td>
                  <td>{formatGHS(flock.direct)}</td>
                  <td className="font-semibold">{formatGHS(flock.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Spreadsheet exports">
        <div className="flex flex-wrap gap-2">
          {[["sales", "Sales"], ["expenses", "Expenses"], ["eggs", "Egg records"], ["feed", "Feed records"]].map(([kind, label]) => (
            <a key={kind} className="btn-ghost" href={`/api/reports/${kind}?month=${month}`}>{label} CSV</a>
          ))}
        </div>
      </Card>
    </div>
  );
}
