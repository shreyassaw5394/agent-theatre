import type { CommandIntent } from "../events/types.js";

/**
 * Classify a shell command and extract the files it writes or reads, from the
 * command text alone. The text itself never leaves this function.
 *
 * Extraction is deliberately conservative: a missed target degrades to a
 * forge beat; a wrong target would send Pip to the wrong building.
 */
export interface BashIntent {
  argv0: string;
  intent: CommandIntent;
  /** Files the command writes (redirect/tee/sed -i/cp/mv destinations/heredoc targets). */
  writes: string[];
  /** Files the command reads (cat/head/tail/less/sed -n first arg). */
  reads: string[];
  /** Files the command removes (rm, git rm, unlink, and the source of mv / git mv). */
  deletes: string[];
  /** The directory of a leading `cd X &&`: relative targets above are relative to it, not to the session. */
  cd?: string;
}

const TEST_RUNNERS = /\b(vitest|jest|mocha|pytest|py\.test|go\s+test|cargo\s+test|npm\s+test|pnpm\s+test|yarn\s+test|bun\s+test|npx\s+(vitest|jest|playwright)|rspec|phpunit|dotnet\s+test|mvn\s+test|gradle\s+test|make\s+test)\b/;
const BUILD = /\b(tsc|tsup|vite\s+build|webpack|esbuild|rollup|next\s+build|cargo\s+build|go\s+build|make\b(?!\s+test)|npm\s+run\s+build|pnpm\s+(run\s+)?build|yarn\s+build|gradle\s+build|mvn\s+package|docker\s+build)\b/;
const INSTALL = /\b(npm\s+(i|install|ci)|pnpm\s+(i|install|add)|yarn(\s+add|\s+install)?|pip3?\s+install|poetry\s+(add|install)|cargo\s+add|go\s+get|brew\s+install|apt(-get)?\s+install|bun\s+(i|install|add))\b/;
const SEARCH = /\b(grep|rg|ag|ack|find|fd|locate)\b/;
const READ = /^\s*(cat|head|tail|less|more|bat|wc|stat|jq)\b/;

/** First word of the first simple command, after env assignments and cd. */
export function argv0Of(command: string): string {
  // a leading shell test (`[ -n "$x" ] && real-command`) or negation is not the command
  const segments = command.split(/\s*(?:&&|\|\||;|\|)\s*/);
  const first = (segments.find((s) => !/^\s*(\[|test\b|!)/.test(s)) ?? segments[0] ?? "").replace(/^\s*!\s*/, "");
  const toks = first.trim().split(/\s+/).map((t) => t.replace(/^[({]+/, "")).filter(Boolean);
  let i = 0;
  while (i < toks.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i]!)) i++;
  if (toks[i] === "cd" && toks.length > i + 1) {
    // `cd x && real` — argv0 is the real command, found in the next segment
    const rest = command.split(/\s*&&\s*/)[1];
    if (rest) return argv0Of(rest);
  }
  const a = toks[i] ?? "";
  return a.replace(/^.*\//, "").slice(0, 40) || "sh";
}

function cleanTarget(t: string): string | null {
  const s = t.replace(/^["']|["']$/g, "").trim();
  // a path built from shell variables or substitutions ($f, ${x}, `cmd`) names no file we can know from the text
  if (!s || s.startsWith("-") || s === "/dev/null" || s.includes("$") || s.includes("`")) return null;
  if (/^\/dev\//.test(s) || /^&\d/.test(s)) return null;
  return s;
}

/** The command with heredoc bodies removed: `cat > f <<'EOF' … EOF` keeps `cat > f`, the body's `>` signs are not redirects. */
export function withoutHeredocBodies(command: string): string {
  return command.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\s*(?:\n|$))/g, (m) => m.split("\n")[0] ?? "");
}
/** A redirect target that could be a file: has a letter, a slash or a dot, and isn't a stray `)` or a bare number. */
const plausibleFile = (t: string) => /[A-Za-z/.]/.test(t) && !/^\d+$/.test(t) && !/[()]$/.test(t);

export function extractWrites(commandRaw: string): string[] {
  const command = withoutHeredocBodies(commandRaw);
  const out = new Set<string>();
  // Redirections: > file, >> file, 1> file, 2>file is stderr (still a write target)
  for (const m of command.matchAll(/(?:^|[\s)])\d?>{1,2}\s*([^\s|&;<>]+)/g)) {
    const t = cleanTarget(m[1] ?? "");
    if (t && plausibleFile(t)) out.add(t);
  }
  // tee [-a] file...
  for (const m of command.matchAll(/\btee\s+(?:-[a-z]+\s+)*((?:[^\s|&;<>]+\s*)+)/g)) {
    for (const f of (m[1] ?? "").split(/\s+/)) {
      const t = cleanTarget(f);
      if (t) out.add(t);
    }
  }
  // sed -i[.bak] [expr] file...  (last non-flag, non-expression token is the file)
  for (const m of command.matchAll(/\bsed\s+-i\S*\s+(.+?)(?=\s*(?:&&|\|\||;|\||$))/g)) {
    const toks = (m[1] ?? "").match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
    const files = toks.filter((t) => !t.startsWith("-") && !t.startsWith("'") && !t.startsWith('"') && !/^s[/|#]/.test(t) && !/^-e$/.test(t));
    for (const f of files) {
      const t = cleanTarget(f);
      if (t) out.add(t);
    }
  }
  // cp/mv src dest (dest = last token)
  for (const m of command.matchAll(/\b(?:cp|mv)\s+(?:-[a-zA-Z]+\s+)*((?:[^\s|&;<>]+\s+)+)([^\s|&;<>]+)/g)) {
    const t = cleanTarget(m[2] ?? "");
    if (t) out.add(t);
  }
  // touch/mkdir -p are creations too
  for (const m of command.matchAll(/\btouch\s+((?:[^\s|&;<>]+\s*)+)/g)) {
    for (const f of (m[1] ?? "").split(/\s+/)) {
      const t = cleanTarget(f);
      if (t) out.add(t);
    }
  }
  return [...out];
}

/** Files a command removes. Conservative: globs, variables and flags-only forms are skipped. */
export function extractDeletes(commandRaw: string): string[] {
  const command = withoutHeredocBodies(commandRaw);
  const out = new Set<string>();
  for (const seg of command.split(/\s*(?:&&|\|\||;|\|)\s*/)) {
    const toks = seg.trim().split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < toks.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i]!)) i++;
    if (toks[i] === "sudo") i++;
    let cmd = toks[i] ?? "";
    let args = toks.slice(i + 1);
    if (cmd === "git" && (args[0] === "rm" || args[0] === "mv")) { cmd = `git-${args[0]}`; args = args.slice(1); }
    if (!["rm", "unlink", "git-rm", "mv", "git-mv"].includes(cmd)) continue;
    const operands = args.filter((a) => !a.startsWith("-"));
    const victims = cmd === "mv" || cmd === "git-mv" ? operands.slice(0, -1) : operands;
    for (const v of victims) {
      if (/[*?[\]{}]/.test(v)) continue; // a glob: the exact files are unknown from the text
      const t = cleanTarget(v);
      if (t && plausibleFile(t)) out.add(t.replace(/\/+$/, ""));
    }
  }
  return [...out];
}

export function extractReads(command: string): string[] {
  const out = new Set<string>();
  for (const seg of command.split(/\s*(?:&&|\|\||;|\|)\s*/)) {
    const m = seg.match(/^\s*(?:cat|head|tail|less|more|bat|wc)\s+(?:-[^\s]+\s+)*((?:[^\s|&;<>]+\s*)+)/);
    if (!m) continue;
    for (const f of (m[1] ?? "").split(/\s+/)) {
      const t = cleanTarget(f);
      if (t && !/^\d+$/.test(t)) out.add(t);
    }
  }
  return [...out];
}

export function classifyBash(command: string): BashIntent {
  const argv0 = argv0Of(command);
  const writes = extractWrites(command);
  const reads = extractReads(command);
  const deletes = extractDeletes(command);
  let intent: CommandIntent = "other";
  if (TEST_RUNNERS.test(command)) intent = "test";
  else if (BUILD.test(command)) intent = "build";
  else if (INSTALL.test(command)) intent = "install";
  else if (/^\s*git\b/.test(command) || argv0 === "git" || argv0 === "gh") intent = "git";
  else if (writes.length || deletes.length) intent = "write_file";
  else if (SEARCH.test(command) && argv0 !== "cd") intent = "search";
  else if (READ.test(command) && reads.length) intent = "read_file";
  const lead = command.match(/^\s*cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)\s*(?:&&|;)/);
  const cd = lead ? lead[1]!.replace(/^["']|["']$/g, "") : undefined;
  return { argv0, intent, writes, reads, deletes, ...(cd && !cd.includes("$") ? { cd } : {}) };
}
