import { useEffect, useMemo, useRef, useState } from "react";
import { buildFinish, buildStart } from "../lib/bim";
import { fmtDate } from "../lib/units";

const DAY = 86_400_000;

/** The build-out's date (user, 2026-10-20: dates instead of "N days elapsed"). */
function dateLabel(day: Date, today: Date): string {
  const isToday = Math.round((day.getTime() - today.getTime()) / DAY) === 0;
  return `${fmtDate(day)}${isToday ? " · Today" : ""}`;
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

  // Arrive: run from the first install to today, then stop on today.
  useEffect(() => {
    if (!autoplay) return;
    onChange(start);
    stopAt.current = todayAt;
    // Mounted once the schedule slide has landed (App), so a short beat is enough.
    const t = window.setTimeout(() => setPlaying(true), 800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const cur = Math.round((valueRef.current.getTime() - start.getTime()) / DAY);
      // 3 days per 0.9 s step: about 33 s from the ground to Today, so the
      // presenter can talk to it (user: slowed to 1.1 s, then "slightly faster"). Space pauses.
      const next = Math.min(stopAt.current, cur + 3);
      onChange(new Date(start.getTime() + next * DAY));
      if (next >= stopAt.current) setPlaying(false);
    }, 900);
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
      <div className="when">{dateLabel(value, today)}</div>
    </div>
  );
}
