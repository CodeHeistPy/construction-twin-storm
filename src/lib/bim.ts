import bimSchedule from "../data/bim-schedule.json";
import { SITE, demoDay } from "../config/site";
import type { Activity, ActivityType, Decision } from "../domain/types";
import { atHour, zonedMidnight } from "./time";

/** How today's components of a sublayer are shown (see SceneCanvas renderer). */
export type TodayClass = Decision | "rescheduled" | "scheduled" | "hidden" | "done" | "dim";

// =============================================================================
// LEVEL-DRIVEN SCHEDULE for Office_Park_Building_1 (user, 2026-10-20: "keep
// building level in mind for the sequencing, everything going up to only
// level 8"). The model's own Installation_Date values don't follow the levels
// (and ~3,600 elements have none), so the 4D build-out, progress and today's
// work all come from this model instead:
//
//   The structure rises one level at a time from the build start; on the demo
//   day ("today") it is working level 8. Each trade follows a fixed number of
//   levels behind it:
//     structure, curtain wall .... level 8 today   (0 behind)
//     interior walls, railings ... level 7         (1)
//     doors, ceilings, MEP ....... level 6         (2)
//     specialty, casework ........ level 5         (3)
//     furniture .................. level 4         (4)
//   Nothing above level 8 exists today.
//
// Element counts per level come from the model's BldgLevel statistics
// (scripts/extract-bim-schedule.mjs -> levels). Today's real curtain wall
// parts do sit at level 8 (~31-35 m up), which this model matches.
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
/** The structure's working level on the demo day. */
export const TODAY_LEVEL = 8;

interface Trade {
  key: string;
  label: string;
  /** Activity name fragment, e.g. "curtain wall". */
  work: string;
  type: ActivityType;
  crew: string;
  /** Levels behind the structure. */
  lag: number;
  sublayers: string[];
}

/** ⚠️ ASSUMPTION: trade order and lags are a standard high-rise sequence. */
export const TRADES: Trade[] = [
  { key: "structure", label: "Structure", work: "structural frame", type: "steel-erection", crew: "Ironworkers", lag: 0, sublayers: ["StructuralColumns", "Floors", "Stairs", "Roofs"] },
  { key: "envelope", label: "Curtain wall", work: "curtain wall", type: "curtain-wall", crew: "Glazing", lag: 0, sublayers: ["CurtainWallPanels", "CurtainWallMullions"] },
  { key: "walls", label: "Interior walls", work: "interior walls and stair railings", type: "interior", crew: "Drywall / framing", lag: 1, sublayers: ["Walls", "StairsRailing"] },
  { key: "finishes", label: "Doors & ceilings", work: "doors and ceilings", type: "interior", crew: "Carpentry / ceilings", lag: 2, sublayers: ["Doors", "Ceilings"] },
  { key: "mep", label: "MEP fixtures", work: "lighting, fire protection and plumbing", type: "interior", crew: "MEP", lag: 2, sublayers: ["LightingFixtures", "FireProtection", "PlumbingFixtures"] },
  { key: "specialty", label: "Specialty & casework", work: "specialty equipment and casework", type: "interior", crew: "Millwork / specialties", lag: 3, sublayers: ["SpecialtyEquipment", "Casework"] },
  { key: "furniture", label: "Furniture", work: "furniture", type: "interior", crew: "FF&E", lag: 4, sublayers: ["Furniture", "FurnitureSystems"] },
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

const keyToDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return zonedMidnight(y, m, d, SITE.timeZone);
};

/** When the timeline starts: the structure's first level (8 weeks before the model's first date). */
export function buildStart(): Date {
  return new Date(keyToDay(BIM_RANGE.first).getTime() - 8 * 7 * DAY_MS);
}

/** Days per level, set so the structure is mid-way through level 8 on the demo day. */
function daysPerLevel(): number {
  return (demoDay().getTime() - buildStart().getTime()) / DAY_MS / (TODAY_LEVEL + 0.5);
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

/** Highest structural level standing on a date: -1 (nothing) to MAX_LEVEL. */
export function levelAt(day: Date): number {
  return Math.min(MAX_LEVEL, workingLevel("structure", day));
}

/** When the last trade (furniture) finishes the top level. */
export function buildFinish(): Date {
  const maxLag = Math.max(...TRADES.map((t) => t.lag));
  return new Date(buildStart().getTime() + (MAX_LEVEL + maxLag + 1) * daysPerLevel() * DAY_MS);
}

/** Element counts per level for a sublayer (model statistics). */
const levelCounts = (sublayer: string): Record<string, number> =>
  ((bimSchedule as { levels?: Record<string, Record<string, number>> }).levels ?? {})[sublayer] ?? {};

/**
 * Arcade classifying an element by its level against the trade's working level
 * on `day`: installed (below) | today-<class> (the working level) | upcoming.
 * Plain number comparisons, so the 4D steps re-render quickly.
 */
export function statusArcade(day: Date, todayClass: TodayClass, sublayer?: string): string {
  const trade = sublayer ? tradeOf.get(sublayer) : undefined;
  if (!trade) return `return "nodate";`;
  const working = workingLevel(trade.key, day);
  return `
var lv = IIf(HasKey($feature, "BldgLevel"), DefaultValue($feature.BldgLevel, 0), 0);
if (lv < ${working}) { return "installed"; }
if (lv == ${working}) { return "today-${todayClass}"; }
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
    const working = workingLevel(t.key, day);
    const p: PackageProgress = { label: t.label, total: 0, installed: 0, today: 0 };
    for (const sub of t.sublayers)
      for (const [lvl, n] of Object.entries(levelCounts(sub))) {
        const l = Number(lvl);
        p.total += n;
        if (l < working) p.installed += n;
        else if (l === working) p.today += n;
      }
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
    const subs = t.sublayers.filter((s) => (levelCounts(s)[String(level)] ?? 0) > 0);
    const count = subs.reduce((n, s) => n + (levelCounts(s)[String(level)] ?? 0), 0);
    if (!count) return;
    out.push({
      id: `L${level}-${t.key.slice(0, 3).toUpperCase()}`,
      name: `${t.key === "structure" ? "Erect" : "Install"} ${t.work}, level ${level} (${count} parts)`,
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
