// Per-level counts of Building 1 parts that are sequenced with a DIFFERENT
// trade than the rest of their sublayer, so the progress bars stay honest:
//   - Walls whose Type is a shear wall: structural core, they rise with the
//     structure, not with the interior partitions.
//   - Doors whose Type is a curtain-wall door: part of the envelope, they go
//     in with the curtain wall, not with the interior doors.
// The layer statistics only give per-field counts, so this reads each node's
// cached attributes (OBJECTID_1, BldgLevel, Type) and de-duplicates across
// levels of detail by object id. Re-run after the model is republished:
//
//   node scripts/extract-type-splits.mjs
//
// Writes src/data/type-splits.json.

import { gunzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const LAYER_URL =
  "https://tiles.arcgis.com/tiles/hAJQfubNy25iblZJ/arcgis/rest/services/Office_Park_Building_1/SceneServer/layers/0";

/** Sublayer -> the Type test that splits it off, and the trade those parts follow. */
const SPLITS = {
  Walls: { match: "Shear Wall", trade: "structure" },
  Doors: { match: "Curtain-Wall", trade: "envelope" },
};

// tiles.arcgis.com returns gzip bodies without a Content-Encoding header.
async function raw(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
}
const get = async (url) => JSON.parse((await raw(url)).toString());

/** Decode one I3S attribute buffer (Oid32 / Int32 / UTF-8 String). */
function decode(buf, info) {
  const count = buf.readUInt32LE(0);
  const type = info.attributeValues.valueType;
  if (type === "String") {
    // header: count, total byte count; then per-value byte counts; then the strings.
    let off = 8;
    const lengths = [];
    for (let i = 0; i < count; i++, off += 4) lengths.push(buf.readUInt32LE(off));
    const out = [];
    for (const n of lengths) {
      out.push(buf.toString("utf8", off, off + n).replace(/\0+$/, ""));
      off += n;
    }
    return out;
  }
  // Numeric values start after the 4-byte header, aligned to their size.
  const out = [];
  for (let i = 0; i < count; i++) out.push(buf.readInt32LE(4 + i * 4));
  return out;
}

const info = await get(`${LAYER_URL}?f=json`);
const flat = [];
const walk = (s) => (s || []).forEach((x) => (flat.push(x), walk(x.sublayers)));
walk(info.sublayers);

const result = { source: { layerUrl: LAYER_URL, extractedAt: new Date().toISOString() }, sublayers: {} };

for (const [name, split] of Object.entries(SPLITS)) {
  const c = flat.find((x) => x.name === name);
  const s = await get(`${LAYER_URL}/sublayers/${c.id}?f=json`);
  const fieldInfo = Object.fromEntries(s.attributeStorageInfo.map((a) => [a.name, a]));
  const perPage = s.nodePages.nodesPerPage;
  const parts = new Map(); // object id -> { level, type }
  for (let page = 0; ; page++) {
    const np = await get(`${LAYER_URL}/sublayers/${c.id}/nodepages/${page}`);
    for (const node of np.nodes) {
      const res = node.mesh?.attribute?.resource;
      if (res === undefined) continue;
      const [ids, levels, types] = await Promise.all(
        ["OBJECTID_1", "BldgLevel", "Type"].map(async (f) =>
          decode(await raw(`${LAYER_URL}/sublayers/${c.id}/nodes/${res}/attributes/${fieldInfo[f].key}/0`), fieldInfo[f]),
        ),
      );
      ids.forEach((id, i) => parts.set(id, { level: levels[i], type: types[i] }));
    }
    if (np.nodes.length < perPage) break;
  }
  const counts = {};
  let total = 0;
  for (const { level, type } of parts.values()) {
    // Null BldgLevel arrives as the Int32 null sentinel; those parts stay hidden anyway.
    if (!type?.includes(split.match) || level < -1000) continue;
    counts[level] = (counts[level] ?? 0) + 1;
    total++;
  }
  result.sublayers[name] = { match: split.match, trade: split.trade, total, parts: parts.size, counts };
  console.log(`${name}: ${parts.size} parts, ${total} "${split.match}" ->`, JSON.stringify(counts));
}

writeFileSync(new URL("../src/data/type-splits.json", import.meta.url), JSON.stringify(result, null, 1) + "\n");
console.log("wrote src/data/type-splits.json");
