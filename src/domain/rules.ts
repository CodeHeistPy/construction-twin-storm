import { THRESHOLDS, WATCH_MARGIN } from "../config/thresholds";
import type {
  Activity,
  ActivityAssessment,
  Decision,
  Reason,
  Threshold,
  WeatherHour,
} from "./types";

/** Weather hours that overlap an activity's working window. */
function hoursFor(activity: Activity, weather: WeatherHour[]): WeatherHour[] {
  const start = activity.start.getTime();
  const end = activity.end.getTime();
  const HOUR = 3_600_000;
  return weather.filter((h) => {
    const t = h.time.getTime();
    return t + HOUR > start && t < end;
  });
}

function checks(t: Threshold, h: WeatherHour) {
  const out: { metric: Reason["metric"]; value: number; limit: number }[] = [];
  if (t.maxWind !== undefined) out.push({ metric: "wind", value: h.windSpeed, limit: t.maxWind });
  if (t.maxGust !== undefined) out.push({ metric: "gust", value: h.windGust, limit: t.maxGust });
  if (t.maxPrecip !== undefined)
    out.push({ metric: "precipitation", value: h.precipitation, limit: t.maxPrecip });
  if (t.stopForLightning) out.push({ metric: "lightning", value: h.lightning ? 1 : 0, limit: 1 });
  return out;
}

/**
 * Deterministic go / watch / postpone decision for one activity.
 * - postpone: any limit is reached during the activity window
 * - watch: any value is within WATCH_MARGIN of its limit (lightning excluded)
 * Each metric is reported once, at the first hour it trips.
 */
export function assessActivity(
  activity: Activity,
  weather: WeatherHour[],
  thresholds: Record<string, Threshold> = THRESHOLDS,
): ActivityAssessment {
  const t = thresholds[activity.type];
  const exceeded = new Map<Reason["metric"], Reason>();
  const near = new Map<Reason["metric"], Reason>();

  for (const h of hoursFor(activity, weather)) {
    for (const c of checks(t, h)) {
      if (c.value >= c.limit) {
        if (!exceeded.has(c.metric)) exceeded.set(c.metric, { ...c, at: h.time });
      } else if (c.metric !== "lightning" && c.value >= c.limit * WATCH_MARGIN) {
        if (!near.has(c.metric)) near.set(c.metric, { ...c, at: h.time });
      }
    }
  }

  let decision: Decision = "go";
  let reasons: Reason[] = [];
  if (exceeded.size) {
    decision = "postpone";
    reasons = [...exceeded.values()];
  } else if (near.size) {
    decision = "watch";
    reasons = [...near.values()];
  }
  reasons.sort((a, b) => a.at.getTime() - b.at.getTime());
  return { activity, decision, reasons };
}

export function assessSchedule(
  activities: Activity[],
  weather: WeatherHour[],
  thresholds?: Record<string, Threshold>,
): ActivityAssessment[] {
  return activities.map((a) => assessActivity(a, weather, thresholds));
}

/** Activities overlapping the 24 h starting at `day` (a site-midnight instant). */
export function activitiesOnDay(activities: Activity[], day: Date): Activity[] {
  const d1 = new Date(day.getTime() + 24 * 3_600_000);
  return activities.filter((a) => a.start < d1 && a.end > day);
}

/** The weather hour containing `time` (or the nearest one). */
export function weatherAt(weather: WeatherHour[], time: Date): WeatherHour | undefined {
  if (!weather.length) return undefined;
  const t = time.getTime();
  let best = weather[0];
  for (const h of weather) {
    if (h.time.getTime() <= t) best = h;
    else break;
  }
  return best;
}
