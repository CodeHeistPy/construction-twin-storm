import { remainingWork } from "../lib/bim";
import { fmtTime } from "../lib/units";
import { planDayLabel } from "../config/site";
import type { Rescheduled } from "../domain/replan";
import type { Twin } from "../state/useTwin";

/** Where postponed work lands, said from the presenter's "today" (day before the storm). */
export const whenLabel = (daysLater: number) => planDayLabel(daysLater);

/** "Adapt the plan": move postponed work to its next workable window and show the knock-on. */
export default function ReplanCard({ twin }: { twin: Twin }) {
  const { replans, replanned, setReplanned } = twin;
  if (!replans.length) return null;

  return (
    <section className={`replan ${replanned ? "on" : ""}`}>
      <header>
        <div>
          <div className="eyebrow">Adapt the plan</div>
          <b>
            {replanned
              ? `${replans.filter((r) => r.daysLater !== null).length} of ${replans.length} postponed activities re-planned`
              : `${replans.length} activities can't run tomorrow`}
          </b>
        </div>
        <div className="replan-actions">
          <button type="button" className={replanned ? "" : "primary"} onClick={() => setReplanned(!replanned)}>
            {replanned ? "Undo" : "Re-plan"}
          </button>
        </div>
      </header>
      {replanned && (
        <ul>
          {replans.map((r) => (
            <ReplanRow key={r.original.activity.id} r={r} day={twin.day} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReplanRow({ r, day }: { r: Rescheduled; day: Date }) {
  const a = r.original.activity;
  const knock = a.bimSublayers?.length ? remainingWork(a.bimSublayers, day) : null;
  return (
    <li>
      <div className="move">
        <span className="id">{a.id}</span>
        {r.daysLater !== null && r.moved ? (
          <span>
            → <b>{whenLabel(r.daysLater)}</b>, {fmtTime(r.moved.start)}–{fmtTime(r.moved.end)}
          </span>
        ) : (
          <span className="none">No workable window in the forecast yet</span>
        )}
      </div>
      {knock && r.daysLater !== null && (
        <div className="knock">
          +{r.daysLater} day{r.daysLater > 1 ? "s" : ""} to {a.name.replace(/^Install /, "").replace(/ \(.*\)$/, "")}{" "}
          completion · {knock.installDays} install days, {knock.parts.toLocaleString()} parts still ahead
        </div>
      )}
    </li>
  );
}
