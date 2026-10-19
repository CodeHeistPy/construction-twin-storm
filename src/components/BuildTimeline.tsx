import { useEffect, useMemo, useRef, useState } from "react";
import { SITE } from "../config/site";
import { BIM_RANGE, buildStart } from "../lib/bim";
import { zonedMidnight } from "../lib/time";

const DAY = 86_400_000;
const midnight = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return zonedMidnight(y, m, d, SITE.timeZone);
};

/** Weeks relative to today, never a calendar date (dates aren't the story). */
function relLabel(day: Date, today: Date): string {
  const days = Math.round((day.getTime() - today.getTime()) / DAY);
  if (days === 0) return "Today";
  const w = Math.round(Math.abs(days) / 7);
  if (w === 0) return days < 0 ? `${-days} days ago` : `In ${days} days`;
  return days < 0 ? `${w} wk ago` : `In ${w} wk`;
}

interface Props {
  today: Date;
  value: Date;
  onChange: (d: Date) => void;
  /** Play from the first level up to today on mount. */
  autoplay?: boolean;
  onPlayingChange?: (playing: boolean) => void;
}

/**
 * 4D build-out: scrub or play Building 1 through its install schedule, like
 * the construction-timelapse reference. Each step re-renders the model as of
 * that day (installed solid, that day's work highlighted, the rest hidden).
 */
export default function BuildTimeline({ today, value, onChange, autoplay = true, onPlayingChange }: Props) {
  // From the first structural level (ground up), not the first dated install.
  const start = useMemo(() => buildStart(), []);
  const end = useMemo(() => midnight(BIM_RANGE.last), []);
  const total = Math.round((end.getTime() - start.getTime()) / DAY);
  const at = Math.round((value.getTime() - start.getTime()) / DAY);
  const todayAt = Math.round((today.getTime() - start.getTime()) / DAY);
  const [playing, setPlaying] = useState(false);
  const stopAt = useRef<number>(total);
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    onPlayingChange?.(playing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Arrive: run from the first install to today, then stop on today.
  useEffect(() => {
    if (!autoplay) return;
    onChange(start);
    stopAt.current = todayAt;
    const t = window.setTimeout(() => setPlaying(true), 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const cur = Math.round((valueRef.current.getTime() - start.getTime()) / DAY);
      const next = Math.min(stopAt.current, cur + 3);
      onChange(new Date(start.getTime() + next * DAY));
      if (next >= stopAt.current) setPlaying(false);
    }, 220);
    return () => window.clearInterval(id);
  }, [playing, start, onChange]);

  return (
    <div className="build-timeline">
      <button
        type="button"
        className="play"
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => {
          if (playing) return setPlaying(false);
          stopAt.current = at >= todayAt ? total : todayAt;
          if (at >= total) onChange(start);
          setPlaying(true);
        }}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="track">
        <input
          type="range"
          min={0}
          max={total}
          step={1}
          value={at}
          onChange={(e) => {
            setPlaying(false);
            onChange(new Date(start.getTime() + Number(e.target.value) * DAY));
          }}
          aria-label="Build timeline"
        />
        <span className="today-mark" style={{ left: `${(100 * todayAt) / total}%` }} />
        <div className="ends">
          <span>Start</span>
          <span>Finish</span>
        </div>
      </div>
      <div className="when">{relLabel(value, today)}</div>
    </div>
  );
}
