"use client";

import { Check, CheckSquare, Egg, Scale, Skull, Syringe, Trash2, Wheat, type LucideIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Empty, Field } from "@/components/ui";
import { MORTALITY_CAUSES } from "@/lib/constants";
import { today } from "@/lib/dates";
import { cachedBootstrap, discard, enqueue, refreshBootstrap, watchQueue, type QueuedRecord } from "@/lib/offline";
import type { Bootstrap } from "@/lib/queries";
import type { RecordType } from "@/lib/records";

const TABS: { type: RecordType; label: string; icon: LucideIcon }[] = [
  { type: "EGGS", label: "Eggs", icon: Egg },
  { type: "FEED", label: "Feed", icon: Wheat },
  { type: "DEATHS", label: "Deaths", icon: Skull },
  { type: "WEIGHT", label: "Weight", icon: Scale },
  { type: "VACCINE", label: "Vaccine", icon: Syringe },
  { type: "TASK", label: "Task", icon: CheckSquare },
];

function Number_({ name, label, min = 0, step, required }: { name: string; label: string; min?: number; step?: string; required?: boolean }) {
  return (
    <Field label={label}>
      <input className="input" name={name} type="number" inputMode={step ? "decimal" : "numeric"} min={min} step={step ?? "1"} required={required} placeholder="0" />
    </Field>
  );
}

export function AddRecord() {
  const params = useSearchParams();
  const [type, setType] = useState<RecordType>(() => {
    const wanted = params.get("type");
    return TABS.find((tab) => tab.type === wanted)?.type ?? "EGGS";
  });
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [queue, setQueue] = useState<QueuedRecord[]>([]);
  const [saved, setSaved] = useState("");
  const [flockId, setFlockId] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      const cached = await cachedBootstrap();
      if (live && cached) setData(cached);
      try {
        const fresh = await refreshBootstrap();
        if (live) setData(fresh);
      } catch {
        // No signal: keep working from what is on the device.
      }
      if (live) setLoaded(true);
    })();
    const stop = watchQueue(setQueue);
    return () => {
      live = false;
      stop();
    };
  }, []);

  const flocks = useMemo(() => {
    const all = data?.flocks ?? [];
    return type === "EGGS" ? all.filter((flock) => flock.birdType === "LAYER") : all;
  }, [data, type]);
  const flock = flocks.find((item) => item.id === flockId) ?? flocks[0];
  const feeds = (data?.feeds ?? []).filter((feed) => feed.farmId === flock?.farmId);
  const rejected = queue.filter((item) => item.rejected);
  const needsFlock = type !== "VACCINE" && type !== "TASK";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const name = flock?.name ?? "";
    const summaries: Record<RecordType, () => string> = {
      EGGS: () => `${Number(values.large || 0) + Number(values.medium || 0) + Number(values.small || 0) + Number(values.broken || 0)} eggs, ${name}`,
      FEED: () => `${values.quantityKg} kg feed, ${name}`,
      DEATHS: () => `${values.count} deaths, ${name}`,
      WEIGHT: () => `Average ${values.averageGrams} g, ${name}`,
      VACCINE: () => `Vaccination, ${data?.doses.find((dose) => dose.id === values.doseId)?.vaccine ?? ""}`,
      TASK: () => `Task done, ${data?.tasks.find((task) => task.id === values.taskId)?.title ?? ""}`,
    };
    const summary = summaries[type]();
    const sent = await enqueue(type, { ...values, flockId: flock?.id }, summary);

    // Done items leave the lists straight away, even with no signal.
    if (type === "VACCINE" || type === "TASK") {
      setData((current) =>
        current && {
          ...current,
          doses: current.doses.filter((dose) => dose.id !== values.doseId),
          tasks: current.tasks.filter((task) => task.id !== values.taskId),
        },
      );
    }
    form.reset();
    setSaved(sent ? `Saved: ${summary}` : `Kept on this device: ${summary}. It will send when the signal returns.`);
  }

  return (
    <div className="space-y-5">
      <div className="-mx-1 grid grid-cols-3 gap-2 sm:grid-cols-6" role="tablist" aria-label="Record type">
        {TABS.map(({ type: tab, label, icon: Icon }) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={type === tab}
            onClick={() => {
              setType(tab);
              setSaved("");
            }}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border text-xs font-semibold ${type === tab ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-ink-soft"}`}
          >
            <Icon size={20} aria-hidden /> {label}
          </button>
        ))}
      </div>

      <form key={type} onSubmit={submit} className="card space-y-4">
        {needsFlock && (
          <Field label="Flock">
            <select className="input" name="pickedFlock" value={flock?.id ?? ""} onChange={(event) => setFlockId(event.target.value)} required>
              {flocks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.houseName}, {item.farmName}
                </option>
              ))}
            </select>
          </Field>
        )}

        {type === "EGGS" && (
          <div className="grid grid-cols-2 gap-3">
            <Number_ name="large" label="Large" />
            <Number_ name="medium" label="Medium" />
            <Number_ name="small" label="Small" />
            <Number_ name="broken" label="Broken" />
          </div>
        )}

        {type === "FEED" && (
          <>
            <Field label="Feed">
              <select className="input" name="itemId" required>
                {feeds.map((feed) => (
                  <option key={feed.id} value={feed.id}>
                    {feed.name}
                  </option>
                ))}
              </select>
            </Field>
            <Number_ name="quantityKg" label="Quantity (kg)" step="0.1" required />
          </>
        )}

        {type === "DEATHS" && (
          <>
            <Number_ name="count" label="Number of birds" min={1} required />
            <Field label="Cause">
              <select className="input" name="cause">
                {MORTALITY_CAUSES.map((cause) => (
                  <option key={cause}>{cause}</option>
                ))}
              </select>
            </Field>
            <Field label="Note (optional)">
              <input className="input" name="note" />
            </Field>
          </>
        )}

        {type === "WEIGHT" && (
          <div className="grid grid-cols-2 gap-3">
            <Number_ name="sampleSize" label="Birds weighed" min={1} required />
            <Number_ name="averageGrams" label="Average weight (g)" min={1} required />
            <Number_ name="uniformityPct" label="Uniformity % (optional)" />
          </div>
        )}

        {type === "VACCINE" &&
          (data?.doses.length ? (
            <>
              <Field label="Vaccination given">
                <select className="input" name="doseId" required>
                  {data.doses.map((dose) => (
                    <option key={dose.id} value={dose.id}>
                      {dose.vaccine} · {dose.flockName} · due {dose.dueDate}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Vaccine batch number (optional)">
                <input className="input" name="batchNo" />
              </Field>
            </>
          ) : (
            <Empty>No vaccinations are waiting.</Empty>
          ))}

        {type === "TASK" &&
          (data?.tasks.length ? (
            <Field label="Task finished">
              <select className="input" name="taskId" required>
                {data.tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title} · due {task.dueDate}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Empty>No open tasks.</Empty>
          ))}

        <Field label="Date">
          <input className="input" name="date" type="date" defaultValue={today()} max={today()} required />
        </Field>

        {!data && loaded && <p className="rounded-2xl bg-warn-soft px-4 py-2.5 text-sm text-warn">Connect once to load your flocks onto this device.</p>}

        <button type="submit" className="btn-yolk w-full" disabled={!data || (needsFlock && !flock)}>
          <Check size={18} /> Save record
        </button>
        {saved && (
          <p role="status" className="rounded-2xl bg-good-soft px-4 py-2.5 text-sm font-medium text-good">
            {saved}
          </p>
        )}
      </form>

      {rejected.length > 0 && (
        <section className="card">
          <h2 className="mb-3 font-display text-lg font-semibold">Not accepted</h2>
          <ul className="space-y-2">
            {rejected.map((item) => (
              <li key={item.clientId} className="flex items-start justify-between gap-3 rounded-2xl bg-bad-soft p-3 text-sm">
                <span>
                  <span className="block font-semibold text-bad">{item.summary}</span>
                  <span className="text-ink-soft">{item.rejected}</span>
                </span>
                <button type="button" aria-label={`Remove ${item.summary}`} onClick={() => discard(item.clientId)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-bad">
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
