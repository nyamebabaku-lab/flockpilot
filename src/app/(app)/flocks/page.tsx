import { Plus } from "lucide-react";
import Link from "next/link";
import { Badge, Empty, LinkButton, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { BIRD_TYPES } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { flockSummaries } from "@/lib/queries";
import { activeFarmIds } from "@/lib/site";

export const metadata = { title: "Flocks" };

export default async function FlocksPage() {
  const user = await requireUser();
  const farmIds = await activeFarmIds(user);
  const [active, closed] = await Promise.all([flockSummaries(farmIds), flockSummaries(farmIds, "CLOSED")]);

  return (
    <>
      <PageHeader
        title="Flocks"
        subtitle={`${active.length} active across your sites`}
        action={can(user.role, "farm.manage") ? <LinkButton href="/flocks/new"><Plus size={18} /> New flock</LinkButton> : undefined}
      />
      {active.length === 0 && <Empty>No active flocks yet.</Empty>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {active.map((flock) => (
          <Link key={flock.id} href={`/flocks/${flock.id}`} className="card block transition hover:-translate-y-0.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg font-semibold">{flock.name}</h2>
                <p className="truncate text-sm text-ink-soft">{flock.houseName}, {flock.farmName}</p>
              </div>
              <Badge>{BIRD_TYPES[flock.birdType]}</Badge>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-ink-faint">Live</dt>
                <dd className="font-display text-xl font-bold">{flock.live.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-ink-faint">Age</dt>
                <dd className="font-display text-xl font-bold">{flock.ageDays}d</dd>
              </div>
              <div>
                <dt className="text-ink-faint">{flock.birdType === "LAYER" ? "Hen-day" : "Weight"}</dt>
                <dd className="font-display text-xl font-bold">
                  {flock.birdType === "LAYER" ? `${flock.henDay.toFixed(0)}%` : flock.lastWeightGrams ? `${(flock.lastWeightGrams / 1000).toFixed(2)}kg` : "–"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink-faint">Mortality {flock.mortality.toFixed(1)}%</p>
          </Link>
        ))}
      </div>
      {closed.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold">Closed flocks</h2>
          <ul className="space-y-2">
            {closed.map((flock) => (
              <li key={flock.id}>
                <Link href={`/flocks/${flock.id}`} className="block rounded-2xl bg-surface px-4 py-3 text-sm">
                  {flock.name} · {flock.farmName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
