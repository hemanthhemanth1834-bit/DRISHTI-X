import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { radarHealth } from "../lib/radar";

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

describe("radarHealth derives readiness from actual frames", () => {
  it("no metadata -> OFFLINE", () => {
    const h = radarHealth(null, NOW);
    assert.equal(h.status, "OFFLINE");
    assert.equal(h.latestAgeMin, null);
  });
  it("empty frames -> OFFLINE", () => {
    assert.equal(radarHealth({ past: [], nowcast: [] }, NOW).status, "OFFLINE");
  });
  it("fresh frame -> LIVE with real age", () => {
    const h = radarHealth({ past: [{ time: NOW / 1000 - 600 }] }, NOW);
    assert.equal(h.status, "LIVE");
    assert.equal(h.latestAgeMin, 10);
  });
  it("stale frame -> DELAYED", () => {
    const h = radarHealth({ past: [{ time: NOW / 1000 - 3 * 3600 }] }, NOW);
    assert.equal(h.status, "DELAYED");
    assert.equal(h.latestAgeMin, 180);
  });
  it("newest frame wins across past + nowcast", () => {
    const h = radarHealth({ past: [{ time: NOW / 1000 - 3600 }], nowcast: [{ time: NOW / 1000 - 60 }] }, NOW);
    assert.equal(h.status, "LIVE");
    assert.equal(h.latestAgeMin, 1);
  });
});
