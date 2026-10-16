import type { BlockId } from "./buildingBlocks";

// =============================================================================
// DRAFT RUN OF SHOW — one step per beat. Narration is placeholder copy; replace
// it with the agreed script once the storyboard is done. Each step can set the
// clock, the camera, and which blocks are lit.
// =============================================================================

export type CameraPreset = "overview" | "site" | "storm" | "crane";

export interface PresentationStep {
  title: string;
  /** Blocks that light up on the rail for this beat (cumulative is fine). */
  blocks: BlockId[];
  /** Hour of the demo day to set the clock to; undefined = leave as is. */
  hour?: number;
  camera?: CameraPreset;
  /** Show the crew-communication dialog. */
  showComms?: boolean;
  /** Apply the adapted plan (postponed work moved to its next window). */
  replan?: boolean;
  narration: string;
}

export const PRESENTATION: PresentationStep[] = [
  {
    title: "The site, this morning",
    blocks: ["foundation"],
    hour: 7,
    camera: "site",
    narration: "DRAFT — The twin: site, building and today's schedule in one place.",
  },
  {
    title: "What's on site right now",
    blocks: ["foundation", "reality"],
    hour: 7,
    camera: "site",
    narration: "DRAFT — Reality capture shows where the build actually is.",
  },
  {
    title: "Systems talking to each other",
    blocks: ["foundation", "reality", "integration"],
    hour: 8,
    camera: "site",
    narration: "DRAFT — The schedule and weather feed are joined to the model.",
  },
  {
    title: "A storm is coming",
    blocks: ["foundation", "reality", "integration", "realtime"],
    hour: 9,
    camera: "storm",
    narration: "DRAFT — Live conditions plus the forecast: the storm reaches the site this afternoon.",
  },
  {
    title: "Play the day forward",
    blocks: ["foundation", "reality", "integration", "realtime", "analysis"],
    hour: 15,
    camera: "overview",
    narration: "DRAFT — Simulate the storm through the day; every activity is tested against its limits.",
  },
  {
    title: "The call",
    blocks: ["foundation", "reality", "integration", "realtime", "analysis", "intelligence"],
    hour: 9,
    camera: "crane",
    narration: "DRAFT — What gets postponed, why, and when. Before the first gust arrives.",
  },
  {
    title: "Adapt the plan",
    blocks: ["foundation", "reality", "integration", "realtime", "analysis", "intelligence"],
    hour: 9,
    camera: "site",
    replan: true,
    narration: "DRAFT — Move the postponed work to the first window it can run, and see the knock-on to the rest of the build.",
  },
  {
    title: "Tell the crews",
    blocks: ["foundation", "reality", "integration", "realtime", "analysis", "intelligence"],
    hour: 9,
    camera: "site",
    showComms: true,
    replan: true,
    narration: "DRAFT — One message to every affected crew, with the reasons attached.",
  },
];
