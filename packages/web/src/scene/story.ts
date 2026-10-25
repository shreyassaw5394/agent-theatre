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

type Phase = "Arrive" | "Explore" | "Build" | "Trouble" | "Fix" | "Finale" | "Help" | "Waiting" | "Hmm" | "Curtain";

/** Acts for the scrubber: consecutive beats of one story phase, short ones merged into neighbours. */
export function deriveActs(beats: Beat[]): Act[] {
  if (!beats.length) return [{ label: "Scene", fromMs: 0, toMs: 0 }];
  const end = Math.max(...beats.map((b) => b.atMs + b.durationMs));
  let gremlins = 0, seenRead = false;
  const phased: Array<{ phase: Phase; at: number; end: number; kind: Beat["kind"] }> = [];
  for (const b of beats) {
    let phase: Phase | null = null;
    switch (b.kind) {
      case "curtain_up": phase = "Arrive"; break;
      case "curtain_down": phase = "Curtain"; break;
      case "read": case "search": phase = gremlins ? "Fix" : seenRead ? "Explore" : "Arrive"; seenRead = true; break;
      case "build": case "raise": case "forge": phase = gremlins ? "Fix" : "Build"; break;
      case "run_tests": phase = gremlins ? "Fix" : "Build"; break;
      case "test_outcome": {
        phase = b.outcome === "fail" ? "Trouble" : "Finale";
        // the test run that led to this outcome belongs to the same act
        const prev = phased.at(-1);
        if (prev && prev.kind === "run_tests") prev.phase = phase;
        break;
      }
      case "spawn_gremlin": gremlins++; phase = "Trouble"; break;
      case "chase": phase = "Fix"; break;
      case "banish": gremlins = Math.max(0, gremlins - 1); phase = "Finale"; break;
      case "celebrate": phase = "Finale"; break;
      case "summon_helper": case "dismiss_helper": phase = "Help"; break;
      case "blocked_on_you": phase = "Waiting"; break;
      case "unverified_claim": phase = "Hmm"; break;
      case "stumble": phase = "Trouble"; break;
      case "your_turn": case "walk_to": case "idle": phase = null; break;
    }
    if (phase) phased.push({ phase, at: b.atMs, end: b.atMs + b.durationMs, kind: b.kind });
  }
  // runs of the same phase
  const runs: Array<{ phase: Phase; from: number; to: number }> = [];
  for (const p of phased) {
    const last = runs.at(-1);
    if (last && last.phase === p.phase) last.to = Math.max(last.to, p.end);
    else runs.push({ phase: p.phase, from: last ? last.to : 0, to: p.end });
  }
  if (runs.length) { runs[0]!.from = 0; runs.at(-1)!.to = end; }
  // merge runs too short to read into their neighbour
  const MIN = 2200;
  for (let i = runs.length - 1; i >= 0 && runs.length > 1; i--) {
    const r = runs[i]!;
    if (r.to - r.from >= MIN) continue;
    if (i > 0) { runs[i - 1]!.to = r.to; runs.splice(i, 1); }
    else { runs[1]!.from = r.from; runs.splice(0, 1); }
  }
  // a curtain tail becomes part of the finale
  const tail = runs.at(-1);
  if (tail && tail.phase === "Curtain" && runs.length > 1) { runs[runs.length - 2]!.to = tail.to; runs.pop(); }
  return runs.map((r) => ({ label: r.phase === "Curtain" ? "Finale" : r.phase, fromMs: r.from, toMs: r.to }));
}
