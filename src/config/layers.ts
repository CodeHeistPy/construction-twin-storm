// =============================================================================
// How web scene layers map to roles, by TITLE (so a new scene only needs its
// titles matched here). The views switch roles on or off (config/tour.ts);
// layers matching no rule are left as the scene has them, and the console
// lists them on load so they can be added here.
//
// Scene "Denver Office Park - copy" (fe60b2cf…): "3D mesh", "Ortho", the
// "Denver Utilities" group (kept off), "Road_and_Rail" (not public),
// Office_Park_Site + Office_Park_Building_1..4.
// =============================================================================

export const LAYER_RULES = {
  /** The building we track (also BIM_LAYER_TITLE in bim-schedule.json). */
  focusBuilding: /^Office_Park_Building_1$/,
  /** Site works shown alongside the focus building. */
  site: /^Office_Park_Site$/,
  /** Proposed development: every design model. */
  proposed: /^Office_Park_/,
  /** Integrated mesh of current conditions. */
  mesh: /mesh/i,
  /** Reality capture imagery. */
  reality: [/ortho/i, /imagery/i],
  /** Existing networks: utilities (group and members) and rail. */
  utilities: [/utilit/i, /rail/i, /storm/i, /sanitary/i, /electric/i, /sewer/i, /manhole/i, /inlet/i],
};

export type LayerRole = "focusBuilding" | "site" | "proposed" | "mesh" | "reality" | "utilities" | null;

export function roleOf(title: string | null | undefined): LayerRole {
  const t = title ?? "";
  if (LAYER_RULES.focusBuilding.test(t)) return "focusBuilding";
  if (LAYER_RULES.site.test(t)) return "site";
  if (LAYER_RULES.proposed.test(t)) return "proposed";
  if (LAYER_RULES.mesh.test(t)) return "mesh";
  if (LAYER_RULES.reality.some((r) => r.test(t))) return "reality";
  if (LAYER_RULES.utilities.some((r) => r.test(t))) return "utilities";
  return null;
}

