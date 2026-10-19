import { useEffect, useState } from "react";
import { fmtTime } from "../lib/units";
import type { Twin } from "../state/useTwin";

const MIN = 5;
const MAX = 21;

/** Steps the demo clock through the day so the storm can be "played forward". */
export default function TimeScrubber({ twin }: { twin: Twin }) {
  const [playing, setPlaying] = useState(false);
  const { hour, setHour } = twin;

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      setHour((h) => {
        const next = h + 0.25;
        if (next > MAX) {
          setPlaying(false);
          return MAX;
        }
        return next;
      });
    }, 250);
    return () => window.clearInterval(t);
  }, [playing, setHour]);

  return (
    <div className="scrubber">
      <button type="button" className="play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="clock">{fmtTime(twin.clock)}</div>
      <input
        type="range"
        min={MIN}
        max={MAX}
        step={0.25}
        value={hour}
        onChange={(e) => setHour(Number(e.target.value))}
        aria-label="Time of day"
      />
    </div>
  );
}
