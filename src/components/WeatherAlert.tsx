import { useMemo } from "react";
import { STRICTEST } from "../config/thresholds";
import { isSameDay } from "../lib/time";
import { fmtDate, fmtHour, fmtPrecip, fmtWind } from "../lib/units";
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
    const rain = bad.reduce((m, h) => Math.max(m, h.precipitation), 0);
    return {
      from: bad[0].time,
      to: bad[bad.length - 1].time,
      peak,
      rain,
      lightning: bad.some((h) => h.lightning),
      atRisk: twin.assessments.filter((a) => a.decision !== "go").length,
    };
  }, [twin.weather, twin.day, twin.assessments]);

  if (!alert) return null;
  return (
    <div className="weather-alert" role="alert">
      <div className="alert-icon" aria-hidden>
        ⚠
      </div>
      <div className="alert-body">
        <div className="alert-head">
          <b>Severe weather arriving tomorrow</b>
        </div>
        <p>
          Tomorrow, {fmtDate(displayDate(twin.day))}, {fmtHour(alert.from)}–{fmtHour(new Date(alert.to.getTime() + 3_600_000))}: gusts to {fmtWind(alert.peak.windGust)}
          {alert.rain > 0 ? `, heavy rain up to ${fmtPrecip(alert.rain)}` : ""}
          {alert.lightning ? ", lightning" : ""}.
        </p>
        <p className="alert-impact">
          {alert.atRisk} of tomorrow's {twin.assessments.length} activities at risk.
        </p>
      </div>
      <button type="button" className="ghost" onClick={onClose} aria-label="Dismiss alert">
        ✕
      </button>
    </div>
  );
}
