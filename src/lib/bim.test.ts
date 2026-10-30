import { describe, expect, it } from "vitest";
import { demoDay } from "../config/site";
import curtainWallStoreys from "../data/curtain-wall-storeys.json";
import bimSchedule from "../data/bim-schedule.json";
import typeSplits from "../data/type-splits.json";
import { bimActivities, buildFinish, buildStart, levelAt, MAX_LEVEL, progressAsOf, TOPPED_OUT, TRADES, workingLevel } from "./bim";

const DAY = 86_400_000;
const today = demoDay();

describe("level-driven schedule", () => {
  it("has the whole frame up today", () => {
    expect(levelAt(today)).toBe(MAX_LEVEL);
    expect(workingLevel("structure", today)).toBeGreaterThan(MAX_LEVEL);
  });

  it("has the fit-out mid-way today, each trade a level behind the one before", () => {
    expect(workingLevel("walls", today)).toBe(9);
    expect(workingLevel("finishes", today)).toBe(8);
    expect(workingLevel("mep", today)).toBe(7);
    expect(workingLevel("envelope", today)).toBe(6);
    expect(workingLevel("specialty", today)).toBe(5);
    expect(workingLevel("furniture", today)).toBe(4);
  });

  it("follows the user's order: framing, interior, then the exterior glass, then specialties and furniture", () => {
    const order = ["structure", "walls", "finishes", "mep", "envelope", "specialty", "furniture"];
    const lags = order.map((k) => TRADES.find((t) => t.key === k)!.lag);
    for (let i = 1; i < lags.length; i++) expect(lags[i]).toBeGreaterThan(lags[i - 1]);
    // The progress panel lists the trades in the same order.
    expect(TRADES.map((t) => t.key)).toEqual(order);
  });

  it("frames the whole building before any fit-out or glass", () => {
    for (let d = buildStart().getTime(); d < buildFinish().getTime(); d += 3 * DAY) {
      const day = new Date(d);
      if (workingLevel("structure", day) > MAX_LEVEL) continue;
      for (const t of TRADES.filter((x) => x.key !== "structure")) expect(workingLevel(t.key, day)).toBeLessThan(0);
    }
    expect(TRADES.filter((t) => t.key !== "structure").every((t) => t.lag >= TOPPED_OUT)).toBe(true);
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
    expect(workingLevel("walls", later)).toBeGreaterThan(workingLevel("walls", today));
  });

  it("finishes with every element installed", () => {
    const after = new Date(buildFinish().getTime() + DAY);
    expect(levelAt(after)).toBe(MAX_LEVEL);
    const p = progressAsOf(after);
    expect(p.installed).toBe(p.total);
  });
});

describe("today's work", () => {
  it("is one activity per fit-out trade, on its working level; no steel erection (the frame is up)", () => {
    const acts = bimActivities(today);
    expect(acts.map((a) => a.id)).toEqual(["L9-WAL", "L8-FIN", "L7-MEP", "L6-ENV", "L5-SPE", "L4-FUR"]);
    for (const a of acts) {
      const level = Number(a.bimWhere?.match(/BldgLevel = (\d+)/)?.[1]);
      expect(a.name).toContain(`level ${level}`);
    }
    expect(acts.some((a) => a.type === "steel-erection")).toBe(false);
  });

  it("counts progress below each trade's working level", () => {
    const p = progressAsOf(today);
    expect(p.installed).toBeGreaterThan(0);
    expect(p.installed).toBeLessThan(p.total);
  });
});
