/* Service worker — makes the app shell available offline after the first visit.
 *
 * - App pages (HTML): network-first, falling back to the cached copy offline.
 *   Every page fetched also caches the JS/CSS chunks it references, so a
 *   cached page can actually boot without a network.
 * - /_next/static/*: cache-first (file names are content-hashed).
 * - API calls, Supabase and other origins: never cached here. Offline data
 *   lives in IndexedDB and is synchronised by the app itself.
 */
const CACHE = "ft-shell-v8";
const ROUTES = [
  "/", "/login", "/quick", "/trips", "/trip", "/trip/edit", "/catch", "/catch/edit", "/collection", "/species",
  "/calendar", "/stats", "/records", "/achievements", "/equipment", "/spots", "/search", "/gallery", "/report",
  "/settings", "/account", "/community", "/best-times", "/more", "/marine", "/catches", "/reports", "/spot", "/analytics", "/account", "/marks", "/map",
];
const EXTRA = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/apple-touch-icon.png", "/icons/sajji-mark.svg"];

async function cacheAssetsFromHtml(cache, html) {
  const urls = new Set();
  const re = /(?:src|href)="(\/_next\/static\/[^"?#]+)"/g;
  let m;
  while ((m = re.exec(html))) urls.add(m[1]);
  // chunks referenced from inline flight data
  const re2 = /"(\/_next\/static\/[^"\\]+\.(?:js|css|woff2))"/g;
  while ((m = re2.exec(html))) urls.add(m[1]);
  const re3 = /\\"(\/_next\/static\/[^"\\]+\.(?:js|css|woff2))\\"/g;
  while ((m = re3.exec(html))) urls.add(m[1]);
  await Promise.all(
    [...urls].map(async (u) => {
      if (await cache.match(u)) return;
      try {
        const r = await fetch(u);
        if (r.ok) await cache.put(u, r);
      } catch {}
    }),
  );
}

async function warm() {
  const cache = await caches.open(CACHE);
  await Promise.all(
    EXTRA.map(async (u) => {
      try {
        const r = await fetch(u);
        if (r.ok) await cache.put(u, r);
      } catch {}
    }),
  );
  for (const route of ROUTES) {
    try {
      const r = await fetch(route, { credentials: "same-origin" });
      if (!r.ok) continue;
      const html = await r.clone().text();
      await cache.put(route, r);
      await cacheAssetsFromHtml(cache, html);
    } catch {}
  }
}

self.addEventListener("install", (e) => {
  e.waitUntil(warm().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "warm") e.waitUntil(warm());
});

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(url.pathname);
        if (hit) return hit;
        const r = await fetch(req);
        if (r.ok) cache.put(url.pathname, r.clone());
        return r;
      }),
    );
    return;
  }

  const isRsc = req.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  if (isRsc) {
    // Client-side navigation payloads: network only. If offline, the router
    // falls back to a full page load, which is then served from the cache below.
    return;
  }

  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const r = await withTimeout(fetch(req), 6000);
          if (r.ok && ROUTES.includes(url.pathname)) {
            const copy = r.clone();
            e.waitUntil(
              copy.text().then(async (html) => {
                await cache.put(url.pathname, new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
                await cacheAssetsFromHtml(cache, html);
              }),
            );
          }
          return r;
        } catch {
          const hit = (await cache.match(url.pathname)) || (await cache.match("/"));
          return (
            hit ||
            new Response("<h1 style='font-family:sans-serif'>Offline</h1>", { status: 503, headers: { "Content-Type": "text/html" } })
          );
        }
      })(),
    );
    return;
  }

  // Other same-origin assets (icons, manifest): stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const net = fetch(req)
        .then((r) => {
          if (r.ok) cache.put(req, r.clone());
          return r;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});

// ---- Push: "the water has stopped" alerts ----------------------------------
self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: "سجي", body: e.data ? e.data.text() : "" };
  }
  // let open windows know too (handy for in-app messages and for testing)
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => list.forEach((c) => c.postMessage({ type: "ft-push", title: d.title, body: d.body }))));
  e.waitUntil(
    self.registration.showNotification(d.title || "سجي", {
      body: d.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: d.tag || "ft-waqfa",
      dir: "rtl",
      lang: "ar",
      data: { url: d.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
