/**
 * Agent-session event schema.
 *
 * Product-agnostic by design: this describes what any coding agent did in a
 * session, not what Agent Theatre draws. Nothing here may carry file contents,
 * prompts, command bodies or search queries — only repo-relative paths, counts,
 * a command's argv0 and a classified intent. That invariant is tested in
 * tests/privacy.test.ts against fixtures with planted secrets.
 */

export type EventSource = "hook" | "transcript" | "otel";

export interface EventBase {
  /** Stable id: the tool_use id from a transcript, or an id minted by the hook. */
  id: string;
  /** Monotonic within a session. */
  seq: number;
  /** Epoch milliseconds. */
  ts: number;
  sessionId: string;
  /** Present when the work was done by a subagent. */
  agentId?: string;
  /** Threads a subagent's work back to the tool_use that spawned it. */
  parentId?: string;
  source: EventSource;
}

export type CommandIntent =
  | "test"
  | "build"
  | "git"
  | "install"
  | "write_file"
  | "read_file"
  | "search"
  | "other";

export type SearchScope = "repo" | "web";
export type WaitReason = "permission" | "question" | "idle";
export type SessionEndReason = "stop" | "error" | "user";

export type AgentEventBody =
  | { kind: "session_start"; repoId: string; branch?: string }
  | { kind: "read_file"; path: string; bytes?: number }
  | { kind: "edit_file"; path: string; added: number; removed: number; hunks: number }
  | { kind: "write_file"; path: string; added: number; created: boolean }
  | {
      kind: "run_command";
      argv0: string;
      intent: CommandIntent;
      touched: string[];
      ok: boolean;
      durationMs?: number;
    }
  | {
      kind: "test_result";
      /** Derived from counts when a runner was recognised, else from exit status. */
      ok: boolean;
      passed: number;
      failed: number;
      skipped?: number;
      framework?: string;
      durationMs?: number;
    }
  | { kind: "search"; scope: SearchScope; hits?: number }
  /** Emitted by the spawning thread about its child; `childId` is the child, `agentId` (base) is the spawner. */
  | { kind: "subagent_start"; childId: string; label?: string }
  | { kind: "subagent_stop"; childId: string; ok: boolean }
  | { kind: "waiting_for_user"; reason: WaitReason }
  /** The agent finished a turn (Stop hook / end_turn). Carries the claim-check input. */
  /** `note`: the agent's own closing words, truncated — the one piece of text the stage carries, so the person knows what their turn is. Never the person's prompt. */
  | { kind: "turn_end"; claimedSuccess: boolean; note?: string }
  | { kind: "error"; where: string; retrying: boolean }
  | { kind: "session_end"; reason: SessionEndReason; claimedSuccess: boolean };

export type AgentEvent = EventBase & AgentEventBody;
export type AgentEventKind = AgentEventBody["kind"];

/** A non-fatal note from an adapter about a shape it did not recognise. */
export interface AdapterWarning {
  code: "unknown_row_type" | "unknown_tool" | "unpaired_result" | "bad_json" | "missing_field";
  detail: string;
  line?: number;
}

export interface AdapterResult {
  events: AgentEvent[];
  warnings: AdapterWarning[];
}
