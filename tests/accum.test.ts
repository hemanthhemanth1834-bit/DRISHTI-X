import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sumWindow } from "../lib/accum";

describe("sumWindow exact-window accumulation", () => {
  const series = [0, 1, 2, 3, 4, null, 6, 7, 8, 9];

  it("sums a complete future window", () => {
    const w = sumWindow(series, 0, 3);
    assert.equal(w.value, 3);
    assert.equal(w.missing, 0);
    assert.equal(w.coverage01, 1);
  });

  it("withholds the total when any expected hour is missing", () => {
    const w = sumWindow(series, 3, 4);
    assert.equal(w.value, null);
    assert.equal(w.missing, 1);
    assert.equal(w.expected, 4);
    assert.equal(w.coverage01, 0.75);
  });

  it("withholds a past window that runs before the series start", () => {
    const w = sumWindow([1, 2, 3], 1, 3, true);
    assert.equal(w.value, null);
    assert.equal(w.missing, 2);
  });

  it("sums a complete past window including nowIdx-1", () => {
    const w = sumWindow([1, 2, 3, 4], 4, 3, true);
    assert.equal(w.value, 9);
    assert.equal(w.coverage01, 1);
  });
});
