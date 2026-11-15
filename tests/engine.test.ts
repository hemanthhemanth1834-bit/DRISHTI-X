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
  it("missing accumulation windows renormalize and disclose coverage", () => {
    const r = computeRisk({ ...base, accum6: null, accum24: null, nwpMean24: null, agreement01: null });
    assert.ok(r.coverage01 < 1);
    assert.equal(r.renormalized, true);
    assert.match(r.renormNote ?? "", /6h accumulation/);
    assert.match(r.renormNote ?? "", /24h accumulation/);
    assert.match(r.renormNote ?? "", /NWP consensus/);
    assert.equal(r.contributions.find((c) => c.feature === "6-hour accumulation")?.points, 0);
    assert.equal(r.contributions.find((c) => c.feature === "24-hour accumulation")?.available, false);
  });
  it("all-null inputs produce no score and UNKNOWN inundation", () => {
    const r = computeRisk({
      ...base,
      rainRateMMH: null, accum1: null, accum3: null, accum6: null, accum12: null,
      accum24: null, accum48: null, antecedent24: null, precipProbMax: null,
      humidity: null, pressureMSL: null, soilMoisture: null, elevationM: null,
      agreement01: null, nwpMean24: null,
    });
    assert.equal(r.score, 0);
    assert.equal(r.coverage01, 0);
    assert.match(r.renormNote ?? "", /not computed/);
    assert.equal(r.inundation.class, "UNKNOWN");
    assert.equal(r.inundation.riskIndex, 0);
    assert.equal(r.inundation.coverage01, 0);
  });
  it("inundation risk index is 0-100 with factor coverage", () => {
    const r = computeRisk({ ...base, rainRateMMH: 8, accum24: 60, antecedent24: 30, soilMoisture: 0.3 });
    assert.ok(r.inundation.riskIndex >= 0 && r.inundation.riskIndex <= 100);
    assert.ok(r.inundation.coverage01 > 0 && r.inundation.coverage01 <= 1);
  });
  it("single-model NWP keeps the real mean and discloses unavailable agreement", () => {
    const r = computeRisk({ ...base, nwpMean24: 24, agreement01: null });
    const nwp = r.contributions.find((c) => c.feature === "NWP consensus");
    assert.equal(nwp?.available, true);
    assert.ok((nwp?.points ?? 0) > 0);
    assert.match(nwp?.detail ?? "", /no consensus adjustment/);
  });
});
