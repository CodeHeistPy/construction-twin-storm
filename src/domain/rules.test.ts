import { describe, expect, it } from "vitest";
import { activitiesOnDay, assessActivity, weatherAt } from "./rules";
import type { Activity, Threshold, WeatherHour } from "./types";

const day = new Date(2026, 9, 20);
const at = (h: number) => new Date(2026, 9, 20, h);

const hour = (h: number, over: Partial<WeatherHour> = {}): WeatherHour => ({
  time: at(h),
  windSpeed: 2,
  windGust: 3,
  windDirection: 200,
  precipitation: 0,
  lightning: false,
  temperature: 20,
  ...over,
});

const activity = (from: number, to: number, type: Activity["type"] = "crane-lift"): Activity => ({
  id: "X",
  name: "x",
  type,
  trade: "t",
  zone: "z",
  start: at(from),
  end: at(to),
  crewSize: 1,
  location: { longitude: 0, latitude: 0, z: 0 },
});

const T: Record<string, Threshold> = {
  "crane-lift": { maxWind: 10, maxGust: 15, stopForLightning: true, source: "test" },
  interior: { source: "test" },
};

describe("assessActivity", () => {
  it("goes when weather is calm", () => {
    const w = Array.from({ length: 24 }, (_, h) => hour(h));
    expect(assessActivity(activity(7, 12), w, T).decision).toBe("go");
  });

  it("postpones when a limit is reached inside the window, citing the first hour", () => {
    const w = Array.from({ length: 24 }, (_, h) => hour(h, h >= 10 ? { windSpeed: 11 } : {}));
    const a = assessActivity(activity(7, 12), w, T);
    expect(a.decision).toBe("postpone");
    expect(a.reasons).toHaveLength(1);
    expect(a.reasons[0].metric).toBe("wind");
    expect(a.reasons[0].at.getHours()).toBe(10);
  });

  it("ignores weather outside the activity window", () => {
    const w = Array.from({ length: 24 }, (_, h) => hour(h, h >= 13 ? { windSpeed: 20 } : {}));
    expect(assessActivity(activity(7, 13), w, T).decision).toBe("go");
  });

  it("flags watch inside the margin", () => {
    const w = Array.from({ length: 24 }, (_, h) => hour(h, { windSpeed: 8.5 }));
    expect(assessActivity(activity(7, 12), w, T).decision).toBe("watch");
  });

  it("postpones for lightning", () => {
    const w = Array.from({ length: 24 }, (_, h) => hour(h, h === 9 ? { lightning: true } : {}));
    const a = assessActivity(activity(7, 12), w, T);
    expect(a.decision).toBe("postpone");
    expect(a.reasons[0].metric).toBe("lightning");
  });

  it("never postpones unexposed work", () => {
    const w = Array.from({ length: 24 }, (_, h) => hour(h, { windSpeed: 40, lightning: true }));
    expect(assessActivity(activity(7, 12, "interior"), w, T).decision).toBe("go");
  });
});

describe("helpers", () => {
  it("activitiesOnDay keeps overlapping activities only", () => {
    const tomorrow = { ...activity(0, 1), start: new Date(2026, 9, 21, 7), end: new Date(2026, 9, 21, 9) };
    expect(activitiesOnDay([activity(7, 9), tomorrow], day)).toHaveLength(1);
  });

  it("weatherAt returns the containing hour", () => {
    const w = Array.from({ length: 24 }, (_, h) => hour(h, { windSpeed: h }));
    expect(weatherAt(w, new Date(2026, 9, 20, 14, 30))?.windSpeed).toBe(14);
  });
});
