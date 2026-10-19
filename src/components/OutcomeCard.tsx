import { useMemo } from "react";
import { STRICTEST } from "../config/thresholds";
import { progressAsOf } from "../lib/bim";
import { hourOf, isSameDay } from "../lib/time";
import type { Twin } from "../state/useTwin";

/** Closing card: what we saw coming, what we changed, and that the build kept moving. */
export default function OutcomeCard({ twin, alertHour }: { twin: Twin; alertHour: number }) {
  const o = useMemo(() => {
    const firstBad = twin.weather.find(
      (h) =>
        isSameDay(twin.day, h.time) &&
        (h.windSpeed >= STRICTEST.wind || h.windGust >= STRICTEST.gust || h.precipitation >= STRICTEST.precip || h.lightning),
    );
    const lead = firstBad ? Math.round(hourOf(twin.day, firstBad.time) - alertHour) : null;
    const ran = twin.assessments.filter((a) => a.decision !== "postpone");
    const moved = twin.replans.filter((r) => r.daysLater !== null);
    const maxSlip = moved.reduce((m, r) => Math.max(m, r.daysLater ?? 0), 0);
    const trades = new Set(twin.assessments.filter((a) => a.decision === "postpone").map((a) => a.activity.trade));
    const p = progressAsOf(twin.day);
    const ranParts = ran.filter((a) => a.activity.source === "bim").reduce((n, a) => n + (a.activity.components ?? 0), 0);
    return {
      lead,
      ran: ran.length,
      ranParts,
      moved: moved.length,
      maxSlip,
      trades: trades.size,
      before: (100 * p.installed) / p.total,
      after: (100 * (p.installed + ranParts)) / p.total,
    };
  }, [twin.weather, twin.day, twin.assessments, twin.replans, alertHour]);

  return (
    <div className="outcome">
      <div className="eyebrow">The outcome</div>
      <h2>We saw it coming, and adjusted</h2>
      <div className="outcome-grid">
        <div>
          <b>{o.lead !== null ? `${o.lead} h` : "—"}</b>
          <span>warning before the first stop-work conditions</span>
        </div>
        <div>
          <b>{o.moved}</b>
          <span>activities moved to the next workable window</span>
        </div>
        <div>
          <b>+{o.maxSlip} day{o.maxSlip === 1 ? "" : "s"}</b>
          <span>schedule impact, not a lost week</span>
        </div>
        <div>
          <b>{o.trades}</b>
          <span>crews notified with the new plan</span>
        </div>
        <div>
          <b>{o.ran}</b>
          <span>activities carried on safely</span>
        </div>
        <div>
          <b>
            {o.before.toFixed(1)}% → {o.after.toFixed(1)}%
          </b>
          <span>Building 1 progress, storm or not</span>
        </div>
      </div>
      <p className="outcome-line">Anticipate. Understand. Adjust. With data behind every decision.</p>
    </div>
  );
}
