import { Bird, CircleAlert, Egg, Feather, Scale, Skull, Syringe, Wheat } from "lucide-react";
import Link from "next/link";
import { TrendChart } from "@/components/trend-chart";
import { Badge, Card, Empty, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { addDays, shortDay, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatCrates, henDayPercent } from "@/lib/metrics";
import { alertsFor, flockSummaries } from "@/lib/queries";
import { activeFarmIds } from "@/lib/site";

export const metadata = { title: "Today" };

const QUICK = [
  { type: "EGGS", label: "Eggs", icon: Egg },
  { type: "FEED", label: "Feed", icon: Wheat },
  { type: "DEATHS", label: "Deaths", icon: Skull },
  { type: "WEIGHT", label: "Weight", icon: Scale },
  { type: "VACCINE", label: "Vaccine", icon: Syringe },
];

function greeting(hour: number) {
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function TodayPage() {
  const user = await requireUser();
  const farmIds = await activeFarmIds(user);
  const day = today();
  const [flocks, alerts, tasks, eggRows, feedToday] = await Promise.all([
    flockSummaries(farmIds),
    alertsFor(farmIds),
    db.task.findMany({
      where: { status: "OPEN", farmId: { in: farmIds }, dueDate: { lte: day }, ...(user.role === "WORKER" ? { OR: [{ assigneeId: user.id }, { assigneeId: null }] } : {}) },
      include: { assignee: true },
      orderBy: { dueDate: "asc" },
    }),
    db.eggRecord.findMany({ where: { date: { gte: addDays(day, -29) }, flock: { house: { farmId: { in: farmIds } } } } }),
    db.feedRecord.aggregate({ where: { date: day, flock: { house: { farmId: { in: farmIds } } } }, _sum: { quantity: true } }),
  ]);

  const live = flocks.reduce((sum, flock) => sum + flock.live, 0);
  const hens = flocks.filter((flock) => flock.birdType === "LAYER").reduce((sum, flock) => sum + flock.live, 0);
  const eggsToday = flocks.reduce((sum, flock) => sum + flock.eggsToday, 0);

  const byDay = new Map<string, number>();
  for (let back = 29; back >= 0; back--) byDay.set(addDays(day, -back), 0);
  for (const row of eggRows) byDay.set(row.date, (byDay.get(row.date) ?? 0) + row.large + row.medium + row.small + row.broken);
  // Today's collection is still in progress, so charts and rates use finished days only.
  const points = [...byDay].filter(([date]) => date !== day).map(([date, value]) => ({ label: shortDay(date), value }));
  const yesterdayEggs = byDay.get(addDays(day, -1)) ?? 0;

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-4xl bg-[#0D5C45] p-6 text-white md:p-8">
        <div aria-hidden className="absolute -right-14 -top-20 h-40 w-32 rotate-12 md:-right-10 md:-top-16 md:h-56 md:w-44 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-[#F5B301]" />
        <p className="relative text-white/80">{greeting(new Date().getUTCHours())}, {user.name.split(" ")[0]}</p>
        <h1 className="relative mt-1 max-w-[82%] font-display text-3xl font-bold tracking-tight md:text-4xl">
          {eggsToday ? `${formatCrates(eggsToday)} collected today` : `${live.toLocaleString()} birds in your care`}
        </h1>
        <div className="relative mt-5 grid grid-cols-5 gap-2 md:max-w-lg">
          {QUICK.map(({ type, label, icon: Icon }) => (
            <Link key={type} href={`/add?type=${type}`} className="flex flex-col items-center gap-1 rounded-2xl bg-white/15 py-3 text-xs font-medium backdrop-blur hover:bg-white/25">
              <Icon size={21} aria-hidden /> {label}
            </Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Live birds" value={live.toLocaleString()} hint={`${flocks.length} active flocks`} icon={Bird} />
        <Stat label="Eggs today" value={eggsToday.toLocaleString()} hint={eggsToday ? formatCrates(eggsToday) : "None recorded yet"} icon={Egg} />
        <Stat label="Hen-day rate" value={`${henDayPercent(yesterdayEggs, hens).toFixed(1)}%`} hint="Yesterday, the last full day" icon={Feather} />
        <Stat label="Feed today" value={`${((feedToday._sum.quantity ?? 0) / 1000).toLocaleString()} kg`} hint="Recorded so far" icon={Wheat} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Eggs, last 30 days" className="lg:col-span-2">
          <TrendChart points={points} label="Eggs collected per day over the last 30 days" />
        </Card>
        <div className="space-y-5">
          <Card title="Needs attention">
            {alerts.length === 0 ? (
              <Empty>Nothing needs attention.</Empty>
            ) : (
              <ul className="space-y-2">
                {alerts.slice(0, 6).map((alert, index) => (
                  <li key={index}>
                    <Link href={alert.href} className="flex items-start gap-3 rounded-2xl bg-raised p-3 hover:bg-brand-soft">
                      <CircleAlert size={18} className={`mt-0.5 shrink-0 ${alert.tone === "bad" ? "text-bad" : "text-warn"}`} aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{alert.title}</span>
                        <span className="block truncate text-xs text-ink-soft">{alert.detail}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Tasks">
            {tasks.length === 0 ? (
              <Empty>No tasks due.</Empty>
            ) : (
              <ul className="space-y-2">
                {tasks.map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-2 rounded-2xl bg-raised p-3 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium">{task.title}</span>
                      {task.assignee && <span className="text-xs text-ink-soft">{task.assignee.name}</span>}
                    </span>
                    {task.dueDate < day ? <Badge tone="bad">Late</Badge> : <Link href="/add?type=TASK" className="text-sm font-semibold text-brand">Done?</Link>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
