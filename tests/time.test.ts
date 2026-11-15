import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toUnixSeconds } from "../lib/time";

describe("toUnixSeconds converts provider-local wall time to a real instant", () => {
  it("IST 21:45 (+19800s) is 16:15 UTC", () => {
    const unix = toUnixSeconds("2026-11-15T21:45", 19800);
    assert.equal(unix, Date.UTC(2026, 10, 15, 16, 15) / 1000);
    assert.equal(new Date((unix as number) * 1000).toISOString(), "2026-11-15T16:15:00.000Z");
  });

  it("zero offset is unchanged", () => {
    assert.equal(toUnixSeconds("2026-01-01T00:00", 0), Date.UTC(2026, 0, 1, 0, 0) / 1000);
  });

  it("negative offset shifts the other way", () => {
    assert.equal(
      toUnixSeconds("2026-01-01T12:00", -18000),
      Date.UTC(2026, 0, 1, 17, 0) / 1000
    );
  });

  it("does not depend on the host timezone", () => {
    // Same wall time with explicit offsets describes two different instants.
    assert.notEqual(toUnixSeconds("2026-06-01T12:00", 19800), toUnixSeconds("2026-06-01T12:00", 0));
  });

  it("invalid input -> null, never a fabricated epoch", () => {
    assert.equal(toUnixSeconds("", 19800), null);
    assert.equal(toUnixSeconds("not-a-date", 19800), null);
  });
});
