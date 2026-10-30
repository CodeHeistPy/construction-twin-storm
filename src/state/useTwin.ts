import { useMemo, useState } from "react";
import { demoDay } from "../config/site";
import { sampleSchedule } from "../data/schedule.sample";
import { scriptedWeather } from "../data/storm.scripted";
import { replan } from "../domain/replan";
import { activitiesOnDay, assessSchedule } from "../domain/rules";
import type { ActivityAssessment } from "../domain/types";
import { bimActivities } from "../lib/bim";

/** All derived twin state: weather, schedule, decisions. */
export function useTwin() {
  const day = useMemo(demoDay, []);
  /** Whether the adapted plan (postponed work moved to its next window) is applied. */
  const [replanned, setReplanned] = useState(false);

  // The scripted storm: repeatable on stage.
  const weather = useMemo(() => scriptedWeather(day), [day]);

  // BIM install work for the day, plus clearly-labelled sample logistics.
  const activities = useMemo(() => activitiesOnDay([...bimActivities(day), ...sampleSchedule(day)], day), [day]);

  // Decisions use the full-day forecast: the call is made in the morning,
  // before the weather arrives.
  const assessments: ActivityAssessment[] = useMemo(() => assessSchedule(activities, weather), [activities, weather]);

  const replans = useMemo(() => replan(assessments, weather), [assessments, weather]);

  return {
    day,
    weather,
    assessments,
    replans,
    replanned,
    setReplanned,
  };
}

export type Twin = ReturnType<typeof useTwin>;
