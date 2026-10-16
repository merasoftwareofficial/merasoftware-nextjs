import { test } from "node:test";
import assert from "node:assert/strict";
import { formatIndiaDate, formatIndiaDateTime, indiaDayKey, indiaInputToUtc, toIndiaInput } from "../src/lib/date-time";

test("IST displays and input round trips are independent of host timezone", () => {
  const previous = process.env.TZ;
  try {
    const value = "2026-10-17T18:45:00.000Z";
    const expected = formatIndiaDateTime(value);
    for (const zone of ["Asia/Kolkata", "UTC", "America/New_York"]) {
      process.env.TZ = zone;
      assert.equal(formatIndiaDateTime(value), expected);
      assert.equal(toIndiaInput(value), "2026-10-18T00:15");
      assert.equal(indiaInputToUtc("2026-10-18T00:15"), value);
      assert.equal(indiaDayKey(value), "2026-10-18");
      assert.match(formatIndiaDate(value), /18/);
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test("invalid inputs cannot silently normalize or display Invalid Date", () => {
  for (const value of ["2026-02-30T12:00", "2026-10-17T24:00", "2026-13-01T10:00", "", "2026-01-01T10:00Z"]) {
    assert.throws(() => indiaInputToUtc(value));
  }
  assert.equal(formatIndiaDateTime("invalid"), "—");
  assert.equal(formatIndiaDate(null), "—");
  assert.equal(toIndiaInput(undefined), "");
  assert.equal(indiaInputToUtc("2028-02-29T12:00"), "2028-02-29T06:30:00.000Z");
  assert.equal(indiaInputToUtc("2026-10-17T23:59", true), "2026-10-17T18:29:59.999Z");
});
