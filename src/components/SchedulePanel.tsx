import { ACTIVITY_LABELS, THRESHOLDS } from "../config/thresholds";
import type { Rescheduled } from "../domain/replan";
import type { ActivityAssessment, Decision } from "../domain/types";
import { fmtDate, fmtReason, fmtTime, fmtWatch } from "../lib/units";
import { displayDate } from "../config/site";
import type { Twin } from "../state/useTwin";
import ReplanCard, { whenLabel } from "./ReplanCard";

// What can go ahead first, then what's at risk (user, 2026-10-20).
const ORDER: Decision[] = ["go", "watch", "postpone"];
const LABEL: Record<Decision, string> = { postpone: "Postpone", watch: "Watch", go: "Proceed" };

interface Props {
  twin: Twin;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Show weather decisions; false = just what's scheduled (before the weather is introduced). */
  decisions?: boolean;
  /** Activity the current beat is about. */
  focusId?: string | null;
  /** Show only this decision's activities (list and map); null = all. */
  filter?: Decision | null;
  onFilter?: (d: Decision | null) => void;
}

export default function SchedulePanel({ twin, selectedId, onSelect, decisions = true, focusId = null, filter = null, onFilter }: Props) {
  const by = (d: Decision) => twin.assessments.filter((a) => a.decision === d);
  // Postponed and Proceed are toggles (user, 2026-10-20): click to show only
  // those activities here and on the map, click again for all.
  const stat = (d: Decision, label: string) => (
    <FilterStat d={d} label={label} count={by(d).length} on={filter === d} onToggle={() => onFilter?.(filter === d ? null : d)} />
  );

  return (
    <aside className="panel panel-left">
      <header className="panel-head">
        <div>
          <div className="eyebrow">Site schedule</div>
          <h2>
            Tomorrow <span className="head-date">{fmtDate(displayDate(twin.day))}</span>
          </h2>
        </div>
      </header>

      {!decisions ? (
        <ScheduledOnly twin={twin} selectedId={selectedId ?? focusId} onSelect={onSelect} />
      ) : (
        <>
      <div className="summary summary-3">
        {stat("postpone", "postponed")}
        <div className="stat watch">
          <b>{by("watch").length}</b>
          <span>watch</span>
        </div>
        {stat("go", "proceed")}
      </div>

      <ReplanCard twin={twin} />

      <div className="activity-list">
        {ORDER.filter((d) => !filter || d === filter).map((d) =>
          by(d).length ? (
            <section key={d}>
              <h3 className={`group ${d}`}>{LABEL[d]}</h3>
              {by(d).map((a) => (
                <ActivityRow
                  key={a.activity.id}
                  a={a}
                  selected={a.activity.id === (selectedId ?? focusId)}
                  onSelect={onSelect}
                  movedTo={twin.replanned ? twin.replans.find((r) => r.original.activity.id === a.activity.id) : undefined}
                />
              ))}
            </section>
          ) : null,
        )}
      </div>
        </>
      )}
    </aside>
  );
}

/** A summary tile that filters the list and map to one decision. */
function FilterStat({ d, label, count, on, onToggle }: { d: Decision; label: string; count: number; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`stat ${d} filter ${on ? "on" : ""}`} aria-pressed={on} onClick={onToggle}>
      <b>{count}</b>
      <span>{label}</span>
    </button>
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
        <span className={`src ${x.source}`}>{x.source === "bim" ? "BIM" : x.source === "derived" ? "Derived" : "Sample"}</span>
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

/** Before the weather is in the story: today's work, no calls yet. */
function ScheduledOnly({
  twin,
  selectedId,
  onSelect,
}: {
  twin: Twin;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const parts = twin.assessments.reduce((n, a) => n + (a.activity.components ?? 0), 0);
  return (
    <>
      <div className="summary summary-2">
        <div className="stat scheduled">
          <b>{twin.assessments.length}</b>
          <span>activities tomorrow</span>
        </div>
        <div className="stat">
          <b>{parts}</b>
          <span>BIM parts to install</span>
        </div>
      </div>
      <div className="activity-list">
        <section>
          <h3 className="group scheduled">Scheduled</h3>
          {twin.assessments.map(({ activity: x }) => (
            <button
              key={x.id}
              type="button"
              className={`activity scheduled ${x.id === selectedId ? "selected" : ""}`}
              onClick={() => onSelect(x.id === selectedId ? null : x.id)}
            >
              <div className="row1">
                <span className="id">{x.id}</span>
                <span className="name">{x.name}</span>
                <span className={`src ${x.source}`}>{x.source === "bim" ? "BIM" : x.source === "derived" ? "Derived" : "Sample"}</span>
              </div>
              <div className="row2">
                {ACTIVITY_LABELS[x.type]} · {x.zone} · {fmtTime(x.start)}–{fmtTime(x.end)}
              </div>
            </button>
          ))}
        </section>
      </div>
    </>
  );
}
