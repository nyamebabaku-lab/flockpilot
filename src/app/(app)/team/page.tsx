import { createTask, createUser, markAttendance, setUserActive } from "@/app/actions/team";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Field, PageHeader, StatusBadge } from "@/components/ui";
import { farmIdsFor, requireUser } from "@/lib/auth";
import { MOMO_NETWORKS, ROLES } from "@/lib/constants";
import { formatDay, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { activeFarmIds } from "@/lib/site";

export const metadata = { title: "Team" };

const STATUSES = ["PRESENT", "ABSENT", "LEAVE"];

export default async function TeamPage() {
  const user = await requireUser();
  const day = today();
  const manage = can(user.role, "team.manage");
  const owner = can(user.role, "users.manage");
  const farmIds = await activeFarmIds(user);
  const allFarms = await db.farm.findMany({ where: { id: { in: await farmIdsFor(user) } }, orderBy: { name: "asc" } });
  const [slips, people, tasks] = await Promise.all([
    db.payslip.findMany({ where: { userId: user.id, run: { status: { not: "DRAFT" } } }, include: { run: true }, orderBy: { run: { period: "desc" } }, take: 12 }),
    db.user.findMany({
      where: user.role === "WORKER" ? { id: user.id } : { role: { not: "OWNER" } },
      include: { sites: { include: { farm: true } }, attendance: { where: { date: day } } },
      orderBy: { name: "asc" },
    }),
    db.task.findMany({
      where: { farmId: { in: farmIds }, ...(user.role === "WORKER" ? { assigneeId: user.id } : {}) },
      include: { assignee: true, farm: true },
      orderBy: [{ status: "desc" }, { dueDate: "asc" }],
      take: 30,
    }),
  ]);

  return (
    <>
      <PageHeader title="Team" subtitle="People, attendance and tasks" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Today's attendance">
          {people.length === 0 ? <Empty>No staff yet.</Empty> : (
            <ul className="space-y-2">
              {people.map((person) => {
                const status = person.attendance[0]?.status;
                return (
                  <li key={person.id} className="rounded-2xl bg-raised p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{person.name} {!person.active && <Badge tone="bad">Disabled</Badge>}</p>
                        <p className="truncate text-xs text-ink-soft">{person.jobTitle ?? ROLES[person.role]} · {person.sites.map((site) => site.farm.name).join(", ") || "No site"}</p>
                      </div>
                      {status && <StatusBadge status={status} />}
                    </div>
                    {manage && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {STATUSES.map((option) => (
                          <form key={option} action={markAttendance.bind(null, person.id, option)}>
                            <button aria-pressed={status === option} className={`min-h-9 rounded-xl border px-3 text-xs font-semibold ${status === option ? "border-brand bg-brand-soft text-brand" : "border-line text-ink-soft"}`}>
                              {option.charAt(0) + option.slice(1).toLowerCase()}
                            </button>
                          </form>
                        ))}
                        {owner && (
                          <form action={setUserActive.bind(null, person.id, !person.active)}>
                            <button className="min-h-9 rounded-xl px-3 text-xs font-semibold text-ink-faint">{person.active ? "Disable login" : "Enable login"}</button>
                          </form>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Tasks">
          {tasks.length === 0 ? <Empty>No tasks.</Empty> : (
            <ul className="space-y-1 text-sm">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-2 border-b border-line/60 py-2">
                  <span className="min-w-0">
                    <span className="block font-medium">{task.title}</span>
                    <span className="text-xs text-ink-soft">{task.assignee?.name ?? "Anyone"} · {task.farm.name} · {formatDay(task.dueDate)}</span>
                  </span>
                  <StatusBadge status={task.status} />
                </li>
              ))}
            </ul>
          )}
          {manage && (
            <ActionForm action={createTask} resetOnSuccess className="mt-4 space-y-3">
              <Field label="New task"><input className="input" name="title" required /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Site">
                  <select className="input" name="farmId">
                    {allFarms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
                  </select>
                </Field>
                <Field label="Assign to">
                  <select className="input" name="assigneeId">
                    <option value="">Anyone</option>
                    {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Due date"><input className="input" name="dueDate" type="date" defaultValue={day} required /></Field>
              <SubmitButton className="btn-ghost w-full">Add task</SubmitButton>
            </ActionForm>
          )}
        </Card>

        {slips.length > 0 && (
          <Card title="My payslips">
            <ul className="text-sm">
              {slips.map((slip) => (
                <li key={slip.id} className="flex justify-between gap-2 border-b border-line/60 py-2">
                  <span>{slip.run.period}</span>
                  <a className="font-semibold text-brand" href={`/api/payslips/${slip.id}`}>Download</a>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {owner && (
          <Card title="Add a team member" className="lg:col-span-2">
            <ActionForm action={createUser} resetOnSuccess>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Full name"><input className="input" name="name" required /></Field>
                <Field label="Phone number"><input className="input" name="phone" type="tel" required /></Field>
                <Field label="Role">
                  <select className="input" name="role" defaultValue="WORKER">
                    <option value="WORKER">Worker</option>
                    <option value="MANAGER">Manager</option>
                  </select>
                </Field>
                <Field label="Job title"><input className="input" name="jobTitle" /></Field>
                <Field label="Monthly pay (GH₵)"><input className="input" name="monthlyPay" inputMode="decimal" /></Field>
                <Field label="First password" hint="At least 8 characters"><input className="input" name="password" type="text" autoComplete="off" required /></Field>
                <Field label="Mobile Money network">
                  <select className="input" name="momoNetwork">
                    {Object.entries(MOMO_NETWORKS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Mobile Money number"><input className="input" name="momoNumber" type="tel" /></Field>
              </div>
              <fieldset>
                <legend className="label">Sites</legend>
                <div className="flex flex-wrap gap-3">
                  {allFarms.map((farm) => (
                    <label key={farm.id} className="flex min-h-11 items-center gap-2 rounded-xl bg-raised px-3 text-sm">
                      <input type="checkbox" name="farmIds" value={farm.id} /> {farm.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <SubmitButton className="btn-primary">Add team member</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
