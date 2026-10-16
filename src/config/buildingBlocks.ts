// The six building blocks of a Digital Twin in ArcGIS, and where each one
// shows up in this app. `appRole` is the in-app evidence; the callback to the
// earlier plenary segments: per the user (2026-10-16), segments before this one
// showed Foundation, Reality, Integration and Decision. Real-time Monitoring and
// Simulation are NEW here, which is where this segment should spend its time.

export type BlockId =
  | "foundation"
  | "realtime"
  | "integration"
  | "reality"
  | "analysis"
  | "intelligence";

export interface BuildingBlock {
  id: BlockId;
  n: number;
  title: string;
  short: string;
  /** What this block contributes in this app. */
  appRole: string;
  /** true if an earlier plenary segment already showed this block. */
  shownEarlier: boolean;
}

export const BUILDING_BLOCKS: BuildingBlock[] = [
  {
    id: "foundation",
    n: 1,
    title: "Spatial Data Foundation",
    short: "Foundation",
    appRole: "The 3D site: terrain, context, BIM model and schedule in one coordinate system.",
    shownEarlier: true,
  },
  {
    id: "realtime",
    n: 2,
    title: "Real-time Monitoring",
    short: "Real-time",
    appRole: "Site weather sensors and the incoming storm, updating as the clock advances.",
    shownEarlier: false,
  },
  {
    id: "integration",
    n: 3,
    title: "System Interoperability & Integration",
    short: "Integration",
    appRole: "The schedule system and the weather feed joined to the 3D model.",
    shownEarlier: true,
  },
  {
    id: "reality",
    n: 4,
    title: "Reality Mapping & Visualization",
    short: "Reality",
    appRole: "Reality capture of current site conditions shown alongside the design.",
    shownEarlier: true,
  },
  {
    id: "analysis",
    n: 5,
    title: "Spatial Analysis & Scenario Simulation",
    short: "Simulation",
    appRole: "Step the storm through the day and test every activity against its limits.",
    shownEarlier: false,
  },
  {
    id: "intelligence",
    n: 6,
    title: "Applied Intelligence & Decision Support",
    short: "Decision",
    appRole: "The postpone / watch / go call, with reasons, ready to send to the crews.",
    shownEarlier: true,
  },
];
