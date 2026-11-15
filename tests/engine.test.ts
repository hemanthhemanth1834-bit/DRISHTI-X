import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { agreementOf, spreadOf, consensusConfidence, computeRisk } from "../lib/engine";

describe("agreementOf (documented: max(0, 1 - spread/max(mean, 2)))", () => {
  it("all-dry models fully agree", () => assert.equal(agreementOf([0, 0, 0, 0]), 1));
  it("single outlier lowers agreement: [0,0.1,0.5,1.1] -> ~0.45", () => {
    assert.ok(Math.abs(agreementOf([0, 0.1, 0.5, 1.1]) - 0.45) < 1e-9);
  });
  it("needs >= 2 models", () => {
    assert.equal(agreementOf([5]), 0);
    assert.equal(agreementOf([]), 0);
  });
  it("ignores non-finite values", () => assert.equal(agreementOf([3, 3, NaN]), 1));
});

describe("spreadOf", () => {
  it("max-min over finite values", () => assert.equal(spreadOf([0, 0.1, 0.5, 1.1]), 1.1));
  it("<2 values -> 0", () => assert.equal(spreadOf([2]), 0));
});

describe("consensusConfidence", () => {
  it("3+ models tight spread -> HIGH", () => assert.equal(consensusConfidence(4, 0, 0), "HIGH"));
  it("1 model -> LOW", () => assert.equal(consensusConfidence(1, 0, 5), "LOW"));
});

describe("computeRisk bands + renormalization", () => {
  const base = {
    rainRateMMH: 0, accum1: 0, accum3: 0, accum6: 0, accum12: 0, accum24: 0,
    accum48: 0, antecedent24: 0, precipProbMax: 10, humidity: 60, pressureMSL: 1013,
    soilMoisture: 0.2, elevationM: 50, agreement01: 0.5, nwpMean24: 0, radarStatus: "READY" as const,
  };
  it("calm inputs -> NORMAL, score 0-19", () => {
    const r = computeRisk(base);
    assert.equal(r.level, "NORMAL");
    assert.ok(r.score < 20);
    assert.equal(r.renormalized, false);
  });
  it("extreme inputs -> EXTREME", () => {
    const r = computeRisk({ ...base, rainRateMMH: 30, accum6: 80, accum24: 150, precipProbMax: 100, soilMoisture: 0.4, nwpMean24: 90, agreement01: 0.9 });
    assert.equal(r.level, "EXTREME");
  });
  it("missing soil renormalizes with disclosure, no fake value", () => {
    const r = computeRisk({ ...base, soilMoisture: null });
    assert.equal(r.renormalized, true);
    assert.match(r.renormNote ?? "", /soil moisture/);
    const soil = r.contributions.find((c) => c.feature === "Soil moisture");
    assert.equal(soil?.available, false);
    assert.equal(soil?.points, 0);
  });
  it("inundation is always a labelled estimate", () => {
    const r = computeRisk(base);
    assert.equal(r.inundation.isEstimate, true);
    assert.match(r.inundation.terrainNote, /DEM\/slope/);
  });
});
