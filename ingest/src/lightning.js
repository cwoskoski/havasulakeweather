/**
 * Havasu Lake Weather — lightning helpers (HLW-048).
 *
 * The Ambient WH31L (received by the Ecowitt GW1100 gateway) reports, per upload:
 *   lightning       — distance of the LAST strike (km)
 *   lightning_num   — strikes so far today (daily counter, resets at midnight)
 *   lightning_time  — epoch seconds of the last strike
 *   wh57batt        — battery (the gateway identifies the WH31L as its WH57 twin)
 *
 * From the stored per-minute readings we derive a 0–3 "bolt level":
 *   0 quiet   — no strikes in the last 60 min
 *   1 distant — strikes in the last 60 min, but far (>15 mi) or stale-30
 *   2 area    — strikes in the last 30 min within ~15 mi
 *   3 close   — strikes in the last ~20 min within ~6 mi
 */

export const kmToMi = (km) => (km == null || !Number.isFinite(km) ? null : +(km * 0.621371).toFixed(1));

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// Strikes within [sinceMs, now]: sum of positive deltas of the daily counter across
// consecutive readings in the window. A negative delta is the midnight reset — the
// post-reset counter value IS the strikes since reset, so add it as-is.
export function strikesInWindow(points, sinceMs) {
  let total = 0, prev = null;
  for (const p of points || []) {
    const t = Date.parse(p.t), n = num(p.num);
    if (n == null || !Number.isFinite(t)) continue;
    if (t < sinceMs) { prev = n; continue; } // last pre-window reading = baseline
    if (prev != null) total += n >= prev ? n - prev : n;
    prev = n;
  }
  return total;
}

// Nearest strike distance (mi) among readings whose last-strike time falls in the window.
export function nearestInWindow(points, sinceSec) {
  let best = null;
  for (const p of points || []) {
    const at = num(p.strikeAt), d = num(p.distMi);
    if (at == null || d == null || at < sinceSec) continue;
    if (best == null || d < best) best = d;
  }
  return best;
}

// The agreed 0–3 ladder.
export function boltLevel({ s60 = 0, s30 = 0, s20 = 0, nearest30Mi = null, nearest20Mi = null }) {
  if (!s60) return 0;
  if (s20 > 0 && nearest20Mi != null && nearest20Mi <= 6) return 3;
  if (s30 > 0 && nearest30Mi != null && nearest30Mi <= 15) return 2;
  return 1;
}

// Full summary from the recent-window series + the newest gateway reading.
export function summarize(points, latest, nowMs = Date.now()) {
  const nowSec = Math.floor(nowMs / 1000);
  const s60 = strikesInWindow(points, nowMs - 60 * 60000);
  const s30 = strikesInWindow(points, nowMs - 30 * 60000);
  const s20 = strikesInWindow(points, nowMs - 20 * 60000);
  const nearest30Mi = nearestInWindow(points, nowSec - 30 * 60);
  const nearest20Mi = nearestInWindow(points, nowSec - 20 * 60);
  const level = boltLevel({ s60, s30, s20, nearest30Mi, nearest20Mi });
  const lastAt = num(latest?.lightning_time);
  return {
    level,
    strikes60: s60,
    countToday: num(latest?.lightning_num) ?? 0,
    nearestMi: nearest30Mi ?? kmToMi(num(latest?.lightning)),
    lastStrikeAt: lastAt ? new Date(lastAt * 1000).toISOString() : null,
    battLow: num(latest?.wh57batt) != null ? num(latest?.wh57batt) <= 1 : null,
  };
}

// Mock scenarios so every bolt level is previewable on a clear desert day.
export function mockLightning(scenario, nowMs = Date.now()) {
  const nowSec = Math.floor(nowMs / 1000);
  const mk = (level, countToday, nearestMi, agoMin, strikes60) => ({
    source: "mock", mock: scenario,
    current: { level, strikes60, countToday, nearestMi, lastStrikeAt: agoMin == null ? null : new Date((nowSec - agoMin * 60) * 1000).toISOString(), battLow: false },
    series: mockSeries(scenario, nowMs),
  });
  if (scenario === "close") return mk(3, 42, 3.1, 4, 18);
  if (scenario === "distant") return mk(1, 7, 19.9, 41, 3);
  return mk(0, 0, null, null, 0); // quiet
}

function mockSeries(scenario, nowMs) {
  const pts = [];
  const active = scenario === "close" ? 26 : scenario === "distant" ? 7 : 0;
  let count = 0;
  for (let m = 240; m >= 0; m -= 5) {
    const t = new Date(nowMs - m * 60000);
    const inStorm = scenario !== "quiet" && m < 150;
    if (inStorm && Math.random() < (scenario === "close" ? 0.75 : 0.3)) count += scenario === "close" ? 2 : 1;
    const base = scenario === "close" ? 22 - (150 - m) * 0.12 : 24 - (150 - m) * 0.03;
    pts.push({
      t: t.toISOString(),
      num: Math.min(count, active),
      distMi: inStorm && count ? +Math.max(2, base + (Math.random() * 3 - 1.5)).toFixed(1) : null,
      strikeAt: inStorm && count ? Math.floor(t.getTime() / 1000) : null,
    });
  }
  return pts;
}
