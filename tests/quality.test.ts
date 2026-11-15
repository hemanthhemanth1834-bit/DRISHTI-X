import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkField, qualityReport } from "../lib/quality";

describe("checkField plausibility gates", () => {
  it("accepts in-range values", () => {
    assert.equal(checkField("humidity", 81).ok, true);
    assert.equal(checkField("pressure", 1013).ok, true);
  });
  it("rejects out-of-range values", () => {
    assert.equal(checkField("humidity", 140).ok, false);
    assert.equal(checkField("pressure", 12).ok, false);
  });
  it("treats missing as failed, never invents", () => {
    const f = checkField("soilMoisture", null);
    assert.equal(f.ok, false);
    assert.match(f.note, /missing/);
  });
});

describe("qualityReport", () => {
  it("lists exactly the suspect fields", () => {
    const r = qualityReport({ humidity: 81, pressure: 12, rainRate: 5 });
    assert.deepEqual(r.suspect, ["pressure"]);
  });
});
