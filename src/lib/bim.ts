import bimSchedule from "../data/bim-schedule.json";
import { SITE } from "../config/site";
import type { Activity, ActivityType, Decision } from "../domain/types";
import { atHour } from "./time";

// =============================================================================
// Today's activities come from the BIM model: every component in
// Office_Park_Building_1 carries an Installation_Date (string, YYYY.MM.DD).
// Components dated "today" = today's install work. Counts are pre-extracted by
// scripts/extract-bim-schedule.mjs into src/data/bim-schedule.json.
// =============================================================================

export const BIM_LAYER_TITLE = bimSchedule.source.layerTitle;
export const BIM_DATE_FIELD = bimSchedule.source.field;

interface WorkPackage {
  type: ActivityType;
  label: string;
  trade: string;
  /** Height of the work face above ground, metres (for the 3D marker only). */
  z: number;
}

/**
 * Sublayer → work package. Curtain wall is the weather-exposed work.
 * ⚠️ ASSUMPTION: Doors are treated as interior; confirm whether any are exterior.
 */
const PACKAGES: Record<string, WorkPackage> = {
  CurtainWallPanels: { type: "curtain-wall", label: "Curtain wall", trade: "Glazing", z: 12 },
  CurtainWallMullions: { type: "curtain-wall", label: "Curtain wall", trade: "Glazing", z: 12 },
  Doors: { type: "interior", label: "Doors", trade: "Carpentry", z: 4 },
  LightingFixtures: { type: "interior", label: "Lighting fixtures", trade: "Electrical", z: 6 },
  PlumbingFixtures: { type: "interior", label: "Plumbing fixtures", trade: "Plumbing", z: 5 },
  FireProtection: { type: "interior", label: "Fire protection", trade: "Fire protection", z: 7 },
  SpecialtyEquipment: { type: "interior", label: "Specialty equipment", trade: "Specialties", z: 4 },
  StairsRailing: { type: "interior", label: "Stair railings", trade: "Metals", z: 6 },
  Furniture: { type: "interior", label: "Furniture", trade: "FF&E", z: 3 },
  FurnitureSystems: { type: "interior", label: "Furniture systems", trade: "FF&E", z: 3 },
  Casework: { type: "interior", label: "Casework", trade: "Millwork", z: 3 },
};

/** ⚠️ ASSUMPTION: a standard 7:00–15:30 shift. The model has dates, not times. */
const SHIFT = { from: 7, to: 15.5 };

/** Plain metre offsets so packages don't stack on one point. Visual only. */
const OFFSETS: Record<string, [number, number]> = {
  "Curtain wall": [0, -18],
  Doors: [-12, 0],
  "Lighting fixtures": [8, 6],
  "Plumbing fixtures": [-6, 8],
  "Fire protection": [12, -4],
};

const PER_SUBLAYER_LABEL: Record<string, string> = {
  CurtainWallPanels: "panels",
  CurtainWallMullions: "mullions",
};

const M_PER_DEG = 111_320;

/** YYYY-MM-DD for a site-midnight instant. */
export function dayKey(day: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SITE.timeZone }).format(day);
}

/** Install counts per sublayer for a day. */
export function installsOn(day: Date): Record<string, number> {
  return (bimSchedule.byDay as Record<string, Record<string, number>>)[dayKey(day)] ?? {};
}

/** Today's BIM work packages as schedule activities. */
export function bimActivities(day: Date): Activity[] {
  const grouped = new Map<string, { pkg: WorkPackage; sublayers: string[]; parts: string[]; total: number }>();
  for (const [sublayer, count] of Object.entries(installsOn(day))) {
    const pkg = PACKAGES[sublayer];
    if (!pkg) continue;
    const g = grouped.get(pkg.label) ?? { pkg, sublayers: [], parts: [], total: 0 };
    g.sublayers.push(sublayer);
    g.total += count;
    g.parts.push(`${count} ${PER_SUBLAYER_LABEL[sublayer] ?? "units"}`);
    grouped.set(pkg.label, g);
  }
  return [...grouped.values()].map(({ pkg, sublayers, parts, total }, i) => {
    const [east, north] = OFFSETS[pkg.label] ?? [((i % 3) - 1) * 10, 12];
    return {
      id: `BIM-${String(i + 1).padStart(2, "0")}`,
      name: `Install ${pkg.label.toLowerCase()} (${parts.join(", ")})`,
      type: pkg.type,
      trade: pkg.trade,
      zone: "Building 1",
      start: atHour(day, SHIFT.from),
      end: atHour(day, SHIFT.to),
      components: total,
      location: {
        longitude: SITE.longitude + east / (M_PER_DEG * Math.cos((SITE.latitude * Math.PI) / 180)),
        latitude: SITE.latitude + north / M_PER_DEG,
        z: pkg.z,
      },
      source: "bim",
      bimSublayers: sublayers,
    };
  });
}

/** Sublayers that carry the install-date field. */
export const DATED_SUBLAYERS = bimSchedule.sublayers.filter((s) => s.hasDate).map((s) => s.name);

/**
 * Arcade that classifies a component against the demo day:
 * installed | today-<decision> | upcoming | nodate. Normalises the malformed
 * values found in the model (e.g. "2026.0425", "2026.7.02", "202604.03"),
 * mirroring normalise() in scripts/extract-bim-schedule.mjs.
 */
export function statusArcade(day: Date, todayDecision: Decision): string {
  return `
var s = Trim(Text($feature.${BIM_DATE_FIELD}));
if (IsEmpty(s)) { return "nodate"; }
var p = Split(s, ".");
var key = "";
if (Count(p) == 3) {
  key = Text(Number(p[0]), "0000") + "-" + Text(Number(p[1]), "00") + "-" + Text(Number(p[2]), "00");
} else {
  var d = Replace(s, ".", "");
  if (Count(d) == 8) { key = Left(d, 4) + "-" + Mid(d, 4, 2) + "-" + Right(d, 2); }
}
if (key == "") { return "nodate"; }
var today = "${dayKey(day)}";
if (key < today) { return "installed"; }
if (key == today) { return "today-${todayDecision}"; }
return "upcoming";
`;
}

export const BIM_MALFORMED = bimSchedule.malformed;
export const BIM_RANGE = (() => {
  const days = Object.keys(bimSchedule.byDay);
  return { first: days[0], last: days[days.length - 1] };
})();
