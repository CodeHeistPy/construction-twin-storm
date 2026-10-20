import { SITE, UNITS } from "../config/site";
import type { Reason } from "../domain/types";

const imperial = UNITS === "imperial";

export const fmtWind = (ms: number) =>
  imperial ? `${Math.round(ms * 2.23694)} mph` : `${Math.round(ms)} m/s`;

export const fmtPrecip = (mmh: number) =>
  imperial ? `${(mmh / 25.4).toFixed(2)} in/h` : `${mmh.toFixed(1)} mm/h`;

export const fmtTemp = (c: number) =>
  imperial ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`;

export const fmtDistance = (km: number) =>
  imperial ? `${(Math.abs(km) * 0.621371).toFixed(0)} mi` : `${Math.abs(km).toFixed(0)} km`;

export const fmtTime = (d: Date) =>
  d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: SITE.timeZone });

/** "Feb 07, 2026" in site time (user, 2026-10-20: the 4D shows dates). */
export const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: SITE.timeZone });

/** "Wednesday, Oct 21, 2026" in site time. */
export const fmtDayDate = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: SITE.timeZone });

export const fmtHour = (d: Date) =>
  d.toLocaleTimeString("en-US", { hour: "numeric", timeZone: SITE.timeZone });

export function fmtReason(r: Reason): string {
  switch (r.metric) {
    case "wind":
      return `Wind ${fmtWind(r.value)} ≥ limit ${fmtWind(r.limit)} at ${fmtHour(r.at)}`;
    case "gust":
      return `Gusts ${fmtWind(r.value)} ≥ limit ${fmtWind(r.limit)} at ${fmtHour(r.at)}`;
    case "precipitation":
      return `Rain ${fmtPrecip(r.value)} ≥ limit ${fmtPrecip(r.limit)} at ${fmtHour(r.at)}`;
    case "lightning":
      return `Lightning in stop radius at ${fmtHour(r.at)}`;
  }
}

/** Same as fmtReason but phrased for "watch" (approaching, not exceeded). */
export function fmtWatch(r: Reason): string {
  const label = { wind: "Wind", gust: "Gusts", precipitation: "Rain", lightning: "Lightning" }[r.metric];
  const v = r.metric === "precipitation" ? fmtPrecip(r.value) : fmtWind(r.value);
  const l = r.metric === "precipitation" ? fmtPrecip(r.limit) : fmtWind(r.limit);
  return `${label} ${v} near limit ${l} at ${fmtHour(r.at)}`;
}
