/**
 * A Set is an art pack. Geometry is shared; a set supplies colour, terrain
 * style, prop style and silhouettes. The Director and player never see this.
 */
export interface Palette { top: number; left: number; right: number; roof: number; roofD: number; win: number }
export interface SetTheme {
  id: "island" | "orbit" | "metropolis";
  name: string;
  tagline: string;
  /** Stage background, top→bottom. */
  sky: [number, number];
  /** Terrain style selects the ground painter. */
  terrain: "island" | "platform" | "block";
  ground: { fill: number; fillLight: number; edge: number; edgeDark: number; sand: number };
  water: { ripple: number; rippleAlpha: number };
  pathColor: number;
  labelColor: number;
  /** Cycled per district. */
  palettes: Palette[];
  beacon: Palette & { lamp: { idle: number; scan: number; fail: number; pass: number } };
  archive: Palette;
  forge: Palette & { ember: number };
  dock: { deck: number; post: number; vessel: number };
  prop: "tree" | "antenna" | "lamp";
  propColors: [number, number, number];
  gremlin: { body: number; eye: number };
  pip: { body: number; bodyLight: number; belly: number; ear: number; cheek: number; ink: number };
  mood: { curious: number; focused: number; lost: number; happy: number; uneasy: number };
  vignette: number;
}
