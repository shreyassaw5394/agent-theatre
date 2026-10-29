import type { AgentEvent, AgentEventKind } from "./types.js";

const KINDS: ReadonlySet<string> = new Set<AgentEventKind>([
  "session_start",
  "read_file",
  "edit_file",
  "write_file",
  "delete_file",
  "run_command",
  "test_result",
  "search",
  "subagent_start",
  "subagent_stop",
  "waiting_for_user",
  "turn_end",
  "error",
  "session_end",
]);

export function isAgentEvent(x: unknown): x is AgentEvent {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.seq === "number" &&
    typeof e.ts === "number" &&
    typeof e.sessionId === "string" &&
    typeof e.kind === "string" &&
    KINDS.has(e.kind)
  );
}
