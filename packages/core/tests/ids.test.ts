import { describe, expect, it } from "vitest";
import { mintId } from "../src/events/ids.js";
import { isAgentEvent } from "../src/events/guards.js";

describe("mintId", () => {
  it("is unique and time-ordered within a tick", () => {
    const a = mintId(1000), b = mintId(1000), c = mintId(1001);
    expect(new Set([a, b, c]).size).toBe(3);
    expect(a < b && b < c).toBe(true);
    expect(a).toMatch(/^ev_[0-9a-z]{13}$/);
  });
});

describe("isAgentEvent", () => {
  it("guards shape and kind", () => {
    expect(isAgentEvent({ id: "x", seq: 0, ts: 1, sessionId: "s", kind: "read_file", path: "a" })).toBe(true);
    expect(isAgentEvent({ id: "x", seq: 0, ts: 1, sessionId: "s", kind: "nope" })).toBe(false);
    expect(isAgentEvent(null)).toBe(false);
  });
});
