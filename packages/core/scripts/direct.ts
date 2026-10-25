// Dev-only: print the beat timeline for a transcript (world inferred from the events).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { parseTranscript, generateWorld, filesFromEvents, direct } from "../src/index.js";

const file = process.argv[2];
if (!file) { console.error("usage: pnpm -F @agent-theatre/core direct <session.jsonl>"); process.exit(2); }
const { events } = parseTranscript(readFileSync(file, "utf8"), { home: homedir() });
const { files, touched } = filesFromEvents(events);
const world = generateWorld({ repoId: file, files, touched });
const beats = direct(events, world);
const t0 = events[0]?.ts ?? 0;
for (const b of beats) {
  const { id: _i, atMs, durationMs, realTs, mood, actor, sourceEventIds: _s, kind, ...rest } = b as any;
  const real = ((realTs - t0) / 1000).toFixed(1).padStart(6);
  console.log(`${(atMs / 1000).toFixed(2).padStart(7)}s +${String(durationMs).padStart(4)}  real ${real}s  ${mood.padEnd(8)} ${actor === "pip" ? "" : `[${actor}] `}${kind.padEnd(16)} ${JSON.stringify(rest)}`);
}
const last = beats.at(-1);
console.error(`\n${beats.length} beats · scene ${(((last?.atMs ?? 0) + (last?.durationMs ?? 0)) / 1000).toFixed(1)}s from ${(((events.at(-1)?.ts ?? 0) - t0) / 1000).toFixed(1)}s real`);
