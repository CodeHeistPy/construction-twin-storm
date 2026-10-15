import { useEffect, useMemo, useState } from "react";
import { demoDay } from "../config/site";
import { sampleSchedule } from "../data/schedule.sample";
import { scriptedWeather, stormCellAt } from "../data/storm.scripted";
import { activitiesOnDay, assessSchedule, weatherAt } from "../domain/rules";
import type { ActivityAssessment, WeatherHour, WeatherSource } from "../domain/types";
import { fetchLiveWeather } from "../lib/liveWeather";
import { atHour, isSameDay } from "../lib/time";

/** All derived twin state: clock, weather, schedule, decisions. */
export function useTwin() {
  const day = useMemo(demoDay, []);
  const [hour, setHour] = useState(7);
  const [source, setSource] = useState<WeatherSource>("scripted");
  const [live, setLive] = useState<WeatherHour[] | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    if (source !== "live" || live) return;
    const ctl = new AbortController();
    fetchLiveWeather(ctl.signal)
      .then((w) => {
        setLive(w);
        setLiveError(null);
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        setLiveError(e instanceof Error ? e.message : String(e));
      });
    return () => ctl.abort();
  }, [source, live]);

  const weather = useMemo(
    () => (source === "live" && live ? live : scriptedWeather(day)),
    [source, live, day],
  );

  const clock = useMemo(() => atHour(day, hour), [day, hour]);

  const activities = useMemo(() => activitiesOnDay(sampleSchedule(day), day), [day]);

  // Decisions use the full-day forecast: the call is made in the morning,
  // before the weather arrives.
  const assessments: ActivityAssessment[] = useMemo(
    () => assessSchedule(activities, weather),
    [activities, weather],
  );

  const now = useMemo(() => weatherAt(weather, clock), [weather, clock]);
  const storm = useMemo(
    () => (source === "scripted" ? stormCellAt(day, clock) : null),
    [source, day, clock],
  );

  return {
    day,
    hour,
    setHour,
    clock,
    source,
    setSource,
    liveError: source === "live" ? liveError : null,
    liveLoading: source === "live" && !live && !liveError,
    /** Live forecast only covers yesterday..tomorrow; a pinned demo day may fall outside. */
    liveOutOfRange:
      source === "live" &&
      !!live &&
      !live.some((h) => isSameDay(day, h.time)),
    weather,
    now,
    storm,
    assessments,
  };
}

export type Twin = ReturnType<typeof useTwin>;
