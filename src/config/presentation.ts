import type { BlockId } from "./buildingBlocks";

// =============================================================================
// THE STORYLINE — the user's run of show (2026-10-16). Each beat sets what the
// scene shows, which panels are up, the clock, the camera, and the lit blocks.
// Narration is DRAFT copy for the presenter card; edit freely.
//
// Arc: existing site → proposed design → Building 1 progress → today's plan →
// real-time weather → the work face → the call → re-plan + notify → outcome.
// =============================================================================

export type CameraPreset = "site" | "development" | "building" | "overview" | "storm";

/** How Building 1 renders. Not-yet-installed parts are hidden in every mode but "design". */
export type BimMode =
  | "design" // the full model as designed
  | "progress" // installed before today only
  | "scheduled" // + today's work highlighted, no weather call yet
  | "decision" // today's work coloured by go / watch / postpone (violet once re-planned)
  | "outcome"; // end of day: what ran is installed, what moved is violet

/** Which of today's activities a work-face beat zooms to. */
export type FocusTarget = "postponed" | "proceeding";

export interface SceneMode {
  /** Reality capture imagery (ortho). */
  reality: boolean;
  /** Existing networks: storm, sanitary (and rail / electrical when available). */
  utilities: boolean;
  /** Integrated mesh of current conditions (hidden once the design is shown). */
  mesh: boolean;
  /** Proposed buildings: none, all, or Building 1 only (plus the site). */
  proposed: "none" | "all" | "focus";
  bim: BimMode;
  /** Storm cell overlay + rain/cloud effects. */
  storm: boolean;
  /** Activity markers. */
  markers: boolean;
  focus?: FocusTarget;
}

export interface PresentationStep {
  title: string;
  blocks: BlockId[];
  narration: string;
  scene: SceneMode;
  /** Left panel content; omitted = hidden. */
  left?: "progress" | "schedule";
  /** Show weather decisions in the schedule (false before weather is introduced). */
  decisions?: boolean;
  /** Right panel (site conditions). */
  conditions?: boolean;
  /** Hour of the demo day to set the clock to. */
  hour?: number;
  camera?: CameraPreset | "focus";
  /** Pop the incoming-weather alert. */
  alert?: boolean;
  replan?: boolean;
  showComms?: boolean;
  outcome?: boolean;
}

const B = {
  start: ["foundation", "reality"] as BlockId[],
  design: ["foundation", "reality", "integration"] as BlockId[],
  plan: ["foundation", "reality", "integration", "analysis"] as BlockId[],
  live: ["foundation", "reality", "integration", "analysis", "realtime"] as BlockId[],
  all: ["foundation", "reality", "integration", "analysis", "realtime", "intelligence"] as BlockId[],
};

const EXISTING_ONLY: SceneMode = { reality: true, utilities: true, mesh: true, proposed: "none", bim: "design", storm: false, markers: false };

export const PRESENTATION: PresentationStep[] = [
  {
    title: "The site today",
    blocks: B.start,
    scene: EXISTING_ONLY,
    hour: 7,
    camera: "site",
    narration:
      "DRAFT — What's on the ground right now: drone reality capture (mesh + ortho) and the existing storm and sanitary networks. One trusted foundation.",
  },
  {
    title: "What we're building",
    blocks: B.design,
    scene: { ...EXISTING_ONLY, mesh: false, proposed: "all" },
    camera: "development",
    narration: "DRAFT — The proposed development: every building's design model, in place, in context.",
  },
  {
    title: "Where Building 1 stands",
    blocks: B.design,
    scene: { ...EXISTING_ONLY, mesh: false, utilities: false, proposed: "focus", bim: "progress" },
    left: "progress",
    camera: "building",
    narration: "DRAFT — Filtered to what's actually installed. Progress comes straight from the model.",
  },
  {
    title: "Today's plan",
    blocks: B.plan,
    scene: { ...EXISTING_ONLY, mesh: false, utilities: false, proposed: "focus", bim: "scheduled", markers: true },
    left: "schedule",
    decisions: false,
    camera: "building",
    hour: 7,
    narration: "DRAFT — What's scheduled today, and where. Next: what could change it.",
  },
  {
    title: "Weather on the way",
    blocks: B.live,
    scene: { ...EXISTING_ONLY, mesh: false, utilities: false, proposed: "focus", bim: "scheduled", storm: true, markers: true },
    left: "schedule",
    decisions: false,
    conditions: true,
    alert: true,
    camera: "storm",
    hour: 9,
    narration: "DRAFT — Live conditions and the forecast: a storm reaches the site this afternoon.",
  },
  {
    title: "At the work face",
    blocks: B.live,
    scene: { ...EXISTING_ONLY, mesh: false, utilities: false, proposed: "focus", bim: "decision", storm: true, markers: true, focus: "postponed" },
    left: "schedule",
    decisions: true,
    conditions: true,
    camera: "focus",
    hour: 13,
    narration: "DRAFT — Today's curtain wall install, on the exposed face, right when the gusts arrive.",
  },
  {
    title: "It can't happen today",
    blocks: B.all,
    scene: { ...EXISTING_ONLY, mesh: false, utilities: false, proposed: "focus", bim: "decision", storm: true, markers: true, focus: "postponed" },
    left: "schedule",
    decisions: true,
    conditions: true,
    camera: "focus",
    hour: 9,
    narration: "DRAFT — The call, made in the morning: exceeds the limits, so it moves. Everything else carries on.",
  },
  {
    title: "Re-plan and notify",
    blocks: B.all,
    scene: { ...EXISTING_ONLY, mesh: false, utilities: false, proposed: "focus", bim: "decision", storm: true, markers: true },
    left: "schedule",
    decisions: true,
    conditions: true,
    replan: true,
    showComms: true,
    camera: "building",
    hour: 9,
    narration: "DRAFT — The schedule updates itself and every affected crew gets the new plan.",
  },
  {
    title: "Ahead of the storm",
    blocks: B.all,
    scene: { ...EXISTING_ONLY, mesh: false, utilities: false, proposed: "focus", bim: "outcome", storm: false, markers: false },
    left: "progress",
    replan: true,
    outcome: true,
    camera: "building",
    hour: 17,
    narration:
      "DRAFT — By bringing the building blocks together we saw it coming, understood the impact, and adjusted, with data behind every decision.",
  },
];

/** Outside presentation mode: everything on. */
export const FREE_MODE: PresentationStep = {
  title: "Explore",
  blocks: B.all,
  scene: { reality: true, utilities: false, mesh: false, proposed: "all", bim: "decision", storm: true, markers: true },
  left: "schedule",
  decisions: true,
  conditions: true,
  narration: "",
};
