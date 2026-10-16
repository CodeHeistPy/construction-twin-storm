// =============================================================================
// How web scene layers map to the storyline, by TITLE (so a new scene only
// needs its titles matched here). Layers matching no rule are left as the
// scene has them; the console lists them on load so they can be added here.
//
// ⚠️ The current scene (7b4a2a02…) has no ortho, mesh or utility layers yet,
// so those rules match nothing until the new scene is wired in.
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
  /** Existing conditions: reality capture + rail + utilities. */
  existing: [/ortho/i, /imagery/i, /rail/i, /storm\s*(water|sewer|drain)?/i, /electric/i, /sanitary/i, /sewer/i, /utilit/i],
};

export type LayerRole = "focusBuilding" | "site" | "proposed" | "mesh" | "existing" | null;

export function roleOf(title: string | null | undefined): LayerRole {
  const t = title ?? "";
  if (LAYER_RULES.focusBuilding.test(t)) return "focusBuilding";
  if (LAYER_RULES.site.test(t)) return "site";
  if (LAYER_RULES.proposed.test(t)) return "proposed";
  if (LAYER_RULES.mesh.test(t)) return "mesh";
  if (LAYER_RULES.existing.some((r) => r.test(t))) return "existing";
  return null;
}
