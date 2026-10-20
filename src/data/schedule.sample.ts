import type { Activity, ActivityType } from "../domain/types";
import { atHour } from "../lib/time";

// =============================================================================
// ⚠️ SAMPLE SITE ACTIVITIES: invented, NOT in the BIM model. The model only
// says what gets installed each day; a real day on site also has crane picks,
// deliveries, utility work and finishes. Shown with a "Sample" tag in the UI.
//
// Each one is placed ON a real asset (user, 2026-10-20: "the points should
// match their assets"): Building 1's faces and core, the site podium between
// the buildings, and a real City of Denver storm manhole (MH 2835760, from the
// Stormwater layer) for the drainage tie-in. Heights are metres above ground.
// Building 1 footprint: -104.99141..-104.99093, 39.69845..39.69882.
// =============================================================================

export const INCLUDE_SAMPLE_ACTIVITIES = true;

interface Row {
  id: string;
  name: string;
  type: ActivityType;
  trade: string;
  zone: string;
  from: number; // hour of the demo day
  to: number;
  crew: number;
  at: [number, number, number]; // lon, lat, metres above ground
  heading?: number; // camera heading that frames it
}

const ROWS: Row[] = [
  {
    id: "S-01",
    name: "Tower crane: hoist curtain wall units",
    type: "crane-lift",
    trade: "Crane / rigging",
    zone: "Building 1, south face",
    from: 7,
    to: 15,
    crew: 4,
    at: [-104.99117, 39.69843, 70],
    heading: 0,
  },
  {
    id: "S-02",
    name: "Curtain wall unit delivery to the podium",
    type: "deliveries",
    trade: "Logistics",
    zone: "Podium, east of Building 1",
    // A morning drop, ahead of the storm, so it proceeds (user, 2026-10-20:
    // postponed and proceed were both 7; now 6 and 8).
    from: 7,
    to: 10,
    crew: 2,
    at: [-104.99082, 39.69866, 11],
    heading: 270,
  },
  {
    id: "S-03",
    name: "Storm drainage tie-in at MH 2835760",
    type: "earthwork",
    trade: "Site utilities",
    zone: "Between Buildings 1 and 2",
    from: 7,
    to: 15,
    crew: 5,
    at: [-104.990856, 39.698433, 1],
    heading: 300,
  },
  {
    id: "S-04",
    name: "Podium deck waterproofing",
    type: "roofing",
    trade: "Waterproofing",
    zone: "Podium, south of Building 1",
    from: 8,
    to: 15,
    crew: 6,
    at: [-104.9911, 39.6983, 11],
    heading: 20,
  },
  {
    id: "S-05",
    name: "Exterior sealant, Building 1 west face, levels 2–4",
    type: "exterior-finishes",
    trade: "Envelope",
    zone: "Building 1, west face",
    from: 9,
    to: 15,
    crew: 3,
    at: [-104.99143, 39.69864, 10],
    heading: 90,
  },
  {
    id: "S-06",
    name: "Plaza paving pour",
    type: "concrete-pour",
    trade: "Concrete",
    zone: "Podium plaza",
    from: 7,
    to: 11,
    crew: 8,
    at: [-104.99135, 39.6981, 11],
    heading: 30,
  },
  {
    id: "S-07",
    name: "Elevator rail installation, core",
    type: "interior",
    trade: "Vertical transport",
    zone: "Building 1, core",
    from: 7,
    to: 15,
    crew: 3,
    at: [-104.99117, 39.698635, 40],
  },
];

export function sampleSchedule(day: Date): Activity[] {
  if (!INCLUDE_SAMPLE_ACTIVITIES) return [];
  return ROWS.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    trade: r.trade,
    zone: r.zone,
    start: atHour(day, r.from),
    end: atHour(day, r.to),
    crewSize: r.crew,
    location: { longitude: r.at[0], latitude: r.at[1], z: r.at[2] },
    viewHeading: r.heading,
    source: "sample",
  }));
}
