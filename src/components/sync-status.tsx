"use client";

import { CloudOff, CloudUpload, Check, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { flush, refreshBootstrap, watchQueue, type QueuedRecord } from "@/lib/offline";

const RETRY_MS = 30_000;

export function SyncStatus() {
  const [items, setItems] = useState<QueuedRecord[]>([]);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const reconnect = () => {
      update();
      void flush();
    };
    update();
    const stop = watchQueue(setItems);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", update);
    const timer = setInterval(() => void flush(), RETRY_MS);
    void flush();
    // Keeps recording data and screens ready on this device before the signal drops.
    if (navigator.onLine) {
      refreshBootstrap().catch(() => {});
      for (const page of ["/add", "/today", "/flocks", "/health"]) fetch(page).catch(() => {});
    }
    return () => {
      stop();
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", update);
      clearInterval(timer);
    };
  }, []);

  const rejected = items.filter((item) => item.rejected).length;
  const waiting = items.length - rejected;
  const base = "flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold";

  if (rejected > 0) {
    return (
      <Link href="/add" className={`${base} bg-bad-soft text-bad`}>
        <TriangleAlert size={15} aria-hidden /> {rejected} need attention
      </Link>
    );
  }
  if (!online) {
    return (
      <span className={`${base} bg-warn-soft text-warn`}>
        <CloudOff size={15} aria-hidden /> Offline{waiting ? `, ${waiting} waiting` : ""}
      </span>
    );
  }
  if (waiting > 0) {
    return (
      <span className={`${base} bg-warn-soft text-warn`}>
        <CloudUpload size={15} aria-hidden /> Sending {waiting}
      </span>
    );
  }
  return (
    <span className={`${base} text-ink-faint`}>
      <Check size={15} aria-hidden /> All saved
    </span>
  );
}
