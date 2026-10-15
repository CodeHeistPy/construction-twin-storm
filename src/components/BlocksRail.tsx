import { BUILDING_BLOCKS, type BlockId } from "../config/buildingBlocks";

/** The six Digital Twin building blocks; lit blocks are part of the current beat. */
export function BlocksRail({ lit }: { lit: Set<BlockId> }) {
  return (
    <ol className="blocks-rail" aria-label="Digital twin building blocks">
      {BUILDING_BLOCKS.map((b) => (
        <li key={b.id} className={lit.has(b.id) ? "lit" : ""} title={`${b.title}: ${b.appRole}`}>
          <span className="n">{b.n}</span>
          <span className="t">{b.short}</span>
        </li>
      ))}
    </ol>
  );
}

/** Small tag that marks which building block a panel demonstrates. */
export function BlockTag({ id }: { id: BlockId }) {
  const b = BUILDING_BLOCKS.find((x) => x.id === id)!;
  return (
    <span className="block-tag" title={b.title}>
      <span className="n">{b.n}</span>
      {b.short}
    </span>
  );
}
