import { assessActivity } from "./rules";
import type { Activity, ActivityAssessment, Threshold, WeatherHour } from "./types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface Rescheduled {
  /** The original (postponed) assessment. */
  original: ActivityAssessment;
  /** Whole days later the work moves to; null = no workable window in the forecast. */
  daysLater: number | null;
  /** The activity in its new window (same hours, later day). */
  moved?: Activity;
}

/** Does the forecast cover every hour of the activity's window? */
function covered(a: Activity, weather: WeatherHour[]): boolean {
  const first = weather[0]?.time.getTime();
  const last = weather[weather.length - 1]?.time.getTime();
  if (first === undefined || last === undefined) return false;
  return a.start.getTime() >= first && a.end.getTime() <= last + HOUR;
}

/**
 * Move each postponed activity to its first workable window: the same shift
 * hours on a later day where it no longer trips a limit ("watch" is workable).
 * Only days the forecast fully covers are considered.
 */
export function replan(
  assessments: ActivityAssessment[],
  weather: WeatherHour[],
  thresholds?: Record<string, Threshold>,
  maxDays = 7,
): Rescheduled[] {
  return assessments
    .filter((a) => a.decision === "postpone")
    .map((original) => {
      for (let d = 1; d <= maxDays; d++) {
        const moved: Activity = {
          ...original.activity,
          start: new Date(original.activity.start.getTime() + d * DAY),
          end: new Date(original.activity.end.getTime() + d * DAY),
        };
        if (!covered(moved, weather)) break;
        if (assessActivity(moved, weather, thresholds).decision !== "postpone") {
          return { original, daysLater: d, moved };
        }
      }
      return { original, daysLater: null };
    });
}
