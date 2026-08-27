/* Havasu Lake Weather — service worker (installability + offline shell) */
const CACHE = "havasu-wx-v39";  // bump on EVERY web/ change (cache correctness; CI-enforced)
const RELEASE = "r3";           // bump ONLY for user-facing changes — drives the "update available" toast
const SHELL = [
  "/", "/index.html", "/water.html", "/radar.html", "/manifest.json", "/sw-register.js",
  "/assets/icon-192.png", "/assets/icon-512.png", "/assets/icon-180.png",
  "/assets/venmo-qr.png", "/assets/cashapp-qr.png",
];

self.addEventListener("install", (e) => {
  // No skipWaiting() here — a new version parks in the "waiting" state so the page can
  // surface an "update available" toast (HLW-010) and activate it on the user's tap.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

// The page posts SKIP_WAITING when the user taps Refresh → activate this worker now.
self.addEventListener("message", (e) => {
  const data = e.data;
  if (data === "SKIP_WAITING" || (data && data.type === "SKIP_WAITING")) self.skipWaiting();
  // The page asks each worker for its RELEASE to decide whether to prompt (see sw-register.js).
  if (data && data.type === "GET_RELEASE" && e.ports && e.ports[0]) {
    e.ports[0].postMessage({ release: RELEASE });
  }
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin (Google Analytics, CDNs)
  if (url.pathname.startsWith("/api/")) return; // live data always goes to the network

  // Stale-while-revalidate for the app shell: instant load, refresh in the background.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return resp;
        })
        .catch(() => cached || caches.match("/index.html"));
      return cached || network;
    })
  );
});
