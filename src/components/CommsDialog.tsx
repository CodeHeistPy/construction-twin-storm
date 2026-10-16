import { useMemo, useState } from "react";
import { SITE } from "../config/site";
import { fmtReason, fmtTime } from "../lib/units";
import type { Twin } from "../state/useTwin";
import { BlockTag } from "./BlocksRail";

/**
 * Drafts the crew notice from the rules output. Nothing is sent: the
 * plenary shows the message; delivery (Teams, SMS, Workforce, etc.) is TBD.
 */
export default function CommsDialog({ twin, onClose }: { twin: Twin; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => {
    const postponed = twin.assessments.filter((a) => a.decision === "postpone");
    const watch = twin.assessments.filter((a) => a.decision === "watch");
    const lines = [
      `WEATHER STAND-DOWN: ${SITE.name}, ${twin.day.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: SITE.timeZone })}`,
      "",
      `${postponed.length} activities postponed:`,
      ...postponed.map(
        (a) =>
          `• ${a.activity.id} ${a.activity.name} (${a.activity.trade}), ${fmtTime(a.activity.start)}–${fmtTime(a.activity.end)}\n   ${a.reasons.map(fmtReason).join("; ")}`,
      ),
    ];
    if (watch.length) {
      lines.push("", "Monitor (near limits):", ...watch.map((a) => `• ${a.activity.id} ${a.activity.name}`));
    }
    lines.push("", "Secure loose materials and laydown areas before the storm arrives.");
    return lines.join("\n");
  }, [twin.assessments, twin.day]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Crew notice">
        <header className="panel-head">
          <div>
            <div className="eyebrow">Crew notice · draft</div>
            <h2>Tell the crews</h2>
          </div>
          <BlockTag id="intelligence" />
        </header>
        <pre className="notice">{text}</pre>
        <div className="modal-actions">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(text).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy text"}
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
