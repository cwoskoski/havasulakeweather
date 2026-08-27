/**
 * Havasu Lake Weather — radar manifest (HLW-045).
 *
 * One small JSON for the /radar page: observed radar (RainViewer, past ~2h + its
 * short nowcast) plus a "future radar" built from HRRR simulated reflectivity
 * (REFD) tiles hosted by Iowa Environmental Mesonet (IEM) — free, keyless.
 *
 * The browser loads tiles directly from RainViewer + IEM; we only return the
 * manifest (host/paths + the HRRR init time and forecast-frame list).
 *
 * HRRR REFD is a MODEL SIMULATION, not observed radar — the page labels it as a
 * forecast. Tiles: hrrr::REFD-F{fmin}-{YYYYMMDDHHmm}, 15-min steps to F1080 (+18h).
 */

const RAINVIEWER = "https://api.rainviewer.com/public/weather-maps.json";
const IEM_TEMPLATE =
  "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/hrrr::REFD-F{fmin}-{init}/{z}/{x}/{y}.png";
// Cheap availability probe (tiny z2 tile): 200 = that init is processed, 503 = not (yet).
const IEM_PROBE =
  "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/hrrr::REFD-F0000-{init}/2/0/1.png";

const pad = (n, w) => String(n).padStart(w, "0");

// IEM model-init string in UTC: YYYYMMDDHHmm.
export function iemInit(d) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}` +
    `${pad(d.getUTCHours(), 2)}${pad(d.getUTCMinutes(), 2)}`
  );
}

// Freshest HRRR run that's reliably processed: the PREVIOUS top-of-hour (UTC).
// HRRR runs hourly and a run is ready ~:50 past the hour, so the previous hour is
// always safe. Costs ~1–2h of run age; negligible for a next-6h view. (Tunable.)
export function hrrrInit(nowMs) {
  const d = new Date(nowMs);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() - 1);
  return d;
}

// Forecast frames from now → now+hoursAhead at stepMin spacing, each within the
// HRRR forecast range (F0000–F1080). { time:unixSec, fmin:"0090", kind:"fc" }.
export function futureFrames(nowMs, init, opts = {}) {
  const { hoursAhead = 6, stepMin = 30, maxFmin = 1080 } = opts;
  const initMs = init.getTime();
  const stepMs = stepMin * 60000;
  const end = nowMs + hoursAhead * 3600000;
  const frames = [];
  for (let t = Math.ceil(nowMs / stepMs) * stepMs; t <= end; t += stepMs) {
    const fmin = Math.round((t - initMs) / 60000);
    if (fmin < 0 || fmin > maxFmin) continue;
    frames.push({ time: Math.round(t / 1000), fmin: pad(fmin, 4), kind: "fc" });
  }
  return frames;
}

async function rainviewer() {
  try {
    const r = await fetch(RAINVIEWER, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(`rainviewer ${r.status}`);
    const j = await r.json();
    return { host: j.host, past: (j.radar && j.radar.past) || [], nowcast: (j.radar && j.radar.nowcast) || [] };
  } catch {
    return { host: null, past: [], nowcast: [] }; // soft-fail → forecast-only
  }
}

async function iemHas(initStr) {
  try {
    const r = await fetch(IEM_PROBE.replace("{init}", initStr), { signal: AbortSignal.timeout(3500) });
    return r.ok; // 200 = run available, 503 = not processed yet
  } catch {
    return false;
  }
}

// Newest HRRR init IEM actually has processed. Starts at the previous top-of-hour and
// steps back up to `tries` hours, skipping runs that 503 (unprocessed/lagging) — so the
// page never asks for tiles that don't exist. Falls back to the oldest tried on total miss.
export async function freshestInit(nowMs, tries = 4) {
  const d = hrrrInit(nowMs);
  for (let i = 0; i < tries; i++) {
    if (await iemHas(iemInit(d))) return d;
    d.setUTCHours(d.getUTCHours() - 1);
  }
  return d;
}

export async function getRadar(nowMs = Date.now()) {
  const [observed, init] = await Promise.all([rainviewer(), freshestInit(nowMs)]);
  return {
    observed,
    forecast: {
      source: "HRRR (Iowa Environmental Mesonet)",
      initUnix: Math.round(init.getTime() / 1000),
      tileTemplate: IEM_TEMPLATE.replace("{init}", iemInit(init)),
      frames: futureFrames(nowMs, init),
    },
    attribution: "Observed radar: RainViewer · Future radar: HRRR via Iowa Environmental Mesonet",
  };
}
