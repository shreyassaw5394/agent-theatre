import type { SetTheme } from "./types.js";

const island: SetTheme = {
  id: "island", name: "Island", tagline: "A warm little island at golden hour.",
  sky: [0x21708a, 0x123e5a], terrain: "island",
  ground: { fill: 0x5cae68, fillLight: 0xa3e48f, edge: 0x8a664a, edgeDark: 0x6a4c38, sand: 0xf2dba6 },
  water: { ripple: 0xffffff, rippleAlpha: 0.24 }, pathColor: 0xf7e4b4, labelColor: 0x184e30,
  palettes: [
    { top: 0xf8e0b8, left: 0xeab985, right: 0xcf9b66, roof: 0xec6f5f, roofD: 0xc2524a, win: 0x8a5a3c },
    { top: 0xdcebf8, left: 0xaecbe6, right: 0x8badcf, roof: 0x5a8bc4, roofD: 0x46709f, win: 0x40618a },
    { top: 0xcfe9dc, left: 0x8cc9a8, right: 0x62a383, roof: 0x2fa58a, roofD: 0x24846f, win: 0x2f6655 },
    { top: 0xfbe3d4, left: 0xf2bfa6, right: 0xd99b84, roof: 0xd96b7c, roofD: 0xb04f61, win: 0x7a4a52 },
    { top: 0xfff3c6, left: 0xf5d98a, right: 0xd9b96a, roof: 0xe39b2e, roofD: 0xba7a1f, win: 0x7a5a2c },
  ],
  beacon: { top: 0xfbfbf8, left: 0xf1efe8, right: 0xd9d5cb, roof: 0xe2574c, roofD: 0xb9443b, win: 0x3a4a5a, lamp: { idle: 0xffd66b, scan: 0xffffff, fail: 0xff5a4e, pass: 0x5ff0a6 } },
  archive: { top: 0xe9e1ff, left: 0xc4b4f0, right: 0xa693d8, roof: 0x8a72cf, roofD: 0x6e58b0, win: 0x4d3e86 },
  forge: { top: 0x6b7280, left: 0x4b5563, right: 0x374151, roof: 0x9ca3af, roofD: 0x6b7280, win: 0xffb547, ember: 0xff9a3c },
  dock: { deck: 0xb08a5a, post: 0x7a5a3a, vessel: 0xf1efe8 },
  prop: "tree", propColors: [0x3f9a5c, 0x62c473, 0x8a5a3a],
  gremlin: { body: 0x7d5cff, eye: 0x1b1030 },
  pip: { body: 0xff9a3c, bodyLight: 0xffd27e, belly: 0xfff5dc, ear: 0xe07f2c, cheek: 0xff6e5a, ink: 0x2a1d17 },
  mood: { curious: 0xffe36b, focused: 0x7cc8ff, lost: 0xff7b69, happy: 0x5ff0a6, uneasy: 0xffa64a },
  vignette: 0x051420,
};

const orbit: SetTheme = {
  ...island,
  id: "orbit", name: "Orbit", tagline: "A quiet station turning above a blue planet.",
  sky: [0x0b1026, 0x1b2a55], terrain: "platform",
  ground: { fill: 0x3b4a6b, fillLight: 0x6b7fa8, edge: 0x27314a, edgeDark: 0x1a2237, sand: 0x8a97b8 },
  water: { ripple: 0x9fd0ff, rippleAlpha: 0.18 }, pathColor: 0xcfe3ff, labelColor: 0xdbe7ff,
  palettes: [
    { top: 0xe8f1ff, left: 0xbfd4f2, right: 0x93acd4, roof: 0x5fd3ff, roofD: 0x3aa9d6, win: 0x7cf3ff },
    { top: 0xf4f6fb, left: 0xd5dbe8, right: 0xaab3c7, roof: 0xb69cff, roofD: 0x8f72e6, win: 0xcdb7ff },
    { top: 0xe6fff6, left: 0xb9f0dc, right: 0x8fcbb8, roof: 0x5ff0a6, roofD: 0x3fbf83, win: 0xa8ffd6 },
  ],
  beacon: { top: 0xffffff, left: 0xe6ebf5, right: 0xb9c2d6, roof: 0x5fd3ff, roofD: 0x3aa9d6, win: 0x7cf3ff, lamp: { idle: 0x9fd0ff, scan: 0xffffff, fail: 0xff5a4e, pass: 0x5ff0a6 } },
  forge: { top: 0x9aa4b8, left: 0x6e788c, right: 0x4e566a, roof: 0xc0c8d8, roofD: 0x8a93a8, win: 0x7cf3ff, ember: 0x7cf3ff },
  dock: { deck: 0x6e788c, post: 0x4e566a, vessel: 0xffffff },
  prop: "antenna", propColors: [0xb9c2d6, 0x7cf3ff, 0x4e566a],
  gremlin: { body: 0xff5a9e, eye: 0x1b1030 },
  vignette: 0x030612,
};

const metropolis: SetTheme = {
  ...island,
  id: "metropolis", name: "Metropolis", tagline: "A warm night city, lights just coming on.",
  sky: [0x1a1030, 0x3b1d4f], terrain: "block",
  ground: { fill: 0x3a3550, fillLight: 0x5a5478, edge: 0x2a2640, edgeDark: 0x1a1730, sand: 0x6a6388 },
  water: { ripple: 0xffb547, rippleAlpha: 0.1 }, pathColor: 0xffd9a0, labelColor: 0xffe9c7,
  palettes: [
    { top: 0xffe2c2, left: 0xf2b990, right: 0xc98b66, roof: 0xff7b69, roofD: 0xd45a4a, win: 0xffd66b },
    { top: 0xe3dcff, left: 0xb7a9f0, right: 0x8a7bd0, roof: 0xb69cff, roofD: 0x8f72e6, win: 0xffe9a8 },
    { top: 0xd6f4ff, left: 0x9ad6f0, right: 0x6faacc, roof: 0x5fd3ff, roofD: 0x3aa9d6, win: 0xfff3c4 },
    { top: 0xffe6ef, left: 0xf7b6cc, right: 0xd48aa6, roof: 0xff6fa5, roofD: 0xd9507f, win: 0xffd66b },
  ],
  beacon: { top: 0xf5f5f5, left: 0xd9d9d9, right: 0xb0b0b0, roof: 0xff6fa5, roofD: 0xd9507f, win: 0x333333, lamp: { idle: 0xffb547, scan: 0xffffff, fail: 0xff5a4e, pass: 0x5ff0a6 } },
  forge: { top: 0x7a7390, left: 0x56506c, right: 0x3c384c, roof: 0xa29bbb, roofD: 0x6f6888, win: 0xffb547, ember: 0xffb547 },
  dock: { deck: 0x56506c, post: 0x3c384c, vessel: 0xffd66b },
  prop: "lamp", propColors: [0xffd66b, 0xfff3c4, 0x3c384c],
  gremlin: { body: 0x5ff0a6, eye: 0x0f2a1c },
  vignette: 0x080414,
};

export const SETS: readonly SetTheme[] = [island, orbit, metropolis];
export const setById = (id: string | null | undefined): SetTheme => SETS.find((s) => s.id === id) ?? island;
export type { SetTheme } from "./types.js";
