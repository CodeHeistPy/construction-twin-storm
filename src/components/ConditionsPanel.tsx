import { SITE } from "../config/site";
import { STRICTEST, WATCH_MARGIN } from "../config/thresholds";
import { hourOf, isSameDay } from "../lib/time";
import { fmtDistance, fmtHour, fmtPrecip, fmtTemp, fmtWind } from "../lib/units";
import type { Twin } from "../state/useTwin";

export default function ConditionsPanel({ twin }: { twin: Twin }) {
  const w = twin.now;
  const dayHours = twin.weather.filter((h) => isSameDay(twin.day, h.time));
  const nowHour = Math.floor(hourOf(twin.day, twin.clock));
  const peak = dayHours.reduce((m, h) => (h.windGust > (m?.windGust ?? -1) ? h : m), dayHours[0]);
  const maxGust = Math.max(1, ...dayHours.map((h) => h.windGust));
  const maxRain = Math.max(1, ...dayHours.map((h) => h.precipitation));

  return (
    <aside className="panel panel-right">
      <header className="panel-head">
        <div>
          <div className="eyebrow">Site conditions</div>
          <h2>{SITE.name}</h2>
        </div>
      </header>

      <div className="segmented" role="radiogroup" aria-label="Weather source">
        <button type="button" className={twin.source === "scripted" ? "on" : ""} onClick={() => twin.setSource("scripted")}>
          Scripted storm
        </button>
        <button type="button" className={twin.source === "live" ? "on" : ""} onClick={() => twin.setSource("live")}>
          Live forecast
        </button>
      </div>
      {twin.liveLoading && <p className="note">Loading live forecast…</p>}
      {twin.liveError && <p className="note warn">Live forecast unavailable ({twin.liveError}). Showing scripted storm.</p>}

      {w && (
        <div className="readings">
          <Reading label="Wind (10-min)" value={fmtWind(w.windSpeed)} level={level(w.windSpeed, STRICTEST.wind)} />
          <Reading label="Gusts" value={fmtWind(w.windGust)} level={level(w.windGust, STRICTEST.gust)} />
          <Reading label="Rain" value={fmtPrecip(w.precipitation)} level={level(w.precipitation, STRICTEST.precip)} />
          <Reading label="Lightning" value={w.lightning ? "In range" : "None"} level={w.lightning ? "bad" : "ok"} />
          <Reading label="Temperature" value={fmtTemp(w.temperature)} level="ok" />
        </div>
      )}

      {twin.storm && (
        <div className={`storm-callout ${twin.storm.distanceKm < 0 ? "approaching" : "passed"}`}>
          {twin.storm.distanceKm < -2
            ? `Storm core ${fmtDistance(twin.storm.distanceKm)} SW, moving NE`
            : twin.storm.distanceKm <= 2
              ? "Storm core over the site"
              : `Storm core ${fmtDistance(twin.storm.distanceKm)} NE, moving away`}
          {peak && <span> · peak gusts {fmtWind(peak.windGust)} at {fmtHour(peak.time)}</span>}
        </div>
      )}

      <div className="hourly" aria-label="Hourly gusts and rain">
        <div className="hourly-legend">
          <span className="k gust" /> Gusts <span className="k rain" /> Rain
        </div>
        <div className="bars">
          {dayHours.map((h) => {
            const isNow = Math.floor(hourOf(twin.day, h.time)) === nowHour;
            return (
              <div key={h.time.getTime()} className={`bar ${isNow ? "now" : ""}`} title={`${fmtHour(h.time)}: gusts ${fmtWind(h.windGust)}, rain ${fmtPrecip(h.precipitation)}`}>
                <i className="gust" style={{ height: `${(h.windGust / maxGust) * 100}%` }} />
                <i className="rain" style={{ height: `${(h.precipitation / maxRain) * 100}%` }} />
              </div>
            );
          })}
        </div>
        <div className="axis">
          <span>12a</span>
          <span>6a</span>
          <span>12p</span>
          <span>6p</span>
          <span>12a</span>
        </div>
      </div>
      <p className="footnote">
        {twin.source === "scripted"
          ? "Scripted storm for the demo, not a real forecast."
          : "Today's real Denver forecast (Open-Meteo), applied to the demo day hour by hour."}
      </p>
    </aside>
  );
}

/** Colour a reading against the strictest activity limit. */
const level = (v: number, limit: number) => (v >= limit ? "bad" : v >= limit * WATCH_MARGIN ? "warn" : "ok");

function Reading({ label, value, level }: { label: string; value: string; level: "ok" | "warn" | "bad" }) {
  return (
    <div className="reading">
      <span>{label}</span>
      <b className={level}>{value}</b>
    </div>
  );
}
