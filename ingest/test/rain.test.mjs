// Unit tests for rainState(recent, latest) from ingest/src/read.js. Pure logic,
// no AWS/network. Uses only Node's built-in runner (node:test) + node:assert/strict.
//
// Contract (verified against the source):
//   rate(r)     = r.hourlyrainin when it's a number, else 0
//   rainingNow  = rate(latest) > 0 OR any recent reading has rate > 0
//   rateInHr    = rate(latest) or null (0 -> null)
//   lastRainAt  = sk of the last wet recent reading, else latest.lastRainAt, else null
import { test } from "node:test";
import assert from "node:assert/strict";
import { rainState } from "../src/read.js";

test("raining now via the latest reading, recent empty", () => {
  const latest = { hourlyrainin: 0.05, lastRainAt: "2026-08-23T10:00:00Z" };
  const r = rainState([], latest);
  assert.equal(r.rainingNow, true);
  assert.equal(r.rateInHr, 0.05);
  // no wet recent reading, so fall back to latest.lastRainAt
  assert.equal(r.lastRainAt, "2026-08-23T10:00:00Z");
});

test("debounce: raining now because a recent reading was wet even though latest is dry", () => {
  const recent = [
    { hourlyrainin: 0, sk: "2026-08-23T09:00:00Z" },
    { hourlyrainin: 0.02, sk: "2026-08-23T09:30:00Z" },
    { hourlyrainin: 0, sk: "2026-08-23T09:45:00Z" },
  ];
  const latest = { hourlyrainin: 0 };
  const r = rainState(recent, latest);
  assert.equal(r.rainingNow, true); // held on by the wet reading in the window
  assert.equal(r.rateInHr, null); // latest rate is 0 -> null
  assert.equal(r.lastRainAt, "2026-08-23T09:30:00Z"); // the wet reading's sk
});

test("debounce: lastRainAt is the LAST wet reading when several are wet", () => {
  const recent = [
    { hourlyrainin: 0.03, sk: "2026-08-23T09:10:00Z" },
    { hourlyrainin: 0, sk: "2026-08-23T09:20:00Z" },
    { hourlyrainin: 0.01, sk: "2026-08-23T09:40:00Z" },
  ];
  const r = rainState(recent, { hourlyrainin: 0 });
  assert.equal(r.rainingNow, true);
  assert.equal(r.lastRainAt, "2026-08-23T09:40:00Z");
});

test("a wet recent reading takes precedence over latest.lastRainAt", () => {
  const recent = [{ hourlyrainin: 0.02, sk: "WET_SK" }];
  const latest = { hourlyrainin: 0.1, lastRainAt: "OLD_STAMP" };
  const r = rainState(recent, latest);
  assert.equal(r.lastRainAt, "WET_SK");
});

test("fully dry: rainingNow false, rateInHr null, lastRainAt from latest fallback", () => {
  const recent = [
    { hourlyrainin: 0, sk: "2026-08-23T09:00:00Z" },
    { hourlyrainin: 0, sk: "2026-08-23T09:30:00Z" },
  ];
  const latest = { hourlyrainin: 0 }; // no lastRainAt
  const r = rainState(recent, latest);
  assert.equal(r.rainingNow, false);
  assert.equal(r.rateInHr, null);
  assert.equal(r.lastRainAt, null);
});

test("omitted recent array (undefined) is treated as empty", () => {
  const r = rainState(undefined, { hourlyrainin: 0.1 });
  assert.equal(r.rainingNow, true);
  assert.equal(r.rateInHr, 0.1);
  assert.equal(r.lastRainAt, null); // no wet recent, no latest.lastRainAt
});

test("empty recent + dry latest is fully dry", () => {
  const r = rainState([], { hourlyrainin: 0 });
  assert.equal(r.rainingNow, false);
  assert.equal(r.rateInHr, null);
  assert.equal(r.lastRainAt, null);
});

test("non-numeric hourlyrainin (string) is treated as 0", () => {
  const latest = { hourlyrainin: "0.05" }; // string, not a number
  const recent = [{ hourlyrainin: "0.1", sk: "2026-08-23T09:00:00Z" }];
  const r = rainState(recent, latest);
  assert.equal(r.rainingNow, false); // both rates coerced to 0
  assert.equal(r.rateInHr, null);
  assert.equal(r.lastRainAt, null); // no wet reading, no latest.lastRainAt
});

test("missing/null hourlyrainin is treated as 0", () => {
  assert.equal(rainState([{ sk: "a" }], { hourlyrainin: null }).rainingNow, false);
  assert.equal(rainState([{ hourlyrainin: undefined, sk: "a" }], {}).rainingNow, false);
});

test("latest raining overrides an all-dry recent window", () => {
  const recent = [
    { hourlyrainin: 0, sk: "2026-08-23T09:00:00Z" },
    { hourlyrainin: 0, sk: "2026-08-23T09:30:00Z" },
  ];
  const r = rainState(recent, { hourlyrainin: 0.25, lastRainAt: "2026-08-23T10:00:00Z" });
  assert.equal(r.rainingNow, true);
  assert.equal(r.rateInHr, 0.25);
  assert.equal(r.lastRainAt, "2026-08-23T10:00:00Z"); // no wet recent -> latest fallback
});

test("null latest does not throw and reads as dry", () => {
  const r = rainState([], null);
  assert.equal(r.rainingNow, false);
  assert.equal(r.rateInHr, null);
  assert.equal(r.lastRainAt, null);
});
