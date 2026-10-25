import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Sfx } from "../src/audio/sfx.js";

// All beat kinds the director can emit (kept in sync with core's BeatBody).
const BEAT_KINDS = ["curtain_up", "curtain_down", "walk_to", "read", "build", "raise", "forge", "search", "run_tests", "test_outcome", "spawn_gremlin", "chase", "banish", "summon_helper", "dismiss_helper", "blocked_on_you", "your_turn", "stumble", "celebrate", "idle", "unverified_claim"];

describe("sound design", () => {
  it("every beat kind is handled by the sfx switch (silence must be explicit)", () => {
    const src = readFileSync(new URL("../src/audio/sfx.ts", import.meta.url), "utf8");
    for (const k of BEAT_KINDS) expect(src, k).toMatch(new RegExp(`case "${k}":`));
  });
  it("only key sounds survive fast replay", () => {
    expect(Sfx.plays("footstep", 4)).toBe(false);
    expect(Sfx.plays("read", 2)).toBe(false);
    expect(Sfx.plays("blocked_on_you", 4)).toBe(true);
    expect(Sfx.plays("test_outcome", 4)).toBe(true);
    expect(Sfx.plays("read", 1)).toBe(true);
  });
  it("ships no audio files and fetches none", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
    const root = new URL("..", import.meta.url).pathname;
    const files = [...walk(join(root, "src")), ...walk(join(root, "public"))];
    expect(files.filter((f) => /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(f))).toEqual([]);
    const srcText = walk(join(root, "src")).filter((f) => /\.(ts|css)$/.test(f)).map((f) => readFileSync(f, "utf8")).join("\n");
    expect(srcText).not.toMatch(/\.(mp3|wav|ogg)\b/i);
  });
});

import { SETS } from "../src/sets/index.js";
import { SOUND } from "../src/sets/sound.js";
describe("per-scene sound", () => {
  it("every set has a voice and an ambience recipe with at least one extra", () => {
    for (const s of SETS) { const r = SOUND[s.id]; expect(r, s.id).toBeTruthy(); expect(r.ambience.extras.length, s.id).toBeGreaterThan(0); expect(r.voice.pitch).toBeGreaterThan(0.5); }
    const voices = new Set(SETS.map((s) => JSON.stringify(SOUND[s.id].voice)));
    expect(voices.size, "distinct voices").toBeGreaterThanOrEqual(12);
  });
});
