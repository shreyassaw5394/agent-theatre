import type { RepoProfile } from "./profile.js";
/**
 * A set-agnostic world: the repo's structure laid out on an integer grid.
 * Themes ("sets") are applied by the renderer; nothing here names one.
 */
export type PlaceKind = "building" | "beacon" | "archive" | "forge" | "dock" | "overflow";
export type PlaceId = string;

export interface FileNode {
  /** Repo-relative, forward slashes. */
  path: string;
  /** Lines of code if known. */
  loc?: number;
  /** Bytes if known (used when loc is not). */
  size?: number;
  /** Recent change count if known (git). */
  churn?: number;
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface District {
  id: string;
  /** Top-level folder name, or "/" for root files. */
  label: string;
  bounds: Rect;
  /** Grid centre. */
  cx: number;
  cy: number;
  placeIds: PlaceId[];
}

export interface Place {
  id: PlaceId;
  kind: PlaceKind;
  /** Repo-relative path; "" for forge/dock. */
  path: string;
  label: string;
  district: string;
  gx: number;
  gy: number;
  /** 1..3 cells per side. */
  footprint: 1 | 2 | 3;
  /** 1..5 abstract height class. */
  height: number;
  /** 0..1 relevance, drives default emphasis. */
  score: number;
  /** True when the session touched this file (forced into the world). */
  touched: boolean;
}

export interface Path { from: string; to: string; points: Array<[number, number]> }

/** How districts are arranged. Chosen per set and seed so stages don't all look like one island. */
export type LayoutStyle = "ring" | "grid" | "strip" | "scatter" | "terrace" | "spine";

export interface World {
  repoId: string;
  seed: number;
  layout: LayoutStyle;
  /** What the repo looks like it is; the renderer uses it to suggest sets. */
  profile: RepoProfile;
  districts: District[];
  places: Place[];
  paths: Path[];
  bounds: Rect;
  /** How many files were considered vs. placed — honest about the cap. */
  stats: { files: number; placed: number; capped: boolean };
}

export interface GenerateOptions {
  repoId: string;
  files: FileNode[];
  /** Repo-relative paths the session touches; always placed. */
  touched?: string[];
  /** Max buildings+archives (beacons, forge, dock are extra). Default 60. */
  cap?: number;
  /** Max beacons. Default 8. */
  beaconCap?: number;
  /** Max session-touched files force-included. Default 48; the rest share a per-district overflow building. */
  touchedCap?: number;
  /** Manifest contents (package.json etc.) if the host read them, for better project-kind detection. Never stored. */
  manifests?: Record<string, string>;
  /** Arrangement; default chosen from the seed. */
  layout?: LayoutStyle;
}
