import { noteOf } from "./hook.js";
import type { AdapterResult, AdapterWarning, AgentEvent, AgentEventBody } from "../events/types.js";
import { claimsSuccess } from "../director/claims.js";
import { basename, type PathContext } from "./paths.js";
import { toolCallToOutcome } from "./tool-call.js";

/**
 * Claude Code JSONL transcript → AgentEvents.
 *
 * The format is documented as internal and may change between releases, so
 * this adapter whitelists row types, never throws on an unexpected shape, and
 * reports what it skipped as warnings. Prompt text and file contents are
 * never read into events.
 */
export interface TranscriptOptions {
  home?: string;
  /** Override the agentId assigned to sidechain rows that carry none. */
  sidechainAgentId?: string;
}

const ROW_TYPES = new Set(["user", "assistant", "system"]);
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

interface Pending {
  name: string;
  input: unknown;
  ts: number;
  agentId?: string;
}

export function parseTranscript(text: string, opts: TranscriptOptions = {}): AdapterResult {
  const rows: unknown[] = [];
  const warnings: AdapterWarning[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      warnings.push({ code: "bad_json", detail: `line ${i + 1}`, line: i + 1 });
    }
  }
  const res = parseTranscriptRows(rows, opts);
  return { events: res.events, warnings: [...warnings, ...res.warnings] };
}

export function parseTranscriptRows(rows: unknown[], opts: TranscriptOptions = {}): AdapterResult {
  const events: AgentEvent[] = [];
  const warnings: AdapterWarning[] = [];
  const unknownTypes = new Set<string>();
  const pending = new Map<string, Pending>();
  const openSubagents = new Map<string, string>(); // agentId -> spawning event id

  let sessionId = "";
  let cwd = "";
  let branch: string | undefined;
  let firstTs = Number.NaN;
  let lastTs = Number.NaN;
  let lastAssistantText = "";
  let seq = 0;
  let sawEnd = false;

  const ctx = (): PathContext => ({ cwd, ...(opts.home ? { home: opts.home } : {}) });
  const push = (ts: number, id: string, body: AgentEventBody, extra: { agentId?: string; parentId?: string } = {}) => {
    events.push({ id, seq: seq++, ts, sessionId, source: "transcript", ...extra, ...body });
  };
  const tsOf = (row: Record<string, unknown>): number => {
    const t = str(row.timestamp);
    const n = t ? Date.parse(t) : Number.NaN;
    return Number.isFinite(n) ? n : Number.isFinite(lastTs) ? lastTs : 0;
  };
  const agentOf = (row: Record<string, unknown>): string | undefined =>
    str(row.agentId) ?? (row.isSidechain === true ? (opts.sidechainAgentId ?? "sidechain") : undefined);

  for (const raw of rows) {
    const row = obj(raw);
    const type = str(row.type) ?? "";
    if (!ROW_TYPES.has(type)) {
      if (type) unknownTypes.add(type);
      continue;
    }
    if (!sessionId && str(row.sessionId)) sessionId = str(row.sessionId)!;
    if (!cwd && str(row.cwd)) cwd = str(row.cwd)!;
    if (!branch && str(row.gitBranch)) branch = str(row.gitBranch);
    const ts = tsOf(row);
    if (!Number.isFinite(firstTs)) {
      firstTs = ts;
      push(ts, `${sessionId || "session"}:start`, { kind: "session_start", repoId: basename(cwd) || "repo", ...(branch ? { branch } : {}) });
    }
    lastTs = ts;
    const agentId = agentOf(row);
    const message = obj(row.message);
    const content = message.content;

    if (type === "system") {
      if (row.subtype === "api_error") {
        const attempt = typeof row.retryAttempt === "number" ? row.retryAttempt : 0;
        const max = typeof row.maxRetries === "number" ? row.maxRetries : 0;
        push(ts, str(row.uuid) ?? `sys:${seq}`, { kind: "error", where: "api", retrying: attempt < max }, agentId ? { agentId } : {});
      }
      continue;
    }

    if (type === "assistant") {
      const blocks = Array.isArray(content) ? content : [];
      for (const b of blocks) {
        const block = obj(b);
        if (block.type === "tool_use" && str(block.id) && str(block.name)) {
          pending.set(str(block.id)!, { name: str(block.name)!, input: block.input, ts, ...(agentId ? { agentId } : {}) });
        } else if (block.type === "text" && !agentId) {
          const t = str(block.text);
          if (t) lastAssistantText = t;
        }
      }
      if (typeof content === "string" && !agentId) lastAssistantText = content;
      if (message.stop_reason === "end_turn" && !agentId) {
        push(ts, `${str(row.uuid) ?? seq}:turn`, { kind: "turn_end", claimedSuccess: claimsSuccess(lastAssistantText), ...noteOf(lastAssistantText) });
      }
      continue;
    }

    // type === "user"
    if (row.toolDenialKind !== undefined) push(ts, `${str(row.uuid) ?? seq}:deny`, { kind: "waiting_for_user", reason: "permission" });
    const blocks = Array.isArray(content) ? content : [];
    for (const b of blocks) {
      const block = obj(b);
      if (block.type !== "tool_result") continue;
      const useId = str(block.tool_use_id);
      if (!useId) continue;
      const p = pending.get(useId);
      if (!p) {
        warnings.push({ code: "unpaired_result", detail: useId });
        continue;
      }
      pending.delete(useId);
      const response = row.toolUseResult ?? block.content;
      const out = toolCallToOutcome(
        { name: p.name, input: p.input, response, isError: block.is_error === true, durationMs: Math.max(0, ts - p.ts) },
        ctx(),
      );
      if (out.warning) warnings.push(out.warning);
      const rowAgent = p.agentId ?? agentId;
      const parentId = rowAgent ? openSubagents.get(rowAgent) : undefined;
      const extra = { ...(rowAgent ? { agentId: rowAgent } : {}), ...(parentId ? { parentId } : {}) };
      out.bodies.forEach((body, i) => push(p.ts, i === 0 ? useId : `${useId}:${i}`, body, extra));
      if (out.pendingSubagent) openSubagents.set(out.pendingSubagent.childId, useId);
    }
    if (blocks.length === 0 && typeof content === "string" && /\[Request interrupted by user/i.test(content)) {
      push(ts, `${str(row.uuid) ?? seq}:interrupt`, { kind: "waiting_for_user", reason: "idle" });
    }
  }

  for (const [useId, p] of pending) {
    warnings.push({ code: "unpaired_result", detail: `tool_use ${useId} (${p.name}) has no result` });
    const out = toolCallToOutcome({ name: p.name, input: p.input, isError: true }, ctx());
    if (out.warning) warnings.push(out.warning);
    out.bodies.forEach((body, i) => push(p.ts, i === 0 ? useId : `${useId}:${i}`, body, p.agentId ? { agentId: p.agentId } : {}));
  }
  for (const [childId, spawnId] of openSubagents) {
    push(lastTs, `${spawnId}:stop`, { kind: "subagent_stop", childId, ok: true }, { parentId: spawnId });
  }
  for (const t of unknownTypes) warnings.push({ code: "unknown_row_type", detail: t });

  if (Number.isFinite(firstTs) && !sawEnd) {
    sawEnd = true;
    push(lastTs, `${sessionId || "session"}:end`, { kind: "session_end", reason: "stop", claimedSuccess: claimsSuccess(lastAssistantText) });
  }
  return { events, warnings };
}
