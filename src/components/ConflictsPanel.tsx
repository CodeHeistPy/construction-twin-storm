import type { Conflict } from "../lib/utilities";

/**
 * Utility conflicts under the proposed buildings: the "found before we dig"
 * outcome for the Spatial Data Foundation.
 */
export default function ConflictsPanel({ conflicts }: { conflicts: Conflict[] | null }) {
  const buildings = conflicts ? [...new Set(conflicts.map((c) => c.building))] : [];
  return (
    <aside className="panel panel-left conflicts-panel">
      <header className="panel-head">
        <div>
          <div className="eyebrow">Below grade</div>
          <h2>Utility conflicts</h2>
        </div>
      </header>

      {conflicts === null ? (
        <p className="note">Checking the networks against the building footprints…</p>
      ) : (
        <>
          <div className="conflict-hero">
            <b>{conflicts.length}</b>
            <span>
              utility conflict{conflicts.length === 1 ? "" : "s"} under {buildings.length} proposed building
              {buildings.length === 1 ? "" : "s"}, found before excavation
            </span>
          </div>
          <ul className="conflict-list">
            {conflicts.map((c) => (
              <li key={c.id}>
                <div className="c-head">
                  <span className={`dot ${c.kind.toLowerCase()}`} />
                  <b>{c.kind}</b> {/manhole/i.test(c.layerTitle) ? "manhole" : /inlet/i.test(c.layerTitle) ? "inlet" : "main"}
                  <span className="c-bldg">{c.building}</span>
                </div>
                <div className="c-meta">
                  {[c.spec, c.invertFt !== null ? `invert ${Math.round(c.invertFt).toLocaleString()} ft` : "invert not recorded", c.owner].filter(Boolean).join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="footnote">
        City of Denver storm and sanitary networks. Pipes drawn at a nominal depth; inverts as recorded by the city.
        Footprints are the models' bounding boxes, so treat them as approximate.
      </p>
    </aside>
  );
}
