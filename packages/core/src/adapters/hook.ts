import type { AdapterResult, AgentEvent, AgentEventBody, SessionEndReason } from "../events/types.js";
import { mintId } from "../events/ids.js";
import { claimsSuccess } from "../director/claims.js";
import { basename, type PathContext } from "./paths.js";
import { toolCallToOutcome } from "./tool-call.js";

/**
 * Claude Code hook stdin payload → AgentEvents (live mode).
 * Field names per code.claude.com/docs/en/hooks. Unknown events produce a
 * warning and no event; the hook script itself always exits 0 regardless.
 */
export interface HookOptions {
  now?: number;
  home?: string;
}

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

/** Events where `agent_id` identifies the thread doing the work (attribution). SubagentStart/Stop name the child instead. */
const TOOL_EVENTS = new Set(["PreToolUse", "PostToolUse", "PostToolUseFailure"]);

function endReason(reason: string | undefined): SessionEndReason {
  switch (reason) {
    case "clear":
    case "logout":
    case "prompt_input_exit":
      return "user";
    default:
      return "stop";
  }
}

export function hookPayloadToEvents(payload: unknown, opts: HookOptions = {}): AdapterResult {
  const p = obj(payload);
  const name = str(p.hook_event_name);
  const sessionId = str(p.session_id) ?? "";
  const ts = opts.now ?? Date.now();
  if (!name) return { events: [], warnings: [{ code: "missing_field", detail: "hook_event_name" }] };
  const cwd = str(p.cwd) ?? "";
  const ctx: PathContext = { cwd, ...(opts.home ? { home: opts.home } : {}) };
  const agentId = TOOL_EVENTS.has(name) ? str(p.agent_id) : undefined;
  const extra = agentId ? { agentId } : {};
  let seq = 0;
  const mk = (body: AgentEventBody, id = mintId(ts)): AgentEvent => ({ id, seq: seq++, ts, sessionId, source: "hook", ...extra, ...body });
  const one = (body: AgentEventBody): AdapterResult => ({ events: [mk(body)], warnings: [] });

  switch (name) {
    case "SessionStart":
      return one({ kind: "session_start", repoId: basename(cwd) || "repo" });
    case "SessionEnd":
      return one({ kind: "session_end", reason: endReason(str(p.reason)), claimedSuccess: false });
    case "Stop":
      return one({ kind: "turn_end", claimedSuccess: claimsSuccess(str(p.last_assistant_message)) });
    case "SubagentStart": {
      const id = str(p.agent_id) ?? "";
      const label = str(p.agent_type);
      return { events: [mk({ kind: "subagent_start", childId: id, ...(label ? { label } : {}) })], warnings: [] };
    }
    case "SubagentStop":
      return one({ kind: "subagent_stop", childId: str(p.agent_id) ?? "", ok: true });
    case "Notification": {
      const t = str(p.notification_type);
      if (t === "permission_prompt") return one({ kind: "waiting_for_user", reason: "permission" });
      if (t === "idle_prompt") return one({ kind: "waiting_for_user", reason: "idle" });
      if (t === "elicitation_dialog") return one({ kind: "waiting_for_user", reason: "question" });
      return { events: [], warnings: [] };
    }
    case "PostToolUseFailure":
      return one({ kind: "error", where: str(p.tool_name) ?? "tool", retrying: false });
    case "PostToolUse": {
      const tool = str(p.tool_name);
      if (!tool) return { events: [], warnings: [{ code: "missing_field", detail: "tool_name" }] };
      const dur = typeof p.duration_ms === "number" ? { durationMs: p.duration_ms } : {};
      const out = toolCallToOutcome({ name: tool, input: p.tool_input, response: p.tool_response, ...dur }, ctx);
      const baseId = str(p.tool_use_id) ?? mintId(ts);
      const events = out.bodies.map((body, i) => mk(body, i === 0 ? baseId : `${baseId}:${i}`));
      return { events, warnings: out.warning ? [out.warning] : [] };
    }
    case "PreToolUse":
    case "UserPromptSubmit":
    case "PreCompact":
    case "PostCompact":
      return { events: [], warnings: [] };
  }
  return { events: [], warnings: [{ code: "unknown_row_type", detail: name }] };
}
