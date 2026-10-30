import bimSchedule from "../data/bim-schedule.json";
import curtainWallStoreys from "../data/curtain-wall-storeys.json";
import typeSplits from "../data/type-splits.json";
import { SITE, demoDay } from "../config/site";
import type { Activity, ActivityType, Decision } from "../domain/types";
import { atHour } from "./time";

/** How today's components of a sublayer are shown (see SceneCanvas renderer). */
export type TodayClass = Decision | "rescheduled" | "scheduled" | "building" | "hidden" | "done" | "dim";

// =============================================================================
// LEVEL-DRIVEN SCHEDULE for Office_Park_Building_1. The model's own
// Installation_Date values don't follow the levels (and ~3,600 elements have
// none), so the 4D build-out, progress and today's work all come from this
// model instead (user, 2026-10-30: "framing for whole building, then the
// interior, then the exterior glass"):
//
//   1. The frame rises a level per step until it tops out (level 16).
//   2. Then each floor is fitted out from the bottom up, every trade a fixed
//      number of levels behind the one before it:
//        interior walls (CMU, partitions) ..... level 9 today
//        doors, ceilings (grid) ............... level 8
//        MEP fixtures (lights, plumbing) ...... level 7
//        curtain wall + curtain-wall doors .... level 6  (glass after the interior)
//        specialties, casework, fire
//          extinguisher cabinets .............. level 5
//        furniture ............................ level 4
//   On the demo day the frame is up and the fit-out is mid-way, so the storm
//   stops the glazing and outdoor work while the interior goes on. Shear walls
//   (Walls) and curtain-wall doors (Doors) are split off their sublayer by Type
//   (TYPE_SPLITS).
//
// Element counts per level come from the model's BldgLevel statistics
// (scripts/extract-bim-schedule.mjs -> levels). The curtain wall is the
// exception: its multi-storey walls are tagged to their BASE level (769 panels
// on "level 3" really span levels 3-7, likewise "level 9" spans 9-13), so each
// panel and mullion uses the storey it actually sits on, measured from its
// geometry (data/curtain-wall-storeys.json).
// =============================================================================

export const BIM_LAYER_TITLE = bimSchedule.source.layerTitle;
export const BIM_DATE_FIELD = bimSchedule.source.field;
export const BIM_MALFORMED = bimSchedule.malformed;
/** The model's own install-date range (reference only; sequencing is by level). */
export const BIM_RANGE = (() => {
  const days = Object.keys(bimSchedule.byDay);
  return { first: days[0], last: days[days.length - 1] };
})();

export const MAX_LEVEL = 16;
/** The step on which the whole frame is up (the structure works one level per step). */
export const TOPPED_OUT = MAX_LEVEL + 1;
/** The step of the demo day: frame up, interior walls on level 9. */
export const TODAY_STEP = TOPPED_OUT + 9;
/** ⚠️ ASSUMPTION: a level a week, for the frame and for each fit-out trade. */
const DAYS_PER_LEVEL = 7;

interface Trade {
  key: string;
  label: string;
  /** Activity name fragment, e.g. "curtain wall". */
  work: string;
  type: ActivityType;
  crew: string;
  /** Steps behind the structure's start (the fit-out trades start once the frame is up). */
  lag: number;
  sublayers: string[];
}

/**
 * The order (user, 2026-10-30): the whole frame first, then floor by floor the
 * interior, then the exterior glass, then specialties and furniture. Listed in
 * that order (the progress panel follows it).
 */
export const TRADES: Trade[] = [
  { key: "structure", label: "Structure", work: "structural frame", type: "steel-erection", crew: "Ironworkers", lag: 0, sublayers: ["StructuralColumns", "Floors", "Stairs", "Roofs"] },
  { key: "walls", label: "Interior walls", work: "interior walls and stair railings", type: "interior", crew: "Masonry / drywall", lag: TOPPED_OUT, sublayers: ["Walls", "StairsRailing"] },
  { key: "finishes", label: "Doors & ceilings", work: "doors and ceilings", type: "interior", crew: "Carpentry / ceilings", lag: TOPPED_OUT + 1, sublayers: ["Doors", "Ceilings"] },
  { key: "mep", label: "MEP fixtures", work: "lighting and plumbing fixtures", type: "interior", crew: "MEP", lag: TOPPED_OUT + 2, sublayers: ["LightingFixtures", "PlumbingFixtures"] },
  { key: "envelope", label: "Curtain wall", work: "curtain wall", type: "curtain-wall", crew: "Glazing", lag: TOPPED_OUT + 3, sublayers: ["CurtainWallPanels", "CurtainWallMullions"] },
  // FireProtection in this model is 99 fire-extinguisher cabinets: a late specialty, not sprinkler work.
  { key: "specialty", label: "Specialty & casework", work: "specialties, casework and fire-extinguisher cabinets", type: "interior", crew: "Millwork / specialties", lag: TOPPED_OUT + 4, sublayers: ["SpecialtyEquipment", "Casework", "FireProtection"] },
  { key: "furniture", label: "Furniture", work: "furniture", type: "interior", crew: "FF&E", lag: TOPPED_OUT + 5, sublayers: ["Furniture", "FurnitureSystems"] },
];

const tradeOf = new Map(TRADES.flatMap((t) => t.sublayers.map((s) => [s, t] as const)));
const ALL_TRADE_SUBLAYERS = TRADES.flatMap((t) => t.sublayers);

/** Sublayers that carry the install-date field (the renderer handles these and the structure). */
export const DATED_SUBLAYERS = bimSchedule.sublayers.filter((s) => s.hasDate).map((s) => s.name);
/** Everything else in a trade (structure, walls, ceilings...). */
export const STRUCTURE_SUBLAYERS = ALL_TRADE_SUBLAYERS.filter((s) => !DATED_SUBLAYERS.includes(s));
/** Room volumes: hidden while the building goes up. */
export const HIDE_DURING_BUILD = ["Rooms"];

/** ⚠️ ASSUMPTION: a standard 7:00–15:30 shift. */
const SHIFT = { from: 7, to: 15.5 };

/**
 * Building 1 footprint centre, from the CurtainWallPanels sublayer extent
 * (-104.99141..-104.99093, 39.69845..39.69882; z 1,592–1,659 m). The layer's own
 * fullExtent is corrupt (reaches California), so do not use it.
 */
export const BUILDING_1 = { longitude: -104.99117, latitude: 39.698635, height: 67 };
/** Approximate storey height (BldgLevel_Elev spans 5,222–5,417 ft over 15 levels). */
const LEVEL_HEIGHT_M = 3.96;

const DAY_MS = 86_400_000;

/** YYYY-MM-DD for a site-midnight instant. */
export function dayKey(day: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SITE.timeZone }).format(day);
}

/** Days per level (and per step). */
function daysPerLevel(): number {
  return DAYS_PER_LEVEL;
}

/**
 * When the timeline starts: the frame's first level, so the demo day lands
 * mid-way through TODAY_STEP. Whole days, so the timeline lands exactly on
 * "Today".
 */
export function buildStart(): Date {
  return new Date(demoDay().getTime() - Math.round((TODAY_STEP + 0.5) * DAYS_PER_LEVEL) * DAY_MS);
}

/** Levels of structure progress at a date (fractional). */
function progressLevels(day: Date): number {
  return (day.getTime() - buildStart().getTime()) / DAY_MS / daysPerLevel();
}

/** The level a trade is working on at a date (below = done, above = not started). */
export function workingLevel(tradeKey: string, day: Date): number {
  const t = TRADES.find((x) => x.key === tradeKey)!;
  return Math.floor(progressLevels(day)) - t.lag;
}

/**
 * Sublayers that go in further behind their trade, in levels. A stair flight
 * runs from its floor up to the next one, so on the top working level it stood
 * "floating" over the slab (user, 2026-10-21): stairs go in once the floor
 * above them exists, one level behind the rest of the structure.
 */
const SUBLAYER_LAG: Record<string, number> = { Stairs: 1 };

/** The level a sublayer's parts go in on at a date (its trade's, less any extra lag). */
export function sublayerWorkingLevel(sublayer: string, day: Date): number {
  const trade = tradeOf.get(sublayer);
  return trade ? workingLevel(trade.key, day) - (SUBLAYER_LAG[sublayer] ?? 0) : -Infinity;
}

/** Highest structural level standing on a date: -1 (nothing) to MAX_LEVEL. */
export function levelAt(day: Date): number {
  return Math.min(MAX_LEVEL, workingLevel("structure", day));
}

/** When the last trade (furniture) finishes the top level. */
export function buildFinish(): Date {
  const maxLag = Math.max(...TRADES.map((t) => t.lag));
  return new Date(buildStart().getTime() + (MAX_LEVEL + maxLag + 1) * daysPerLevel() * DAY_MS);
}

type StoreyTable = { idField: string; counts: Record<string, number>; runs: [number, number, number][] };
/** Curtain wall parts by their real storey (measured), keyed by sublayer. */
const STOREYS = curtainWallStoreys.sublayers as unknown as Record<string, StoreyTable>;

/** Element counts per level for a sublayer (model statistics; curtain wall by real storey). */
const levelCounts = (sublayer: string): Record<string, number> =>
  STOREYS[sublayer]?.counts ?? ((bimSchedule as { levels?: Record<string, Record<string, number>> }).levels ?? {})[sublayer] ?? {};

type TypeSplit = { match: string; trade: string; counts: Record<string, number> };
/**
 * Parts sequenced with a different trade than the rest of their sublayer, by
 * Type (scripts/extract-type-splits.mjs): core shear walls rise with the
 * structure; curtain-wall doors go in with the curtain wall.
 */
const TYPE_SPLITS = typeSplits.sublayers as unknown as Record<string, TypeSplit>;

/** Per-level counts of a sublayer's own parts (without any split-off type). */
const ownCounts = (sublayer: string): Record<string, number> => {
  const all = levelCounts(sublayer);
  const split = TYPE_SPLITS[sublayer];
  if (!split) return all;
  return Object.fromEntries(Object.entries(all).map(([l, n]) => [l, n - (split.counts[l] ?? 0)]));
};

/**
 * Arcade setting `lv` to a curtain wall part's real storey: a binary search of
 * the measured id runs, falling back to BldgLevel for parts within one storey.
 * Built once per sublayer; only the working level changes per 4D step.
 */
const storeyArcade = new Map(
  Object.entries(STOREYS).map(([name, t]) => [
    name,
    `
var S = [${t.runs.map((r) => r[0]).join(",")}];
var E = [${t.runs.map((r) => r[1]).join(",")}];
var L = [${t.runs.map((r) => r[2]).join(",")}];
var id = $feature.${t.idField};
var lo = 0;
var hi = Count(S) - 1;
while (lo <= hi) {
  var mid = Floor((lo + hi) / 2);
  if (id < S[mid]) { hi = mid - 1; }
  else if (id > E[mid]) { lo = mid + 1; }
  else { lv = L[mid]; break; }
}`,
  ]),
);

/**
 * SQL for the parts of `sublayer` on `level`, for client-side queries (marker
 * placement). Curtain wall parts go by their real storey: those measured onto
 * this storey, plus those tagged to it that weren't moved elsewhere.
 */
export function partsWhere(sublayer: string, level: number): string {
  const t = STOREYS[sublayer];
  if (!t) return `BldgLevel = ${level}`;
  const between = (runs: [number, number, number][]) => runs.map(([a, b]) => `(${t.idField} BETWEEN ${a} AND ${b})`).join(" OR ");
  const here = t.runs.filter((r) => r[2] === level);
  const stay = `(BldgLevel = ${level} AND NOT (${between(t.runs)}))`;
  return here.length ? `${stay} OR ${between(here)}` : stay;
}

/** The trade a sublayer's split-off parts follow (shear walls -> structure), if any. */
export function splitTrade(sublayer: string): string | undefined {
  return TYPE_SPLITS[sublayer]?.trade;
}

/**
 * Arcade classifying an element by its level against the trade's working level
 * on `day`: installed (below) | today-<class> (the working level) | upcoming.
 * Plain number comparisons, so the 4D steps re-render quickly. Parts split off
 * by Type (TYPE_SPLITS) compare against their own trade's working level and
 * take `splitClass` on it.
 *
 * Elements with NO level (the crown spires, some railings, every plumbing
 * fixture) aren't in the tracked counts and would otherwise read as level 0,
 * i.e. standing on the ground before the frame reaches them. They stay hidden.
 */
export function statusArcade(
  day: Date,
  todayClass: TodayClass,
  sublayer?: string,
  cutAbove?: number | null,
  splitClass: TodayClass = todayClass,
): string {
  const trade = sublayer ? tradeOf.get(sublayer) : undefined;
  if (!trade) return `return "nodate";`;
  const working = sublayerWorkingLevel(sublayer!, day);
  const split = TYPE_SPLITS[sublayer!];
  const splitLines = split
    ? `
if (HasKey($feature, "Type") && Find("${split.match}", DefaultValue($feature.Type, "")) > -1) {
  w = ${workingLevel(split.trade, day)};
  cls = "today-${splitClass}";
}`
    : "";
  return `
var lv = null;
if (HasKey($feature, "BldgLevel")) { lv = $feature.BldgLevel; }
if (IsEmpty(lv)) { return "upcoming"; }${storeyArcade.get(sublayer!) ?? ""}${cutAbove == null ? "" : `
if (lv > ${cutAbove}) { return "upcoming"; }`}
var w = ${working};
var cls = "today-${todayClass}";${splitLines}
if (lv < w) { return "installed"; }
if (lv == w) { return cls; }
return "upcoming";
`;
}

export interface PackageProgress {
  label: string;
  total: number;
  /** Installed before the date. */
  installed: number;
  /** On the working level that day. */
  today: number;
}

/** Building 1 progress at a date, by trade, from element counts per level. */
export function progressAsOf(day: Date): { packages: PackageProgress[]; total: number; installed: number; today: number } {
  const packages = TRADES.map((t) => {
    const p: PackageProgress = { label: t.label, total: 0, installed: 0, today: 0 };
    const add = (counts: Record<string, number>, working: number) => {
      for (const [lvl, n] of Object.entries(counts)) {
        const l = Number(lvl);
        p.total += n;
        if (l < working) p.installed += n;
        else if (l === working) p.today += n;
      }
    };
    for (const sub of t.sublayers) add(ownCounts(sub), sublayerWorkingLevel(sub, day));
    // Parts of other sublayers that follow this trade (shear walls -> structure).
    for (const split of Object.values(TYPE_SPLITS)) if (split.trade === t.key) add(split.counts, workingLevel(t.key, day));
    return p;
  }).filter((p) => p.total > 0);
  const sum = (k: keyof Omit<PackageProgress, "label">) => packages.reduce((s, p) => s + p[k], 0);
  return { packages, total: sum("total"), installed: sum("installed"), today: sum("today") };
}

/**
 * Today's Building 1 work: each trade on its working level. Markers are
 * placed on the actual components (SceneCanvas queries `bimWhere`).
 */
export function bimActivities(day: Date): Activity[] {
  const out: Activity[] = [];
  TRADES.forEach((t) => {
    const level = workingLevel(t.key, day);
    if (level < 0 || level > MAX_LEVEL) return;
    // Sublayers that lag their trade (stairs) aren't on this level today.
    const subs = t.sublayers.filter((s) => !SUBLAYER_LAG[s] && (levelCounts(s)[String(level)] ?? 0) > 0);
    const count = subs.reduce((n, s) => n + (levelCounts(s)[String(level)] ?? 0), 0);
    if (!count) return;
    out.push({
      id: `L${level}-${t.key.slice(0, 3).toUpperCase()}`,
      // No part count in the title: a whole level's parts read as an unrealistic
      // day's install (user, 2026-10-20). The count stays in `components`.
      name: `${t.key === "structure" ? "Erect" : "Install"} ${t.work}, level ${level}`,
      type: t.type,
      trade: t.crew,
      zone: `Building 1, level ${level}`,
      start: atHour(day, SHIFT.from),
      end: atHour(day, SHIFT.to),
      components: count,
      location: { longitude: BUILDING_1.longitude, latitude: BUILDING_1.latitude, z: (level + 0.5) * LEVEL_HEIGHT_M },
      source: "bim",
      bimSublayers: subs,
      bimWhere: `BldgLevel = ${level}`,
      viewHeading: t.key === "envelope" ? 170 : 30,
    });
  });
  return out;
}

/** Superseded by the level model (kept so callers don't break). */
export function derivedActivities(_day: Date): Activity[] {
  return [];
}

/**
 * What's left of a trade from the demo day on: levels and parts. For the
 * knock-on of a postponement.
 * ⚠️ ASSUMPTION: one crew works the trade level by level, so moving today's
 * work N days pushes the rest of the trade (and its completion) N days.
 */
export function remainingWork(sublayers: string[], day: Date): { installDays: number; parts: number } {
  const trade = sublayers.map((s) => tradeOf.get(s)).find(Boolean);
  if (!trade) return { installDays: 0, parts: 0 };
  const working = workingLevel(trade.key, day);
  let parts = 0;
  let levels = 0;
  for (let l = Math.max(0, working); l <= MAX_LEVEL; l++) {
    const n = trade.sublayers.reduce((sum, s) => sum + (levelCounts(s)[String(l)] ?? 0), 0);
    if (n) {
      parts += n;
      levels++;
    }
  }
  return { installDays: Math.round(levels * daysPerLevel()), parts };
}
