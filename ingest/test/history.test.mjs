// Unit tests for daySegments(startISO, nowMs) from ingest/src/read.js (HLW-055).
// Pure logic, no AWS/network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { daySegments } from "../src/read.js";

test("daySegments: first day starts at startISO, later days cover the whole day", () => {
  const segs = daySegments("2026-10-18T13:05:00Z", Date.parse("2026-10-20T02:00:00Z"));
  assert.deepEqual(segs, [
    { mm: "2026-10", lo: "2026-10-18T13:05:00Z", hi: "2026-10-18U" },
    { mm: "2026-10", lo: "2026-10-19T", hi: "2026-10-19U" },
    { mm: "2026-10", lo: "2026-10-20T", hi: "2026-10-20U" },
  ]);
  // every reading key on a covered day falls inside its window
  assert.ok("2026-10-19T00:00:00Z" >= segs[1].lo && "2026-10-19T23:59:59Z" <= segs[1].hi);
  assert.ok("2026-10-18T13:04:59Z" < segs[0].lo);
});

test("daySegments: crosses a month boundary with the right partition month", () => {
  const segs = daySegments("2026-09-30T20:00:00Z", Date.parse("2026-10-01T05:00:00Z"));
  assert.deepEqual(segs.map((s) => s.mm), ["2026-09", "2026-10"]);
});

test("daySegments: 7 days is 8 windows", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const start = new Date(now - 168 * 3600e3).toISOString().slice(0, 19) + "Z";
  assert.equal(daySegments(start, now).length, 8);
});
