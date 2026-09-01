// Unit tests for parseParams(event) from ingest/src/handler.js (HLW-048).
// The WS-2902 uploads via GET query string; an Ecowitt gateway (GW1100 relaying the WH31L)
// POSTs urlencoded form data — parseParams must read both. No AWS/network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseParams } from "../src/handler.js";

test("GET query string (WS-2902 style)", () => {
  const p = parseParams({ queryStringParameters: { PASSKEY: "ABC", tempf: "101.2" } });
  assert.equal(p.PASSKEY, "ABC");
  assert.equal(p.tempf, "101.2");
});

test("POST urlencoded body (Ecowitt gateway style)", () => {
  const p = parseParams({ body: "PASSKEY=GW1&stationtype=GW1100&lightning_num=3&lightning=12" });
  assert.equal(p.PASSKEY, "GW1");
  assert.equal(p.stationtype, "GW1100");
  assert.equal(p.lightning_num, "3");
  assert.equal(p.lightning, "12");
});

test("base64-encoded POST body decodes", () => {
  const raw = "PASSKEY=GW1&lightning_time=1788300000";
  const p = parseParams({ body: Buffer.from(raw, "utf8").toString("base64"), isBase64Encoded: true });
  assert.equal(p.PASSKEY, "GW1");
  assert.equal(p.lightning_time, "1788300000");
});

test("query string wins over body when both present", () => {
  const p = parseParams({ queryStringParameters: { PASSKEY: "Q" }, body: "PASSKEY=B" });
  assert.equal(p.PASSKEY, "Q");
});

test("path-jammed params fallback (some firmware)", () => {
  const p = parseParams({ rawPath: "/data/report/?PASSKEY=P&humidity=40" });
  assert.equal(p.PASSKEY, "P");
  assert.equal(p.humidity, "40");
});

test("empty event -> {}", () => {
  assert.deepEqual(parseParams({}), {});
  assert.deepEqual(parseParams({ body: "" }), {});
});
