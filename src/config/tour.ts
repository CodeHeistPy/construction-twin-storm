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

export type CameraPreset = "site" | "development" | "building" | "overview" | "storm" | "underground";

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
}

export interface StopRule {
  key: string;
  /** Matched against the slide title. */
  match: RegExp;
  behaviour: StopBehaviour;
  /** Used only when the scene has no matching slide yet. */
  builtIn: { title: string; camera: CameraPreset | "focus" };
}

const LAYERS = {
  overview: { reality: true, utilities: false, mesh: false, proposed: "all" as const },
  underground: { reality: true, utilities: true, mesh: false, proposed: "all" as const },
  today: { reality: true, utilities: false, mesh: true, proposed: "none" as const },
  design: { reality: true, utilities: false, mesh: false, proposed: "all" as const },
  focus: { reality: true, utilities: false, mesh: false, proposed: "focus" as const },
};

const base = (layers: SceneMode["layers"], over: Partial<SceneMode> = {}): SceneMode => ({
  layers,
  underground: false,
  bim: "design",
  storm: false,
  markers: false,
  ...over,
});

/** In scene order of the storyline. First match wins. */
export const STOP_RULES: StopRule[] = [
  {
    key: "underground",
    match: /underground|utilit/i,
    behaviour: { scene: base(LAYERS.underground, { underground: true }), left: "conflicts", replan: false, hour: 7 },
    builtIn: { title: "What's underground", camera: "underground" },
  },
  {
    key: "today",
    match: /there today|existing|reality/i,
    behaviour: { scene: base(LAYERS.today), replan: false },
    builtIn: { title: "What's there today", camera: "site" },
  },
  {
    key: "design",
    match: /going to be there|design|bim/i,
    behaviour: { scene: base(LAYERS.design), replan: false },
    builtIn: { title: "What's going to be there", camera: "development" },
  },
  {
    key: "schedule",
    match: /when|schedule|4d|progress/i,
    behaviour: { scene: base(LAYERS.focus, { bim: "timeline" }), left: "progress", replan: false, hour: 7 },
    builtIn: { title: "When it will be there", camera: "building" },
  },
  {
    key: "weather",
    match: /change|weather|real-?time|storm/i,
    behaviour: {
      scene: base(LAYERS.focus, { bim: "decision", storm: true, markers: true }),
      left: "schedule",
      decisions: true,
      conditions: true,
      alert: true,
      replan: false,
      hour: 9,
    },
    builtIn: { title: "What could change it", camera: "storm" },
  },
  {
    key: "decision",
    match: /what we do|decision|re-?plan|act/i,
    behaviour: {
      scene: base(LAYERS.focus, { bim: "decision", storm: true, markers: true, focus: "postponed" }),
      left: "schedule",
      decisions: true,
      conditions: true,
      hour: 9,
    },
    builtIn: { title: "What we do about it", camera: "focus" },
  },
];

/** Behaviour for a slide that matches no rule: the slide as authored, nothing added. */
export const PLAIN: StopBehaviour = { scene: base(LAYERS.overview) };

export function ruleFor(title: string): StopRule | undefined {
  return STOP_RULES.find((r) => r.match.test(title));
}
