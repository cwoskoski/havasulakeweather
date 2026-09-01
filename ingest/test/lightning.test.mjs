// Unit tests for the lightning helpers in ingest/src/lightning.js (HLW-048). No AWS/network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { kmToMi, strikesInWindow, nearestInWindow, boltLevel, summarize, mockLightning } from "../src/lightning.js";

const T0 = Date.UTC(2026, 8, 1, 20, 0, 0); // fixed "now"
const iso = (minAgo) => new Date(T0 - minAgo * 60000).toISOString();

test("kmToMi converts and guards", () => {
  assert.equal(kmToMi(10), 6.2);
  assert.equal(kmToMi(0), 0);
  assert.equal(kmToMi(null), null);
  assert.equal(kmToMi(NaN), null);
});

test("strikesInWindow sums positive deltas, baseline from pre-window reading", () => {
  const pts = [
    { t: iso(70), num: 10 }, // pre-window baseline
    { t: iso(50), num: 12 }, // +2
    { t: iso(30), num: 12 }, // +0
    { t: iso(10), num: 15 }, // +3
  ];
  assert.equal(strikesInWindow(pts, T0 - 60 * 60000), 5);
});

test("strikesInWindow handles the midnight counter reset", () => {
  const pts = [
    { t: iso(50), num: 40 },
    { t: iso(30), num: 3 },  // reset: counter dropped, 3 new strikes since midnight
    { t: iso(10), num: 5 },  // +2
  ];
  assert.equal(strikesInWindow(pts, T0 - 60 * 60000), 5);
});

test("strikesInWindow: empty/no-data -> 0", () => {
  assert.equal(strikesInWindow([], T0), 0);
  assert.equal(strikesInWindow([{ t: iso(5), num: null }], T0 - 3600e3), 0);
});

test("nearestInWindow filters by strike time and takes the min", () => {
  const s = Math.floor(T0 / 1000);
  const pts = [
    { distMi: 4.0, strikeAt: s - 50 * 60 }, // outside 30-min window
    { distMi: 12.4, strikeAt: s - 25 * 60 },
    { distMi: 8.1, strikeAt: s - 5 * 60 },
  ];
  assert.equal(nearestInWindow(pts, s - 30 * 60), 8.1);
  assert.equal(nearestInWindow(pts, s - 60 * 60), 4.0);
  assert.equal(nearestInWindow([], s), null);
});

test("boltLevel ladder matches the agreed thresholds", () => {
  assert.equal(boltLevel({ s60: 0 }), 0);
  assert.equal(boltLevel({ s60: 3, s30: 0 }), 1);                                    // only stale-30 activity
  assert.equal(boltLevel({ s60: 3, s30: 2, nearest30Mi: 22 }), 1);                    // active but far
  assert.equal(boltLevel({ s60: 5, s30: 4, nearest30Mi: 12 }), 2);                    // storm in the area
  assert.equal(boltLevel({ s60: 9, s30: 8, s20: 5, nearest30Mi: 9, nearest20Mi: 4.5 }), 3); // close
  assert.equal(boltLevel({ s60: 9, s30: 8, s20: 5, nearest30Mi: 9, nearest20Mi: 9 }), 2);   // recent but not close
});

test("summarize composes level + count + last-strike ISO", () => {
  const s = Math.floor(T0 / 1000);
  const pts = [
    { t: iso(70), num: 0 },
    { t: iso(15), num: 6, distMi: 5.0, strikeAt: s - 15 * 60 },
    { t: iso(5), num: 9, distMi: 4.2, strikeAt: s - 5 * 60 },
  ];
  const out = summarize(pts, { lightning_num: 9, lightning: 6.8, lightning_time: s - 300, wh57batt: 4 }, T0);
  assert.equal(out.level, 3);
  assert.equal(out.countToday, 9);
  assert.equal(out.nearestMi, 4.2);
  assert.equal(out.lastStrikeAt, new Date((s - 300) * 1000).toISOString());
  assert.equal(out.battLow, false);
});

test("mock scenarios hit the intended bolt levels", () => {
  assert.equal(mockLightning("quiet", T0).current.level, 0);
  assert.equal(mockLightning("distant", T0).current.level, 1);
  assert.equal(mockLightning("close", T0).current.level, 3);
  assert.ok(mockLightning("close", T0).series.length > 10);
});
