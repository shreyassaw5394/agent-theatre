// Dev-only: print the event table for a transcript. Not part of the library.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { parseTranscript } from "../src/index.js";

const file = process.argv[2];
if (!file) {
  console.error("usage: pnpm -F @agent-theatre/core demo <session.jsonl>");
  process.exit(2);
}
const { events, warnings } = parseTranscript(readFileSync(file, "utf8"), { home: homedir() });
const t0 = events[0]?.ts ?? 0;
for (const e of events) {
  const { seq, ts, kind, agentId } = e;
  const rest = Object.fromEntries(Object.entries(e).filter(([k]) => !["id", "seq", "ts", "sessionId", "source", "kind", "agentId"].includes(k)));
  const rel = ((ts - t0) / 1000).toFixed(1).padStart(7);
  console.log(`${String(seq).padStart(3)} ${rel}s ${kind.padEnd(16)} ${agentId ? `[${agentId}] ` : ""}${JSON.stringify(rest)}`);
}
if (warnings.length) console.error(`\n${warnings.length} warning(s):`, warnings.slice(0, 10));
