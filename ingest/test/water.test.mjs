// Unit + light integration tests for ingest/src/water.js — the lake & river
// helpers. Uses only Node's built-in runner (node:test) + node:assert/strict; no
// jest/vitest/mocha, no network, no AWS. getWater is exercised through its
// in-memory MOCK map so nothing touches DynamoDB or RISE/USGS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { netFlow, pctFull, contextFor, getWater, davisUnits } from "../src/water.js";

// --- netFlow(inCfs, outCfs) -> { netCfs, trend } with a ±200 cfs deadband -------

test("netFlow: net above +200 cfs is rising", () => {
  assert.deepEqual(netFlow(1000, 500), { netCfs: 500, trend: "rising" });
});

test("netFlow: net below -200 cfs is draining", () => {
  assert.deepEqual(netFlow(500, 1000), { netCfs: -500, trend: "draining" });
});

test("netFlow: small positive net inside the deadband is steady", () => {
  assert.deepEqual(netFlow(1000, 900), { netCfs: 100, trend: "steady" });
});

test("netFlow: small negative net inside the deadband is steady", () => {
  assert.deepEqual(netFlow(900, 1000), { netCfs: -100, trend: "steady" });
});

test("netFlow: exactly +200 cfs stays steady (deadband is inclusive)", () => {
  assert.deepEqual(netFlow(1200, 1000), { netCfs: 200, trend: "steady" });
});

test("netFlow: +201 cfs tips over into rising", () => {
  assert.deepEqual(netFlow(1201, 1000), { netCfs: 201, trend: "rising" });
});

test("netFlow: exactly -200 cfs stays steady (deadband is inclusive)", () => {
  assert.deepEqual(netFlow(1000, 1200), { netCfs: -200, trend: "steady" });
});

test("netFlow: -201 cfs tips over into draining", () => {
  assert.deepEqual(netFlow(1000, 1201), { netCfs: -201, trend: "draining" });
});

test("netFlow: net is rounded to a whole cfs", () => {
  // 500.7 - 100.2 = 400.5 -> Math.round -> 401
  assert.deepEqual(netFlow(500.7, 100.2), { netCfs: 401, trend: "rising" });
});

test("netFlow: null inflow returns null", () => {
  assert.equal(netFlow(null, 500), null);
});

test("netFlow: null outflow returns null", () => {
  assert.equal(netFlow(500, null), null);
});

test("netFlow: undefined args return null", () => {
  assert.equal(netFlow(undefined, 500), null);
  assert.equal(netFlow(500, undefined), null);
  assert.equal(netFlow(undefined, undefined), null);
});

// --- pctFull(storageAf, capacityAf) -> integer percent, or null ----------------

test("pctFull: full storage reads 100", () => {
  assert.equal(pctFull(619000, 619000), 100);
});

test("pctFull: partial storage is rounded to an integer", () => {
  // 555000 / 619000 * 100 = 89.66... -> 90
  assert.equal(pctFull(555000, 619000), 90);
  // 1 / 3 * 100 = 33.33... -> 33
  assert.equal(pctFull(1, 3), 33);
  // 2 / 3 * 100 = 66.66... -> 67
  assert.equal(pctFull(2, 3), 67);
});

test("pctFull: zero storage against a real capacity is 0, not null", () => {
  assert.equal(pctFull(0, 100), 0);
});

test("pctFull: null/undefined storage returns null", () => {
  assert.equal(pctFull(null, 100), null);
  assert.equal(pctFull(undefined, 100), null);
});

test("pctFull: zero or missing capacity returns null (no divide-by-zero)", () => {
  assert.equal(pctFull(500, 0), null);
  assert.equal(pctFull(500, null), null);
  assert.equal(pctFull(500, undefined), null);
});

// --- contextFor(norm, value, month) -> seasonal band classification -------------
// norm shape mirrors ingest/data/water-normals.json:
//   { byMonth: { "<month>": { p10, median, p90 } }, allTime: { min, max } }
const NORM = {
  byMonth: { "8": { p10: 100, median: 200, p90: 300 } },
  allTime: { min: 10, max: 500 },
};

test("contextFor: null value returns null", () => {
  assert.equal(contextFor(NORM, null, 8), null);
});

test("contextFor: missing norm returns null", () => {
  assert.equal(contextFor(null, 200, 8), null);
  assert.equal(contextFor(undefined, 200, 8), null);
});

test("contextFor: value below the monthly p10 is low, with band fields", () => {
  assert.deepEqual(contextFor(NORM, 50, 8), {
    level: "low",
    monthLo: 100,
    monthMed: 200,
    monthHi: 300,
    allLo: 10,
    allHi: 500,
  });
});

test("contextFor: value between p10 and p90 is normal", () => {
  assert.equal(contextFor(NORM, 200, 8).level, "normal");
});

test("contextFor: value above the monthly p90 is high", () => {
  assert.equal(contextFor(NORM, 400, 8).level, "high");
});

test("contextFor: exactly at p10 is normal (strict less-than boundary)", () => {
  assert.equal(contextFor(NORM, 100, 8).level, "normal");
});

test("contextFor: exactly at p90 is normal (strict greater-than boundary)", () => {
  assert.equal(contextFor(NORM, 300, 8).level, "normal");
});

test("contextFor: a month with no band is unknown but still returns all-time range", () => {
  const c = contextFor(NORM, 200, 1); // no byMonth["1"]
  assert.equal(c.level, "unknown");
  assert.equal(c.monthLo, null);
  assert.equal(c.monthMed, null);
  assert.equal(c.monthHi, null);
  assert.equal(c.allLo, 10);
  assert.equal(c.allHi, 500);
});

// --- getWater(mock) -> full mock response, no AWS/network ------------------------
const RESERVOIR_KEYS = ["powell", "mead", "mohave", "havasu"];
const FLOW_KEYS = ["grandcanyon", "hoover", "davis", "parker"];

test("getWater('normal'): tags the response as a mock", async () => {
  const w = await getWater("normal");
  assert.equal(w.source, "mock");
  assert.equal(w.mock, "normal");
  assert.equal(w.location, "Lake Havasu");
  assert.equal(typeof w.updatedAt, "string");
});

test("getWater('normal'): cascade has 8 nodes — 4 reservoirs + 4 flows in order", async () => {
  const w = await getWater("normal");
  assert.ok(Array.isArray(w.cascade));
  assert.equal(w.cascade.length, 8);

  const reservoirs = w.cascade.filter((n) => n.type === "reservoir");
  const flows = w.cascade.filter((n) => n.type === "flow");
  assert.equal(reservoirs.length, 4);
  assert.equal(flows.length, 4);
  assert.deepEqual(reservoirs.map((n) => n.key), RESERVOIR_KEYS);
  assert.deepEqual(flows.map((n) => n.key), FLOW_KEYS);
});

test("getWater('normal'): Lake Havasu node is the starred reservoir with numeric pctFull + a valid netTrend", async () => {
  const w = await getWater("normal");
  const havasu = w.cascade.find((n) => n.key === "havasu");
  assert.ok(havasu, "expected a havasu node");
  assert.equal(havasu.type, "reservoir");
  assert.equal(havasu.star, true);
  assert.equal(typeof havasu.pctFull, "number");
  assert.ok(Number.isFinite(havasu.pctFull));
  assert.ok(["rising", "draining", "steady"].includes(havasu.netTrend));
});

test("getWater: every real scenario yields an 8-node cascade with a starred Havasu", async () => {
  for (const scenario of ["normal", "low-lake", "high-release"]) {
    const w = await getWater(scenario);
    assert.equal(w.source, "mock", `${scenario}: source`);
    assert.equal(w.mock, scenario, `${scenario}: mock name`);
    assert.equal(w.cascade.length, 8, `${scenario}: node count`);
    const havasu = w.cascade.find((n) => n.key === "havasu");
    assert.equal(havasu.star, true, `${scenario}: havasu starred`);
    assert.equal(typeof havasu.pctFull, "number", `${scenario}: numeric pctFull`);
    assert.ok(["rising", "draining", "steady"].includes(havasu.netTrend), `${scenario}: netTrend`);
  }
});

test("getWater: an unknown scenario name falls back to the normal fixture shape", async () => {
  const w = await getWater("does-not-exist");
  assert.equal(w.source, "mock");
  // MOCK[mock] || MOCK.normal — content defaults to normal, but the echoed name is preserved
  assert.equal(w.mock, "does-not-exist");
  assert.equal(w.cascade.length, 8);
});

// --- davisUnits(cfs) -> Davis Dam generating units, ~4,600 cfs each (HLW-057) -----
// Rounded to the nearest half; the rating uses the rounded value (<2 low, <3 minimum, 3+ good).

test("davisUnits: null / non-numeric cfs gives null", () => {
  assert.equal(davisUnits(null), null);
  assert.equal(davisUnits(undefined), null);
  assert.equal(davisUnits(NaN), null);
});

test("davisUnits: 1 unit (4,600 cfs) is low", () => {
  assert.deepEqual(davisUnits(4600), { units: 1, rating: "low", cfsPerUnit: 4600 });
});

test("davisUnits: just under 2 units rounds to 1.5 and is low", () => {
  assert.equal(davisUnits(8000).units, 1.5);
  assert.equal(davisUnits(8000).rating, "low");
});

test("davisUnits: exactly 2 units is minimum", () => {
  assert.deepEqual(davisUnits(9200), { units: 2, rating: "minimum", cfsPerUnit: 4600 });
});

test("davisUnits: a hair under 2 that rounds to 2 is minimum (badge and color agree)", () => {
  assert.equal(davisUnits(9100).units, 2);
  assert.equal(davisUnits(9100).rating, "minimum");
});

test("davisUnits: 2.5 units is still minimum", () => {
  assert.equal(davisUnits(11500).units, 2.5);
  assert.equal(davisUnits(11500).rating, "minimum");
});

test("davisUnits: exactly 3 units is good", () => {
  assert.deepEqual(davisUnits(13800), { units: 3, rating: "good", cfsPerUnit: 4600 });
});

test("davisUnits: 5 units (all wide open) is good", () => {
  assert.equal(davisUnits(23000).units, 5);
  assert.equal(davisUnits(23000).rating, "good");
});

const isDavisLow = (w) => w.kind === "river" && /Davis Dam is averaging/.test(w.text);

test("getWater('davis-low'): Davis under 2 units raises a low-water warning", async () => {
  const w = await getWater("davis-low");
  assert.equal(w.inflow.units.rating, "low");
  const warn = w.warnings.find(isDavisLow);
  assert.ok(warn, "expected a Davis low-water warning");
  assert.equal(warn.severity, "warning");
});

test("getWater('davis-minimum' / 'davis-good'): no low-water warning", async () => {
  for (const s of ["davis-minimum", "davis-good"]) {
    const w = await getWater(s);
    assert.equal(w.inflow.units.rating, s.slice(6));
    assert.equal(w.warnings.some(isDavisLow), false, s);
  }
});

test("getWater: Davis cascade node carries units; Parker does not (Davis only)", async () => {
  const w = await getWater("normal");
  const davis = w.cascade.find((n) => n.key === "davis");
  const parker = w.cascade.find((n) => n.key === "parker");
  assert.equal(davis.units.units, 2.5);
  assert.equal(parker.units, null);
  assert.equal(w.outflow.units, undefined);
});
