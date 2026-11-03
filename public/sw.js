const VERSION = "flockpilot-v2";
const PAGE_TIMEOUT_MS = 4000;
// Financial screens are never stored on the device.
const PRIVATE = ["/money", "/payroll", "/reports", "/settings", "/sales", "/expenses", "/pay", "/o/", "/signin"];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function fromNetworkFirst(request) {
  const cache = await caches.open(VERSION);
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), PAGE_TIMEOUT_MS));
  try {
    const response = await Promise.race([fetch(request), timeout]);
    if (response.ok && !response.redirected) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) ?? (await cache.match("/add")) ?? new Response("You are offline.", { status: 503, headers: { "content-type": "text/plain" } });
  }
}

async function fromCacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.searchParams.has("_rsc") || request.headers.has("RSC")) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.endsWith(".png") || url.pathname.endsWith(".svg")) {
    event.respondWith(fromCacheFirst(request));
    return;
  }
  if (PRIVATE.some((path) => url.pathname.startsWith(path))) return;
  event.respondWith(fromNetworkFirst(request));
});
