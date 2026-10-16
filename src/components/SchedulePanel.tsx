import { ACTIVITY_LABELS, THRESHOLDS } from "../config/thresholds";
import type { Rescheduled } from "../domain/replan";
import type { ActivityAssessment, Decision } from "../domain/types";
import { fmtReason, fmtTime, fmtWatch } from "../lib/units";
import type { Twin } from "../state/useTwin";
import { BlockTag } from "./BlocksRail";
import ReplanCard, { whenLabel } from "./ReplanCard";

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
  const deferred = postponed.reduce((n, a) => n + (a.activity.components ?? 0), 0);

  return (
    <aside className="panel panel-left">
      <header className="panel-head">
        <div>
          <div className="eyebrow">Site schedule</div>
          <h2>Today</h2>
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
          <b>{deferred}</b>
          <span>BIM parts deferred</span>
        </div>
      </div>

      <ReplanCard twin={twin} />

      <div className="activity-list">
        {ORDER.map((d) =>
          by(d).length ? (
            <section key={d}>
              <h3 className={`group ${d}`}>{LABEL[d]}</h3>
              {by(d).map((a) => (
                <ActivityRow
                  key={a.activity.id}
                  a={a}
                  selected={a.activity.id === selectedId}
                  onSelect={onSelect}
                  movedTo={twin.replanned ? twin.replans.find((r) => r.original.activity.id === a.activity.id) : undefined}
                />
              ))}
            </section>
          ) : null,
        )}
      </div>
      <p className="footnote">
        BIM work from Building 1 install dates. Shift hours, sample items and stop-work limits are placeholders.
      </p>
    </aside>
  );
}

function ActivityRow({
  a,
  selected,
  onSelect,
  movedTo,
}: {
  a: ActivityAssessment;
  selected: boolean;
  onSelect: (id: string | null) => void;
  movedTo?: Rescheduled;
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
        <span className={`src ${x.source}`}>{x.source === "bim" ? "BIM" : "Sample"}</span>
      </div>
      <div className="row2">
        {ACTIVITY_LABELS[x.type]} · {x.zone} · {fmtTime(x.start)}–{fmtTime(x.end)}
        {x.crewSize ? ` · ${x.crewSize} crew` : ""}
      </div>
      {reasons.length > 0 && (
        <ul className="reasons">
          {reasons.map((r) => (
            <li key={r.metric}>{decision === "postpone" ? fmtReason(r) : fmtWatch(r)}</li>
          ))}
        </ul>
      )}
      {movedTo?.moved && movedTo.daysLater !== null && (
        <div className="moved-to">
          Re-planned: {whenLabel(movedTo.daysLater)}, {fmtTime(movedTo.moved.start)}–{fmtTime(movedTo.moved.end)}
        </div>
      )}
      {selected && <div className="source">Limit source: {THRESHOLDS[x.type].source}</div>}
    </button>
  );
}
