import { useMemo, useState } from "react";
import { SITE } from "../config/site";
import { fmtReason, fmtTime } from "../lib/units";
import type { Twin } from "../state/useTwin";
import { whenLabel } from "./ReplanCard";

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
      `WEATHER STAND-DOWN: ${SITE.name}, tomorrow`,
      "",
      `${postponed.length} activities postponed:`,
      ...postponed.map((a) => {
        const r = twin.replanned ? twin.replans.find((x) => x.original.activity.id === a.activity.id) : undefined;
        const next =
          r?.moved && r.daysLater !== null
            ? `\n   NEW TIME: ${whenLabel(r.daysLater)}, ${fmtTime(r.moved.start)}–${fmtTime(r.moved.end)}`
            : "";
        return `• ${a.activity.id} ${a.activity.name} (${a.activity.trade}), ${fmtTime(a.activity.start)}–${fmtTime(a.activity.end)}\n   ${a.reasons.map(fmtReason).join("; ")}${next}`;
      }),
    ];
    if (watch.length) {
      lines.push("", "Monitor (near limits):", ...watch.map((a) => `• ${a.activity.id} ${a.activity.name}`));
    }
    lines.push("", "Secure loose materials and laydown areas today, before the storm arrives.");
    return lines.join("\n");
  }, [twin.assessments, twin.replans, twin.replanned]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Crew notice">
        <header className="panel-head">
          <div>
            <div className="eyebrow">Crew notice · draft</div>
            <h2>Tell the crews</h2>
          </div>
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
