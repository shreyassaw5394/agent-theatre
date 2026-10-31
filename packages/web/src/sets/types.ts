/**
 * A Set is an art pack. Geometry is shared; a set supplies colour, terrain
 * style, prop style and silhouettes. The Director and player never see this.
 */
export interface Palette { top: number; left: number; right: number; roof: number; roofD: number; win: number }
import type { ProjectKind } from "@agent-theatre/core";
export type SetId = "island" | "orbit" | "metropolis" | "harbour" | "observatory" | "greenhouse" | "workshop" | "arcade" | "kingdom" | "outpost" | "snowfield" | "canopy" | "lagoon" | "volcano" | "cloudtop" | "reef" | "bazaar" | "monastery" | "moonbase" | "lanterns" | "halloween";
export interface SetTheme {
  id: SetId;
  name: string;
  tagline: string;
  /** Project kinds this stage suits; used to suggest a default. */
  fits: ProjectKind[];
  /** Fully art-directed (true) or a palette set on shared geometry (false). */
  flagship: boolean;
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
  prop: "tree" | "antenna" | "lamp" | "pumpkin";
  propColors: [number, number, number];
  gremlin: { body: number; eye: number };
  pip: { body: number; bodyLight: number; belly: number; ear: number; cheek: number; ink: number };
  mood: { curious: number; focused: number; lost: number; happy: number; uneasy: number };
  vignette: number;
  /** Something alive in the air above the stage (drawn by the world layer, still under reduced motion). */
  ambient?: "bats";
  /** Occasional jump scares over the stage (Halloween). The viewer can switch them off. */
  scares?: boolean;
  /** A seasonal stage: suggested first between these dates (month, day), inclusive. */
  season?: { from: [number, number]; to: [number, number] };
}
