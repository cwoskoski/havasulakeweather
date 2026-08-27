// Unit tests for the pure HRRR helpers in ingest/src/radar.js. No network.
// iemInit (UTC init string), hrrrInit (previous top-of-hour), futureFrames (now→+6h @30m).
import { test } from "node:test";
import assert from "node:assert/strict";
import { iemInit, hrrrInit, futureFrames } from "../src/radar.js";

test("iemInit formats YYYYMMDDHHmm in UTC", () => {
  assert.equal(iemInit(new Date(Date.UTC(2026, 7, 27, 15, 0, 0))), "202608271500"); // Aug = month 7
  assert.equal(iemInit(new Date(Date.UTC(2026, 0, 3, 9, 5, 0))), "202601030905");
});

test("hrrrInit is the previous top-of-hour (UTC), reliably processed", () => {
  const init = hrrrInit(Date.UTC(2026, 7, 27, 16, 20, 0));
  assert.equal(iemInit(init), "202608271500");
  // on the hour boundary it still steps back one hour
  assert.equal(iemInit(hrrrInit(Date.UTC(2026, 7, 27, 16, 0, 0))), "202608271500");
});

test("futureFrames: 30-min steps from now→+6h, 4-digit fmin, ascending", () => {
  const now = Date.UTC(2026, 7, 27, 16, 20, 0);
  const init = hrrrInit(now); // 15:00Z
  const frames = futureFrames(now, init);
  assert.equal(frames.length, 12);              // 16:30 … 22:00 inclusive
  assert.equal(frames[0].fmin, "0090");          // 16:30 − 15:00 = 90 min
  assert.equal(frames[0].kind, "fc");
  assert.equal(frames[frames.length - 1].fmin, "0420"); // 22:00 − 15:00 = 420 min
  for (let i = 1; i < frames.length; i++) {
    assert.ok(frames[i].time > frames[i - 1].time, "times strictly increasing");
    assert.ok(Number(frames[i].fmin) <= 1080, "within HRRR forecast range");
    assert.equal(frames[i].fmin.length, 4, "4-digit forecast minutes");
  }
});

test("futureFrames: honors hoursAhead + stepMin", () => {
  const now = Date.UTC(2026, 7, 27, 16, 0, 0);
  const init = hrrrInit(now); // 15:00Z
  const frames = futureFrames(now, init, { hoursAhead: 2, stepMin: 60 });
  // 17:00 and 18:00 (16:00 itself is not > now-rounded start; ceil(16:00)→16:00, so 16:00,17:00,18:00)
  assert.deepEqual(frames.map((f) => f.fmin), ["0060", "0120", "0180"]);
});
