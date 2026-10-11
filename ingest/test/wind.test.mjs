// Unit tests for the wind-history helpers in ingest/src/wind.js (HLW-051). No AWS/network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sectorOf, speedBin, stepMinFor, meanDir, bucketWind, windRose, localDayHour, dailyWind, summarizeWind, mockWind } from "../src/wind.js";

const T0 = Date.UTC(2026, 9, 10, 22, 0, 0); // 3 pm PDT, Oct 10
const rd = (minAgo, mph, dir, gust) => ({ sk: new Date(T0 - minAgo * 60000).toISOString(), windspeedmph: mph, windgustmph: gust ?? mph, winddir: dir });

test("sectorOf maps degrees onto 16 compass sectors and wraps", () => {
  assert.equal(sectorOf(0), 0);
  assert.equal(sectorOf(11), 0);
  assert.equal(sectorOf(12), 1);   // NNE starts at 11.25°
  assert.equal(sectorOf(270), 12); // W
  assert.equal(sectorOf(350), 0);  // wraps back to N
  assert.equal(sectorOf(360), 0);
  assert.equal(sectorOf(-90), 12);
});

test("speedBin: calm below 1 mph, then Beaufort-ish lower edges", () => {
  assert.equal(speedBin(0), -1);
  assert.equal(speedBin(0.9), -1);
  assert.equal(speedBin(1), 0);
  assert.equal(speedBin(3.9), 0);
  assert.equal(speedBin(4), 1);
  assert.equal(speedBin(12.9), 2);
  assert.equal(speedBin(19), 4);
  assert.equal(speedBin(60), 4);
});

test("stepMinFor keeps every range near 150 buckets", () => {
  assert.equal(stepMinFor(24), 10);
  assert.equal(stepMinFor(72), 30);
  assert.equal(stepMinFor(168), 60);
});

test("meanDir averages across north instead of pointing south", () => {
  assert.equal(meanDir([rd(0, 5, 350), rd(1, 5, 10)]), 0);
  assert.equal(meanDir([rd(0, 5, 90), rd(1, 5, 180)]), 135);
});

test("meanDir weights by speed and ignores calm readings", () => {
  assert.equal(meanDir([rd(0, 10, 270), rd(1, 0.2, 90)]), 270); // the calm east reading doesn't count
  assert.equal(meanDir([rd(0, 0.3, 90), rd(1, 0, 200)]), null);
  assert.equal(meanDir([]), null);
});

test("bucketWind: average speed, peak gust, gaps stay null", () => {
  const items = [rd(29, 2, 270, 4), rd(25, 4, 270, 9), rd(5, 6, 90, 7)];
  const pts = bucketWind(items, T0 - 30 * 60000, T0, 10);
  assert.equal(pts.length, 3);
  assert.deepEqual(pts[0], { t: new Date(T0 - 30 * 60000).toISOString(), avgMph: 3, gustMph: 9, dirDeg: 270 });
  assert.deepEqual([pts[1].avgMph, pts[1].gustMph, pts[1].dirDeg], [null, null, null]); // dropout
  assert.deepEqual([pts[2].avgMph, pts[2].gustMph, pts[2].dirDeg], [6, 7, 90]);
});

test("windRose: shares by sector and speed bin, calm counted separately", () => {
  const items = [rd(0, 0.2, 90), rd(1, 2, 270), rd(2, 5, 270), rd(3, 5, 265), rd(4, 20, 0)];
  const r = windRose(items);
  assert.equal(r.total, 5);
  assert.equal(r.calmPct, 20);
  const w = r.sectors[12];
  assert.equal(w.dir, "W");
  assert.equal(w.pct, 60);
  assert.deepEqual(w.bins, [20, 40, 0, 0, 0]);
  assert.deepEqual(r.sectors[0].bins, [0, 0, 0, 0, 20]);
  assert.equal(r.sectors[4].pct, 0); // the calm east reading is not in the rose
  const sum = r.sectors.reduce((a, s) => a + s.pct, 0) + r.calmPct;
  assert.equal(Math.round(sum), 100);
});

test("windRose on no data is empty, not NaN", () => {
  const r = windRose([]);
  assert.equal(r.total, 0);
  assert.equal(r.calmPct, 0);
  assert.equal(r.sectors.length, 16);
});

test("localDayHour uses Pacific time, across the UTC date line", () => {
  assert.deepEqual(localDayHour(Date.UTC(2026, 9, 11, 3, 30)), { day: "2026-10-10", hour: 20 }); // PDT = UTC-7
  assert.deepEqual(localDayHour(Date.UTC(2026, 0, 15, 7, 59)), { day: "2026-01-14", hour: 23 });  // PST = UTC-8
  assert.deepEqual(localDayHour(Date.UTC(2026, 0, 15, 8, 0)), { day: "2026-01-15", hour: 0 });
});

test("dailyWind: per-day average, peak gust + time, dominant direction, hourly grid", () => {
  const items = [
    rd(24 * 60, 2, 90, 3),        // 3 pm the day before
    rd(60, 4, 270, 12),           // 2 pm
    rd(30, 6, 270, 8),            // 2:30 pm
    rd(0, 0.5, 100, 0.5),         // 3 pm, calm
  ].sort((a, b) => (a.sk < b.sk ? -1 : 1));
  const days = dailyWind(items);
  assert.deepEqual(days.map((d) => d.day), ["2026-10-09", "2026-10-10"]);
  const d = days[1];
  assert.equal(d.avgMph, 3.5);
  assert.equal(d.peakGustMph, 12);
  assert.equal(d.peakGustAt, items[1].sk);
  assert.equal(d.fromDir, "W");
  assert.equal(d.calmPct, 33);
  assert.equal(d.hourly.length, 24);
  assert.equal(d.hourly[14], 5);
  assert.equal(d.hourly[15], 0.5);
  assert.equal(d.hourly[3], null);
});

test("summarizeWind: shape, range filter and latest reading", () => {
  const items = [rd(30 * 60, 9, 180), rd(120, 3, 270, 5), rd(1, 4, 280, 6)];
  const s = summarizeWind(items, 24, T0);
  assert.equal(s.hours, 24);
  assert.equal(s.stepMin, 10);
  assert.equal(s.points.length, 144);
  assert.equal(s.count, 2); // the 30-hours-ago reading is out of range
  assert.equal(s.avgMph, 3.5);
  assert.deepEqual(s.latest, { t: items[2].sk, windMph: 4, gustMph: 6, dirDeg: 280, compass: "W" });
  assert.equal(s.points.at(-1).avgMph, 4);
});

test("summarizeWind with no readings degrades to empty", () => {
  const s = summarizeWind([], 24, T0);
  assert.equal(s.latest, null);
  assert.equal(s.avgMph, null);
  assert.equal(s.days.length, 0);
  assert.ok(s.points.every((p) => p.avgMph == null));
});

test("mockWind scenarios are deterministic and ordered calm < breezy < gusty", () => {
  const calm = mockWind("calm", 24, T0), breezy = mockWind("breezy", 24, T0), gusty = mockWind("gusty", 24, T0);
  assert.deepEqual(mockWind("breezy", 24, T0), breezy);
  assert.equal(breezy.source, "mock");
  assert.ok(calm.avgMph < breezy.avgMph && breezy.avgMph < gusty.avgMph);
  assert.ok(calm.rose.calmPct > gusty.rose.calmPct);
  assert.ok(gusty.points.every((p) => p.gustMph >= p.avgMph));
  assert.equal(mockWind("nonsense", 24, T0).avgMph, breezy.avgMph); // unknown scenario → breezy
});
