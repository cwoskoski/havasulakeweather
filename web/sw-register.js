/* Havasu Lake Weather — service-worker registration + "update available" toast (HLW-010).
 * Included by index.html and water.html. Registers /sw.js; when a new SW version is waiting,
 * shows a persistent, tappable toast. Tapping activates the waiting worker and reloads once
 * (guarded against reload loops). Self-contained: builds its own toast DOM + styles, so it
 * behaves identically on every page without per-page markup. */
(function () {
  if (!("serviceWorker" in navigator)) return;

  var refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (refreshing) return;      // the waiting worker took control — reload once to pick it up
    refreshing = true;
    window.location.reload();
  });

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

  function promptUpdate(reg) {
    if (reg.waiting) showToast(function () { reg.waiting.postMessage("SKIP_WAITING"); });
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").then(function (reg) {
      // An update may already be waiting (installed on a prior visit / another tab).
      if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg);
      // Or one starts installing now — prompt once it finishes (and only if this isn't the
      // first-ever install, i.e. a controller already exists).
      reg.addEventListener("updatefound", function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", function () {
          if (nw.state === "installed" && navigator.serviceWorker.controller) promptUpdate(reg);
        });
      });
    }).catch(function () {});
  });
})();
