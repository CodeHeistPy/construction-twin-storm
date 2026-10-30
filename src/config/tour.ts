// =============================================================================
// THE TOUR: the app's three views, stepped through with the bar at the bottom
// (arrows / clicker). The story's earlier beats (site, design, utilities) are
// told in Scene Viewer (user, 2026-10-20); the app picks up at the build-out.
// No on-screen narration: the presenter calls out the building blocks.
// =============================================================================

/**
 * The app's views: exact cameras and sun times (SceneCanvas SLIDE_VIEWS),
 * first copied from the user's slides in the original web scene 61a325c2….
 */
export type SlideView = "schedule" | "adjustment" | "completion";

/** How Building 1 renders. Not-yet-installed parts are hidden in every mode but "design". */
export type BimMode =
  | "design" // the full model as designed (before the first view lands)
  | "timeline" // 4D: installed as of the timeline date
  | "scheduled" // today's work highlighted, no weather call yet
  | "decision"; // today's work coloured by go / watch / postpone (violet once re-planned)

export interface SceneMode {
  /** Layer visibility by role (config/layers.ts). */
  layers: { reality: boolean; utilities: boolean; mesh: boolean; proposed: "none" | "all" };
  bim: BimMode;
  /** Activity markers. */
  markers: boolean;
}

export interface StopBehaviour {
  scene: SceneMode;
  /** Left panel; omitted = hidden. */
  left?: "progress" | "schedule";
  /** Weather calls in the schedule panel. */
  decisions?: boolean;
  /**
   * Hold the weather calls back behind a topbar "Weather alert" button (user,
   * 2026-10-20): the stop opens on the full schedule; the click shows the alert
   * and switches the panel, building and pins to postpone / proceed.
   */
  alertButton?: boolean;
  /**
   * The 4D plays on from Today to the finished building (user, 2026-10-21:
   * a closing view of the completed building); the completion date holds.
   */
  completion?: boolean;
  /** Force the re-plan state on arrival (undefined = leave as the presenter set it). */
  replan?: boolean;
}

export interface StopRule {
  key: string;
  title: string;
  camera: SlideView;
  behaviour: StopBehaviour;
}

/** Buildings and the 3D mesh on, ortho and utilities off (user, 2026-10-20). */
const LAYERS: SceneMode["layers"] = { reality: false, utilities: false, mesh: true, proposed: "all" };

const scene = (over: Partial<SceneMode> = {}): SceneMode => ({ layers: LAYERS, bim: "design", markers: false, ...over });

/** Building sublayers kept off on EVERY stop (user: no site trees anywhere). */
export const ALWAYS_HIDDEN: { layer: string; sublayers: string[] }[] = [{ layer: "Office_Park_Site", sublayers: ["Planting"] }];

/** The three views, in order. */
export const STOP_RULES: StopRule[] = [
  {
    key: "schedule",
    title: "Construction Progress",
    camera: "schedule",
    behaviour: { scene: scene({ bim: "timeline" }), left: "progress", replan: false },
  },
  {
    key: "decision",
    title: "Schedule Adjustment",
    camera: "adjustment",
    // The incoming-weather alert pops here, behind the topbar button.
    behaviour: { alertButton: true, scene: scene({ bim: "decision", markers: true }), left: "schedule", decisions: true },
  },
  {
    key: "completion",
    title: "Completed Building",
    camera: "completion",
    behaviour: { scene: scene({ bim: "timeline" }), left: "progress", completion: true },
  },
];

/** Before the first view lands: the scene as loaded, nothing added. */
export const PLAIN: StopBehaviour = { scene: scene() };
