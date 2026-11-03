import Link from "next/link";
import { addTemplate, removeTemplate } from "@/app/actions/farm";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Field, LinkButton, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { BIRD_TYPES } from "@/lib/constants";
import { addDays, formatDay, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { activeFarmIds } from "@/lib/site";

export const metadata = { title: "Health" };

export default async function HealthPage() {
  const user = await requireUser();
  const farmIds = await activeFarmIds(user);
  const day = today();
  const inSites = { flock: { house: { farmId: { in: farmIds } } } };
  const [doses, deaths, treatments, templates] = await Promise.all([
    db.vaccinationDose.findMany({ where: { givenOn: null, dueDate: { lte: addDays(day, 14) }, flock: { status: "ACTIVE", house: { farmId: { in: farmIds } } } }, include: { flock: true }, orderBy: { dueDate: "asc" } }),
    db.mortalityRecord.groupBy({ by: ["cause"], where: { date: { gte: addDays(day, -30) }, ...inSites }, _sum: { count: true }, orderBy: { _sum: { count: "desc" } } }),
    db.treatment.findMany({ where: inSites, include: { flock: true }, orderBy: { date: "desc" }, take: 10 }),
    db.vaccinationTemplate.findMany({ orderBy: [{ birdType: "asc" }, { dayOfAge: "asc" }] }),
  ]);
  const manage = can(user.role, "farm.manage");
  const totalDeaths = deaths.reduce((sum, item) => sum + (item._sum.count ?? 0), 0);

  return (
    <>
      <PageHeader title="Health" subtitle="Vaccinations, treatments and losses" action={<LinkButton href="/add?type=VACCINE">Record vaccination</LinkButton>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Vaccinations due in 14 days">
          {doses.length === 0 ? (
            <Empty>Nothing due.</Empty>
          ) : (
            <ul className="space-y-2">
              {doses.map((dose) => (
                <li key={dose.id}>
                  <Link href={`/flocks/${dose.flockId}`} className="flex items-center justify-between gap-2 rounded-2xl bg-raised p-3 text-sm">
                    <span>
                      <span className="block font-medium">{dose.vaccine}</span>
                      <span className="text-xs text-ink-soft">{dose.flock.name} · {dose.route} · {formatDay(dose.dueDate)}</span>
                    </span>
                    {dose.dueDate < day ? <Badge tone="bad">Overdue</Badge> : <Badge tone="warn">Due</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Causes of death, last 30 days">
          {deaths.length === 0 ? (
            <Empty>No deaths recorded.</Empty>
          ) : (
            <ul className="space-y-3 text-sm">
              {deaths.map((item) => {
                const count = item._sum.count ?? 0;
                return (
                  <li key={item.cause}>
                    <div className="mb-1 flex justify-between"><span>{item.cause}</span><span className="font-semibold">{count}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-brand" style={{ width: `${(count / totalDeaths) * 100}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Recent treatments">
          {treatments.length === 0 ? (
            <Empty>No treatments recorded.</Empty>
          ) : (
            <ul className="space-y-1 text-sm">
              {treatments.map((item) => (
                <li key={item.id} className="border-b border-line/60 py-2">
                  <span className="font-medium">{item.medicine}</span> · {item.flock.name} · {item.reason} · {formatDay(item.date)}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Vaccination schedule">
          <p className="-mt-2 mb-3 text-sm text-ink-soft">A starting template. Confirm it with your vet; changes apply to new flocks.</p>
          <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
            {templates.map((template) => (
              <li key={template.id} className="flex items-center justify-between gap-2 border-b border-line/60 py-2">
                <span>{BIRD_TYPES[template.birdType]} · day {template.dayOfAge} · {template.vaccine} · {template.route}</span>
                {manage && (
                  <form action={removeTemplate.bind(null, template.id)}>
                    <button className="text-xs font-semibold text-bad">Remove</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {manage && (
            <ActionForm action={addTemplate} resetOnSuccess className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bird type">
                  <select className="input" name="birdType">
                    {Object.entries(BIRD_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Age (days)"><input className="input" name="dayOfAge" type="number" min="0" required /></Field>
                <Field label="Vaccine"><input className="input" name="vaccine" required /></Field>
                <Field label="Route"><input className="input" name="route" required placeholder="Drinking water" /></Field>
              </div>
              <SubmitButton className="btn-ghost w-full">Add to schedule</SubmitButton>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
