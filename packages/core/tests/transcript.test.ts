import { describe, expect, it } from "vitest";
import { parseTranscript } from "../src/adapters/transcript.js";
import type { AgentEvent } from "../src/events/types.js";
import { readFixture } from "./_fixtures.js";

const kinds = (es: AgentEvent[]) => es.map((e) => e.kind);
const of = <K extends AgentEvent["kind"]>(es: AgentEvent[], k: K) => es.filter((e) => e.kind === k) as Extract<AgentEvent, { kind: K }>[];

describe("episode-1", () => {
  const { events, warnings } = parseTranscript(readFixture("episode-1.jsonl"), { home: "/Users/dev" });
  it("tells the story in order", () => {
    expect(kinds(events)).toEqual([
      "session_start",
      "read_file",
      "edit_file",
      "run_command", "test_result",
      "read_file",
      "edit_file",
      "run_command", "test_result",
      "turn_end",
      "session_end",
    ]);
  });
  it("has repo-relative paths and real patch counts", () => {
    expect(of(events, "read_file")[0]?.path).toBe("src/auth/session.ts");
    expect(of(events, "edit_file")[0]).toMatchObject({ path: "src/api/login.ts", added: 14, removed: 3, hunks: 1 });
  });
  it("derives test results with counts from vitest output and failure from is_error", () => {
    const [t1, t2] = of(events, "test_result");
    expect(t1).toMatchObject({ ok: false, passed: 22, failed: 2, framework: "vitest" });
    expect(t2).toMatchObject({ ok: true, passed: 24, failed: 0, framework: "vitest" });
    const [r1] = of(events, "run_command");
    expect(r1).toMatchObject({ argv0: "npm", intent: "test", ok: false });
    expect(r1?.durationMs).toBe(1000);
  });
  it("session metadata and claim", () => {
    expect(events[0]).toMatchObject({ kind: "session_start", repoId: "acme-shop", branch: "main", seq: 0 });
    expect(of(events, "turn_end")[0]?.claimedSuccess).toBe(true);
    expect(events.at(-1)).toMatchObject({ kind: "session_end", reason: "stop", claimedSuccess: true });
    expect(events.every((e, i) => e.seq === i && e.sessionId === "11111111-2222-3333-4444-555555555555" && e.source === "transcript")).toBe(true);
  });
  it("ignores noise row types and reports each once", () => {
    const unknown = warnings.filter((w) => w.code === "unknown_row_type").map((w) => w.detail).sort();
    expect(unknown).toEqual(["api-request-blob", "attachment", "pr-link", "queue-operation"]);
    expect(warnings.filter((w) => w.code !== "unknown_row_type")).toEqual([]);
  });
});

describe("bash-heavy (no Edit tool at all)", () => {
  const { events } = parseTranscript(readFixture("bash-heavy.jsonl"));
  it("still produces file-level events from heredocs and sed -i", () => {
    const writes = of(events, "write_file").map((e) => e.path);
    expect(writes).toEqual(["src/api/health.ts", "src/api/index.ts", "src/api/health.ts"]);
    expect(of(events, "read_file").map((e) => e.path)).toEqual(["src/api/index.ts"]);
  });
  it("classifies every command", () => {
    expect(of(events, "run_command").map((e) => e.intent)).toEqual(["write_file", "write_file", "test", "write_file", "git"]);
  });
  it("test passes, then a later write, then a success claim — the director's claim-check case", () => {
    const k = kinds(events);
    const lastTest = k.lastIndexOf("test_result");
    const lastWrite = k.lastIndexOf("write_file");
    expect(of(events, "test_result")[0]?.ok).toBe(true);
    expect(lastWrite).toBeGreaterThan(lastTest);
    expect(of(events, "turn_end")[0]?.claimedSuccess).toBe(true);
  });
  it("never has a dead stretch: no gap > 3s between consecutive events", () => {
    for (let i = 1; i < events.length; i++) expect(events[i]!.ts - events[i - 1]!.ts).toBeLessThanOrEqual(3000);
  });
});

describe("subagents", () => {
  const { events } = parseTranscript(readFixture("subagents.jsonl"));
  it("async Agent → subagent_start, its sidechain work carries agentId + parentId, stop at session end", () => {
    const starts = of(events, "subagent_start");
    expect(starts.map((s) => [s.childId, s.label])).toEqual([["agent_aaa111", "Audit auth module"], ["agent_bbb222", "Check lint config"]]);
    const side = events.filter((e) => e.agentId === "agent_aaa111");
    expect(side.map((e) => e.kind)).toEqual(["read_file", "search"]);
    expect(side.every((e) => e.parentId === "toolu_sa_1")).toBe(true);
    expect(of(events, "search")[0]).toMatchObject({ scope: "repo", hits: 3 });
    const stops = of(events, "subagent_stop");
    expect(stops.map((s) => s.childId)).toEqual(["agent_bbb222", "agent_aaa111"]);
    expect(stops[1]?.parentId).toBe("toolu_sa_1");
  });
  it("main-thread events carry no agentId", () => {
    expect(events.filter((e) => e.kind === "session_start" || e.kind === "subagent_start").every((e) => e.agentId === undefined)).toBe(true);
  });
});

describe("robustness", () => {
  it("never throws on garbage and reports bad lines", () => {
    const { events, warnings } = parseTranscript('{"type":"user","sessionId":"s","timestamp":"2026-01-01T00:00:00Z","message":{"role":"user","content":"hi"}}\nnot json\n{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"WeirdTool","input":{}}]}}\n');
    expect(warnings.map((w) => w.code).sort()).toEqual(["bad_json", "unknown_tool", "unpaired_result"]);
    expect(events.map((e) => e.kind)).toEqual(["session_start", "run_command", "session_end"]);
  });
  it("empty input → no events, no throw", () => {
    expect(parseTranscript("")).toEqual({ events: [], warnings: [] });
  });
});
