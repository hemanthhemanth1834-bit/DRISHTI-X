import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toFiniteNumber, formatPrecip, barWidth, normalizeNwpModel, amountToRate } from "../lib/normalize";

describe("toFiniteNumber", () => {
  it("passes finite numbers", () => assert.equal(toFiniteNumber(2.5), 2.5));
  it("rejects null/undefined/NaN/Infinity", () => {
    assert.equal(toFiniteNumber(null), null);
    assert.equal(toFiniteNumber(undefined), null);
    assert.equal(toFiniteNumber(NaN), null);
    assert.equal(toFiniteNumber(Infinity), null);
  });
  it("coerces numeric strings", () => assert.equal(toFiniteNumber("3.5"), 3.5));
});

describe("formatPrecip keeps null distinct from zero", () => {
  it("0 -> '0.0 mm'", () => assert.equal(formatPrecip(0), "0.0 mm"));
  it("null -> '—'", () => assert.equal(formatPrecip(null), "—"));
});

describe("barWidth never NaN", () => {
  it("clamps 0-100 for all junk", () => {
    for (const v of [undefined, null, NaN, Infinity, 0, 30, 600]) {
      const w = barWidth(v);
      assert.ok(Number.isFinite(w) && w >= 0 && w <= 100);
    }
  });
});

describe("amountToRate converts an amount over its interval, not per hour", () => {
  it("15-min amount 0.25 mm -> 1.0 mm/h", () => assert.equal(amountToRate(0.25), 1));
  it("zero stays zero", () => assert.equal(amountToRate(0), 0));
  it("missing/negative -> null, never zero", () => {
    assert.equal(amountToRate(null), null);
    assert.equal(amountToRate(undefined), null);
    assert.equal(amountToRate(-0.1), null);
  });
  it("60-min interval is unchanged", () => assert.equal(amountToRate(2.5, 60), 2.5));
});

describe("normalizeNwpModel", () => {
  it("accepts canonical + legacy shapes, flags live-missing", () => {
    assert.equal(normalizeNwpModel({ model: "g", label: "G", resolution: "r", status: "LIVE", precipMM: 1 })?.precipMM, 1);
    assert.equal(normalizeNwpModel({ model: "g", label: "G", resolution: "r", status: "LIVE", precipMM24: 2 })?.precipMM, 2);
    const m = normalizeNwpModel({ model: "g", label: "G", resolution: "r", status: "LIVE" });
    assert.equal(m?.precipMM, null);
    assert.equal(m?.dataMissing, true);
  });
});
