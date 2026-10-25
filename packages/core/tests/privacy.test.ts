import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hookPayloadToEvents } from "../src/adapters/hook.js";
import { parseTranscript } from "../src/adapters/transcript.js";
import { findLeaks } from "../src/privacy/leaks.js";
import { fixturePath, readFixture, readJson } from "./_fixtures.js";

const markers = Object.values(readJson<Record<string, string>>("secrets.markers.json"));

describe("privacy invariant", () => {
  it("no planted prompt, file content, command body, stdout, query or agent prompt reaches the event stream or warnings", () => {
    const res = parseTranscript(readFixture("secrets.jsonl"), { home: "/Users/dev" });
    expect(res.events.length).toBeGreaterThan(5);
    expect(findLeaks(res, markers)).toEqual([]);
  });
  it("…and the only path that leaves is the redirect target, not the echoed body", () => {
    const { events } = parseTranscript(readFixture("secrets.jsonl"));
    const w = events.filter((e) => e.kind === "write_file").map((e) => (e as any).path);
    expect(w).toContain("out.txt");
  });
  it("hook payloads never pass tool_input/tool_response through verbatim", () => {
    for (const f of readdirSync(fixturePath("hooks"))) {
      const payload = readJson<Record<string, unknown>>(`hooks/${f}`);
      const res = hookPayloadToEvents(payload);
      const forbidden = [
        JSON.stringify(payload.tool_input ?? "\u0000"),
        JSON.stringify(payload.tool_response ?? "\u0000"),
        String(payload.last_assistant_message ?? "\u0000"),
        String(payload.transcript_path ?? "\u0000"),
        String(payload.message ?? "\u0000"),
      ].filter((s) => s.length > 3);
      expect(findLeaks(res, forbidden), f).toEqual([]);
    }
  });
  it("absolute home paths never leak a username", () => {
    const { events } = parseTranscript(readFixture("secrets.jsonl"), { home: "/Users/dev" });
    expect(findLeaks(events, ["/Users/dev"])).toEqual([]);
  });
});
