import { describe, expect, it } from "vitest";
import { replan } from "./replan";
import { assessSchedule } from "./rules";
import type { Activity, Threshold, WeatherHour } from "./types";

const day0 = new Date(2026, 9, 20);
const at = (h: number) => new Date(day0.getTime() + h * 3_600_000);

const T: Record<string, Threshold> = {
  "crane-lift": { maxWind: 10, source: "test" },
  interior: { source: "test" },
};

const activity = (type: Activity["type"] = "crane-lift"): Activity => ({
  id: "A",
  name: "a",
  type,
  trade: "t",
  zone: "z",
  start: at(7),
  end: at(15),
  location: { longitude: 0, latitude: 0, z: 0 },
  source: "sample",
});

/** Hourly weather for `days` days; windy on the given day indexes. */
const weather = (days: number, windyDays: number[]): WeatherHour[] =>
  Array.from({ length: days * 24 }, (_, h) => ({
    time: at(h),
    windSpeed: windyDays.includes(Math.floor(h / 24)) ? 15 : 3,
    windGust: 5,
    windDirection: 0,
    precipitation: 0,
    lightning: false,
    temperature: 20,
  }));

describe("replan", () => {
  it("moves postponed work to the first workable day", () => {
    const w = weather(3, [0]);
    const [r] = replan(assessSchedule([activity()], w, T), w, T);
    expect(r.daysLater).toBe(1);
    expect(r.moved?.start.getTime()).toBe(at(24 + 7).getTime());
  });

  it("skips further bad days", () => {
    const w = weather(3, [0, 1]);
    const [r] = replan(assessSchedule([activity()], w, T), w, T);
    expect(r.daysLater).toBe(2);
  });

  it("returns null when the forecast has no workable window", () => {
    const w = weather(2, [0, 1]);
    const [r] = replan(assessSchedule([activity()], w, T), w, T);
    expect(r.daysLater).toBeNull();
  });

  it("only re-plans postponed work", () => {
    const w = weather(2, [0]);
    expect(replan(assessSchedule([activity("interior")], w, T), w, T)).toHaveLength(0);
  });
});
