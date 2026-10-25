import type { Beat, World } from "@agent-theatre/core";

/** Plain-English caption for a beat. Written for someone who has never seen the island. */
export function captionFor(b: Beat, world: World, helperLabel?: string): string {
  const name = (id: string) => world.places.find((p) => p.id === id)?.label ?? id.replace(/^p:/, "");
  const who = b.actor === "pip" ? "Pip" : helperLabel ? `A helper (${helperLabel})` : "A helper";
  switch (b.kind) {
    case "curtain_up": return `${b.repoId}. Every building on this stage is a file in the repo.`;
    case "curtain_down": return b.verified ? "Curtain. Every claim in this session was backed by a passing test." : "Curtain. Something was called done without a passing test to show for it.";
    case "walk_to": return `${who} heads to ${name(b.target)}.`;
    case "read": return `${who} reads ${name(b.target)}.`;
    case "build": return `${who} is working on ${name(b.target)}${b.intensity > 0.6 ? " — a big change" : ""}.`;
    case "raise": return `A new file rises: ${name(b.target)}.`;
    case "forge": return `${who} runs a command at the forge.`;
    case "search": return b.scope === "web" ? `${who} looks something up on the web.` : `${who} searches the repo.`;
    case "run_tests": return `Running the tests at ${name(b.target)}…`;
    case "test_outcome": return b.outcome === "pass" ? `${b.passed} tests pass.` : b.outcome === "fail" ? `${b.failed} test${b.failed === 1 ? "" : "s"} fail${b.failed === 1 ? "s" : ""}.` : "Tests ran — the runner didn't say how many.";
    case "spawn_gremlin": return `A bug gremlin pops out of ${name(b.target)}.`;
    case "chase": return `${who} chases the gremlin around ${name(b.target)}.`;
    case "banish": return "Caught. The gremlin is gone.";
    case "summon_helper": return `A helper arrives at the dock${b.label ? ` to ${b.label.toLowerCase()}` : ""}.`;
    case "dismiss_helper": return b.ok ? "The helper reports back and leaves." : "The helper leaves without finishing.";
    case "blocked_on_you": return b.reason === "permission" ? "Pip needs your permission to continue." : "Pip has a question for you.";
    case "your_turn": return "Pip is done for now. Your turn.";
    case "stumble": return b.retrying ? "Something went wrong. Pip tries again." : "Something went wrong.";
    case "celebrate": return "All green. Pip celebrates.";
    case "idle": return "";
    case "unverified_claim": return "Pip says it's done — but no test has passed since the last change. Something's hiding.";
  }
}

export interface Act { label: string; fromMs: number; toMs: number }

/** Acts for the scrubber: split at test outcomes and turn ends, named by what happened. */
export function deriveActs(beats: Beat[]): Act[] {
  const end = beats.length ? Math.max(...beats.map((b) => b.atMs + b.durationMs)) : 0;
  const cuts = [0, ...beats.filter((b) => b.kind === "test_outcome" || b.kind === "your_turn").map((b) => b.atMs + b.durationMs), end].filter((v, i, a) => i === 0 || v > a[i - 1]! + 1500);
  if (cuts.at(-1) !== end) cuts.push(end);
  const acts: Act[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const from = cuts[i]!, to = cuts[i + 1]!;
    const inside = beats.filter((b) => b.atMs >= from && b.atMs < to && b.kind !== "idle");
    acts.push({ label: labelFor(inside, i === 0), fromMs: from, toMs: to });
  }
  return acts.length ? acts : [{ label: "Scene", fromMs: 0, toMs: end }];
}

function labelFor(bs: Beat[], first: boolean): string {
  const has = (k: Beat["kind"]) => bs.some((b) => b.kind === k);
  if (has("celebrate")) return "Finale";
  if (has("unverified_claim")) return "Hmm";
  if (bs.some((b) => b.kind === "test_outcome" && b.outcome === "fail") || has("spawn_gremlin")) return "Trouble";
  if (has("chase")) return "Fix";
  if (has("build") || has("raise")) return has("read") ? "Build" : "Build";
  if (has("read") || has("search")) return first ? "Arrive" : "Explore";
  if (has("summon_helper")) return "Help";
  if (has("blocked_on_you")) return "Waiting";
  return first ? "Arrive" : "Scene";
}
