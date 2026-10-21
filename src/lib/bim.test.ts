import { describe, expect, it } from "vitest";
import { demoDay } from "../config/site";
import curtainWallStoreys from "../data/curtain-wall-storeys.json";
import bimSchedule from "../data/bim-schedule.json";
import typeSplits from "../data/type-splits.json";
import { bimActivities, buildFinish, buildStart, levelAt, MAX_LEVEL, progressAsOf, TODAY_LEVEL, TRADES, workingLevel } from "./bim";

const DAY = 86_400_000;
const today = demoDay();

describe("level-driven schedule", () => {
  it("has the structure working level 8 today, and nothing higher", () => {
    expect(levelAt(today)).toBe(TODAY_LEVEL);
    for (const t of TRADES) expect(workingLevel(t.key, today)).toBeLessThanOrEqual(TODAY_LEVEL);
  });

  it("puts each trade the right number of levels behind the structure", () => {
    expect(workingLevel("envelope", today)).toBe(6);
    expect(workingLevel("walls", today)).toBe(5);
    expect(workingLevel("finishes", today)).toBe(4);
    expect(workingLevel("mep", today)).toBe(3);
    expect(workingLevel("specialty", today)).toBe(2);
    expect(workingLevel("furniture", today)).toBe(1);
  });

  it("follows the real-world order: frame, envelope, walls, ceilings, fixtures, specialties, furniture", () => {
    const order = ["structure", "envelope", "walls", "finishes", "mep", "specialty", "furniture"];
    const lags = order.map((k) => TRADES.find((t) => t.key === k)!.lag);
    for (let i = 1; i < lags.length; i++) expect(lags[i]).toBeGreaterThan(lags[i - 1]);
    // Interior work only on floors the curtain wall has already dried in.
    expect(TRADES.find((t) => t.key === "walls")!.lag).toBeGreaterThan(TRADES.find((t) => t.key === "envelope")!.lag);
  });

  it("counts every part once after the type splits (shear walls, curtain-wall doors)", () => {
    const after = new Date(buildFinish().getTime() + DAY);
    const levels = (bimSchedule as { levels: Record<string, Record<string, number>> }).levels;
    const sum = (o: Record<string, number> = {}) => Object.values(o).reduce((a, b) => a + b, 0);
    const traded = TRADES.flatMap((t) => t.sublayers);
    const expected = traded.reduce(
      (n, sub) =>
        n +
        sum(
          sub in curtainWallStoreys.sublayers
            ? (curtainWallStoreys.sublayers as Record<string, { counts: Record<string, number> }>)[sub].counts
            : levels[sub],
        ),
      0,
    );
    expect(progressAsOf(after).total).toBe(expected);
    // The split-off parts land in their own trade's package.
    const structure = progressAsOf(after).packages.find((p) => p.label === "Structure")!;
    expect(structure.total).toBeGreaterThan(typeSplits.sublayers.Walls.total);
  });

  it("only clads a storey once its floor is in", () => {
    for (let d = buildStart().getTime(); d < buildFinish().getTime(); d += 3 * DAY) {
      const day = new Date(d);
      // Curtain wall installed on storey s => the structure is past s.
      expect(workingLevel("envelope", day)).toBeLessThan(workingLevel("structure", day));
    }
  });

  it("counts the curtain wall by its real storey, nothing lost", () => {
    const after = new Date(buildFinish().getTime() + DAY);
    const cw = progressAsOf(after).packages.find((p) => p.label === "Curtain wall")!;
    expect(cw.total).toBe(1994 + 5057 + typeSplits.sublayers.Doors.total); // panels + mullions + curtain-wall doors
    // Spread up the building, not 769 panels on "level 3" and 776 on "level 9".
    const panels = curtainWallStoreys.sublayers.CurtainWallPanels.counts as Record<string, number>;
    expect(Math.max(...Object.values(panels))).toBeLessThan(200);
    expect(panels["7"]).toBeGreaterThan(100);
  });

  it("starts from the ground and rises over time", () => {
    expect(levelAt(buildStart())).toBe(0);
    const later = new Date(today.getTime() + 60 * DAY);
    expect(levelAt(later)).toBeGreaterThan(TODAY_LEVEL);
  });

  it("finishes with every element installed", () => {
    const after = new Date(buildFinish().getTime() + DAY);
    expect(levelAt(after)).toBe(MAX_LEVEL);
    const p = progressAsOf(after);
    expect(p.installed).toBe(p.total);
  });
});

describe("today's work", () => {
  it("is one activity per trade, on its working level, at or below level 8", () => {
    const acts = bimActivities(today);
    expect(acts.length).toBeGreaterThanOrEqual(5);
    for (const a of acts) {
      const level = Number(a.bimWhere?.match(/BldgLevel = (\d+)/)?.[1]);
      expect(level).toBeLessThanOrEqual(TODAY_LEVEL);
      expect(a.name).toContain(`level ${level}`);
    }
    expect(acts.find((a) => a.type === "curtain-wall")?.name).toContain("level 6");
  });

  it("counts progress below each trade's working level", () => {
    const p = progressAsOf(today);
    expect(p.installed).toBeGreaterThan(0);
    expect(p.installed).toBeLessThan(p.total);
  });
});
