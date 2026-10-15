import { ACTIVITY_LABELS, THRESHOLDS } from "../config/thresholds";
import type { ActivityAssessment, Decision } from "../domain/types";
import { fmtReason, fmtTime, fmtWatch } from "../lib/units";
import type { Twin } from "../state/useTwin";
import { BlockTag } from "./BlocksRail";

const ORDER: Decision[] = ["postpone", "watch", "go"];
const LABEL: Record<Decision, string> = { postpone: "Postpone", watch: "Watch", go: "Proceed" };

interface Props {
  twin: Twin;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function SchedulePanel({ twin, selectedId, onSelect }: Props) {
  const by = (d: Decision) => twin.assessments.filter((a) => a.decision === d);
  const postponed = by("postpone");
  const crews = postponed.reduce((n, a) => n + a.activity.crewSize, 0);
  const dateLabel = twin.day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <aside className="panel panel-left">
      <header className="panel-head">
        <div>
          <div className="eyebrow">Today's schedule</div>
          <h2>{dateLabel}</h2>
        </div>
        <div className="tags">
          <BlockTag id="integration" />
          <BlockTag id="intelligence" />
        </div>
      </header>

      <div className="summary">
        <div className="stat postpone">
          <b>{postponed.length}</b>
          <span>postponed</span>
        </div>
        <div className="stat watch">
          <b>{by("watch").length}</b>
          <span>watch</span>
        </div>
        <div className="stat go">
          <b>{by("go").length}</b>
          <span>proceed</span>
        </div>
        <div className="stat">
          <b>{crews}</b>
          <span>workers affected</span>
        </div>
      </div>

      <div className="activity-list">
        {ORDER.map((d) =>
          by(d).length ? (
            <section key={d}>
              <h3 className={`group ${d}`}>{LABEL[d]}</h3>
              {by(d).map((a) => (
                <ActivityRow key={a.activity.id} a={a} selected={a.activity.id === selectedId} onSelect={onSelect} />
              ))}
            </section>
          ) : null,
        )}
      </div>
      <p className="footnote">Sample schedule and placeholder limits — not project data.</p>
    </aside>
  );
}

function ActivityRow({
  a,
  selected,
  onSelect,
}: {
  a: ActivityAssessment;
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  const { activity: x, decision, reasons } = a;
  return (
    <button
      type="button"
      className={`activity ${decision} ${selected ? "selected" : ""}`}
      onClick={() => onSelect(selected ? null : x.id)}
    >
      <div className="row1">
        <span className="id">{x.id}</span>
        <span className="name">{x.name}</span>
      </div>
      <div className="row2">
        {ACTIVITY_LABELS[x.type]} · {x.zone} · {fmtTime(x.start)}–{fmtTime(x.end)} · {x.crewSize} crew
      </div>
      {reasons.length > 0 && (
        <ul className="reasons">
          {reasons.map((r) => (
            <li key={r.metric}>{decision === "postpone" ? fmtReason(r) : fmtWatch(r)}</li>
          ))}
        </ul>
      )}
      {selected && <div className="source">Limit source: {THRESHOLDS[x.type].source}</div>}
    </button>
  );
}
