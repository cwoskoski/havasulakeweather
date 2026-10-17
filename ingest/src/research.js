/**
 * Havasu Lake Weather — rollups + range queries for the /research page (HLW-052).
 *
 * Pure helpers (no AWS). The station posts every minute, so long ranges read
 * pre-aggregated items instead of raw readings:
 *
 *   hourly:  pk = HOUR#<stationKey>#YYYY-MM,  sk = <hour start ISO, UTC>
 *   daily:   pk = DAY#<stationKey>#YYYY,      sk = <YYYY-MM-DD, Pacific-local day>
 *
 * Every aggregate ("agg") has the same mergeable shape, whatever it covers:
 *   { n, <metric>: { n, sum, min, minAt, max, maxAt }, rainIn, dirX, dirY }
 * so ten minutes, an hour, a day or a whole year combine exactly (avg = sum / n).
 * Rain is the sum of dailyrainin increments; direction is a speed-weighted vector.
 */

export const TZ = "America/Los_Angeles";
const HOUR = 3600e3, DAY = 86400e3;

// Coerces stored values (the WH31E fields arrive as strings) — null if absent/bad.
export const num = (v) => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

export function dewPointF(tf, rh) {
  if (tf == null || rh == null || rh <= 0) return null;
  const c = (tf - 32) * 5 / 9, a = 17.27, b = 237.7;
  const g = Math.log(rh / 100) + (a * c) / (b + c);
  return +(((b * g) / (a - g)) * 9 / 5 + 32).toFixed(1);
}

// metric -> value off a raw reading. temp = all-in-one array ("Full Sun"); shade = WH31E.
export const METRICS = {
  temp: (r) => num(r.tempf),
  shade: (r) => num(r.temp1f),
  humidity: (r) => num(r.humidity),
  dew: (r) => dewPointF(num(r.tempf), num(r.humidity)),
  wind: (r) => num(r.windspeedmph),
  gust: (r) => num(r.windgustmph),
  pressure: (r) => num(r.baromrelin),
  uv: (r) => num(r.uv),
  solar: (r) => num(r.solarradiation),
};
const DECIMALS = { pressure: 2, solar: 0 }; // everything else: 1
const CALM_MPH = 1;
const MAX_RAIN_STEP_IN = 1; // a bigger jump between two readings is a counter glitch, not rain

const round = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// ---------- aggregates ----------

export const newAgg = () => ({ n: 0, rainIn: 0, dirX: 0, dirY: 0 });

export function addReading(a, r, rainInc = 0) {
  a.n++;
  for (const [k, get] of Object.entries(METRICS)) {
    const v = get(r);
    if (v == null) continue;
    const m = a[k] || (a[k] = { n: 0, sum: 0, min: v, minAt: r.sk, max: v, maxAt: r.sk });
    m.n++; m.sum += v;
    if (v < m.min) { m.min = v; m.minAt = r.sk; }
    if (v > m.max) { m.max = v; m.maxAt = r.sk; }
  }
  const s = num(r.windspeedmph), d = num(r.winddir);
  if (s != null && d != null && s >= CALM_MPH) {
    a.dirX += s * Math.sin((d * Math.PI) / 180);
    a.dirY += s * Math.cos((d * Math.PI) / 180);
  }
  a.rainIn += rainInc;
  return a;
}

// Combine `b` into `a` (either may be a stored item; extra keys like pk/sk are ignored).
// Ties keep the earlier timestamp, so "high at 2:41 PM" names the first time it was hit.
export function mergeAgg(a, b) {
  if (!b || !b.n) return a;
  a.n += b.n;
  for (const k of Object.keys(METRICS)) {
    const m = b[k];
    if (!m || !m.n) continue;
    const t = a[k];
    if (!t) { a[k] = { ...m }; continue; }
    t.n += m.n; t.sum += m.sum;
    if (m.min < t.min || (m.min === t.min && m.minAt < t.minAt)) { t.min = m.min; t.minAt = m.minAt; }
    if (m.max > t.max || (m.max === t.max && m.maxAt < t.maxAt)) { t.max = m.max; t.maxAt = m.maxAt; }
  }
  a.rainIn += b.rainIn || 0;
  a.dirX += b.dirX || 0;
  a.dirY += b.dirY || 0;
  return a;
}

// Trim float noise before storing (sums of 60 readings drift in the 15th decimal).
export function compactAgg(a) {
  const out = { n: a.n, rainIn: round(a.rainIn, 3), dirX: round(a.dirX, 2), dirY: round(a.dirY, 2) };
  for (const k of Object.keys(METRICS)) if (a[k]) out[k] = { ...a[k], sum: round(a[k].sum, 3) };
  return out;
}

export function meanDirOf(a) {
  if (!a || Math.hypot(a.dirX || 0, a.dirY || 0) < 1e-6) return null;
  return Math.round(((Math.atan2(a.dirX, a.dirY) * 180) / Math.PI + 360) % 360) % 360;
}

// Public shape: per metric { avg, min, max }, plus minAt/maxAt for the metrics in
// `times` (true = all). Day rows only time the headline metrics, to keep a year small.
export const DAY_TIMED = ["temp", "shade", "gust"];
export function outAgg(a, times = false) {
  if (!a || !a.n) return { n: 0 };
  const out = { n: a.n };
  for (const k of Object.keys(METRICS)) {
    const m = a[k];
    if (!m || !m.n) continue;
    const d = DECIMALS[k] ?? 1;
    out[k] = { avg: round(m.sum / m.n, d), min: round(m.min, d), max: round(m.max, d) };
    if (times === true || (times && times.includes(k))) { out[k].minAt = m.minAt; out[k].maxAt = m.maxAt; }
    if (times === true) out[k].n = m.n; // summary only: lets the page tell how much of the range a sensor covered
  }
  out.rainIn = round(a.rainIn, 2);
  out.dirDeg = meanDirOf(a);
  return out;
}

// ---------- raw readings -> buckets ----------

// Rain fallen since the previous reading, from the daily counter. A drop means the
// counter reset at midnight, so the new value is what fell since.
export function rainStep(prev, cur) {
  const p = num(prev?.dailyrainin), c = num(cur?.dailyrainin);
  if (p == null || c == null) return 0;
  const inc = c >= p ? c - p : c;
  return inc > MAX_RAIN_STEP_IN ? 0 : inc;
}

// `readings` sorted by sk. Readings before startMs only seed the rain diff.
// Returns n aggs (null where a bucket had no readings — a dropout stays a gap).
export function bucketize(readings, startMs, stepMs, n) {
  const out = new Array(n).fill(null);
  let prev = null;
  for (const r of readings) {
    const t = Date.parse(r.sk), i = Math.floor((t - startMs) / stepMs);
    if (i >= 0 && i < n) addReading(out[i] || (out[i] = newAgg()), r, rainStep(prev, r));
    prev = r;
  }
  return out;
}

// Hourly rollup items for [fromMs, toMs) — only hours that had readings.
export function rollupHours(readings, fromMs, toMs) {
  const n = Math.round((toMs - fromMs) / HOUR);
  return bucketize(readings, fromMs, HOUR, n)
    .map((a, i) => (a ? { sk: isoSec(fromMs + i * HOUR), ...compactAgg(a) } : null))
    .filter(Boolean);
}

// ---------- Pacific-local calendar ----------

export const isoSec = (ms) => new Date(ms).toISOString().slice(0, 19) + "Z";
const partsFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
function localParts(ms) {
  const p = {};
  for (const x of partsFmt.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}
export const localDay = (ms) => localParts(ms).day;
export function addDays(day, k) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + k, 12)).toISOString().slice(0, 10);
}
// UTC ms of local midnight. Pacific is UTC-7 or UTC-8, and DST flips at 2 AM, so
// midnight is always one of those two offsets.
export function localDayStart(day) {
  const [y, m, d] = day.split("-").map(Number);
  for (const off of [7, 8]) {
    const ms = Date.UTC(y, m - 1, d, off);
    const p = localParts(ms);
    if (p.day === day && p.hour === 0) return ms;
  }
  throw new Error(`no local midnight for ${day}`);
}
export const isDay = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ---------- partition keys ----------

export const hourPk = (key, ms) => `HOUR#${key}#${isoSec(ms).slice(0, 7)}`;
export const dayPk = (key, day) => `DAY#${key}#${day.slice(0, 4)}`;
export function monthsBetween(startMs, endMs) {
  const out = [];
  let [y, m] = isoSec(startMs).slice(0, 7).split("-").map(Number);
  const last = isoSec(endMs).slice(0, 7);
  for (let guard = 0; guard < 120; guard++) {
    const mm = `${y}-${String(m).padStart(2, "0")}`;
    out.push(mm);
    if (mm >= last) break;
    if (++m === 13) { m = 1; y++; }
  }
  return out;
}

// ---------- ranges + resolution ----------

export const MAX_SPAN_DAYS = 366 * 5;

// from/to: "YYYY-MM-DD" (whole local days, `to` inclusive) or ISO timestamps.
// Default: the last 24 h. Clipped to now; null when unusable.
export function parseRange(qs, nowMs = Date.now()) {
  const from = qs?.from, to = qs?.to;
  let startMs, endMs;
  if (!from && !to) { endMs = nowMs; startMs = nowMs - DAY; }
  else {
    startMs = isDay(from) ? localDayStart(from) : Date.parse(from);
    endMs = !to ? nowMs : isDay(to) ? localDayStart(addDays(to, 1)) : Date.parse(to);
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  endMs = Math.min(endMs, nowMs);
  if (endMs <= startMs) return null;
  if (endMs - startMs > MAX_SPAN_DAYS * DAY) startMs = endMs - MAX_SPAN_DAYS * DAY;
  return { startMs, endMs };
}

// Source + bucket width for a span, so every range lands near 150–250 points.
export function pickResolution(spanMs) {
  const h = spanMs / HOUR;
  if (h <= 26) return { src: "raw", stepMin: 10 };
  if (h <= 74) return { src: "raw", stepMin: 30 };
  if (h <= 8 * 24) return { src: "hour", stepMin: 60 };
  if (h <= 22 * 24) return { src: "hour", stepMin: 180 };
  if (h <= 63 * 24) return { src: "hour", stepMin: 360 };
  return { src: "day", stepMin: 1440 };
}

// Buckets start on a step boundary counted from local midnight, so 6-hour buckets
// read midnight / 6 AM / noon / 6 PM.
export function alignStart(startMs, stepMin) {
  const step = stepMin * 60e3, anchor = localDayStart(localDay(startMs));
  return anchor + Math.floor((startMs - anchor) / step) * step;
}

// ---------- assemble a /api/research response ----------

// `entries`: [{ t (ms), a (agg) }] at the source's native granularity (raw buckets,
// hour items or day items). Regroups them into chart points, local-day rows and a summary.
// At daily resolution the day rows ARE the chart points (every day, gaps included), so
// `points` is left null rather than sending the year twice.
export function assemble(entries, { startMs, endMs, res }) {
  let points = null;
  if (res.src !== "day") {
    const step = res.stepMin * 60e3, s0 = alignStart(startMs, res.stepMin);
    const n = Math.max(1, Math.ceil((endMs - s0) / step));
    const groups = new Array(n).fill(null);
    for (const e of entries) {
      const i = Math.floor((e.t - s0) / step);
      if (i >= 0 && i < n) mergeAgg(groups[i] || (groups[i] = newAgg()), e.a);
    }
    points = groups.map((g, i) => ({ t: isoSec(s0 + i * step), ...outAgg(g) }));
  }

  const days = new Map(), total = newAgg();
  for (const e of entries) {
    const d = localDay(e.t);
    mergeAgg(days.get(d) || days.set(d, newAgg()).get(d), e.a);
    mergeAgg(total, e.a);
  }
  const dayRows = [];
  for (let d = localDay(startMs), last = localDay(endMs - 1); d <= last; d = addDays(d, 1)) {
    if (days.has(d) || res.src === "day") dayRows.push({ day: d, ...outAgg(days.get(d), DAY_TIMED) });
  }
  return {
    res, from: isoSec(startMs), to: isoSec(endMs),
    points,
    days: dayRows,
    summary: { ...outAgg(total, true), days: dayRows.filter((d) => d.n).length, rainDays: dayRows.filter((d) => d.rainIn >= 0.01).length },
  };
}

// Raw readings -> entries at the resolution's bucket width (used for short ranges and mocks).
export function entriesFromReadings(readings, startMs, endMs, stepMin) {
  const step = stepMin * 60e3, s0 = alignStart(startMs, stepMin);
  const n = Math.max(1, Math.ceil((endMs - s0) / step));
  return bucketize(readings, s0, step, n)
    .map((a, i) => (a ? { t: s0 + i * step, a } : null))
    .filter((e) => e && e.t + step > startMs);
}

// Only the lake/river fields the page charts.
export const WATER_FIELDS = ["havasuElevFt", "havasuStorageAf", "havasuTempF", "davisCfs", "parkerCfs"];
export const waterRow = (it) => Object.fromEntries([["date", it.sk], ...WATER_FIELDS.map((k) => [k, num(it[k])])]);

// ---------- mock scenarios (?mock=summer|storm|winter) ----------
// Synthetic readings through the real pipeline, so previews exercise the same maths.

const SCENARIOS = {
  summer: { tMean: 92, tSwing: 14, rh: 18, wind: 6, rainDays: 0 },
  storm: { tMean: 84, tSwing: 10, rh: 38, wind: 9, rainDays: 0.25 },
  winter: { tMean: 58, tSwing: 12, rh: 40, wind: 5, rainDays: 0.08 },
};
function rng(seed) { // mulberry32
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function mockReadings(scenario, startMs, endMs) {
  const sc = SCENARIOS[scenario] || SCENARIOS.summer, span = endMs - startMs;
  const cadence = span <= 3 * DAY ? 60e3 : span <= 63 * DAY ? 600e3 : HOUR;
  const out = [];
  let rain = 0, day = null, storm = 0, wob = 0;
  // Seed by time so a given hour always looks the same, whichever range asks for it.
  for (let t = Math.floor((startMs - HOUR) / cadence) * cadence; t <= endMs; t += cadence) {
    const rand = rng(Math.floor(t / 60e3));
    const p = localParts(t), hf = p.hour + (t % HOUR) / HOUR;
    if (p.day !== day) { day = p.day; rain = 0; const dr = rng(Number(day.replace(/-/g, "")))(); storm = dr < sc.rainDays ? 0.05 + dr * 1.2 : 0; }
    // Long ranges follow the desert year (≈55° Jan → ≈95° Jul) instead of one season.
    const doy = (Date.parse(day) - Date.UTC(Number(day.slice(0, 4)), 0, 1)) / DAY;
    const mean = span > 63 * DAY ? 75 + 20 * Math.cos(((doy - 200) / 365) * 2 * Math.PI) : sc.tMean;
    const diurnal = Math.sin(((hf - 9) / 24) * 2 * Math.PI); // low ~3 AM, high ~3 PM
    wob = Math.max(-1, Math.min(1, wob * 0.9 + (rand() - 0.5) * 0.4));
    const shade = mean + sc.tSwing * diurnal + wob * 2;
    const sun = Math.max(0, Math.sin(((hf - 6) / 13) * Math.PI));
    const pm = Math.exp(-Math.pow(hf - 15, 2) / 10);
    const wind = Math.max(0, sc.wind * (0.3 + pm) * (1 + wob * 0.4) + (storm && hf > 14 && hf < 18 ? 12 : 0));
    const raining = storm && hf > 15 && hf < 17;
    if (raining) rain += (storm / 2) * (cadence / HOUR);
    const rh = Math.min(100, sc.rh * (1.4 - 0.5 * diurnal) + (raining ? 45 : 0));
    out.push({
      sk: isoSec(t),
      tempf: round(shade + sun * 6, 1), temp1f: String(round(shade, 1)), humidity: Math.round(rh),
      windspeedmph: round(wind, 1), windgustmph: round(wind * (1.3 + rand() * 0.4), 1),
      winddir: Math.round((hf >= 10 && hf < 20 ? 220 : 340) + (rand() - 0.5) * 60 + 360) % 360,
      baromrelin: round(29.85 + 0.08 * Math.sin(t / (4 * DAY)) - 0.03 * diurnal - (storm ? 0.06 : 0), 2),
      uv: round(sun * (mean > 80 ? 10 : 5), 1), solarradiation: Math.round(sun * (mean > 80 ? 950 : 600) * (storm && hf > 13 ? 0.4 : 1)),
      dailyrainin: round(rain, 2),
    });
  }
  return out;
}
export function mockWater(startMs, endMs) {
  const out = [];
  for (let d = localDay(startMs), last = localDay(endMs - 1); d <= last; d = addDays(d, 1)) {
    const k = Date.parse(d) / DAY;
    out.push({
      date: d, havasuElevFt: round(448.4 + 0.6 * Math.sin(k / 9), 2), havasuStorageAf: Math.round(560000 + 18000 * Math.sin(k / 9)),
      havasuTempF: round(70 + 12 * Math.sin(((k - 110) / 365) * 2 * Math.PI), 1), davisCfs: Math.round(14000 + 4000 * Math.sin(k / 3)), parkerCfs: Math.round(13000 + 3500 * Math.sin(k / 3 + 0.4)),
    });
  }
  return out;
}
export function mockResearch(scenario, range, nowMs = Date.now()) {
  const res = pickResolution(range.endMs - range.startMs);
  const stepMin = res.src === "raw" ? res.stepMin : 60; // hour/day sources start from hourly aggs
  const entries = entriesFromReadings(mockReadings(scenario, range.startMs, range.endMs), range.startMs, range.endMs, stepMin);
  return {
    source: "mock", mock: scenario || "summer",
    since: localDay(nowMs - 400 * DAY),
    ...assemble(entries, { ...range, res }),
    water: mockWater(range.startMs, range.endMs),
  };
}
