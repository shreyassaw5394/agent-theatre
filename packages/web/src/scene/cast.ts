/**
 * The cast. Every character is drawn by one procedural routine from a spec, so
 * the whole company shares the motion system (squash/stretch, anticipation,
 * blink, mood light) while reading as different people. Pip is just the first.
 */
export type BodyShape = "round" | "tall" | "boxy" | "teardrop" | "bean";
export type Topper = "antenna" | "ears" | "tuft" | "leaf" | "crest" | "halo";
export type EyeStyle = "dot" | "wide" | "sleepy" | "visor";

export interface CharacterSpec {
  id: string;
  name: string;
  /** One line of personality — for the cast picker, never the scene. */
  bio: string;
  shape: BodyShape;
  topper: Topper;
  eyes: EyeStyle;
  body: number; bodyLight: number; belly: number; ear: number; cheek: number; ink: number;
  /** Relative size (Pip = 1). */
  size: number;
}

export const CAST: readonly CharacterSpec[] = [
  { id: "pip",    name: "Pip",    bio: "Curious, quick, a little clumsy. The original.",   shape: "round",    topper: "antenna", eyes: "wide",   body: 0xff9a3c, bodyLight: 0xffd27e, belly: 0xfff5dc, ear: 0xe07f2c, cheek: 0xff6e5a, ink: 0x2a1d17, size: 1 },
  { id: "mo",     name: "Mo",     bio: "Tall, calm, measures twice.",                      shape: "tall",     topper: "tuft",    eyes: "sleepy", body: 0x5fa8ff, bodyLight: 0xa9d2ff, belly: 0xeaf4ff, ear: 0x3f7fd0, cheek: 0xff8fa0, ink: 0x15233a, size: 1.1 },
  { id: "juno",   name: "Juno",   bio: "Bright, chatty, finds the bug by talking to it.", shape: "bean",     topper: "ears",    eyes: "wide",   body: 0x7fe08a, bodyLight: 0xc8ffc0, belly: 0xf3fff0, ear: 0x4fb466, cheek: 0xffb0a0, ink: 0x163a1f, size: 0.95 },
  { id: "rook",   name: "Rook",   bio: "Boxy, deliberate, never guesses.",                shape: "boxy",     topper: "crest",   eyes: "visor",  body: 0x9aa4b8, bodyLight: 0xd5dbe6, belly: 0xeef1f6, ear: 0x6e788c, cheek: 0x7cf3ff, ink: 0x1b2230, size: 1.05 },
  { id: "fen",    name: "Fen",    bio: "Quiet and sharp. Reads everything first.",        shape: "teardrop", topper: "leaf",    eyes: "dot",    body: 0xb69cff, bodyLight: 0xe0d2ff, belly: 0xf6f0ff, ear: 0x8f72e6, cheek: 0xffa6d8, ink: 0x2a1b4a, size: 0.9 },
  { id: "sol",    name: "Sol",    bio: "Warm, loud, celebrates everything.",              shape: "round",    topper: "halo",    eyes: "wide",   body: 0xffd23f, bodyLight: 0xfff0a8, belly: 0xfffbe6, ear: 0xe0a800, cheek: 0xff8c5a, ink: 0x3a2a05, size: 1.08 },
  { id: "ivy",    name: "Ivy",    bio: "Patient gardener of code. Hates loose ends.",     shape: "bean",     topper: "leaf",    eyes: "sleepy", body: 0x3fbf9a, bodyLight: 0x9ff0d8, belly: 0xeafff8, ear: 0x2a8c70, cheek: 0xffb0a0, ink: 0x0f3a2e, size: 1 },
  { id: "bolt",   name: "Bolt",   bio: "Fast. Sometimes too fast.",                       shape: "teardrop", topper: "crest",   eyes: "dot",    body: 0xff5a9e, bodyLight: 0xffb0d0, belly: 0xfff0f6, ear: 0xd0357a, cheek: 0xffd27e, ink: 0x3a0f22, size: 0.92 },
  { id: "ash",    name: "Ash",    bio: "Dry wit, steady hands.",                          shape: "tall",     topper: "ears",    eyes: "sleepy", body: 0x7a7390, bodyLight: 0xb8b2cc, belly: 0xeeebf5, ear: 0x56506c, cheek: 0xffb547, ink: 0x1a1730, size: 1.06 },
  { id: "nimbus", name: "Nimbus", bio: "Soft, cloud-headed, surprisingly precise.",       shape: "round",    topper: "halo",    eyes: "wide",   body: 0xeef4ff, bodyLight: 0xffffff, belly: 0xffffff, ear: 0xc9d8f0, cheek: 0xffb0c8, ink: 0x2a3a52, size: 1.02 },
  { id: "ember",  name: "Ember",  bio: "Runs hot. Loves a red lighthouse.",               shape: "boxy",     topper: "antenna", eyes: "visor",  body: 0xff6b3d, bodyLight: 0xffb08a, belly: 0xfff1e6, ear: 0xc4442a, cheek: 0xffe36b, ink: 0x3a1208, size: 1 },
  { id: "tove",   name: "Tove",   bio: "Small, brave, follows the map.",                  shape: "bean",     topper: "tuft",    eyes: "dot",    body: 0xc9a46b, bodyLight: 0xeed9ad, belly: 0xfff7e6, ear: 0x9c7a44, cheek: 0xff8c5a, ink: 0x3a2a10, size: 0.85 },
];

export const castById = (id: string | null | undefined): CharacterSpec | undefined => CAST.find((c) => c.id === id);

const lum = (c: number) => (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;
/** A character must read against the ground it stands on (Nimbus on Cloudtop snow was invisible). */
export const readableOn = (c: CharacterSpec, groundFill: number): boolean => Math.abs(lum(c.body) - lum(groundFill)) > 0.22;

/** Lead for a repo: seeded so a repo keeps its character; helpers are the next distinct ones. Low-contrast picks are skipped. */
export function pickCompany(seed: number, leadId?: string | null, groundFill?: number): { lead: CharacterSpec; helpers: CharacterSpec[] } {
  const ok = (c: CharacterSpec) => groundFill === undefined || readableOn(c, groundFill);
  let lead = castById(leadId) ?? CAST[seed % CAST.length]!;
  if (!ok(lead)) lead = CAST.find((c, i) => i >= seed % CAST.length && ok(c)) ?? CAST.find(ok) ?? lead;
  const rest = CAST.filter((c) => c.id !== lead.id && ok(c));
  const start = rest.length ? (seed >>> 3) % rest.length : 0;
  return { lead, helpers: [...rest.slice(start), ...rest.slice(0, start)] };
}
