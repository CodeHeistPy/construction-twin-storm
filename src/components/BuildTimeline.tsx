import { useEffect, useMemo, useRef, useState } from "react";
import { buildFinish, buildStart } from "../lib/bim";
import { fmtDate } from "../lib/units";
import { displayDate } from "../config/site";

const DAY = 86_400_000;
/** Days the build-out advances per step (every 0.75 s). */
const DAYS_PER_STEP = 4;

/** The build-out's date (user, 2026-10-20: dates instead of "N days elapsed"). */
function dateLabel(day: Date, today: Date, isEnd: boolean): string {
  const isToday = Math.round((day.getTime() - today.getTime()) / DAY) === 0;
  return `${fmtDate(displayDate(day))}${isToday ? " · Today" : isEnd ? " · Complete" : ""}`;
}

interface Props {
  today: Date;
  value: Date;
  onChange: (d: Date) => void;
  /** Play from the first level up to today on mount. */
  autoplay?: boolean;
  /** Play on from today to the finished building instead (Completed Building view). */
  toFinish?: boolean;
  onPlayingChange?: (playing: boolean) => void;
}

/**
 * 4D build-out: scrub or play Building 1 through its install schedule, like
 * the construction-timelapse reference. Each step re-renders the model as of
 * that day (installed solid, that day's work highlighted, the rest hidden).
 */
export default function BuildTimeline({ today, value, onChange, autoplay = true, onPlayingChange, toFinish = false }: Props) {
  // From the first structural level (ground up), not the first dated install.
  const start = useMemo(() => buildStart(), []);
  const end = useMemo(() => buildFinish(), []);
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

  // Arrive: run from the first install to today, then stop on today (or, on
  // the Completed Building view, from today on to the finish).
  useEffect(() => {
    if (!autoplay) return;
    onChange(toFinish ? today : start);
    stopAt.current = toFinish ? total : todayAt;
    // Mounted once the schedule slide has landed (App), so a short beat is enough.
    const t = window.setTimeout(() => setPlaying(true), 800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const cur = Math.round((valueRef.current.getTime() - start.getTime()) / DAY);
      // 4 days per 0.75 s step: about 21 s from the ground to Today, so the
      // presenter can talk to it (user: slowed to 1.1 s, then sped up three times). Space pauses.
      // Faster = more days per step, not shorter steps: one renderer step takes
      // ~0.45 s to settle, so 0.75 s is near the floor.
      const next = Math.min(stopAt.current, cur + DAYS_PER_STEP);
      onChange(new Date(start.getTime() + next * DAY));
      if (next >= stopAt.current) setPlaying(false);
    }, 750);
    return () => window.clearInterval(id);
  }, [playing, start, onChange]);

  const toggle = () => {
    if (playing) return setPlaying(false);
    stopAt.current = at >= todayAt ? total : todayAt;
    if (at >= total) onChange(start);
    setPlaying(true);
  };
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  // Space bar pauses / resumes, so the presenter can stop on a moment.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || (e.target as HTMLElement)?.tagName === "INPUT") return;
      e.preventDefault();
      toggleRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="build-timeline">
      <button
        type="button"
        className="play"
        aria-label={playing ? "Pause" : "Play"}
        onClick={toggle}
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
      <div className="when">{dateLabel(value, today, at >= total)}</div>
    </div>
  );
}
