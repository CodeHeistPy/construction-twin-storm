import { SITE } from "../config/site";
import type { Activity, ActivityType } from "../domain/types";
import { offsetMeters } from "../lib/geo";
import { atHour } from "../lib/time";

// =============================================================================
// ⚠️ SAMPLE SITE-LOGISTICS ACTIVITIES — invented, NOT in the BIM model. The
// model only says what gets installed each day; real curtain wall work also
// needs a crane pick and a delivery, and those are the most wind-sensitive
// items on the day. Shown with a "Sample" tag in the UI. Set
// INCLUDE_SAMPLE_ACTIVITIES to false to show only BIM-derived work.
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
  east: number;
  north: number;
  z: number;
}

const ROWS: Row[] = [
  { id: "S-01", name: "Mobile crane: hoist curtain wall units", type: "crane-lift", trade: "Crane / rigging", zone: "South laydown", from: 7, to: 15, crew: 4, east: 10, north: -40, z: 30 },
  { id: "S-02", name: "Curtain wall unit delivery", type: "deliveries", trade: "Logistics", zone: "Site gate", from: 13, to: 15, crew: 2, east: -45, north: -55, z: 0 },
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
    location: { ...offsetMeters(SITE.longitude, SITE.latitude, r.east, r.north), z: r.z },
    source: "sample",
  }));
}
