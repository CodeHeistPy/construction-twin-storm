import bimSchedule from "../data/bim-schedule.json";
import { SITE } from "../config/site";
import type { Activity, ActivityType, Decision } from "../domain/types";

/** How today's components of a sublayer are shown (see SceneCanvas renderer). */
export type TodayClass = Decision | "rescheduled" | "scheduled" | "hidden" | "done" | "dim";
import { atHour, zonedMidnight } from "./time";

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
export function statusArcade(day: Date, todayClass: TodayClass, sublayer?: string): string {
  const table = sublayer ? derivedTable(sublayer) : null;
  const decode = table
    ? `Decode(lv, ${table.map((k, l) => `${l}, "${k}"`).join(", ")}, "${table[table.length - 1]}")`
    : '""';
  return `
var key = "";
if (HasKey($feature, "${BIM_DATE_FIELD}")) {
  var s = Trim(DefaultValue(Text($feature.${BIM_DATE_FIELD}), ""));
  var p = Split(s, ".");
  if (Count(p) == 3) {
    key = Text(Number(p[0]), "0000") + "-" + Text(Number(p[1]), "00") + "-" + Text(Number(p[2]), "00");
  } else if (s != "") {
    var d = Replace(s, ".", "");
    if (Count(d) == 8) { key = Left(d, 4) + "-" + Mid(d, 4, 2) + "-" + Right(d, 2); }
  }
}
if (key == "") {
  var lv = IIf(HasKey($feature, "BldgLevel"), DefaultValue($feature.BldgLevel, 0), 0);
  key = ${decode};
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
  const add = (sublayer: string, d: string, n: number) => {
    const label = PACKAGES[sublayer]?.label ?? DERIVED_LABELS[sublayer] ?? sublayer;
    const p = byLabel.get(label) ?? { label, total: 0, installed: 0, today: 0 };
    p.total += n;
    if (d < key) p.installed += n;
    else if (d === key) p.today += n;
    byLabel.set(label, p);
  };
  for (const [d, counts] of Object.entries(bimSchedule.byDay as Record<string, Record<string, number>>))
    for (const [sublayer, n] of Object.entries(counts)) add(sublayer, d, n);
  for (const { sublayer, key: d, count } of derivedCounts()) add(sublayer, d, count);
  const packages = [...byLabel.values()].sort((a, b) => b.total - a.total);
  const sum = (k: keyof Omit<PackageProgress, "label">) => packages.reduce((s, p) => s + p[k], 0);
  return { packages, total: sum("total"), installed: sum("installed"), today: sum("today") };
}

// -----------------------------------------------------------------------------
// Ground-up build for the 4D timeline. The structure (floors, columns, walls,
// stairs, roof, ceilings) carries NO install dates in the model, so it is
// sequenced by its BldgLevel (0-16, verified 2026-10-19) over the weeks before
// the first dated install. DERIVED, not scheduled: say so if asked.
// -----------------------------------------------------------------------------

export const STRUCTURE_SUBLAYERS = ["Floors", "StructuralColumns", "Walls", "Stairs", "Roofs", "Ceilings"];
/** Room volumes: hidden while the building goes up. */
export const HIDE_DURING_BUILD = ["Rooms"];
export const MAX_LEVEL = 16;
const STRUCTURE_WEEKS = 8;

const firstInstall = (): Date => {
  const [y, m, d] = BIM_RANGE.first.split("-").map(Number);
  return zonedMidnight(y, m, d, SITE.timeZone);
};

/** When the timeline starts: the structure's first level, before any dated work. */
export function buildStart(): Date {
  return new Date(firstInstall().getTime() - STRUCTURE_WEEKS * 7 * 86_400_000);
}

/** Highest structural level standing on a date: -1 (nothing) to MAX_LEVEL. */
export function levelAt(day: Date): number {
  const s = buildStart().getTime();
  const f = firstInstall().getTime();
  if (day.getTime() >= f) return MAX_LEVEL;
  const frac = (day.getTime() - s) / (f - s);
  return Math.min(MAX_LEVEL, Math.floor(frac * (MAX_LEVEL + 1)) - 1);
}

/** Arcade for structure: levels up to `level` stand, the next one is going up now. */
export function levelArcade(level: number): string {
  return `
var l = DefaultValue($feature.BldgLevel, 0);
if (l <= ${level}) { return "installed"; }
if (l == ${level + 1}) { return "today-scheduled"; }
return "upcoming";
`;
}

// -----------------------------------------------------------------------------
// DERIVED install dates for elements the model leaves undated (user, 2026-10-20:
// "fill them in so they fit the rest of the schedule"). ~3,600 elements: the
// structure (no dates at all), ~1,100 curtain wall parts and ~70 furniture.
// Standard high-rise sequence, by BldgLevel:
//   structure rises level by level (before the first dated install), then each
//   floor's curtain wall closes it in, then interior walls / doors / ceilings,
//   then MEP fixtures, casework, and furniture last.
// Real dates always win; these only fill gaps. DERIVED, not scheduled.
// -----------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const STRUCTURE_TRADES = new Set(["StructuralColumns", "Floors", "Stairs", "Roofs"]);

/** Days after a floor's curtain wall starts that each trade follows. */
const TRADE_LAG_DAYS: Record<string, number> = {
  CurtainWallPanels: 0,
  CurtainWallMullions: 0,
  Walls: 7,
  StairsRailing: 14,
  Doors: 21,
  Ceilings: 28,
  LightingFixtures: 35,
  FireProtection: 35,
  PlumbingFixtures: 35,
  SpecialtyEquipment: 42,
  Casework: 49,
  Furniture: 63,
  FurnitureSystems: 63,
};

const DERIVED_LABELS: Record<string, string> = {
  StructuralColumns: "Structure",
  Floors: "Structure",
  Stairs: "Structure",
  Roofs: "Structure",
  Walls: "Interior walls",
  Ceilings: "Ceilings",
};

const keyToDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return zonedMidnight(y, m, d, SITE.timeZone);
};

/** First and last curtain wall install days in the model. */
const CW_RANGE = (() => {
  const days = Object.entries(bimSchedule.byDay as Record<string, Record<string, number>>)
    .filter(([, c]) => c.CurtainWallPanels || c.CurtainWallMullions)
    .map(([d]) => d)
    .sort();
  return { first: keyToDay(days[0]), last: keyToDay(days[days.length - 1]) };
})();

/**
 * When a floor's curtain wall starts: spread across levels 2-15 from the first
 * to the last curtain wall day (bottom-up). ASSUMPTION: the model has no
 * per-level dates to read this from.
 */
function closeIn(level: number): Date {
  const lo = 2;
  const hi = 15;
  const t = Math.max(0, Math.min(1, (level - lo) / (hi - lo)));
  return new Date(CW_RANGE.first.getTime() + t * (CW_RANGE.last.getTime() - CW_RANGE.first.getTime()));
}

/** Derived date key for an undated element of a sublayer at a level. */
export function derivedKey(sublayer: string, level: number): string | null {
  if (STRUCTURE_TRADES.has(sublayer)) {
    const s = buildStart().getTime();
    const f = firstInstall().getTime();
    return dayKey(new Date(s + ((level + 0.5) / (MAX_LEVEL + 1)) * (f - s)));
  }
  const lag = TRADE_LAG_DAYS[sublayer];
  if (lag === undefined) return null;
  return dayKey(new Date(closeIn(level).getTime() + lag * DAY_MS));
}

/** Level 0..MAX_LEVEL -> derived key, for the Arcade Decode table. */
function derivedTable(sublayer: string): string[] | null {
  if (derivedKey(sublayer, 0) === null) return null;
  return Array.from({ length: MAX_LEVEL + 1 }, (_, l) => derivedKey(sublayer, l)!);
}

/**
 * Undated element counts by derived day, for progress. Per sublayer, undated =
 * elements per level (from the model's BldgLevel statistics) minus dated ones,
 * spread across levels in proportion.
 */
function derivedCounts(): { sublayer: string; key: string; count: number }[] {
  const levels = (bimSchedule as { levels?: Record<string, Record<string, number>> }).levels ?? {};
  const dated = new Map<string, number>();
  for (const counts of Object.values(bimSchedule.byDay as Record<string, Record<string, number>>))
    for (const [sub, n] of Object.entries(counts)) dated.set(sub, (dated.get(sub) ?? 0) + n);
  const out: { sublayer: string; key: string; count: number }[] = [];
  for (const [sub, byLevel] of Object.entries(levels)) {
    const total = Object.values(byLevel).reduce((a, b) => a + b, 0);
    const undated = Math.max(0, total - (dated.get(sub) ?? 0));
    if (!undated || !total) continue;
    for (const [lvl, n] of Object.entries(byLevel)) {
      const key = derivedKey(sub, Number(lvl));
      if (!key) continue;
      const count = Math.round((n * undated) / total);
      if (count) out.push({ sublayer: sub, key, count });
    }
  }
  return out;
}
