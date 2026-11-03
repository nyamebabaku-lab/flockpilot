import { notFound } from "next/navigation";
import { addTreatment, closeFlock, recordMovement } from "@/app/actions/farm";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/action-form";
import { TrendChart } from "@/components/trend-chart";
import { Badge, Card, Empty, Field, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { farmIdsFor, requireUser } from "@/lib/auth";
import { BIRD_TYPES, EGGS_PER_CRATE } from "@/lib/constants";
import { formatDay, shortDay, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { ageInDays, feedConversion, formatCrates, henDayPercent, liveBirds, mortalityPercent } from "@/lib/metrics";
import { formatGHS } from "@/lib/money";
import { can } from "@/lib/permissions";

const CHICK_GRAMS = 40;

export default async function FlockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const flock = await db.flock.findUnique({
    where: { id },
    include: {
      house: { include: { farm: true } },
      eggs: { orderBy: { date: "asc" } },
      feed: { orderBy: { date: "asc" } },
      mortality: { orderBy: { date: "desc" } },
      weights: { orderBy: { date: "asc" } },
      movements: { orderBy: { date: "desc" } },
      doses: { orderBy: { dueDate: "asc" } },
      treatments: { orderBy: { date: "desc" } },
      expenses: true,
    },
  });
  if (!flock || !(await farmIdsFor(user)).includes(flock.house.farmId)) notFound();

  const day = flock.closedOn ?? today();
  const manage = can(user.role, "farm.manage") && flock.status === "ACTIVE";
  const deaths = flock.mortality.reduce((sum, item) => sum + item.count, 0);
  const live = liveBirds(flock.startCount, deaths, flock.movements);
  const layer = flock.birdType === "LAYER";
  const feedKg = flock.feed.reduce((sum, item) => sum + item.quantity, 0) / 1000;
  const feedCost = flock.feed.reduce((sum, item) => sum + Math.round((item.quantity / 1000) * item.unitCost), 0);
  const eggTotal = flock.eggs.reduce((sum, item) => sum + item.large + item.medium + item.small + item.broken, 0);
  const lastWeight = flock.weights.at(-1);
  const gainKg = lastWeight ? (lastWeight.averageGrams * live - CHICK_GRAMS * flock.startCount) / 1000 : 0;
  const fcr = feedConversion(feedKg, gainKg);
  const costPerCrate = layer && eggTotal ? Math.round((feedCost / eggTotal) * EGGS_PER_CRATE) : null;
  // Several collections can share a day, and today's is unfinished, so the chart adds up full days only.
  const eggsByDay = new Map<string, number>();
  for (const item of flock.eggs) {
    if (item.date < today()) eggsByDay.set(item.date, (eggsByDay.get(item.date) ?? 0) + item.large + item.medium + item.small + item.broken);
  }
  const eggPoints = [...eggsByDay].slice(-30).map(([date, value]) => ({ label: shortDay(date), value: henDayPercent(value, live) }));
  const weightPoints = flock.weights.map((item) => ({ label: shortDay(item.date), value: item.averageGrams }));

  const feedByDay = new Map<string, number>();
  for (const item of flock.feed) feedByDay.set(item.date, (feedByDay.get(item.date) ?? 0) + item.quantity / 1000);
  const feedPoints = [...feedByDay].slice(-30).map(([date, value]) => ({ label: shortDay(date), value }));

  return (
    <div className="space-y-5">
      <PageHeader
        title={flock.name}
        subtitle={`${BIRD_TYPES[flock.birdType]}${flock.breed ? `, ${flock.breed}` : ""} · ${flock.house.name}, ${flock.house.farm.name}`}
        action={<StatusBadge status={flock.status} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Live birds" value={live.toLocaleString()} hint={`Started with ${flock.startCount.toLocaleString()}`} />
        <Stat label="Age" value={`${ageInDays(flock.startDate, flock.ageAtStart, day)} days`} hint={`Started ${formatDay(flock.startDate)}`} />
        <Stat label="Mortality" value={`${mortalityPercent(deaths, flock.startCount).toFixed(1)}%`} hint={`${deaths} birds`} />
        {layer ? (
          <Stat label="Feed cost per crate" value={costPerCrate === null ? "–" : formatGHS(costPerCrate)} hint={`${formatCrates(eggTotal)} so far`} />
        ) : (
          <Stat label="Feed conversion" value={fcr ? fcr.toFixed(2) : "–"} hint="kg feed per kg gained" />
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {layer ? (
          <Card title="Hen-day rate">
            <TrendChart points={eggPoints} label="Hen-day percentage by day" unit="percent" />
          </Card>
        ) : (
          <Card title="Average weight">
            <TrendChart points={weightPoints} label="Average bird weight by sample date" unit="grams" />
          </Card>
        )}
        <Card title="Feed per day">
          <TrendChart kind="bar" points={feedPoints} label="Feed used per day in kilograms" unit="kg" />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Vaccinations">
          {flock.doses.length === 0 ? (
            <Empty>No vaccinations planned.</Empty>
          ) : (
            <ul className="space-y-2">
              {flock.doses.map((dose) => (
                <li key={dose.id} className="flex items-center justify-between gap-2 rounded-2xl bg-raised p-3 text-sm">
                  <span>
                    <span className="block font-medium">{dose.vaccine}</span>
                    <span className="text-xs text-ink-soft">{dose.route} · due {formatDay(dose.dueDate)}</span>
                  </span>
                  {dose.givenOn ? <Badge tone="good">Given</Badge> : dose.dueDate < today() ? <Badge tone="bad">Overdue</Badge> : <Badge>Planned</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Deaths">
          {flock.mortality.length === 0 ? (
            <Empty>No deaths recorded.</Empty>
          ) : (
            <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
              {flock.mortality.slice(0, 30).map((item) => (
                <li key={item.id} className="flex justify-between gap-3 border-b border-line/60 py-2">
                  <span>{formatDay(item.date)} · {item.cause}</span>
                  <span className="font-semibold">{item.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Treatments">
          {flock.treatments.length === 0 ? (
            <Empty>No treatments recorded.</Empty>
          ) : (
            <ul className="mb-4 space-y-1 text-sm">
              {flock.treatments.map((item) => (
                <li key={item.id} className="border-b border-line/60 py-2">
                  <span className="font-medium">{item.medicine}</span> · {item.reason} · {formatDay(item.date)}
                  {item.withdrawalDays > 0 && ` · ${item.withdrawalDays} day withdrawal`}
                </li>
              ))}
            </ul>
          )}
          {manage && (
            <ActionForm action={addTreatment.bind(null, flock.id)} resetOnSuccess className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Medicine"><input className="input" name="medicine" required /></Field>
                <Field label="Reason"><input className="input" name="reason" required /></Field>
                <Field label="Date"><input className="input" name="date" type="date" defaultValue={today()} required /></Field>
                <Field label="Withdrawal days"><input className="input" name="withdrawalDays" type="number" min="0" defaultValue="0" /></Field>
              </div>
              <SubmitButton className="btn-ghost w-full">Add treatment</SubmitButton>
            </ActionForm>
          )}
        </Card>

        <Card title="Bird movements">
          {flock.movements.length === 0 ? (
            <Empty>No sales, culls or transfers yet.</Empty>
          ) : (
            <ul className="mb-4 space-y-1 text-sm">
              {flock.movements.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 border-b border-line/60 py-2">
                  <span>{formatDay(item.date)} · {item.kind.replace("_", " ").toLowerCase()}</span>
                  <span className="font-semibold">{item.count}</span>
                </li>
              ))}
            </ul>
          )}
          {manage && (
            <>
              <ActionForm action={recordMovement.bind(null, flock.id)} resetOnSuccess className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type">
                    <select className="input" name="kind">
                      <option value="SALE">Sold</option>
                      <option value="CULL">Culled</option>
                      <option value="TRANSFER_OUT">Transferred out</option>
                      <option value="TRANSFER_IN">Transferred in</option>
                    </select>
                  </Field>
                  <Field label="Birds"><input className="input" name="count" type="number" min="1" required /></Field>
                  <Field label="Date"><input className="input" name="date" type="date" defaultValue={today()} required /></Field>
                  <Field label="Note"><input className="input" name="note" /></Field>
                </div>
                <SubmitButton className="btn-ghost w-full">Save movement</SubmitButton>
              </ActionForm>
              <ActionForm action={closeFlock.bind(null, flock.id)} className="mt-6 space-y-3 border-t border-line pt-4">
                <input type="hidden" name="closedOn" value={today()} />
                <Field label="Reason for closing"><input className="input" name="closeReason" placeholder="Sold out" /></Field>
                <ConfirmSubmit message="Close this flock? It will leave daily recording.">Close flock</ConfirmSubmit>
              </ActionForm>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
