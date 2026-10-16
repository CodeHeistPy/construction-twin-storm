import { useMemo } from "react";
import { progressAsOf } from "../lib/bim";
import type { Twin } from "../state/useTwin";
import { BlockTag } from "./BlocksRail";

const pct = (n: number, d: number) => (d ? (100 * n) / d : 0);

/**
 * Building 1 progress straight from the model's install dates. With
 * `endOfDay`, today's work that ran counts as installed and moved work doesn't.
 */
export default function ProgressPanel({ twin, endOfDay = false }: { twin: Twin; endOfDay?: boolean }) {
  const p = useMemo(() => progressAsOf(twin.day), [twin.day]);

  // Parts that actually went in today = today's BIM work that wasn't postponed.
  const ranToday = twin.assessments
    .filter((a) => a.activity.source === "bim" && a.decision !== "postpone")
    .reduce((n, a) => n + (a.activity.components ?? 0), 0);
  const moved = twin.assessments
    .filter((a) => a.activity.source === "bim" && a.decision === "postpone")
    .reduce((n, a) => n + (a.activity.components ?? 0), 0);

  const installed = p.installed + (endOfDay ? ranToday : 0);
  const now = pct(installed, p.total);
  const start = pct(p.installed, p.total);

  return (
    <aside className="panel panel-left">
      <header className="panel-head">
        <div>
          <div className="eyebrow">{endOfDay ? "End of day" : "Progress"}</div>
          <h2>Building 1</h2>
        </div>
        <div className="tags">
          <BlockTag id="foundation" />
          <BlockTag id="integration" />
        </div>
      </header>

      <div className="progress-hero">
        <div className="ring" style={{ ["--p" as string]: `${now}` }}>
          <b>{now.toFixed(1)}%</b>
          <span>installed</span>
        </div>
        <div className="hero-facts">
          <div>
            <b>{installed.toLocaleString()}</b> of {p.total.toLocaleString()} tracked parts
          </div>
          {endOfDay ? (
            <>
              <div className="up">
                +{ranToday.toLocaleString()} parts today ({start.toFixed(1)}% → {now.toFixed(1)}%)
              </div>
              {moved > 0 && <div className="moved">{moved.toLocaleString()} parts moved to tomorrow</div>}
            </>
          ) : (
            <div className="today">{p.today.toLocaleString()} parts scheduled today</div>
          )}
        </div>
      </div>

      <div className="packages">
        {p.packages.map((k) => (
          <div key={k.label} className="pkg">
            <div className="pkg-row">
              <span>{k.label}</span>
              <span>
                {pct(k.installed, k.total).toFixed(0)}%{k.today ? ` · ${k.today} today` : ""}
              </span>
            </div>
            <div className="bar">
              <i className="done" style={{ width: `${pct(k.installed, k.total)}%` }} />
              <i className="today" style={{ width: `${pct(k.today, k.total)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="footnote">
        From each component's install date in the BIM model. Structure, walls, floors and roofs carry no date and are
        shown as in place.
      </p>
    </aside>
  );
}
