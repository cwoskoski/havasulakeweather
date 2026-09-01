// Unit tests for carryForward(fresh, prev) from ingest/src/water-ingest.js (HLW-046).
// Pure merge, no AWS/network: a null field falls back to the previous snapshot so a
// transient source hiccup never blanks a good value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { carryForward } from "../src/water-ingest.js";

test("fresh value wins over previous", () => {
  const { merged, carried } = carryForward(
    { havasuElevFt: 451.2, davisCfs: 5000 },
    { havasuElevFt: 450.0, davisCfs: 4000 },
  );
  assert.equal(merged.havasuElevFt, 451.2);
  assert.equal(merged.davisCfs, 5000);
  assert.deepEqual(carried, []);
});

test("null fresh falls back to previous (never blanks a good value)", () => {
  const { merged, carried } = carryForward(
    { havasuElevFt: null, havasuStorageAf: null, davisCfs: 5409 },
    { havasuElevFt: 451.4, havasuStorageAf: 527971, davisCfs: 5000 },
  );
  assert.equal(merged.havasuElevFt, 451.4);     // carried
  assert.equal(merged.havasuStorageAf, 527971); // carried
  assert.equal(merged.davisCfs, 5409);          // fresh wins
  assert.ok(carried.includes("havasuElevFt"));
  assert.ok(carried.includes("havasuStorageAf"));
  assert.ok(!carried.includes("davisCfs"));
});

test("both null stays null (nothing to carry)", () => {
  const { merged, carried } = carryForward({ havasuElevFt: null }, { havasuElevFt: null });
  assert.equal(merged.havasuElevFt, null);
  assert.deepEqual(carried, []);
});

test("no previous snapshot leaves fresh untouched", () => {
  const { merged, carried } = carryForward({ havasuElevFt: null, davisCfs: 5409 }, null);
  assert.equal(merged.havasuElevFt, null);
  assert.equal(merged.davisCfs, 5409);
  assert.deepEqual(carried, []);
});

test("only the 08-31 failure shape: USGS fields carried, RISE fields fresh", () => {
  const fresh = { havasuElevFt: null, havasuStorageAf: null, mohaveElevFt: null, davisCfs: 5409, parkerCfs: 2989 };
  const prev = { havasuElevFt: 451.71, havasuStorageAf: 532373, mohaveElevFt: 643, davisCfs: 5389, parkerCfs: 1934 };
  const { merged, carried } = carryForward(fresh, prev);
  assert.equal(merged.havasuElevFt, 451.71);
  assert.equal(merged.mohaveElevFt, 643);
  assert.equal(merged.davisCfs, 5409);   // fresh RISE wins
  assert.equal(merged.parkerCfs, 2989);
  assert.deepEqual(carried.sort(), ["havasuElevFt", "havasuStorageAf", "mohaveElevFt"]);
});
