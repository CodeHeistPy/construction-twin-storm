import { describe, expect, it } from "vitest";
import { BIM_RANGE, derivedKey, MAX_LEVEL, progressAsOf } from "./bim";
import { zonedMidnight } from "./time";

describe("derived install dates", () => {
  it("raises the structure level by level, before the first dated install", () => {
    const keys = Array.from({ length: MAX_LEVEL + 1 }, (_, l) => derivedKey("Floors", l)!);
    expect([...keys].sort()).toEqual(keys); // bottom-up
    expect(keys[MAX_LEVEL] < BIM_RANGE.first).toBe(true);
  });

  it("follows the trade sequence on each floor", () => {
    for (const level of [3, 8, 14]) {
      const walls = derivedKey("Walls", level)!;
      const ceilings = derivedKey("Ceilings", level)!;
      const furniture = derivedKey("Furniture", level)!;
      expect(derivedKey("Floors", level)! < walls).toBe(true);
      expect(walls < ceilings).toBe(true);
      expect(ceilings < furniture).toBe(true);
    }
  });

  it("moves upward floor by floor", () => {
    expect(derivedKey("Walls", 3)! < derivedKey("Walls", 12)!).toBe(true);
  });

  it("leaves unknown trades undated", () => {
    expect(derivedKey("Rooms", 4)).toBeNull();
  });
});

describe("progress with derived dates", () => {
  it("counts the structure and reaches 100% after the last install", () => {
    const [y, m, d] = BIM_RANGE.last.split("-").map(Number);
    const after = new Date(zonedMidnight(y, m, d, "America/Denver").getTime() + 120 * 86_400_000);
    const p = progressAsOf(after);
    expect(p.packages.some((k) => k.label === "Structure")).toBe(true);
    expect(p.installed).toBe(p.total);
  });
});
