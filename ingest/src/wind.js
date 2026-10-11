/**
 * Havasu Lake Weather — wind history summaries for the /wind page (HLW-051).
 *
 * Pure helpers over raw station readings ({ sk, windspeedmph, windgustmph, winddir }):
 * a bucketed timeline, a 16-sector wind rose, an hour-of-day grid and per-day stats.
 * Aggregated here so a phone never downloads the raw minute-by-minute series
 * (7 days is ~10k readings / 1.7 MB). Days and hours are station-local (Pacific).
 */

export const TZ = "America/Los_Angeles";
export const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const CALM_MPH = 1;                    // below this the vane is just wandering
export const SPEED_BINS = [1, 4, 8, 13, 19];  // lower edges (mph) ≈ Beaufort 1,2,3,4,5+

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

export const sectorOf = (deg) => Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
export function speedBin(mph) {
  let b = -1;
  for (let i = 0; i < SPEED_BINS.length; i++) if (mph >= SPEED_BINS[i]) b = i;
  return b; // -1 = calm
}

// Bucket width for a range: ~150 points whatever the span.
export const stepMinFor = (hours) => (hours <= 24 ? 10 : hours <= 72 ? 30 : 60);

// Speed-weighted vector mean of directions (so 350° and 10° average to 0°, not 180°).
// Calm readings carry no direction; returns null when nothing but calm.
export function meanDir(readings) {
  let x = 0, y = 0;
  for (const r of readings) {
    const s = num(r.windspeedmph), d = num(r.winddir);
    if (s == null || d == null || s < CALM_MPH) continue;
    x += s * Math.sin((d * Math.PI) / 180);
    y += s * Math.cos((d * Math.PI) / 180);
  }
  if (Math.hypot(x, y) < 1e-9) return null;
  return Math.round(((Math.atan2(x, y) * 180) / Math.PI + 360) % 360) % 360;
}

// Timeline: per bucket the average speed, the peak gust and the mean direction.
// Empty buckets are kept (nulls) so a station dropout shows as a gap, not a straight line.
export function bucketWind(items, startMs, endMs, stepMin) {
  const step = stepMin * 60000;
  const n = Math.max(1, Math.ceil((endMs - startMs) / step));
  const groups = Array.from({ length: n }, () => []);
  for (const r of items) {
    const i = Math.floor((Date.parse(r.sk) - startMs) / step);
    if (i >= 0 && i < n) groups[i].push(r);
  }
  return groups.map((g, i) => {
    const sp = g.map((r) => num(r.windspeedmph)).filter((v) => v != null);
    const gu = g.map((r) => num(r.windgustmph)).filter((v) => v != null);
    return {
      t: new Date(startMs + i * step).toISOString(),
      avgMph: sp.length ? r1(sp.reduce((a, b) => a + b, 0) / sp.length) : null,
      gustMph: gu.length ? r1(Math.max(...gu)) : sp.length ? r1(Math.max(...sp)) : null,
      dirDeg: meanDir(g),
    };
  });
}

// Wind rose: share of readings (%) per compass sector × speed bin, plus the calm share.
export function windRose(items) {
  const counts = Array.from({ length: 16 }, () => new Array(SPEED_BINS.length).fill(0));
  let total = 0, calm = 0;
  for (const r of items) {
    const s = num(r.windspeedmph);
    if (s == null) continue;
    total++;
    const b = speedBin(s), d = num(r.winddir);
    if (b < 0 || d == null) { calm++; continue; }
    counts[sectorOf(d)][b]++;
  }
  const pct = (c) => (total ? Math.round((c / total) * 1000) / 10 : 0);
  return {
    total, calmPct: pct(calm), binsMph: SPEED_BINS,
    sectors: counts.map((c, i) => ({ dir: COMPASS[i], pct: pct(c.reduce((a, b) => a + b, 0)), bins: c.map(pct) })),
  };
}

// Station-local calendar day + hour for a timestamp (DST-safe via Intl).
const localFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
export function localDayHour(ms) {
  const p = {};
  for (const x of localFmt.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

// Per local day: average, peak gust (and when), the direction it mostly blew from, calm
// share, and the 24 hourly averages that feed the "when it's windy" heatmap.
export function dailyWind(items) {
  const days = new Map();
  for (const r of items) {
    const s = num(r.windspeedmph);
    if (s == null) continue;
    const { day, hour } = localDayHour(Date.parse(r.sk));
    let d = days.get(day);
    if (!d) days.set(day, (d = { sum: 0, n: 0, calm: 0, peak: null, peakAt: null, sect: new Array(16).fill(0), hs: new Array(24).fill(0), hn: new Array(24).fill(0) }));
    d.sum += s; d.n++; d.hs[hour] += s; d.hn[hour]++;
    const dir = num(r.winddir);
    if (s < CALM_MPH || dir == null) d.calm++; else d.sect[sectorOf(dir)]++;
    const g = num(r.windgustmph) ?? s;
    if (d.peak == null || g > d.peak) { d.peak = g; d.peakAt = r.sk; }
  }
  return [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, d]) => {
    const top = Math.max(...d.sect);
    return {
      day, avgMph: r1(d.sum / d.n), peakGustMph: r1(d.peak), peakGustAt: d.peakAt,
      fromDir: top > 0 ? COMPASS[d.sect.indexOf(top)] : null,
      calmPct: Math.round((d.calm / d.n) * 100),
      hourly: d.hs.map((v, h) => (d.hn[h] ? r1(v / d.hn[h]) : null)),
    };
  });
}

// Everything the /wind page needs for one range.
export function summarizeWind(items, hours, nowMs = Date.now()) {
  const stepMin = stepMinFor(hours), step = stepMin * 60000;
  const endMs = Math.ceil(nowMs / step) * step, startMs = endMs - hours * 3600e3;
  const inRange = items.filter((r) => { const t = Date.parse(r.sk); return t >= startMs && t <= endMs; });
  const last = inRange[inRange.length - 1] || null;
  const speeds = inRange.map((r) => num(r.windspeedmph)).filter((v) => v != null);
  return {
    hours, stepMin, count: inRange.length,
    latest: last ? { t: last.sk, windMph: num(last.windspeedmph), gustMph: num(last.windgustmph), dirDeg: num(last.winddir), compass: num(last.winddir) == null ? null : COMPASS[sectorOf(last.winddir)] } : null,
    avgMph: speeds.length ? r1(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null,
    points: bucketWind(inRange, startMs, endMs, stepMin),
    rose: windRose(inRange),
    days: dailyWind(inRange),
  };
}

// ---- mock scenarios (?mock=calm|breezy|gusty) — synthetic minute readings through the
// real summarizer, so the preview exercises the same maths as live data.
const SCENARIOS = {
  calm: { base: 0.6, afternoon: 3, gustiness: 1.3, front: 0 },
  breezy: { base: 3, afternoon: 9, gustiness: 1.45, front: 0 },
  gusty: { base: 3, afternoon: 8, gustiness: 1.6, front: 11 },
};
function rng(seed) { // mulberry32 — deterministic so the mock doesn't dance between polls
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function mockReadings(scenario, hours, nowMs = Date.now()) {
  const sc = SCENARIOS[scenario] || SCENARIOS.breezy, rand = rng(42);
  const end = Math.floor(nowMs / 60000) * 60000, out = [];
  let wob = 0, dirWob = 0;
  for (let t = end - hours * 3600e3; t <= end; t += 60000) {
    const { hour } = localDayHour(t);
    const hf = hour + (t % 3600e3) / 3600e3;
    const pm = Math.exp(-Math.pow(hf - 15, 2) / 10);          // afternoon thermal peak ~3 pm
    const am = Math.exp(-Math.pow(hf - 4.5, 2) / 8) * 0.35;   // light pre-dawn drainage breeze
    const hrsAgo = (end - t) / 3600e3;
    const front = sc.front * Math.exp(-Math.pow(hrsAgo - 9, 2) / 6); // a front ~9 h ago
    wob = Math.max(-0.4, Math.min(0.4, wob * 0.96 + (rand() - 0.5) * 0.3));
    dirWob = dirWob * 0.97 + (rand() - 0.5) * 6;
    const speed = Math.max(0, (sc.base + sc.afternoon * pm + sc.afternoon * am + front) * (1 + wob) - 0.4);
    const dir = front > 4 ? 340 : hf >= 10 && hf < 20 ? 265 : 105; // W by day, E/SE overnight, NNW behind a front
    out.push({
      sk: new Date(t).toISOString().slice(0, 19) + "Z",
      windspeedmph: r1(speed),
      windgustmph: r1(speed * (1 + (sc.gustiness - 1) * (0.4 + 0.6 * rand()))),
      winddir: Math.round((dir + dirWob * 4 + (rand() - 0.5) * 30 + 360) % 360),
    });
  }
  return out;
}
export function mockWind(scenario, hours, nowMs = Date.now()) {
  return { source: "mock", mock: scenario, ...summarizeWind(mockReadings(scenario, hours, nowMs), hours, nowMs) };
}
