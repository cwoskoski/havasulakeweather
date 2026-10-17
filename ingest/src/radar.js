/**
 * Havasu Lake Weather — radar manifest (HLW-045, observed source swapped in HLW-054).
 *
 * One small JSON for the /radar page:
 *   - observed radar: NOAA MRMS quality-controlled base reflectivity (1 km, ~2-min
 *     updates) as a time-enabled WMS — NCEP GeoServer first, NOAA nowCOAST as fallback.
 *     (RainViewer's free API was cut to zoom 7 + one fixed color scheme in 2026.)
 *   - future radar: HRRR simulated reflectivity (REFD) tiles from Iowa Environmental
 *     Mesonet (IEM). Both use the same NWS reflectivity palette, so they match.
 *   - active NWS storm warnings (polygons) near the lake, and the nowCOAST lightning layer.
 * All free and keyless. The browser loads tiles directly; we only return the manifest.
 *
 * HRRR REFD is a MODEL SIMULATION, not observed radar — the page labels it as a
 * forecast. Tiles: hrrr::REFD-F{fmin}-{YYYYMMDDHHmm}, 15-min steps to F1080 (+18h).
 */

// Observed radar sources, in preference order. Both are MRMS mosaics with a WMS TIME dimension.
export const OBS_SOURCES = [
  { name: "NOAA MRMS (NCEP)", wmsUrl: "https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows", layer: "conus_bref_qcd" },
  { name: "NOAA nowCOAST", wmsUrl: "https://nowcoast.noaa.gov/geoserver/observations/weather_radar/ows", layer: "base_reflectivity_mosaic" },
];
export const LIGHTNING = { name: "NOAA nowCOAST lightning density", wmsUrl: "https://nowcoast.noaa.gov/geoserver/lightning_detection/ows", layer: "ldn_lightning_strike_density" };
const UA = process.env.NWS_USER_AGENT || "HavasuLakeWeather/1.0 (+https://havasulakeweather.com)";
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

// Times from a WMS 1.3.0 capabilities doc: the <Dimension name="time"> of `layer`
// (comma-separated ISO list). Returns ms, ascending; [] if absent.
export function parseWmsTimes(xml, layer) {
  const at = xml.indexOf(`<Name>${layer}</Name>`);
  if (at < 0) return [];
  const m = /<Dimension[^>]*name="time"[^>]*>([^<]*)<\/Dimension>/.exec(xml.slice(at));
  if (!m) return [];
  return m[1].split(",").map((t) => Date.parse(t.trim())).filter(Number.isFinite).sort((a, b) => a - b);
}

// ~`spanMin` of history at ~`stepMin` spacing: for each step back from the newest scan,
// the newest scan at or before it. Always ends on the newest. [{ time: unixSec, iso }].
export function pickFrames(timesMs, { spanMin = 120, stepMin = 10 } = {}) {
  if (!timesMs.length) return [];
  const newest = timesMs[timesMs.length - 1], picked = new Set();
  for (let k = 0; k * stepMin <= spanMin; k++) {
    const target = newest - k * stepMin * 60000;
    let best = null;
    for (const t of timesMs) if (t <= target) best = t; else break;
    if (best != null && newest - best <= (spanMin + stepMin / 2) * 60000) picked.add(best);
  }
  return [...picked].sort((a, b) => a - b).map((t) => ({ time: Math.round(t / 1000), iso: new Date(t).toISOString().slice(0, 19) + "Z" }));
}

// First source whose capabilities list a scan from the last 30 min; null if none do.
async function observed(nowMs) {
  for (const src of OBS_SOURCES) {
    try {
      const r = await fetch(`${src.wmsUrl}?service=WMS&version=1.3.0&request=GetCapabilities`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error(`${src.name} ${r.status}`);
      const times = parseWmsTimes(await r.text(), src.layer);
      if (!times.length || nowMs - times[times.length - 1] > 30 * 60000) throw new Error(`${src.name} stale`);
      return { source: src.name, wmsUrl: src.wmsUrl, layer: src.layer, frames: pickFrames(times) };
    } catch (e) {
      console.error(JSON.stringify({ msg: "radar-observed-source", source: src.name, error: String(e?.message || e) }));
    }
  }
  return null; // soft-fail → forecast-only
}

// Storm-based NWS warnings — the ones drawn as polygons on a radar map.
export const WARN_EVENTS = new Set([
  "Tornado Warning", "Severe Thunderstorm Warning", "Flash Flood Warning", "Extreme Wind Warning",
  "Dust Storm Warning", "Special Weather Statement",
]);
const WARN_BOX = [-118.5, 31.5, -110, 37.5]; // lon/lat box well beyond the map's default view

function ringsOf(g) {
  if (!g) return [];
  if (g.type === "Polygon") return g.coordinates;
  if (g.type === "MultiPolygon") return g.coordinates.flat();
  return [];
}
export function stormWarnings(features, box = WARN_BOX) {
  return (features || []).filter((f) => {
    const p = f.properties || {};
    if (!WARN_EVENTS.has(p.event) || !f.geometry) return false;
    return ringsOf(f.geometry).some((ring) => ring.some(([x, y]) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]));
  }).map((f) => ({
    event: f.properties.event,
    headline: f.properties.headline || f.properties.event,
    ends: f.properties.ends || f.properties.expires || null,
    geometry: f.geometry,
  }));
}

async function warnings() {
  try {
    const r = await fetch("https://api.weather.gov/alerts/active?area=CA,AZ,NV&status=actual", {
      headers: { "user-agent": UA, accept: "application/geo+json" }, signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw new Error(`nws ${r.status}`);
    return stormWarnings((await r.json()).features);
  } catch {
    return []; // soft-fail: no polygons is better than no radar
  }
}

// ?mock=warning — a Severe Thunderstorm Warning box just west of the lake, for previews.
export const MOCK_WARNING = {
  event: "Severe Thunderstorm Warning",
  headline: "Severe Thunderstorm Warning (preview) — 60 mph wind gusts and quarter-size hail",
  ends: null,
  geometry: { type: "Polygon", coordinates: [[[-114.75, 34.32], [-114.38, 34.22], [-114.30, 34.55], [-114.62, 34.66], [-114.75, 34.32]]] },
};

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

export async function getRadar(nowMs = Date.now(), mock = null) {
  const [obs, init, warn] = await Promise.all([observed(nowMs), freshestInit(nowMs), mock ? Promise.resolve([]) : warnings()]);
  if (mock === "warning") { warn.push({ ...MOCK_WARNING, ends: new Date(nowMs + 45 * 60000).toISOString() }); }
  return {
    observed: obs,
    forecast: {
      source: "HRRR (Iowa Environmental Mesonet)",
      initUnix: Math.round(init.getTime() / 1000),
      tileTemplate: IEM_TEMPLATE.replace("{init}", iemInit(init)),
      frames: futureFrames(nowMs, init),
    },
    warnings: warn,
    lightning: LIGHTNING,
    attribution: "Observed radar: NOAA MRMS · Future radar: HRRR via Iowa Environmental Mesonet · Warnings: NWS",
  };
}
