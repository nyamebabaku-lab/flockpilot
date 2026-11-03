"use client";

import Dexie, { liveQuery, type Table } from "dexie";
import type { Bootstrap } from "./queries";
import type { RecordType, SyncResult } from "./records";

export type QueuedRecord = {
  clientId: string;
  type: RecordType;
  payload: Record<string, unknown>;
  summary: string;
  createdAt: number;
  rejected?: string;
};

class DeviceStore extends Dexie {
  queue!: Table<QueuedRecord, string>;
  cache!: Table<{ key: string; value: Bootstrap }, string>;

  constructor() {
    super("flockpilot");
    this.version(1).stores({ queue: "clientId, createdAt", cache: "key" });
  }
}

const store = new DeviceStore();
const BOOTSTRAP = "bootstrap";
const BATCH = 25;
let flushing = false;

export function watchQueue(listener: (items: QueuedRecord[]) => void) {
  const subscription = liveQuery(() => store.queue.orderBy("createdAt").toArray()).subscribe({ next: listener });
  return () => subscription.unsubscribe();
}

export async function cachedBootstrap() {
  return (await store.cache.get(BOOTSTRAP))?.value ?? null;
}

export async function refreshBootstrap() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load farm data");
  const value = (await response.json()) as Bootstrap;
  const previous = await cachedBootstrap();
  // A shared phone must not send one person's waiting records under the next person's name.
  if (previous && previous.userId !== value.userId) await store.queue.clear();
  await store.cache.put({ key: BOOTSTRAP, value });
  return value;
}

/** Returns true only once the server has the record. A phone can report a connection that carries no data. */
export async function enqueue(type: RecordType, payload: Record<string, unknown>, summary: string) {
  const clientId = crypto.randomUUID();
  await store.queue.add({ clientId, type, payload, summary, createdAt: Date.now() });
  await flush();
  return !(await store.queue.get(clientId));
}

export async function discard(clientId: string) {
  await store.queue.delete(clientId);
}

/** Sends waiting records. Anything not acknowledged stays on the device for the next try. */
export async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    for (;;) {
      const waiting = (await store.queue.orderBy("createdAt").toArray()).filter((item) => !item.rejected).slice(0, BATCH);
      if (waiting.length === 0) return;
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: waiting.map(({ clientId, type, payload }) => ({ clientId, type, payload })) }),
      });
      if (!response.ok) return;
      const { results } = (await response.json()) as { results: SyncResult[] };
      for (const result of results) {
        if (result.status === "saved") await store.queue.delete(result.clientId);
        else await store.queue.update(result.clientId, { rejected: result.reason ?? "Not accepted" });
      }
    }
  } catch {
    // No signal. The records stay queued.
  } finally {
    flushing = false;
  }
}

export async function clearDevice() {
  await flush();
  await Promise.all([store.queue.clear(), store.cache.clear()]);
  if ("caches" in window) for (const key of await caches.keys()) await caches.delete(key);
}
