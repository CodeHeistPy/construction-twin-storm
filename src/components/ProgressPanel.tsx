import { useMemo } from "react";
import { buildFinish, buildStart, levelAt, MAX_LEVEL, progressAsOf, TRADES, workingLevel } from "../lib/bim";
import { fmtDate } from "../lib/units";
import { displayDate } from "../config/site";
import type { Twin } from "../state/useTwin";

const DAY = 86_400_000;
const pct = (n: number, d: number) => (d ? (100 * n) / d : 0);

/** One colour per construction layer (trade), in sequence order. */
const LAYER_COLORS: Record<string, string> = {
  Structure: "#5eead4",
  "Curtain wall": "#38bdf8",
  "Interior walls": "#818cf8",
  "Doors & ceilings": "#c084fc",
  "MEP fixtures": "#f472b6",
  "Specialty & casework": "#facc15",
};

/** Layers the panel leaves out (user, 2026-10-20); the 3D build-out still installs them. */
const PANEL_HIDDEN = new Set(["Furniture"]);

/** The phase the build is in on a date, from where the trades are working. */
function phaseAt(day: Date): string {
  const lastLevel = (key: string) => workingLevel(key, day) > MAX_LEVEL;
  if (TRADES.every((t) => lastLevel(t.key))) return "Complete";
  if (!lastLevel("structure")) return "Office Building 1 of 4"; // user, 2026-10-20 (was "Superstructure")
  if (!lastLevel("envelope")) return "Building enclosure";
  return "Interior fit-out";
}

interface Props {
  twin: Twin;
  /** With `endOfDay`, today's work that ran counts as installed and moved work doesn't. */
  endOfDay?: boolean;
  /** During the 4D build-out the panel follows the timeline date. */
  asOf?: Date;
  /** Restart the build-out from the ground. */
  onReset?: () => void;
  /** The presenter's "today" (the day before the storm); defaults to the demo day. */
  today?: Date;
  /** The layer (trade label) the 3D building is filtered to; null = all. */
  layerFilter?: string | null;
  onLayerFilter?: (label: string | null) => void;
}

/**
 * Building 1 progress, laid out like the construction-timelapse reference's
 * "planned construction sequencing" panel (user, 2026-10-20): a day pill, a
 * % complete ring with the current phase, three stat tiles, then one coloured
 * bar per construction layer. Days, never calendar dates.
 */
export default function ProgressPanel({ twin, endOfDay = false, asOf, onReset, today = twin.day, layerFilter = null, onLayerFilter }: Props) {
  const when = asOf ?? today;
  const p = useMemo(() => progressAsOf(when), [when]);
  // The layers shown, and the totals over just those, so the ring matches the list.
  const layers = p.packages.filter((k) => !PANEL_HIDDEN.has(k.label));
  const shownTotal = layers.reduce((n, k) => n + k.total, 0);
  const shownInstalled = layers.reduce((n, k) => n + k.installed, 0);
  const start = useMemo(() => buildStart(), []);
  const finish = useMemo(() => buildFinish(), []);
  const isToday = Math.round((when.getTime() - today.getTime()) / DAY) === 0;
  const elapsed = Math.max(0, Math.round((when.getTime() - start.getTime()) / DAY));
  const remaining = Math.max(0, Math.round((finish.getTime() - when.getTime()) / DAY));

  // Parts that actually went in today = today's BIM work that wasn't postponed.
  const ranToday = twin.assessments
    .filter((a) => a.activity.source === "bim" && a.decision !== "postpone")
    .reduce((n, a) => n + (a.activity.components ?? 0), 0);
  const installed = shownInstalled + (endOfDay ? ranToday : 0);
  const complete = pct(installed, shownTotal);
  const level = Math.max(0, Math.min(MAX_LEVEL, levelAt(when)));
  const phase = phaseAt(when);

  return (
    <aside className="panel panel-left seq">
      <div className="seq-pill">{fmtDate(displayDate(when))}{isToday ? " · Today" : ""}</div>

      <div className="seq-hero">
        <div className="seq-ring" style={{ ["--p" as string]: `${complete}` }}>
          <b>{Math.round(complete)}%</b>
          {/* Total project progress, so it reads apart from the per-layer bars (user). */}
          <span>Total complete</span>
        </div>
        <div className="seq-phase">
          <b>{phase}</b>
          {phase !== "Complete" && (
            <small>
              Level {level} of {MAX_LEVEL}
            </small>
          )}
        </div>
      </div>

      <div className="seq-stats">
        <div>
          <span>Elapsed (days)</span>
          <b>{elapsed}</b>
        </div>
        <div>
          <span>Remaining (days)</span>
          <b>{remaining}</b>
        </div>
      </div>

      <div className="seq-head">
        <span>Installation progress</span>
        {onReset && (
          <button type="button" onClick={onReset}>
            Reset
          </button>
        )}
      </div>

      <div className="seq-layers">
        {layers.map((k) => {
          const share = pct(k.installed, k.total);
          const color = LAYER_COLORS[k.label] ?? "var(--accent)";
          return (
            // Click a layer to show only its parts in the 3D building; again for all.
            <button
              type="button"
              key={k.label}
              className={`seq-layer ${share > 0 || k.today > 0 ? "" : "idle"} ${layerFilter === k.label ? "on" : layerFilter ? "dim" : ""}`}
              style={{ ["--c" as string]: color }}
              aria-pressed={layerFilter === k.label}
              onClick={() => onLayerFilter?.(layerFilter === k.label ? null : k.label)}
            >
              <div className="seq-row">
                <i />
                <span>{k.label}</span>
                <b>{Math.round(share)}%</b>
              </div>
              <div className="seq-bar">
                <i style={{ width: `${share}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
