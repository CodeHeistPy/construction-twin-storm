// Extracts the install schedule from the Building Scene Layer's per-field
// statistics into src/data/bim-schedule.json, so the demo never depends on a
// live statistics call on stage. Re-run after the model is republished:
//
//   node scripts/extract-bim-schedule.mjs
//
// Source: web scene 7b4a2a0217b244568c74cbe636936c52 (arcaec org, public),
// layer Office_Park_Building_1, field Installation_Date (string, YYYY.MM.DD).

import { gunzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const LAYER_TITLE = "Office_Park_Building_1";
const LAYER_URL =
  "https://tiles.arcgis.com/tiles/hAJQfubNy25iblZJ/arcgis/rest/services/Office_Park_Building_1/SceneServer/layers/0";
const FIELD = "Installation_Date";

// tiles.arcgis.com returns gzip bodies without a Content-Encoding header.
async function get(url) {
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const text = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString() : buf.toString();
  return JSON.parse(text);
}

/** Normalise the field's string to YYYY-MM-DD; null if unparseable. Keep in sync with lib/bim.ts. */
function normalise(raw) {
  const s = String(raw ?? "").trim();
  const parts = s.split(".");
  let y, m, d;
  if (parts.length === 3) [y, m, d] = parts.map(Number);
  else {
    const digits = s.replace(/\D/g, "");
    if (digits.length !== 8) return null;
    [y, m, d] = [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].map(Number);
  }
  if (!y || !m || !d || m > 12 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const info = await get(`${LAYER_URL}?f=json`);
const flat = [];
const walk = (s) => (s || []).forEach((x) => (flat.push(x), walk(x.sublayers)));
walk(info.sublayers);

const byDay = {};
const sublayers = [];
const malformed = [];
/** Element count per BldgLevel per sublayer (dated + undated), for derived dates. */
const levels = {};
for (const c of flat.filter((x) => x.layerType === "3DObject" && x.id !== 0)) {
  const s = await get(`${LAYER_URL}/sublayers/${c.id}?f=json`);
  const lv = (s.statisticsInfo || []).find((x) => x.name === "BldgLevel");
  if (lv) {
    const ls = (await get(`${LAYER_URL}/sublayers/${c.id}/${lv.href}`)).stats;
    levels[c.name] = Object.fromEntries((ls.mostFrequentValues || []).map((v) => [String(v.value), v.count]).sort((a, b) => Number(a[0]) - Number(b[0])));
  }
  const st = (s.statisticsInfo || []).find((x) => x.name === FIELD);
  sublayers.push({ id: c.id, name: c.name, hasDate: !!st });
  if (!st) continue;
  const stats = (await get(`${LAYER_URL}/sublayers/${c.id}/${st.href}`)).stats;
  for (const { value, count } of stats.mostFrequentValues) {
    const day = normalise(value);
    if (!day) {
      malformed.push({ sublayer: c.name, value, count, normalisedTo: null });
      continue;
    }
    if (!/^\d{4}\.\d{2}\.\d{2}$/.test(value)) malformed.push({ sublayer: c.name, value, count, normalisedTo: day });
    (byDay[day] ??= {})[c.name] = (byDay[day]?.[c.name] ?? 0) + count;
  }
}

const e = info.fullExtent;
const out = {
  source: { webSceneId: "61a325c274ea4118999c9079c8b6e356", layerTitle: LAYER_TITLE, layerUrl: LAYER_URL, field: FIELD },
  extractedAt: new Date().toISOString(),
  extent: e,
  sublayers,
  levels,
  malformed,
  byDay: Object.fromEntries(Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b))),
};
writeFileSync(new URL("../src/data/bim-schedule.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
const days = Object.keys(out.byDay);
console.log(`${days.length} install days, ${days[0]} → ${days.at(-1)}; ${malformed.length} malformed values; extent wkid ${e?.spatialReference?.wkid}`);
console.log("malformed:", malformed.map((m) => `${m.sublayer} ${JSON.stringify(m.value)}×${m.count}→${m.normalisedTo}`).join("; "));
console.log("extent:", JSON.stringify(e));
for (const [n, m] of Object.entries(levels)) console.log(`  ${n.padEnd(20)} ${Object.values(m).reduce((a, b) => a + b, 0)} elements over ${Object.keys(m).length} levels`);
