import type { ProjectKind, RepoProfile } from "@agent-theatre/core";
import type { SetTheme, SetId } from "./types.js";

const island: SetTheme = {
  id: "island", name: "Island", tagline: "A warm little island at golden hour.", fits: ["cli-tool", "library", "unknown"], flagship: true,
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
  id: "orbit", name: "Orbit", tagline: "A quiet station turning above a blue planet.", fits: ["backend-api", "infra-devops", "systems"], flagship: true,
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
  id: "metropolis", name: "Metropolis", tagline: "A warm night city, lights just coming on.", fits: ["web-frontend", "monorepo"], flagship: true,
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

// Palette sets: same geometry, different world. Each is a real place with its own light.
const harbour: SetTheme = { ...island, id: "harbour", name: "Harbour", tagline: "Fog lifting off a working port.", fits: ["backend-api", "infra-devops"], flagship: false,
  sky: [0x2b5d73, 0x0f2f3f], ground: { fill: 0x7a8f6a, fillLight: 0xa9bd93, edge: 0x5c5a52, edgeDark: 0x3d3b35, sand: 0xc9c3ad }, water: { ripple: 0xd9f1ff, rippleAlpha: 0.3 }, pathColor: 0xd9d2bd, labelColor: 0x1f3a2a,
  palettes: [{ top: 0xf4ece0, left: 0xd9cbb3, right: 0xb3a386, roof: 0x3e6b8a, roofD: 0x2d4f66, win: 0x5a4a3a }, { top: 0xf7e9e4, left: 0xe3bfb2, right: 0xbf9887, roof: 0xc95a4a, roofD: 0xa0453a, win: 0x6b3a30 }, { top: 0xe9efe2, left: 0xc4d1b7, right: 0x9bab8c, roof: 0x4f7f5e, roofD: 0x3a6146, win: 0x2f4a38 }],
  dock: { deck: 0x8c6f4c, post: 0x5a4632, vessel: 0xe84b3c }, prop: "lamp", propColors: [0xffd9a0, 0xfff1d6, 0x4a4a4a], vignette: 0x06161f };
const observatory: SetTheme = { ...orbit, id: "observatory", name: "Observatory", tagline: "A mountaintop under a hard, clear sky.", fits: ["data-ml", "systems"], flagship: false,
  sky: [0x0a1030, 0x24204a], terrain: "block", ground: { fill: 0x4a4766, fillLight: 0x6e6b8f, edge: 0x2f2d45, edgeDark: 0x1d1b2e, sand: 0x8d89aa }, water: { ripple: 0xffffff, rippleAlpha: 0.22 }, pathColor: 0xd9d6f0, labelColor: 0xeae7ff,
  palettes: [{ top: 0xf1efff, left: 0xcfc9ee, right: 0xa39dc9, roof: 0xb69cff, roofD: 0x8f72e6, win: 0xfff1a8 }, { top: 0xe6f3ff, left: 0xbcd6f3, right: 0x8fa9c9, roof: 0x5fd3ff, roofD: 0x3aa9d6, win: 0xfff1a8 }],
  beacon: { ...orbit.beacon, roof: 0xb69cff, roofD: 0x8f72e6 }, prop: "antenna", propColors: [0xcfc9ee, 0xfff1a8, 0x2f2d45], vignette: 0x05081c };
const greenhouse: SetTheme = { ...island, id: "greenhouse", name: "Greenhouse", tagline: "Glass, leaves and warm afternoon light.", fits: ["data-ml", "library"], flagship: false,
  sky: [0x8fc9b0, 0x3e8b7a], ground: { fill: 0x7cbf6a, fillLight: 0xb6e39f, edge: 0x7a6248, edgeDark: 0x5a4634, sand: 0xe6dcb3 }, water: { ripple: 0xffffff, rippleAlpha: 0.18 }, pathColor: 0xf3ecd2, labelColor: 0x1e4d33,
  palettes: [{ top: 0xf0fff6, left: 0xcdeedd, right: 0xa3cdb9, roof: 0x7bd3a3, roofD: 0x4fa97c, win: 0xd9fff0 }, { top: 0xfff9e6, left: 0xf2e3b8, right: 0xcdbd8f, roof: 0xf0b35c, roofD: 0xc78b3b, win: 0x7a5a2c }, { top: 0xf6f0ff, left: 0xdccbf3, right: 0xb5a3d1, roof: 0xb48cff, roofD: 0x8a66d6, win: 0x4d3e86 }],
  prop: "tree", propColors: [0x4fb46a, 0x8fe08c, 0x7a5a3a], vignette: 0x0b2a1c };
const workshop: SetTheme = { ...island, id: "workshop", name: "Workshop", tagline: "A village of makers, sawdust in the air.", fits: ["cli-tool", "library", "systems"], flagship: false,
  sky: [0xd9a86c, 0x8a4f2e], ground: { fill: 0x9ec46a, fillLight: 0xcfe39d, edge: 0x8a5a3a, edgeDark: 0x66402a, sand: 0xe9d2a3 }, water: { ripple: 0xffe9c7, rippleAlpha: 0.2 }, pathColor: 0xf2dfb6, labelColor: 0x4a2a10,
  palettes: [{ top: 0xf7e3c3, left: 0xe0b98a, right: 0xb98f63, roof: 0xa65b3a, roofD: 0x7f4329, win: 0xffd27e }, { top: 0xf2e8d8, left: 0xd8c7ae, right: 0xb09b80, roof: 0x5c6f8a, roofD: 0x45546a, win: 0xffd27e }, { top: 0xfbe7d9, left: 0xefc2a8, right: 0xcb9a82, roof: 0xc9473a, roofD: 0xa0352c, win: 0xffd27e }],
  forge: { ...island.forge, ember: 0xffb547 }, prop: "tree", propColors: [0x5aa35c, 0x86c56e, 0x7a4a2a], vignette: 0x2a1408 };
const arcade: SetTheme = { ...metropolis, id: "arcade", name: "Arcade", tagline: "Neon rain on a late-night strip.", fits: ["game", "web-frontend"], flagship: false,
  sky: [0x120826, 0x2a0f4a], ground: { fill: 0x241a3c, fillLight: 0x3a2a5c, edge: 0x16102a, edgeDark: 0x0c081a, sand: 0x5a3a8c }, water: { ripple: 0xff4fd8, rippleAlpha: 0.12 }, pathColor: 0x7cf3ff, labelColor: 0xfff0ff,
  palettes: [{ top: 0xffd6f6, left: 0xff8fe0, right: 0xd45ab8, roof: 0x7cf3ff, roofD: 0x3ab8d6, win: 0x7cf3ff }, { top: 0xd9f6ff, left: 0x8fe4ff, right: 0x5ab4d4, roof: 0xff4fd8, roofD: 0xc62aa8, win: 0xfff06b }, { top: 0xfff5cc, left: 0xffe36b, right: 0xd6b84a, roof: 0xb69cff, roofD: 0x8f72e6, win: 0xff4fd8 }],
  beacon: { ...metropolis.beacon, roof: 0xff4fd8, roofD: 0xc62aa8, lamp: { idle: 0x7cf3ff, scan: 0xffffff, fail: 0xff5a4e, pass: 0x5ff0a6 } }, gremlin: { body: 0xfff06b, eye: 0x2a1a05 }, prop: "lamp", propColors: [0xff4fd8, 0xffd6f6, 0x16102a], vignette: 0x05020e };
const kingdom: SetTheme = { ...island, id: "kingdom", name: "Kingdom", tagline: "Stone walls, banners, a river below.", fits: ["monorepo", "backend-api", "unknown"], flagship: false,
  sky: [0x7fb3d9, 0x3b6e99], ground: { fill: 0x6fae5e, fillLight: 0xa6d58f, edge: 0x7f7a6a, edgeDark: 0x5d594d, sand: 0xd8d2bd }, water: { ripple: 0xffffff, rippleAlpha: 0.22 }, pathColor: 0xcfc6ad, labelColor: 0x2b2a22,
  palettes: [{ top: 0xf1ede3, left: 0xd3cdbf, right: 0xaba497, roof: 0x3f5f8f, roofD: 0x2e466b, win: 0x5a4a3a }, { top: 0xf1ede3, left: 0xd3cdbf, right: 0xaba497, roof: 0xa83a3a, roofD: 0x812c2c, win: 0x5a4a3a }, { top: 0xf1ede3, left: 0xd3cdbf, right: 0xaba497, roof: 0x4a7f52, roofD: 0x36603d, win: 0x5a4a3a }],
  beacon: { ...island.beacon, top: 0xe9e4d6, left: 0xcfc8b6, right: 0xa39d8d, roof: 0x3f5f8f, roofD: 0x2e466b }, prop: "tree", propColors: [0x3f8f52, 0x6fbf6a, 0x5a4634], vignette: 0x0d1a26 };
const outpost: SetTheme = { ...island, id: "outpost", name: "Outpost", tagline: "A desert station at dusk, dust in the light.", fits: ["infra-devops", "cli-tool", "systems"], flagship: false,
  sky: [0xf0a35a, 0x6b2f4a], ground: { fill: 0xd9b46e, fillLight: 0xf1d39a, edge: 0xa5703f, edgeDark: 0x7a522d, sand: 0xf3d7a3 }, water: { ripple: 0xffe0b0, rippleAlpha: 0.14 }, pathColor: 0xfbe8c4, labelColor: 0x4a2a10,
  palettes: [{ top: 0xfbe9d0, left: 0xe8c79a, right: 0xc49f73, roof: 0xd9623f, roofD: 0xa9482d, win: 0x5a3a20 }, { top: 0xf6ede0, left: 0xdfd0b8, right: 0xb8a68d, roof: 0x2f8f8a, roofD: 0x236b67, win: 0x5a3a20 }],
  prop: "antenna", propColors: [0xc49f73, 0xffe0b0, 0x7a522d], vignette: 0x2a0f14 };
const snowfield: SetTheme = { ...island, id: "snowfield", name: "Snowfield", tagline: "Blue hour, fresh snow, chimney smoke.", fits: ["library", "docs-content", "unknown"], flagship: false,
  sky: [0x9fc3e6, 0x3f5f8f], ground: { fill: 0xeaf1fa, fillLight: 0xffffff, edge: 0x8e9db5, edgeDark: 0x66758c, sand: 0xd6e2f2 }, water: { ripple: 0xffffff, rippleAlpha: 0.3 }, pathColor: 0xc3d3e8, labelColor: 0x2a3a52,
  palettes: [{ top: 0xf6f0e6, left: 0xdccbb6, right: 0xb6a28c, roof: 0xb84a3a, roofD: 0x8c3528, win: 0xffd27e }, { top: 0xf0f4f8, left: 0xcbd5e0, right: 0xa2aebc, roof: 0x3e6b8a, roofD: 0x2d4f66, win: 0xffd27e }, { top: 0xeef7f0, left: 0xc6ddd0, right: 0x9fb8aa, roof: 0x4a7f52, roofD: 0x36603d, win: 0xffd27e }],
  prop: "tree", propColors: [0x2f6b4a, 0x4f9a6a, 0x5a4634], vignette: 0x0d1a2a };
const canopy: SetTheme = { ...island, id: "canopy", name: "Canopy", tagline: "Treehouses strung through an old forest.", fits: ["docs-content", "data-ml", "library"], flagship: false,
  sky: [0x5f9f6b, 0x1f4a33], ground: { fill: 0x4f8f4f, fillLight: 0x7fbf6a, edge: 0x5a4634, edgeDark: 0x3e3024, sand: 0xa89f72 }, water: { ripple: 0xd8f5d0, rippleAlpha: 0.18 }, pathColor: 0xd6c99a, labelColor: 0xeaf7df,
  palettes: [{ top: 0xf2e6c9, left: 0xd9c49b, right: 0xb39a72, roof: 0x6a8f3f, roofD: 0x4e6b2d, win: 0xffd27e }, { top: 0xf6ead8, left: 0xe3c7a6, right: 0xbf9f7e, roof: 0xb86a3a, roofD: 0x8c4f2a, win: 0xffd27e }],
  prop: "tree", propColors: [0x2f7a3f, 0x5cb35a, 0x4a3524], vignette: 0x06160c };

const lagoon: SetTheme = { ...island, id: "lagoon", name: "Lagoon", tagline: "Turquoise shallows and white sand at noon.", fits: ["web-frontend", "library", "docs-content"], flagship: false,
  sky: [0x7fd7ef, 0x1f8fb8], ground: { fill: 0x9ad88a, fillLight: 0xd3f3bd, edge: 0xc9b27e, edgeDark: 0xa3905f, sand: 0xfff3d6 }, water: { ripple: 0xffffff, rippleAlpha: 0.36 }, pathColor: 0xfff5dc, labelColor: 0x0f4a5a,
  palettes: [{ top: 0xffffff, left: 0xf0efe8, right: 0xcfcdc4, roof: 0x2fb3c9, roofD: 0x208fa3, win: 0x2f6a7a }, { top: 0xfff6e6, left: 0xffe1b8, right: 0xe0bc8c, roof: 0xff8c5a, roofD: 0xd66a3e, win: 0x7a4a2c }, { top: 0xf2fff8, left: 0xc9f3dd, right: 0x9fd1b9, roof: 0x3fbf9a, roofD: 0x2a8c70, win: 0x1f5a4a }],
  prop: "tree", propColors: [0x3f9f5c, 0x8be07a, 0x9c7a44], vignette: 0x083040 };
const volcano: SetTheme = { ...island, id: "volcano", name: "Volcano", tagline: "Black rock, red sky, light from below.", fits: ["systems", "infra-devops", "game"], flagship: false,
  sky: [0x5a1a1a, 0x1a0808], ground: { fill: 0x3a2f2f, fillLight: 0x5a4a48, edge: 0x241a1a, edgeDark: 0x120a0a, sand: 0x6a5a56 }, water: { ripple: 0xff7b3a, rippleAlpha: 0.22 }, pathColor: 0xff9a5a, labelColor: 0xffe1c7,
  palettes: [{ top: 0x4a4042, left: 0x3a3234, right: 0x2a2426, roof: 0xff6b3d, roofD: 0xc44a24, win: 0xffb547 }, { top: 0x5a4a52, left: 0x463a40, right: 0x332a2f, roof: 0xffb547, roofD: 0xd98c22, win: 0xff6b3d }],
  beacon: { ...island.beacon, top: 0x3a3234, left: 0x2a2426, right: 0x1f1a1c, roof: 0xff6b3d, roofD: 0xc44a24, lamp: { idle: 0xffb547, scan: 0xffffff, fail: 0xff5a4e, pass: 0x5ff0a6 } }, forge: { ...island.forge, ember: 0xff6b3d }, dock: { deck: 0x463a40, post: 0x2a2426, vessel: 0xffb547 },
  prop: "antenna", propColors: [0x5a4a48, 0xff6b3d, 0x241a1a], gremlin: { body: 0x7cf3ff, eye: 0x0a2a30 }, vignette: 0x0a0202 };
const cloudtop: SetTheme = { ...orbit, id: "cloudtop", name: "Cloudtop", tagline: "A floating town above a sea of cloud.", fits: ["web-frontend", "mobile", "docs-content"], flagship: false,
  sky: [0xcfe6ff, 0x7fb0e6], terrain: "platform", ground: { fill: 0xf3f6fb, fillLight: 0xffffff, edge: 0xd7e0ee, edgeDark: 0xb7c4d8, sand: 0xffffff }, water: { ripple: 0xffffff, rippleAlpha: 0.5 }, pathColor: 0xffe9a8, labelColor: 0x2a3a52,
  palettes: [{ top: 0xffffff, left: 0xf0f4fa, right: 0xcfd8e6, roof: 0xff8fa0, roofD: 0xd66a7c, win: 0xffd27e }, { top: 0xffffff, left: 0xf0f4fa, right: 0xcfd8e6, roof: 0x7cc8ff, roofD: 0x4f9ad6, win: 0xffd27e }, { top: 0xffffff, left: 0xf0f4fa, right: 0xcfd8e6, roof: 0xb69cff, roofD: 0x8f72e6, win: 0xffd27e }],
  beacon: { ...orbit.beacon, roof: 0xff8fa0, roofD: 0xd66a7c, lamp: { idle: 0xffd27e, scan: 0xffffff, fail: 0xff5a4e, pass: 0x5ff0a6 } }, dock: { deck: 0xf0f4fa, post: 0xb7c4d8, vessel: 0xff8fa0 }, prop: "tree", propColors: [0x8fd7a0, 0xc8f0c0, 0xb7c4d8], vignette: 0x4a6a9a };
const reef: SetTheme = { ...island, id: "reef", name: "Reef", tagline: "Underwater, where the light comes in ribbons.", fits: ["data-ml", "game", "library"], flagship: false,
  sky: [0x1b7fa0, 0x062a40], terrain: "island", ground: { fill: 0xc9b98a, fillLight: 0xe9dcb0, edge: 0x8a7a5a, edgeDark: 0x5a4e3a, sand: 0xe3d3a6 }, water: { ripple: 0x9fe8ff, rippleAlpha: 0.3 }, pathColor: 0xf3e7c3, labelColor: 0xe6fbff,
  palettes: [{ top: 0xffd9e6, left: 0xff9ec0, right: 0xd66c92, roof: 0xff6fa5, roofD: 0xd9507f, win: 0x7a2a4a }, { top: 0xfff1c9, left: 0xffd27e, right: 0xd9ad5a, roof: 0xff8c5a, roofD: 0xd66a3e, win: 0x7a4a2c }, { top: 0xd9fff6, left: 0x9ff0d8, right: 0x6cc9b0, roof: 0x3fbf9a, roofD: 0x2a8c70, win: 0x1f5a4a }],
  prop: "antenna", propColors: [0xff9ec0, 0x9ff0d8, 0x8a7a5a], gremlin: { body: 0x1b1030, eye: 0x9fe8ff }, vignette: 0x021420 };
const bazaar: SetTheme = { ...workshop, id: "bazaar", name: "Bazaar", tagline: "Ochre walls, striped awnings, late light.", fits: ["monorepo", "web-frontend", "backend-api"], flagship: false,
  sky: [0xf2c27a, 0xa85a3a], ground: { fill: 0xd8b071, fillLight: 0xf1d6a0, edge: 0x8a5a3a, edgeDark: 0x66402a, sand: 0xf3dcae }, water: { ripple: 0xfff1c9, rippleAlpha: 0.16 }, pathColor: 0xfff1c9, labelColor: 0x4a2a10,
  palettes: [{ top: 0xfde9cf, left: 0xeac7a0, right: 0xc49f73, roof: 0xd94b3a, roofD: 0xa83a2c, win: 0x5a3a20 }, { top: 0xfde9cf, left: 0xeac7a0, right: 0xc49f73, roof: 0x2f8f8a, roofD: 0x236b67, win: 0x5a3a20 }, { top: 0xfde9cf, left: 0xeac7a0, right: 0xc49f73, roof: 0x3f5f8f, roofD: 0x2e466b, win: 0x5a3a20 }, { top: 0xfde9cf, left: 0xeac7a0, right: 0xc49f73, roof: 0xe39b2e, roofD: 0xba7a1f, win: 0x5a3a20 }],
  prop: "lamp", propColors: [0xffd27e, 0xfff1c9, 0x66402a], vignette: 0x2a1408 };
const monastery: SetTheme = { ...kingdom, id: "monastery", name: "Monastery", tagline: "Mist on the mountain, a bell somewhere.", fits: ["docs-content", "library", "systems"], flagship: false,
  sky: [0xb8c9c4, 0x4f6b6a], ground: { fill: 0x7f9f7a, fillLight: 0xb0c9a6, edge: 0x6a6f66, edgeDark: 0x4a4e47, sand: 0xc7c9bd }, water: { ripple: 0xffffff, rippleAlpha: 0.2 }, pathColor: 0xd9d3c0, labelColor: 0x1f2a28,
  palettes: [{ top: 0xf1ede3, left: 0xd3cdbf, right: 0xaba497, roof: 0x5a4a3a, roofD: 0x3e3228, win: 0xffd27e }, { top: 0xf1ede3, left: 0xd3cdbf, right: 0xaba497, roof: 0x8a3a2a, roofD: 0x662a1e, win: 0xffd27e }],
  prop: "tree", propColors: [0x3f6f4a, 0x6a9a6a, 0x4a3524], vignette: 0x101a18 };
const moonbase: SetTheme = { ...orbit, id: "moonbase", name: "Moonbase", tagline: "Grey dust, black sky, one blue marble.", fits: ["systems", "infra-devops", "data-ml"], flagship: false,
  sky: [0x05060c, 0x0b0d18], terrain: "platform", ground: { fill: 0x8d8d95, fillLight: 0xb8b8c0, edge: 0x5e5e66, edgeDark: 0x3a3a40, sand: 0xa8a8b0 }, water: { ripple: 0xffffff, rippleAlpha: 0.28 }, pathColor: 0xdcdce4, labelColor: 0xf0f0f6,
  palettes: [{ top: 0xf6f6fa, left: 0xdcdce4, right: 0xb4b4be, roof: 0x7cf3ff, roofD: 0x3ab8d6, win: 0xffd27e }, { top: 0xf6f6fa, left: 0xdcdce4, right: 0xb4b4be, roof: 0xffb547, roofD: 0xd98c22, win: 0x7cf3ff }],
  prop: "antenna", propColors: [0xb8b8c0, 0x7cf3ff, 0x3a3a40], vignette: 0x000000 };
const lanterns: SetTheme = { ...metropolis, id: "lanterns", name: "Lanterns", tagline: "A night festival, paper light everywhere.", fits: ["web-frontend", "game", "unknown"], flagship: false,
  sky: [0x1a0a2e, 0x3a1030], terrain: "block", ground: { fill: 0x3a2a44, fillLight: 0x5a4466, edge: 0x241a2e, edgeDark: 0x140e1c, sand: 0x6a5a78 }, water: { ripple: 0xff9a5a, rippleAlpha: 0.14 }, pathColor: 0xffd9a0, labelColor: 0xffe9c7,
  palettes: [{ top: 0xffe9cf, left: 0xf2c7a0, right: 0xc9986e, roof: 0xd94b3a, roofD: 0xa83a2c, win: 0xffd27e }, { top: 0xf6e3ff, left: 0xd9b7f2, right: 0xaa8cc9, roof: 0xff6fa5, roofD: 0xd9507f, win: 0xffd27e }, { top: 0xfff6d6, left: 0xffe3a0, right: 0xd9b96a, roof: 0xe39b2e, roofD: 0xba7a1f, win: 0xff9a5a }],
  prop: "lamp", propColors: [0xff9a5a, 0xffe3a0, 0x241a2e], vignette: 0x0a0414 };

// Seasonal: dark houses with lit windows, jack-o'-lanterns, bats, and a ghost-white gremlin.
const halloween: SetTheme = { ...island, id: "halloween", name: "Halloween", tagline: "Jack-o'-lanterns, bats and lit windows at dusk.", fits: ["game", "web-frontend", "unknown"], flagship: false,
  sky: [0x2a1442, 0x0d0618], terrain: "island", ground: { fill: 0x3d4a33, fillLight: 0x5d6b45, edge: 0x4a3a30, edgeDark: 0x2e241e, sand: 0x8a7a5e }, water: { ripple: 0xff9a3c, rippleAlpha: 0.16 }, pathColor: 0xd9a35a, labelColor: 0xffe1b0,
  palettes: [
    { top: 0x6a5a78, left: 0x4f4160, right: 0x3a2f48, roof: 0x2a1f36, roofD: 0x1a1224, win: 0xffb547 },
    { top: 0x5e6b5a, left: 0x465243, right: 0x333c31, roof: 0x7a2f3a, roofD: 0x5a2029, win: 0xffd66b },
    { top: 0x7a6a5a, left: 0x5c4f43, right: 0x443a31, roof: 0x3a2a4f, roofD: 0x261b35, win: 0xa6ff8a },
    { top: 0x6e5f7e, left: 0x544666, right: 0x3c3250, roof: 0xff7a1a, roofD: 0xc75a10, win: 0xffd66b },
  ],
  beacon: { top: 0x4f4160, left: 0x3a2f48, right: 0x2a2236, roof: 0xff7a1a, roofD: 0xc75a10, win: 0xffb547, lamp: { idle: 0xff9a3c, scan: 0xffffff, fail: 0xff5a4e, pass: 0xa6ff8a } },
  archive: { top: 0x5a4a6e, left: 0x463a58, right: 0x342b44, roof: 0x7a2f3a, roofD: 0x5a2029, win: 0xa6ff8a },
  forge: { top: 0x3a3a40, left: 0x2a2a30, right: 0x1e1e24, roof: 0x4a4a52, roofD: 0x34343a, win: 0xa6ff8a, ember: 0x7dff6a },
  dock: { deck: 0x4a3a30, post: 0x2e241e, vessel: 0xe9e6ff },
  prop: "pumpkin", propColors: [0xff7a1a, 0xffd66b, 0x4a6a2a],
  gremlin: { body: 0xeee9ff, eye: 0x1b1030 },
  vignette: 0x07020d, ambient: "bats", scares: true, season: { from: [10, 17], to: [11, 2] } };

export const SETS: readonly SetTheme[] = [island, orbit, metropolis, harbour, observatory, greenhouse, workshop, arcade, kingdom, outpost, snowfield, canopy, lagoon, volcano, cloudtop, reef, bazaar, monastery, moonbase, lanterns, halloween];
export const setById = (id: string | null | undefined): SetTheme => SETS.find((s) => s.id === id) ?? island;

/** True while a seasonal set is in season (month/day, inclusive; local time). */
export function inSeason(s: SetTheme, now: Date): boolean {
  if (!s.season) return false;
  const md = (now.getMonth() + 1) * 100 + now.getDate(), from = s.season.from[0] * 100 + s.season.from[1], to = s.season.to[0] * 100 + s.season.to[1];
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
}

/** Sets that fit this repo, best first; flagships win ties; falls back to everything. Deterministic order given a seed and a date. A set in season leads. */
export function suggestSets(profile: RepoProfile | undefined, seed = 0, now: Date = new Date()): SetTheme[] {
  const ranked = rankSets(profile, seed);
  const seasonal = SETS.filter((s) => inSeason(s, now));
  return seasonal.length ? [...seasonal, ...ranked.filter((s) => !seasonal.includes(s))] : ranked;
}
function rankSets(profile: RepoProfile | undefined, seed: number): SetTheme[] {
  const kinds: ProjectKind[] = profile?.kinds?.length ? profile.kinds : ["unknown"];
  const score = (s: SetTheme) => kinds.reduce((n, k, i) => n + (s.fits.includes(k) ? (kinds.length - i) * 2 : 0), 0) + (s.flagship ? 1 : 0);
  // seasonal sets only lead in season (above); out of season they stay in "All sets" but are never suggested
  const year = SETS.filter((s) => !s.season);
  const fitting = year.filter((s) => score(s) > 1);
  const pool = fitting.length >= 3 ? fitting : year;
  // seeded shuffle among equal scores so first launch feels chosen, not sorted
  let x = (seed >>> 0) || 1;
  const rnd = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1000) / 1000; };
  return [...pool].map((s) => ({ s, k: score(s) + rnd() * 0.5 })).sort((a, b) => b.k - a.k).map(({ s }) => s);
}
export type { SetTheme, SetId };
