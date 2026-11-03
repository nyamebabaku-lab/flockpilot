"use client";

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      return;
    }
    // Development files keep the same names, so a cached copy would go stale.
    navigator.serviceWorker.getRegistrations().then((all) => all.forEach((worker) => worker.unregister()));
    caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
  }, []);
  return null;
}
