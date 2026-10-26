import { describe, expect, it } from "vitest";
import { parseTranscript } from "../src/adapters/transcript.js";
import { direct, Director } from "../src/director/direct.js";
import type { Beat } from "../src/director/types.js";
import type { AgentEvent } from "../src/events/types.js";
import { filesFromEvents } from "../src/world/from-events.js";
import { generateWorld } from "../src/world/generate.js";
import { readFixture } from "./_fixtures.js";

const load = (name: string) => {
  const { events } = parseTranscript(readFixture(name), { home: "/Users/dev" });
  const { files, touched } = filesFromEvents(events);
  return { events, world: generateWorld({ repoId: name, files, touched }) };
};
const kinds = (bs: Beat[]) => bs.filter((b) => b.kind !== "idle").map((b) => b.kind);
const of = <K extends Beat["kind"]>(bs: Beat[], k: K) => bs.filter((b) => b.kind === k) as Extract<Beat, { kind: K }>[];

let n = 0;
const ev = (body: Partial<AgentEvent> & { kind: AgentEvent["kind"] }, ts: number): AgentEvent =>
  ({ id: `e${n++}`, seq: n, ts, sessionId: "s", source: "transcript", ...body }) as AgentEvent;

describe("episode-1 → beats", () => {
  const { events, world } = load("episode-1.jsonl");
  const beats = direct(events, world);
  it("tells the story: read, build, fail, gremlin, read test, chase, build, pass, banish, celebrate", () => {
    expect(kinds(beats)).toEqual([
      "curtain_up",
      "walk_to", "read",
      "walk_to", "build",
      "walk_to", "run_tests", "test_outcome", "spawn_gremlin",
      "read", // already standing at the login.spec.ts beacon — no walk
      "walk_to", "chase", "build",
      "walk_to", "run_tests", "test_outcome", "banish", "celebrate",
      "your_turn",
      "curtain_down",
    ]);
  });
  it("moods follow the events: curious → focused → uneasy → happy", () => {
    const m = (k: Beat["kind"], i = 0) => of(beats, k)[i]?.mood;
    expect(m("read")).toBe("curious");
    expect(m("build")).toBe("focused");
    expect(m("spawn_gremlin")).toBe("uneasy");
    expect(m("celebrate")).toBe("happy");
    expect(of(beats, "curtain_down")[0]).toMatchObject({ verified: true, mood: "happy" });
  });
  it("the gremlin spawns at the last-edited file and is banished on the pass", () => {
    const g = of(beats, "spawn_gremlin")[0]!;
    expect(g.target).toBe("p:src/api/login.ts");
    expect(of(beats, "chase")[0]).toMatchObject({ gremlinId: g.gremlinId, target: "p:src/api/login.ts" });
    expect(of(beats, "banish")[0]?.gremlinId).toBe(g.gremlinId);
  });
  it("tests run at the beacon for the test file read; outcomes carry counts", () => {
    expect(of(beats, "run_tests")[1]?.target).toBe("p:tests/login.spec.ts");
    expect(of(beats, "test_outcome").map((t) => [t.outcome, t.passed, t.failed])).toEqual([["fail", 22, 2], ["pass", 24, 0]]);
  });
  it("is deterministic and every beat traces to an event", () => {
    expect(JSON.stringify(direct(events, world))).toBe(JSON.stringify(beats));
    const ids = new Set(events.map((e) => e.id));
    for (const b of beats) expect(b.sourceEventIds.every((id) => ids.has(id)), b.kind).toBe(true);
  });
  it("scene clock is monotonic with no overlaps and walks are bounded", () => {
    for (let i = 1; i < beats.length; i++) expect(beats[i]!.atMs).toBeGreaterThanOrEqual(beats[i - 1]!.atMs);
    for (const w of of(beats, "walk_to")) { expect(w.durationMs).toBeGreaterThanOrEqual(300); expect(w.durationMs).toBeLessThanOrEqual(2500); }
  });
});

describe("claim check", () => {
  it("bash-heavy: edit after the last pass + 'Done.' → unverified_claim, curtain_down unverified", () => {
    const { events, world } = load("bash-heavy.jsonl");
    const beats = direct(events, world);
    expect(of(beats, "unverified_claim")).toHaveLength(1);
    expect(of(beats, "unverified_claim")[0]?.mood).toBe("uneasy");
    expect(of(beats, "curtain_down")[0]?.verified).toBe(false);
  });
  it("a claim with no edits in the turn (pure Q&A) is not flagged", () => {
    const world = generateWorld({ repoId: "r", files: [{ path: "a.ts", loc: 10 }] });
    const beats = direct([ev({ kind: "session_start", repoId: "r" }, 0), ev({ kind: "read_file", path: "a.ts" }, 1000), ev({ kind: "turn_end", claimedSuccess: true }, 2000)], world);
    expect(of(beats, "unverified_claim")).toHaveLength(0);
  });
  it("a claim after an edit WITH a passing test is not flagged; a later pass banishes a claim gremlin", () => {
    const world = generateWorld({ repoId: "r", files: [{ path: "a.ts", loc: 10 }, { path: "a.test.ts", loc: 10 }] });
    const ok = direct([ev({ kind: "session_start", repoId: "r" }, 0), ev({ kind: "edit_file", path: "a.ts", added: 2, removed: 1, hunks: 1 }, 1000),
      ev({ kind: "run_command", argv0: "npm", intent: "test", touched: [], ok: true }, 2000), ev({ kind: "test_result", ok: true, passed: 3, failed: 0 }, 2100),
      ev({ kind: "turn_end", claimedSuccess: true }, 3000)], world);
    expect(of(ok, "unverified_claim")).toHaveLength(0);
    const late = direct([ev({ kind: "session_start", repoId: "r" }, 0), ev({ kind: "edit_file", path: "a.ts", added: 2, removed: 1, hunks: 1 }, 1000),
      ev({ kind: "turn_end", claimedSuccess: true }, 2000),
      ev({ kind: "run_command", argv0: "npm", intent: "test", touched: [], ok: true }, 3000), ev({ kind: "test_result", ok: true, passed: 3, failed: 0 }, 3100)], world);
    expect(of(late, "unverified_claim")).toHaveLength(1);
    expect(of(late, "banish").map((b) => b.gremlinId)).toEqual([of(late, "unverified_claim")[0]!.gremlinId]);
  });
});

describe("mood, waiting, helpers, gaps", () => {
  const world = generateWorld({ repoId: "r", files: [{ path: "a.ts", loc: 10 }, { path: "b.ts", loc: 10 }] });
  it("two errors inside the window → lost; a pass clears it", () => {
    const beats = direct([ev({ kind: "session_start", repoId: "r" }, 0), ev({ kind: "error", where: "api", retrying: true }, 1000), ev({ kind: "error", where: "api", retrying: true }, 2000),
      ev({ kind: "read_file", path: "a.ts" }, 3000), ev({ kind: "run_command", argv0: "npm", intent: "test", touched: [], ok: true }, 4000), ev({ kind: "test_result", ok: true, passed: 1, failed: 0 }, 4100)], world);
    expect(of(beats, "stumble").map((s) => s.mood)).toEqual(["uneasy", "lost"]);
    expect(of(beats, "read")[0]?.mood).toBe("lost");
    expect(of(beats, "celebrate")[0]?.mood).toBe("happy");
  });
  it("permission prompts are blocked_on_you; turn ends are your_turn", () => {
    const beats = direct([ev({ kind: "session_start", repoId: "r" }, 0), ev({ kind: "waiting_for_user", reason: "permission" }, 1000), ev({ kind: "turn_end", claimedSuccess: false }, 2000)], world);
    expect(kinds(beats)).toEqual(["curtain_up", "blocked_on_you", "your_turn"]);
  });
  it("subagents: summoned at the dock, act as their own actor, dismissed", () => {
    const { events, world: w } = load("subagents.jsonl");
    const beats = direct(events, w);
    expect(of(beats, "summon_helper").map((h) => h.helperId)).toEqual(["agent_aaa111", "agent_bbb222"]);
    const helperBeats = beats.filter((b) => b.actor === "agent_aaa111");
    expect(helperBeats.map((b) => b.kind)).toEqual(["walk_to", "read", "search", "dismiss_helper"]);
    expect(of(beats, "dismiss_helper")).toHaveLength(2);
  });
  it("files created mid-session are raised into their district", () => {
    const beats = direct([ev({ kind: "session_start", repoId: "r" }, 0), ev({ kind: "write_file", path: "src/new.ts", added: 12, created: true }, 1000)], world);
    const r = of(beats, "raise");
    expect(r[0]?.newPlace?.path).toBe("src/new.ts");
    expect(kinds(beats)).toEqual(["curtain_up", "raise", "walk_to", "raise", "build"]);
  });
  it("real gaps are compressed: a 4-minute think becomes a ≤2.5 s idle", () => {
    const beats = direct([ev({ kind: "session_start", repoId: "r" }, 0), ev({ kind: "read_file", path: "a.ts" }, 240_000), ev({ kind: "read_file", path: "b.ts" }, 240_500)], world);
    const idles = of(beats, "idle");
    expect(idles).toHaveLength(1);
    expect(idles[0]!.durationMs).toBeLessThanOrEqual(2500);
    const end = beats.at(-1)!;
    expect(end.atMs + end.durationMs).toBeLessThan(15_000);
  });
  it("incremental feed equals batch direct", () => {
    const { events, world: w } = load("episode-1.jsonl");
    const d = new Director(w);
    const streamed = events.flatMap((e) => d.feed(e));
    expect(JSON.stringify(streamed)).toBe(JSON.stringify(direct(events, w)));
  });
});

describe("unknown test outcome", () => {
  it("a zero exit with no counts is not evidence: a success claim after an edit still gets the gremlin", async () => {
    const { direct } = await import("../src/director/direct.js");
    const { generateWorld } = await import("../src/world/generate.js");
    const world = generateWorld({ repoId: "r", files: [{ path: "src/a.ts", loc: 50 }, { path: "tests/a.test.ts", loc: 20 }], touched: ["src/a.ts"] });
    const base = { sessionId: "s", source: "hook" as const };
    const ev = [
      { ...base, id: "e1", seq: 1, ts: 1000, kind: "edit_file" as const, path: "src/a.ts", added: 3, removed: 1, hunks: 1 },
      { ...base, id: "e2", seq: 2, ts: 2000, kind: "run_command" as const, argv0: "npx", intent: "test" as const, touched: [], ok: true },
      { ...base, id: "e3", seq: 3, ts: 2100, kind: "test_result" as const, ok: true, passed: 0, failed: 0, framework: "unknown" },
      { ...base, id: "e4", seq: 4, ts: 3000, kind: "turn_end" as const, claimedSuccess: true },
    ];
    const beats = direct(ev as any, world);
    expect(beats.some((b) => b.kind === "unverified_claim")).toBe(true);
    expect(beats.find((b) => b.kind === "test_outcome")).toMatchObject({ outcome: "unknown" });
  });
});
