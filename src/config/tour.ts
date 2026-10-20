// =============================================================================
// THE TOUR — driven by the web scene's own slides (authored in Scene Viewer;
// see SLIDES.md). Each slide is matched by TITLE to a behaviour: what the app
// adds on top of the slide's camera and layers (pipes at depth, 4D build-out,
// storm, decisions...). No on-screen narration: the presenter calls out the
// building blocks.
//
// Until the slides are authored, BUILT_IN stops with the same storyline run
// instead (camera shots + layer roles from config/layers.ts).
// =============================================================================

export type CameraPreset = "site" | "development" | "building" | "overview" | "storm" | "underground" | SlideView;

/**
 * The app's two views, taken from the user's own slides ("Construction
 * Schedule", "Schedule Adjustment") in the original web scene 61a325c2…: exact
 * cameras and sun times. Built into the app (user, 2026-10-20) so it no longer
 * depends on the scene's slides (the scene copy it now loads has none).
 */
export type SlideView = "schedule" | "adjustment";

/** How Building 1 renders. Not-yet-installed parts are hidden in every mode but "design". */
export type BimMode =
  | "design" // the full model as designed
  | "timeline" // 4D: installed as of the timeline date
  | "progress" // installed before today only
  | "scheduled" // + today's work highlighted, no weather call yet
  | "decision" // today's work coloured by go / watch / postpone (violet once re-planned)
  | "outcome"; // end of day: what ran is installed, what moved is violet

/** Which of today's activities a stop is about. */
export type FocusTarget = "postponed" | "proceeding";

export interface SceneMode {
  /** Layer visibility by role: only applied by BUILT-IN stops (authored slides set their own). */
  layers: { reality: boolean; utilities: boolean; mesh: boolean; proposed: "none" | "all" | "focus" };
  /** Utilities as pipes at depth, see-through ground, conflicts flagged. */
  underground: boolean;
  bim: BimMode;
  /** Storm cell overlay + rain/cloud effects. */
  storm: boolean;
  /** Activity markers. */
  markers: boolean;
  focus?: FocusTarget;
}

export interface StopBehaviour {
  scene: SceneMode;
  /** Left panel; omitted = hidden. */
  left?: "progress" | "schedule" | "conflicts";
  /** Weather calls in the schedule panel. */
  decisions?: boolean;
  /** Right panel (site conditions + forecast). */
  conditions?: boolean;
  /** Clock hour to set on arrival. */
  hour?: number;
  /** Pop the incoming-weather alert on arrival. */
  alert?: boolean;
  /** Force the re-plan state on arrival (undefined = leave as the presenter set it). */
  replan?: boolean;
  outcome?: boolean;
  /** Building sublayers switched off while this stop is up (slides can't save that). */
  hideSublayers?: { layer: string; sublayers: string[] }[];
}

export interface StopRule {
  key: string;
  /** Matched against the slide title. */
  match: RegExp;
  behaviour: StopBehaviour;
  /** Used only when the scene has no matching slide yet. "none" = keep the camera where it is. */
  builtIn: { title: string; camera: CameraPreset | "focus" | "none" };
  /** With authored slides, still add this stop (camera-less) if no slide matches it. */
  insertIfMissing?: boolean;
}

const LAYERS = {
  overview: { reality: true, utilities: false, mesh: false, proposed: "all" as const },
  underground: { reality: true, utilities: true, mesh: false, proposed: "all" as const },
  today: { reality: true, utilities: false, mesh: true, proposed: "none" as const },
  design: { reality: true, utilities: false, mesh: false, proposed: "all" as const },
  focus: { reality: true, utilities: false, mesh: false, proposed: "focus" as const },
  // As the user's two slides had it: buildings on, ortho and mesh off.
  slides: { reality: false, utilities: false, mesh: false, proposed: "all" as const },
};

const base = (layers: SceneMode["layers"], over: Partial<SceneMode> = {}): SceneMode => ({
  layers,
  underground: false,
  bim: "design",
  storm: false,
  markers: false,
  ...over,
});

/** Building sublayers kept off on EVERY stop (user: no site trees anywhere). */
export const ALWAYS_HIDDEN: { layer: string; sublayers: string[] }[] = [{ layer: "Office_Park_Site", sublayers: ["Planting"] }];

/**
 * The stops this app plays (user, 2026-10-20): the story's earlier beats (site,
 * design, utilities...) are now told in Scene Viewer, and the app only does the
 * 4D schedule and the weather adjustment. Every other slide in the scene is
 * left out, so slides added there for the rest of the story never show up here.
 */
export const APP_STOPS = ["schedule", "decision"];

/**
 * In storyline order (the user's slides): Development Site → Current Design →
 * Current Utilities → Construction Schedule → Schedule Adjustment (with the
 * weather alert). First match wins. A rule with `insertIfMissing` gets a
 * camera-less stop of its own when no authored slide matches it.
 */
export const STOP_RULES: StopRule[] = [
  {
    key: "today",
    match: /development site|there today|existing|reality/i,
    behaviour: { scene: base(LAYERS.today), replan: false, hour: 7 },
    builtIn: { title: "What's there today", camera: "site" },
  },
  {
    key: "underground",
    match: /underground|utilit/i,
    behaviour: { scene: base(LAYERS.underground, { underground: true }), left: "conflicts", replan: false, hour: 7 },
    builtIn: { title: "What's underground", camera: "underground" },
  },
  {
    key: "design",
    match: /going to be there|design|bim/i,
    behaviour: { scene: base(LAYERS.design), replan: false },
    builtIn: { title: "What's going to be there", camera: "development" },
  },
  {
    key: "schedule",
    // Not "Schedule Adjustment": that's the decision stop.
    match: /^(?!.*adjust).*(when|schedule|4d|progress)/i,
    behaviour: { scene: base(LAYERS.slides, { bim: "timeline" }), left: "progress", replan: false, hour: 7 },
    builtIn: { title: "Construction Schedule", camera: "schedule" },
  },
  {
    key: "decision",
    match: /adjust|what we do|decision|re-?plan/i,
    // The incoming-weather alert pops here (user: the separate "What could
    // change it" stop is gone; its alert moved onto this slide).
    behaviour: {
      alert: true,
      scene: base(LAYERS.slides, { bim: "decision", markers: true }),
      left: "schedule",
      decisions: true,
      hour: 9,
    },
    builtIn: { title: "Schedule Adjustment", camera: "adjustment" },
  },
];

/** Behaviour for a slide that matches no rule: the slide as authored, nothing added. */
export const PLAIN: StopBehaviour = { scene: base(LAYERS.overview) };

export function ruleFor(title: string): StopRule | undefined {
  return STOP_RULES.find((r) => r.match.test(title));
}
