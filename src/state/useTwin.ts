import { useEffect, useMemo, useState } from "react";
import { SITE, demoDay } from "../config/site";
import { sampleSchedule } from "../data/schedule.sample";
import { scriptedWeather, stormCellAt } from "../data/storm.scripted";
import { replan } from "../domain/replan";
import { activitiesOnDay, assessSchedule, weatherAt } from "../domain/rules";
import type { ActivityAssessment, WeatherHour, WeatherSource } from "../domain/types";
import { bimActivities } from "../lib/bim";
import { fetchLiveWeather } from "../lib/liveWeather";
import { atHour, todayIn, zonedMidnight } from "../lib/time";

/**
 * Live mode: take today's real Denver forecast and lay it over the demo day
 * hour-for-hour, so the (pinned) BIM schedule is tested against real weather.
 */
function shiftToDemoDay(live: WeatherHour[], day: Date): WeatherHour[] {
  const [y, m, d] = todayIn(SITE.timeZone);
  const realToday = zonedMidnight(y, m, d, SITE.timeZone);
  const shift = day.getTime() - realToday.getTime();
  const end = realToday.getTime() + 48 * 3_600_000; // today + tomorrow, for re-planning
  return live
    .filter((h) => h.time >= realToday && h.time.getTime() < end)
    .map((h) => ({ ...h, time: new Date(h.time.getTime() + shift) }));
}

/** All derived twin state: clock, weather, schedule, decisions. */
export function useTwin() {
  const day = useMemo(demoDay, []);
  const [hour, setHour] = useState(7);
  const [source, setSource] = useState<WeatherSource>("scripted");
  const [live, setLive] = useState<WeatherHour[] | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  /** Whether the adapted plan (postponed work moved to its next window) is applied. */
  const [replanned, setReplanned] = useState(false);

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
    () => (source === "live" && live ? shiftToDemoDay(live, day) : scriptedWeather(day)),
    [source, live, day],
  );

  const clock = useMemo(() => atHour(day, hour), [day, hour]);

  // BIM install work for the day, plus clearly-labelled sample logistics.
  const activities = useMemo(
    () => activitiesOnDay([...bimActivities(day), ...sampleSchedule(day)], day),
    [day],
  );

  // Decisions use the full-day forecast: the call is made in the morning,
  // before the weather arrives.
  const assessments: ActivityAssessment[] = useMemo(
    () => assessSchedule(activities, weather),
    [activities, weather],
  );

  const replans = useMemo(() => replan(assessments, weather), [assessments, weather]);

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
    weather,
    now,
    storm,
    assessments,
    replans,
    replanned,
    setReplanned,
  };
}

export type Twin = ReturnType<typeof useTwin>;
