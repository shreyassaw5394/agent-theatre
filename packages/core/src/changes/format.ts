import type { ChangeSet, FileChange } from "./build.js";

/**
 * Text renderings of a ChangeSet. Paths and counts only; no file contents,
 * prompts or session titles (titles can be the person's own words).
 */
const counts = (f: Pick<FileChange, "added" | "removed" | "action">): string =>
  f.action === "deleted" ? "deleted" : f.action === "created" ? `new, +${f.added}` : `+${f.added} −${f.removed}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "7 files changed (+182 −40) · 2 new · 1 deleted" — or "" when nothing changed. */
export function headline(cs: ChangeSet): string {
  const t = cs.totals;
  if (!t.changed) return "";
  const bits = [`${plural(t.changed, "file")} changed (+${t.added} −${t.removed})`];
  if (t.created) bits.push(`${t.created} new`);
  if (t.deleted) bits.push(`${t.deleted} deleted`);
  return bits.join(" · ");
}

/** One short message for the end of a turn (Claude Code shows it under the reply). "" when the turn changed nothing. */
export function turnSummary(cs: ChangeSet, opts: { mapUrl?: string; max?: number } = {}): string {
  const head = headline(cs);
  if (!head) return "";
  const max = opts.max ?? 5;
  const changed = cs.files.filter((f) => f.by === "agent" && f.action !== "read");
  const list = changed.slice(0, max).map((f) => `${f.path} (${counts(f)})`);
  if (changed.length > max) list.push(`${changed.length - max} more`);
  const tail = opts.mapUrl ? ` · map: ${opts.mapUrl}` : "";
  return `Agent Theatre · this turn: ${head}\n${list.join(", ")}${tail}`;
}

/** Markdown for a pull request comment or a paste. Starts with a marker so a later post can replace it. */
export const PR_MARKER = "<!-- agent-theatre:changes -->";
export function toMarkdown(cs: ChangeSet, opts: { title?: string; marker?: boolean } = {}): string {
  const t = cs.totals;
  const out: string[] = [];
  if (opts.marker !== false) out.push(PR_MARKER);
  out.push(`### ${opts.title ?? "What the agent touched"}`, "");
  if (!t.changed) out.push("The agent changed no files.", "");
  else {
    out.push(`**${headline(cs)}**${t.read ? ` · ${plural(t.read, "file")} only read` : ""}`, "");
    out.push("| | File | Lines |", "| :- | :- | -: |");
    for (const f of cs.files.filter((x) => x.by === "agent" && x.action !== "read")) {
      const lines = f.action === "deleted" ? "" : f.action === "created" ? `+${f.added}` : `+${f.added} −${f.removed}`;
      const who = f.agents.some((a) => a !== "main") ? " (subagent)" : "";
      out.push(`| ${f.action}${who} | \`${mdCode(f.path)}\` | ${lines} |`);
    }
    out.push("");
  }
  const reads = cs.files.filter((f) => f.by === "agent" && f.action === "read");
  if (reads.length) {
    out.push(`<details><summary>Read only (${reads.length})</summary>`, "");
    for (const f of reads.slice(0, 200)) out.push(`- \`${mdCode(f.path)}\``);
    if (reads.length > 200) out.push(`- …and ${reads.length - 200} more`);
    out.push("", "</details>", "");
  }
  const outside = cs.files.filter((f) => f.by === "outside");
  if (outside.length) {
    out.push(`<details><summary>Also changed, not by the agent (${outside.length})</summary>`, "");
    for (const f of outside.slice(0, 200)) out.push(`- \`${mdCode(f.path)}\` (${f.action})`);
    out.push("", "</details>", "");
  }
  if (t.external) out.push(`_The agent also changed ${plural(t.external, "file")} outside this folder._`, "");
  out.push("<sub>Made locally by [Agent Theatre](https://agenttheatre.dev) from the agent's own events. Paths and line counts only.</sub>");
  return out.join("\n");
}
const mdCode = (p: string) => p.replace(/`/g, "'").replace(/\|/g, "\\|");

/** A folder tree for the terminal: one line per file, folders as headings. Plain text; the CLI adds colour. */
export interface TreeLine { depth: number; text: string; file?: FileChange }
export function toTree(cs: ChangeSet, opts: { includeReads?: boolean } = {}): TreeLine[] {
  const files = cs.files.filter((f) => opts.includeReads || f.action !== "read");
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const lines: TreeLine[] = [];
  let prev: string[] = [];
  for (const f of sorted) {
    const parts = f.path.split("/");
    const dirs = parts.slice(0, -1);
    let common = 0;
    while (common < dirs.length && common < prev.length && dirs[common] === prev[common]) common++;
    for (let d = common; d < dirs.length; d++) lines.push({ depth: d, text: `${dirs[d]}/` });
    lines.push({ depth: dirs.length, text: `${parts[parts.length - 1]}  ${f.action === "read" ? "read" : counts(f)}${f.by === "outside" ? "  (not by the agent)" : ""}`, file: f });
    prev = dirs;
  }
  return lines;
}
