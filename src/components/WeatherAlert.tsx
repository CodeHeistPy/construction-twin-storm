import { useMemo } from "react";
import { STRICTEST } from "../config/thresholds";
import { isSameDay } from "../lib/time";
import { fmtDayDate, fmtHour, fmtWind } from "../lib/units";
import { displayDate } from "../config/site";
import type { Twin } from "../state/useTwin";

/**
 * Incoming-weather alert, built from the forecast the app is using (the
 * scripted storm). Not an official warning. The on-screen "scripted" notes
 * were removed at the user's request (2026-10-20).
 */
export default function WeatherAlert({ twin, onClose }: { twin: Twin; onClose: () => void }) {
  const alert = useMemo(() => {
    // The whole storm day (the demo day, "tomorrow" on screen).
    const tomorrow = twin.weather.filter((h) => isSameDay(twin.day, h.time));
    const bad = tomorrow.filter(
      (h) => h.windSpeed >= STRICTEST.wind || h.windGust >= STRICTEST.gust || h.precipitation >= STRICTEST.precip || h.lightning,
    );
    if (!bad.length) return null;
    const peak = bad.reduce((m, h) => (h.windGust > m.windGust ? h : m), bad[0]);
    // Shown as just "heavy rain" (user, 2026-10-20), so only whether there is any.
    const rain = bad.some((h) => h.precipitation > 0);
    return { from: bad[0].time, to: bad[bad.length - 1].time, peak, rain };
  }, [twin.weather, twin.day]);

  if (!alert) return null;
  return (
    <div className="weather-alert" role="alert">
      <div className="alert-icon" aria-hidden>
        ⚠
      </div>
      <div className="alert-body">
        <div className="alert-head">
          <b>Severe weather arriving tomorrow, {fmtDayDate(displayDate(twin.day))}</b>
        </div>
        <p>
          {fmtHour(alert.from)}–{fmtHour(new Date(alert.to.getTime() + 3_600_000))}: gusts to {fmtWind(alert.peak.windGust)}
          {alert.rain ? ", heavy rain" : ""}.
        </p>
      </div>
      <button type="button" className="ghost" onClick={onClose} aria-label="Dismiss alert">
        ✕
      </button>
    </div>
  );
}
