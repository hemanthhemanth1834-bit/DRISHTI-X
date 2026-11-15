import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMlFeatures, mlHeavyProbability, ML_FEATURES, ML_HEAVY_MM } from "../lib/ml";

describe("ml inference parity with validated artifact", () => {
  it("feature order matches training schema", () => {
    assert.deepEqual(ML_FEATURES, ["lag1", "lag2", "lag3", "lag6", "lag12", "lag24", "sum24", "gaps24", "hod_sin", "hod_cos"]);
    assert.equal(ML_HEAVY_MM, 5.0);
  });
  it("matches sklearn predict_proba reference vector (p=0.3253564197)", () => {
    const p = mlHeavyProbability([2.0, 1.0, 0.5, 3.0, 0.0, 1.5, 8.0, 0, 0.5, -0.866]);
    assert.ok(Math.abs(p - 0.3253564197) < 1e-9, `got ${p}`);
  });
  it("probability stays in [0,1]", () => {
    const p = mlHeavyProbability([30, 30, 30, 30, 30, 30, 200, 0, 0, 1]);
    assert.ok(p >= 0 && p <= 1);
  });
  it("incomplete history returns null, never imputes", () => {
    const past = Array.from({ length: 30 }, () => 0 as number | null);
    past[6] = null;
    assert.equal(buildMlFeatures(past, 12), null);
    past[6] = 1.0;
    const f = buildMlFeatures(past, 12);
    assert.ok(Array.isArray(f) && f.length === 10);
  });
});
