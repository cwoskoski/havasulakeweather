// Unit tests for toNum(v) from ingest/src/read.js. Pure logic, no AWS/network.
// toNum coerces the WH31E extra-sensor fields (temp1f/humidity1/batt1), which the
// ingest currently stores as STRINGS, back to numbers for the API — returning null
// (not 0) when the sensor is absent, so the page falls back to the array.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toNum } from "../src/read.js";

test("toNum: numeric string -> number", () => {
  assert.equal(toNum("112.1"), 112.1);
  assert.equal(toNum("16"), 16);
  assert.equal(toNum("-3.5"), -3.5);
});

test("toNum: number passes through", () => {
  assert.equal(toNum(98), 98);
  assert.equal(toNum(0), 0);
});

test("toNum: absent/empty -> null (never 0)", () => {
  // DynamoDB returns undefined for a missing attribute; guard null/"" too, since
  // Number(null) and Number("") are 0 and would fake a 0°F reading.
  assert.equal(toNum(undefined), null);
  assert.equal(toNum(null), null);
  assert.equal(toNum(""), null);
});

test("toNum: non-numeric -> null", () => {
  assert.equal(toNum("abc"), null);
  assert.equal(toNum("NaN"), null);
});
