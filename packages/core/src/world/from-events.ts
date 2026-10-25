import type { AgentEvent } from "../events/types.js";
import type { FileNode } from "./types.js";

/**
 * When the repo is not on disk (replaying someone else's session, or the VS
 * Code webview has no fs), infer a file list from the events themselves.
 * Sizes are estimated from the lines the session touched.
 */
export function filesFromEvents(events: AgentEvent[]): { files: FileNode[]; touched: string[] } {
  const loc = new Map<string, number>();
  const bump = (p: string, n: number) => loc.set(p, (loc.get(p) ?? 0) + n);
  for (const e of events) {
    if (e.kind === "read_file") bump(e.path, Math.max(5, Math.round((e.bytes ?? 400) / 40)));
    else if (e.kind === "edit_file") bump(e.path, Math.max(5, (e.added + e.removed) * 3));
    else if (e.kind === "write_file") bump(e.path, Math.max(5, e.added * 2));
    else if (e.kind === "run_command") for (const p of e.touched) bump(p, 5);
  }
  const touched = [...loc.keys()];
  return { files: touched.map((path) => ({ path, loc: loc.get(path)! })), touched };
}
