import { SITE } from "../config/site";
import type { WeatherHour } from "../domain/types";
import { offsetMeters } from "../lib/geo";
import { atHour } from "../lib/time";

// =============================================================================
// SCRIPTED STORM — a repeatable, stage-safe storm for the plenary. Every value
// is invented; tune the curve to match the story (arrival time, peak wind, rain
// totals) once those are agreed. Units: m/s, mm/h, °C.
// =============================================================================

// hour: [wind, gust, dirFrom, precip, lightning, temp]
const CURVE: [number, number, number, number, boolean, number][] = [
  [3, 5, 200, 0, false, 18], // 00
  [3, 5, 200, 0, false, 18],
  [3, 5, 200, 0, false, 17],
  [3, 6, 205, 0, false, 17],
  [3, 6, 205, 0, false, 17],
  [4, 6, 210, 0, false, 17], // 05
  [4, 7, 210, 0, false, 18],
  [5, 8, 210, 0, false, 19],
  [5, 8, 215, 0, false, 21],
  [6, 9, 215, 0, false, 22],
  [7, 10, 220, 0, false, 23], // 10
  [8, 11, 220, 0.2, false, 24],
  [9, 13, 225, 1.0, false, 24],
  [12, 18, 230, 4.0, false, 22],
  [16, 24, 235, 12.0, true, 20],
  [19, 28, 240, 22.0, true, 19], // 15 peak
  [17, 26, 245, 15.0, true, 18],
  [13, 19, 250, 6.0, false, 18],
  [9, 14, 260, 2.0, false, 17],
  [7, 11, 270, 0.5, false, 17],
  [5, 8, 280, 0, false, 16], // 20
  [4, 7, 280, 0, false, 16],
  [4, 6, 285, 0, false, 15],
  [3, 5, 290, 0, false, 15],
];

// Tomorrow: the storm has cleared. Light NW wind, dry. Gives the re-plan a
// workable window to move postponed work into.
const TOMORROW: [number, number, number, number, boolean, number][] = Array.from({ length: 24 }, (_, h) => {
  const daytime = h >= 9 && h <= 17;
  return [daytime ? 5 : 3, daytime ? 8 : 5, 300, 0, false, daytime ? 19 : 13];
});

/** Today (the storm) followed by tomorrow (cleared), hourly. */
export function scriptedWeather(day: Date): WeatherHour[] {
  return [...CURVE, ...TOMORROW].map(
    ([windSpeed, windGust, windDirection, precipitation, lightning, temperature], h) => ({
      time: atHour(day, h),
      windSpeed,
      windGust,
      windDirection,
      precipitation,
      lightning,
      temperature,
    }),
  );
}

/** Storm cell centre at a time: approaches from the SW, passes over ~15:00. */
export function stormCellAt(day: Date, time: Date) {
  const PEAK_HOUR = 15;
  const SPEED_MS = 9; // ground speed of the cell, m/s
  const hoursFromPeak = (time.getTime() - day.getTime()) / 3_600_000 - PEAK_HOUR;
  const dist = hoursFromPeak * 3600 * SPEED_MS; // negative = still approaching
  const heading = 45; // moving toward NE
  const rad = (heading * Math.PI) / 180;
  return {
    ...offsetMeters(SITE.longitude, SITE.latitude, Math.sin(rad) * dist, Math.cos(rad) * dist),
    heading,
    /** km from site, signed: <0 approaching. */
    distanceKm: dist / 1000,
  };
}
