/* Havasu Lake Weather — service-worker registration + "update available" toast (HLW-010).
 * Included by index.html and water.html. Registers /sw.js; when a new SW version is waiting,
 * shows a persistent, tappable toast. Tapping activates the waiting worker and reloads once
 * (guarded against reload loops). Self-contained: builds its own toast DOM + styles, so it
 * behaves identically on every page without per-page markup. */
(function () {
  if (!("serviceWorker" in navigator)) return;

  // Dev: never keep a service worker on localhost — it caches the app shell and forces
  // a fresh port between edits (the cache is scoped to scheme+host+port). Unregister any
  // leftover worker + clear its caches, then bail. Production (havasulakeweather.com)
  // registers as normal, so this is a no-op there.
  var host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }).catch(function () {});
    if (window.caches && caches.keys) caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); }).catch(function () {});
    return;
  }

  var refreshing = false;
  var userInitiatedReload = false; // only reload the page for a user-tapped update, not silent ones
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (refreshing || !userInitiatedReload) return; // silent background activation → don't reload
    refreshing = true;
    window.location.reload();
  });

  // Ask a worker for its RELEASE marker (MessageChannel round-trip). Resolves null when the
  // worker is absent or too old to answer (the pre-HLW-042 worker) — treated as "unknown".
  function getRelease(worker) {
    return new Promise(function (resolve) {
      if (!worker) return resolve(null);
      var ch = new MessageChannel();
      var done = false;
      ch.port1.onmessage = function (e) {
        if (done) return; done = true;
        resolve((e.data && e.data.release) || null);
      };
      try { worker.postMessage({ type: "GET_RELEASE" }, [ch.port2]); }
      catch (err) { return resolve(null); }
      setTimeout(function () { if (!done) { done = true; resolve(null); } }, 1500);
    });
  }

  function showToast(onRefresh) {
    if (document.getElementById("swUpdateToast")) return; // already showing
    var wrap = document.createElement("div");
    wrap.id = "swUpdateToast";
    wrap.setAttribute("role", "status");
    wrap.style.cssText = "position:fixed;left:50%;bottom:max(20px,env(safe-area-inset-bottom));" +
      "transform:translateX(-50%) translateY(12px);z-index:2147483000;display:flex;align-items:center;gap:12px;" +
      "background:#0a2b34;color:#eaf6f8;border:1px solid rgba(255,255,255,.18);border-radius:999px;" +
      "padding:10px 12px 10px 18px;font:700 .88rem ui-rounded,'SF Pro Rounded','Segoe UI',system-ui,-apple-system,sans-serif;" +
      "box-shadow:0 14px 40px -12px rgba(0,0,0,.7);opacity:0;transition:opacity .25s,transform .25s;";

    var msg = document.createElement("span");
    msg.textContent = "New version available";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Refresh";
    btn.style.cssText = "cursor:pointer;border:0;border-radius:999px;padding:7px 15px;" +
      "font:800 .82rem inherit;color:#04222a;background:#7fe6e2;";
    btn.addEventListener("click", function () { btn.disabled = true; btn.textContent = "Updating…"; onRefresh(); });

    wrap.appendChild(msg);
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
    requestAnimationFrame(function () { wrap.style.opacity = "1"; wrap.style.transform = "translateX(-50%) translateY(0)"; });
  }

  // Show the toast only when the RELEASE marker changed (a real user-facing update). For a
  // cache-only change (same RELEASE — SEO, backend, infra) activate silently in the background,
  // so those never nag the user with "New version available".
  function handleWaiting(reg) {
    if (!reg.waiting) return;
    Promise.all([getRelease(reg.waiting), getRelease(navigator.serviceWorker.controller)])
      .then(function (rels) {
        var next = rels[0], current = rels[1];
        if (next && current && next !== current) {
          showToast(function () {
            userInitiatedReload = true;
            reg.waiting.postMessage("SKIP_WAITING");
          });
        } else {
          reg.waiting.postMessage("SKIP_WAITING"); // silent: same release, or unknown/first upgrade
        }
      });
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").then(function (reg) {
      // An update may already be waiting (installed on a prior visit / another tab).
      if (reg.waiting && navigator.serviceWorker.controller) handleWaiting(reg);
      // Or one starts installing now — prompt once it finishes (and only if this isn't the
      // first-ever install, i.e. a controller already exists).
      reg.addEventListener("updatefound", function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", function () {
          if (nw.state === "installed" && navigator.serviceWorker.controller) handleWaiting(reg);
        });
      });
    }).catch(function () {});
  });
})();
