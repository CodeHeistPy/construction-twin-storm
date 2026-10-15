import { SITE } from "../config/site";
import type { Activity, ActivityType } from "../domain/types";
import { offsetMeters } from "../lib/geo";
import { atHour } from "../lib/time";

// =============================================================================
// ⚠️ SAMPLE SCHEDULE — invented so the rules engine and UI can be built before
// the real schedule export arrives. Replace with a loader for the project's
// schedule (P6 / MS Project / CSV / feature table) once its format is known.
// Positions are metre offsets from the site centre.
// =============================================================================

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
  { id: "A-101", name: "Tower crane: lift L12 steel bundles", type: "crane-lift", trade: "Crane / rigging", zone: "Tower crane TC-1", from: 7, to: 16, crew: 4, east: 0, north: 25, z: 60 },
  { id: "A-102", name: "Erect L12 perimeter steel", type: "steel-erection", trade: "Ironworkers", zone: "Level 12 north", from: 7, to: 17, crew: 9, east: -10, north: 10, z: 46 },
  { id: "A-103", name: "Pour L9 slab, pour 3", type: "concrete-pour", trade: "Concrete", zone: "Level 9 east", from: 12, to: 18, crew: 12, east: 15, north: 0, z: 34 },
  { id: "A-104", name: "Roof membrane, podium", type: "roofing", trade: "Roofing", zone: "Podium roof", from: 8, to: 15, crew: 6, east: 30, north: -25, z: 14 },
  { id: "A-105", name: "Curtain wall units, south face L5–L6", type: "curtain-wall", trade: "Glazing", zone: "South elevation", from: 7, to: 15, crew: 5, east: 0, north: -18, z: 20 },
  { id: "A-106", name: "Exterior sealant, west façade", type: "exterior-finishes", trade: "Envelope", zone: "West elevation", from: 9, to: 16, crew: 3, east: -22, north: 0, z: 10 },
  { id: "A-107", name: "Utility trench, east lot", type: "earthwork", trade: "Civil", zone: "East laydown", from: 7, to: 15, crew: 5, east: 60, north: 10, z: 0 },
  { id: "A-108", name: "Rebar delivery, gate 2", type: "deliveries", trade: "Logistics", zone: "Gate 2", from: 6, to: 9, crew: 2, east: -55, north: -40, z: 0 },
  { id: "A-109", name: "Curtain wall delivery, gate 2", type: "deliveries", trade: "Logistics", zone: "Gate 2", from: 14, to: 16, crew: 2, east: -55, north: -40, z: 0 },
  { id: "A-110", name: "MEP rough-in L3–L4", type: "interior", trade: "MEP", zone: "Levels 3–4", from: 7, to: 17, crew: 14, east: 5, north: 5, z: 12 },
  { id: "A-111", name: "Drywall L2", type: "interior", trade: "Interiors", zone: "Level 2", from: 7, to: 15, crew: 8, east: -5, north: -5, z: 7 },
];

export function sampleSchedule(day: Date): Activity[] {
  const at = (h: number) => atHour(day, h);
  return ROWS.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    trade: r.trade,
    zone: r.zone,
    start: at(r.from),
    end: at(r.to),
    crewSize: r.crew,
    location: { ...offsetMeters(SITE.longitude, SITE.latitude, r.east, r.north), z: r.z },
  }));
}
