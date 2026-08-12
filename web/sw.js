/* Havasu Lake Weather — service worker (installability + offline shell) */
const CACHE = "havasu-wx-v10";
const SHELL = [
  "/", "/index.html", "/manifest.json",
  "/assets/icon-192.png", "/assets/icon-512.png", "/assets/icon-180.png",
  "/assets/venmo-qr.png", "/assets/cashapp-qr.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
