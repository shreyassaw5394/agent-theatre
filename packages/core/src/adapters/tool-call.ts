import type { AdapterWarning, AgentEventBody } from "../events/types.js";
import { classifyBash } from "./bash-intent.js";
import { relativizePath, type PathContext } from "./paths.js";
import { parseTestSummary } from "./test-summary.js";

/**
 * One tool invocation as seen by either adapter. `response` is the raw tool
 * result (transcript `toolUseResult` or hook `tool_response`); it is inspected
 * for counts and flags and never retained.
 */
export interface ToolCall {
  name: string;
  input: unknown;
  response?: unknown;
  isError?: boolean;
  durationMs?: number;
}

export interface ToolCallOutcome {
  bodies: AgentEventBody[];
  /** Set when the tool spawned a subagent that has not finished yet. */
  pendingSubagent?: { childId: string };
  warning?: AdapterWarning;
}

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);
const lineCount = (s: string | undefined): number => (s ? (s.match(/\n/g)?.length ?? 0) + (s.endsWith("\n") ? 0 : 1) : 0);

function patchCounts(response: unknown): { added: number; removed: number; hunks: number } | null {
  const patch = obj(response).structuredPatch;
  if (!Array.isArray(patch)) return null;
  let added = 0,
    removed = 0;
  for (const h of patch) {
    const lines = obj(h).lines;
    if (!Array.isArray(lines)) continue;
    for (const l of lines) {
      if (typeof l !== "string") continue;
      if (l.startsWith("+")) added++;
      else if (l.startsWith("-")) removed++;
    }
  }
  return { added, removed, hunks: patch.length };
}

function responseText(response: unknown): string {
  if (typeof response === "string") return response;
  const r = obj(response);
  const parts = [str(r.stdout), str(r.stderr), str(r.output)].filter((x): x is string => !!x);
  if (parts.length) return parts.join("\n");
  if (Array.isArray(response)) return response.map((b) => str(obj(b).text) ?? "").join("\n");
  return "";
}

const SEARCH_TOOLS_REPO = new Set(["Grep", "Glob", "LS", "ToolSearch"]);
const SEARCH_TOOLS_WEB = new Set(["WebSearch", "WebFetch"]);
const SILENT_TOOLS = new Set(["TodoWrite", "TodoRead", "Skill", "EnterPlanMode", "ExitPlanMode", "EnterWorktree", "ExitWorktree", "NotebookRead", "ListAgents", "SendMessage", "TaskStop", "Monitor", "ScheduleWakeup", "ReportFindings"]);

export function toolCallToOutcome(call: ToolCall, ctx: PathContext): ToolCallOutcome {
  const input = obj(call.input);
  const resp = call.response;
  const ok = !call.isError && obj(resp).interrupted !== true;
  const rel = (p: string) => relativizePath(p, ctx);
  const dur = call.durationMs !== undefined ? { durationMs: call.durationMs } : {};

  switch (call.name) {
    case "Read": {
      const path = str(input.file_path) ?? str(input.path);
      if (!path) return { bodies: [], warning: { code: "missing_field", detail: "Read without file_path" } };
      const content = str(obj(obj(resp).file).content);
      return { bodies: [{ kind: "read_file", path: rel(path), ...(content !== undefined ? { bytes: content.length } : {}) }] };
    }
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit": {
      const path = str(input.file_path) ?? str(input.notebook_path);
      if (!path) return { bodies: [], warning: { code: "missing_field", detail: `${call.name} without file_path` } };
      const counts = patchCounts(resp) ?? {
        added: lineCount(str(input.new_string) ?? str(input.new_source)),
        removed: lineCount(str(input.old_string)),
        hunks: 1,
      };
      return { bodies: [{ kind: "edit_file", path: rel(path), ...counts }] };
    }
    case "Write": {
      const path = str(input.file_path);
      if (!path) return { bodies: [], warning: { code: "missing_field", detail: "Write without file_path" } };
      const r = obj(resp);
      const created = r.type === "create" || (r.type === undefined && r.originalFile === null);
      return { bodies: [{ kind: "write_file", path: rel(path), added: lineCount(str(input.content)), created }] };
    }
    case "Bash": {
      const command = str(input.command) ?? "";
      const c = classifyBash(command);
      const touched = [...c.writes, ...c.reads].map(rel);
      const bodies: AgentEventBody[] = [{ kind: "run_command", argv0: c.argv0, intent: c.intent, touched, ok, ...dur }];
      for (const w of c.writes) bodies.push({ kind: "write_file", path: rel(w), added: 0, created: false });
      for (const r of c.reads) bodies.push({ kind: "read_file", path: rel(r) });
      if (c.intent === "test") {
        const sum = parseTestSummary(responseText(resp));
        if (sum) bodies.push({ kind: "test_result", ok: sum.failed === 0 && ok, passed: sum.passed, failed: sum.failed, ...(sum.skipped !== undefined ? { skipped: sum.skipped } : {}), framework: sum.framework, ...dur });
        else bodies.push({ kind: "test_result", ok, passed: 0, failed: 0, framework: "unknown", ...dur });
      }
      return { bodies };
    }
    case "Agent":
    case "Task": {
      const r = obj(resp);
      const agentId = str(r.agentId) ?? str(r.agent_id) ?? "";
      const label = str(input.description) ?? str(input.subagent_type);
      const start: AgentEventBody = { kind: "subagent_start", childId: agentId, ...(label ? { label } : {}) };
      if (r.status === "async_launched" || r.isAsync === true) return { bodies: [start], pendingSubagent: { childId: agentId } };
      return { bodies: [start, { kind: "subagent_stop", childId: agentId, ok }] };
    }
    case "AskUserQuestion":
      return { bodies: [{ kind: "waiting_for_user", reason: "question" }] };
  }
  if (SEARCH_TOOLS_REPO.has(call.name)) {
    const n = obj(resp).numFiles ?? obj(resp).numLines ?? obj(resp).count;
    return { bodies: [{ kind: "search", scope: "repo", ...(typeof n === "number" ? { hits: n } : {}) }] };
  }
  if (SEARCH_TOOLS_WEB.has(call.name)) return { bodies: [{ kind: "search", scope: "web" }] };
  if (SILENT_TOOLS.has(call.name)) return { bodies: [] };
  // Unknown tool (MCP tools arrive as mcp__server__tool). Treated as generic work.
  return {
    bodies: [{ kind: "run_command", argv0: call.name.slice(0, 40), intent: "other", touched: [], ok, ...dur }],
    warning: { code: "unknown_tool", detail: call.name.slice(0, 80) },
  };
}
