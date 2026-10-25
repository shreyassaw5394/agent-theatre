import { describe, expect, it } from "vitest";
import { hookPayloadToEvents } from "../src/adapters/hook.js";
import { readJson } from "./_fixtures.js";

const run = (name: string) => hookPayloadToEvents(readJson(`hooks/${name}.json`), { now: 1_700_000_000_000, home: "/Users/dev" });

describe("hookPayloadToEvents", () => {
  it("SessionStart / SessionEnd", () => {
    expect(run("session-start").events[0]).toMatchObject({ kind: "session_start", repoId: "acme-shop", source: "hook", ts: 1_700_000_000_000 });
    expect(run("session-end").events[0]).toMatchObject({ kind: "session_end", reason: "user" });
  });
  it("PostToolUse Edit → edit_file with structuredPatch counts and tool_use_id as id", () => {
    const { events } = run("post-tool-use-edit");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: "toolu_hk_1", kind: "edit_file", path: "src/api/login.ts", added: 2, removed: 1, hunks: 1 });
  });
  it("PostToolUse Bash test → run_command + test_result", () => {
    const { events } = run("post-tool-use-bash-test");
    expect(events.map((e) => e.kind)).toEqual(["run_command", "test_result"]);
    expect(events[0]).toMatchObject({ argv0: "npx", intent: "test", ok: true, durationMs: 1020 });
    expect(events[1]).toMatchObject({ ok: false, passed: 22, failed: 2, framework: "vitest" });
    expect(events[1]?.id).toBe("toolu_hk_2:1");
  });
  it("PostToolUse Bash heredoc → write_file at the real file", () => {
    const { events } = run("post-tool-use-bash-heredoc");
    expect(events.map((e) => e.kind)).toEqual(["run_command", "write_file"]);
    expect(events[1]).toMatchObject({ path: "src/new.ts" });
  });
  it("tool events inside a subagent carry agent_id", () => {
    const { events } = run("post-tool-use-subagent-tool");
    expect(events[0]).toMatchObject({ kind: "read_file", path: "README.md", agentId: "agent_aaa111", bytes: 7 });
  });
  it("failures, subagents, notifications", () => {
    expect(run("post-tool-use-failure").events[0]).toMatchObject({ kind: "error", where: "Bash", retrying: false });
    expect(run("subagent-start").events[0]).toMatchObject({ kind: "subagent_start", childId: "agent_aaa111", label: "Explore" });
    expect(run("subagent-stop").events[0]).toMatchObject({ kind: "subagent_stop", childId: "agent_aaa111", ok: true });
    expect(run("notification-permission").events[0]).toMatchObject({ kind: "waiting_for_user", reason: "permission" });
  });
  it("Stop → turn_end with the claim check on last_assistant_message", () => {
    expect(run("stop-claims-success").events[0]).toMatchObject({ kind: "turn_end", claimedSuccess: true });
    expect(run("stop-hedged").events[0]).toMatchObject({ kind: "turn_end", claimedSuccess: false });
  });
  it("unknown events warn and emit nothing; garbage never throws", () => {
    const u = run("unknown-event");
    expect(u.events).toEqual([]);
    expect(u.warnings).toEqual([{ code: "unknown_row_type", detail: "SomethingNew" }]);
    expect(hookPayloadToEvents(null).events).toEqual([]);
    expect(hookPayloadToEvents("nope").warnings[0]?.code).toBe("missing_field");
  });
});
