import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { direct, filesFromEvents, generateWorld, parseTranscript } from "@agent-theatre/core";
import { deriveActs, captionFor } from "../src/scene/story.js";

const fixture = (n: string) => readFileSync(new URL(`../../../fixtures/${n}`, import.meta.url), "utf8");
const load = (n: string) => { const { events } = parseTranscript(fixture(n)); const { files, touched } = filesFromEvents(events); const world = generateWorld({ repoId: n, files, touched }); return { world, beats: direct(events, world) }; };

describe("acts", () => {
  it("episode-1 reads as a story, with no repeated or truncated labels", () => {
    const { beats } = load("episode-1.jsonl");
    const acts = deriveActs(beats);
    const labels = acts.map((a) => a.label);
    expect(labels[0]).toBe("Arrive");
    expect(labels).toContain("Trouble");
    expect(labels).toContain("Fix");
    expect(labels.at(-1)).toBe("Finale");
    for (let i = 1; i < labels.length; i++) expect(labels[i], "no adjacent repeats").not.toBe(labels[i - 1]);
    for (const a of acts) expect(a.toMs - a.fromMs, a.label).toBeGreaterThanOrEqual(2200);
    expect(acts[0]!.fromMs).toBe(0);
    expect(acts.at(-1)!.toMs).toBe(Math.max(...beats.map((b) => b.atMs + b.durationMs)));
  });
  it("bash-heavy ends on Hmm (claim without evidence)", () => {
    const { beats } = load("bash-heavy.jsonl");
    expect(deriveActs(beats).map((a) => a.label)).toContain("Hmm");
  });
  it("every beat kind has a caption", () => {
    const { beats, world } = load("episode-1.jsonl");
    for (const b of beats) if (b.kind !== "idle") expect(captionFor(b, world).length, b.kind).toBeGreaterThan(0);
  });
});
