import bimSchedule from "../data/bim-schedule.json";
import { SITE } from "../config/site";
import type { Activity, ActivityType, Decision } from "../domain/types";

/** How today's components of a sublayer are shown (see SceneCanvas renderer). */
export type TodayClass = Decision | "rescheduled" | "scheduled" | "hidden" | "done" | "dim";
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
  CurtainWallPanels: { type: "curtain-wall", label: "Curtain wall", trade: "Glazing", z: 30 },
  CurtainWallMullions: { type: "curtain-wall", label: "Curtain wall", trade: "Glazing", z: 30 },
  Doors: { type: "interior", label: "Doors", trade: "Carpentry", z: 70 },
  LightingFixtures: { type: "interior", label: "Lighting fixtures", trade: "Electrical", z: 70 },
  PlumbingFixtures: { type: "interior", label: "Plumbing fixtures", trade: "Plumbing", z: 70 },
  FireProtection: { type: "interior", label: "Fire protection", trade: "Fire protection", z: 70 },
  SpecialtyEquipment: { type: "interior", label: "Specialty equipment", trade: "Specialties", z: 70 },
  StairsRailing: { type: "interior", label: "Stair railings", trade: "Metals", z: 70 },
  Furniture: { type: "interior", label: "Furniture", trade: "FF&E", z: 70 },
  FurnitureSystems: { type: "interior", label: "Furniture systems", trade: "FF&E", z: 70 },
  Casework: { type: "interior", label: "Casework", trade: "Millwork", z: 70 },
};

/** ⚠️ ASSUMPTION: a standard 7:00–15:30 shift. The model has dates, not times. */
const SHIFT = { from: 7, to: 15.5 };

/** Metre offsets from Building 1's centre so markers don't stack. Visual only. */
const OFFSETS: Record<string, [number, number]> = {
  "Curtain wall": [0, 21], // north face, where today's install band reads best
  Doors: [-10, 4],
  "Lighting fixtures": [8, 6],
  "Plumbing fixtures": [-6, 8],
  "Fire protection": [10, -4],
};

/** Camera heading to frame each package (curtain wall: from the north). */
const HEADINGS: Record<string, number> = { "Curtain wall": 170 };

const PER_SUBLAYER_LABEL: Record<string, string> = {
  CurtainWallPanels: "panels",
  CurtainWallMullions: "mullions",
};

const M_PER_DEG = 111_320;

/**
 * Building 1 footprint centre, from the CurtainWallPanels sublayer extent
 * (-104.99141..-104.99093, 39.69845..39.69882; z 1,592–1,659 m). The layer's own
 * fullExtent is corrupt (reaches California), so do not use it.
 */
export const BUILDING_1 = { longitude: -104.99117, latitude: 39.698635, height: 67 };

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
        longitude: BUILDING_1.longitude + east / (M_PER_DEG * Math.cos((BUILDING_1.latitude * Math.PI) / 180)),
        latitude: BUILDING_1.latitude + north / M_PER_DEG,
        z: pkg.z,
      },
      source: "bim",
      bimSublayers: sublayers,
      viewHeading: HEADINGS[pkg.label] ?? 30,
    };
  });
}

/** Sublayers that carry the install-date field. */
export const DATED_SUBLAYERS = bimSchedule.sublayers.filter((s) => s.hasDate).map((s) => s.name);

/**
 * Arcade that classifies a component against the demo day:
 * installed | today-<decision|rescheduled> | upcoming | nodate. Normalises the malformed
 * values found in the model (e.g. "2026.0425", "2026.7.02", "202604.03"),
 * mirroring normalise() in scripts/extract-bim-schedule.mjs.
 */
export function statusArcade(day: Date, todayClass: TodayClass): string {
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
if (key == today) { return "today-${todayClass}"; }
return "upcoming";
`;
}

export const BIM_MALFORMED = bimSchedule.malformed;
export const BIM_RANGE = (() => {
  const days = Object.keys(bimSchedule.byDay);
  return { first: days[0], last: days[days.length - 1] };
})();

/**
 * What's left of a work package from the demo day on (inclusive): install days
 * and parts. Used for the knock-on of a postponement.
 * ⚠️ ASSUMPTION: one crew works the package sequentially, so moving today's
 * work N days pushes the rest of the package (and its completion) N days.
 */
export function remainingWork(sublayers: string[], day: Date): { installDays: number; parts: number } {
  const today = dayKey(day);
  let installDays = 0;
  let parts = 0;
  for (const [key, counts] of Object.entries(bimSchedule.byDay as Record<string, Record<string, number>>)) {
    if (key < today) continue;
    const n = sublayers.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
    if (n > 0) {
      installDays++;
      parts += n;
    }
  }
  return { installDays, parts };
}

export interface PackageProgress {
  label: string;
  total: number;
  /** Installed before the demo day. */
  installed: number;
  /** Scheduled on the demo day. */
  today: number;
}

/**
 * Building 1 progress as of the start of the demo day, by work package.
 * Counts only components that carry an install date (structure, walls,
 * floors and roofs have none and are treated as in place).
 */
export function progressAsOf(day: Date): { packages: PackageProgress[]; total: number; installed: number; today: number } {
  const key = dayKey(day);
  const byLabel = new Map<string, PackageProgress>();
  for (const [d, counts] of Object.entries(bimSchedule.byDay as Record<string, Record<string, number>>)) {
    for (const [sublayer, n] of Object.entries(counts)) {
      const label = PACKAGES[sublayer]?.label ?? sublayer;
      const p = byLabel.get(label) ?? { label, total: 0, installed: 0, today: 0 };
      p.total += n;
      if (d < key) p.installed += n;
      else if (d === key) p.today += n;
      byLabel.set(label, p);
    }
  }
  const packages = [...byLabel.values()].sort((a, b) => b.total - a.total);
  const sum = (k: keyof Omit<PackageProgress, "label">) => packages.reduce((s, p) => s + p[k], 0);
  return { packages, total: sum("total"), installed: sum("installed"), today: sum("today") };
}
