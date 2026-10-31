import type { SetId } from "./types.js";

/**
 * Silhouette per stage. Geometry (footprint, height) is shared; the roofline,
 * the overhang and the rooftop furniture are what make a kingdom read as a
 * kingdom and a moonbase as a moonbase from across the stage.
 */
export type RoofStyle = "pitched" | "flat" | "dome" | "tiered" | "tent" | "capsule" | "gable" | "onion";
export interface Architecture {
  roof: RoofStyle;
  /** Eave overhang in cells (0 = walls flush with roof). */
  eave: number;
  /** Rooftop furniture: chimney, vent, mast, finial, lantern, dish. */
  furniture: "chimney" | "vent" | "mast" | "finial" | "lantern" | "dish" | "none";
  /** Stripe the near face (tents, lighthouses in some sets). */
  stripes: boolean;
}

const cottage: Architecture = { roof: "pitched", eave: 0.14, furniture: "chimney", stripes: false };
const civic: Architecture = { roof: "flat", eave: 0.05, furniture: "vent", stripes: false };
const station: Architecture = { roof: "capsule", eave: 0, furniture: "dish", stripes: false };

export const ARCHITECTURE: Record<SetId, Architecture> = {
  island: cottage,
  orbit: station,
  metropolis: civic,
  harbour: { roof: "gable", eave: 0.16, furniture: "chimney", stripes: false },
  observatory: { roof: "dome", eave: 0.04, furniture: "dish", stripes: false },
  greenhouse: { roof: "gable", eave: 0.1, furniture: "vent", stripes: false },
  workshop: { roof: "gable", eave: 0.12, furniture: "chimney", stripes: false },
  arcade: { roof: "flat", eave: 0.08, furniture: "mast", stripes: true },
  kingdom: { roof: "pitched", eave: 0.1, furniture: "finial", stripes: false },
  outpost: { roof: "flat", eave: 0.12, furniture: "vent", stripes: false },
  snowfield: { roof: "pitched", eave: 0.2, furniture: "chimney", stripes: false },
  canopy: { roof: "pitched", eave: 0.22, furniture: "none", stripes: false },
  lagoon: { roof: "tent", eave: 0.18, furniture: "none", stripes: true },
  volcano: { roof: "flat", eave: 0.06, furniture: "vent", stripes: false },
  cloudtop: { roof: "dome", eave: 0.06, furniture: "finial", stripes: false },
  reef: { roof: "dome", eave: 0.02, furniture: "none", stripes: false },
  bazaar: { roof: "tent", eave: 0.2, furniture: "none", stripes: true },
  monastery: { roof: "onion", eave: 0.08, furniture: "finial", stripes: false },
  moonbase: { roof: "capsule", eave: 0, furniture: "dish", stripes: false },
  lanterns: { roof: "tiered", eave: 0.26, furniture: "lantern", stripes: false },
  halloween: { roof: "pitched", eave: 0.2, furniture: "chimney", stripes: false },
};
