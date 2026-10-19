import Graphic from "@arcgis/core/Graphic";
import Polygon from "@arcgis/core/geometry/Polygon";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import SimpleRenderer from "@arcgis/core/renderers/SimpleRenderer";
import { UTILITY_STYLES } from "../config/layers";

// =============================================================================
// Utilities underground: pipes at their recorded depth and size, manholes as
// shafts, and conflicts where networks run under the proposed buildings.
//
// City of Denver data (verified 2026-10-19): storm mains carry upelev/downelev
// (invert, FEET) and width/height (INCHES); sanitary mains carry upelev/
// downelev and diameter (INCHES). Some inverts are null or 0.
// =============================================================================


/**
 * ⚠️ NOMINAL depth below the shown ground, in metres. The city's recorded
 * inverts (feet) do NOT line up with this scene's ground: at Building 2 the
 * Existing_Ground surface is ~1,590.5 m while a 48 in storm main's invert is
 * ~1,598.6 m (likely a different vertical datum, or Existing_Ground is a cut
 * surface). So pipes are drawn at a nominal depth and inverts are shown as
 * recorded attributes only. Verified 2026-10-19.
 */
export const NOMINAL_DEPTH_M = 3;

/**
 * Building footprints, from each model's Walls sublayer extent (axis-aligned
 * bounding boxes, so APPROXIMATE). Building 1's layer extent is corrupt; these are not.
 */
export const FOOTPRINTS: { name: string; box: [number, number, number, number] }[] = [
  { name: "Building 1", box: [-104.99141, 39.69845, -104.99093, 39.69882] },
  { name: "Building 2", box: [-104.9912, 39.69792, -104.99081, 39.69828] },
  { name: "Building 3", box: [-104.99105, 39.6974, -104.99074, 39.69774] },
  { name: "Building 4", box: [-104.99122, 39.69693, -104.99075, 39.69723] },
];

export function footprintPolygon(box: [number, number, number, number]): Polygon {
  const [x0, y0, x1, y1] = box;
  return new Polygon({
    rings: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
    spatialReference: { wkid: 4326 },
  });
}

export const styleFor = (title: string) => UTILITY_STYLES.find((u) => u.match.test(title));

const has = (l: FeatureLayer, f: string) => l.fields?.some((x) => x.name.toLowerCase() === f);

/** The pipe-size field (inches) a layer carries, if any. */
function sizeField(l: FeatureLayer): string | null {
  for (const f of ["diameter", "width", "v_size_inches"]) if (has(l, f)) return l.fields!.find((x) => x.name.toLowerCase() === f)!.name;
  return null;
}

/** True if this feature's depth comes from the city's recorded inverts. */
export function hasRecordedDepth(attrs: Record<string, unknown>): boolean {
  const u = Number(attrs.upelev);
  const d = Number(attrs.downelev);
  return u > 0 && d > 0;
}

/** Mean recorded invert in feet (city datum), or null. */
export function invertFt(attrs: Record<string, unknown>): number | null {
  if (!hasRecordedDepth(attrs)) return null;
  return (Number(attrs.upelev) + Number(attrs.downelev)) / 2;
}

/** Underground: 3D pipes / shafts. */
export function styleUnderground(l: FeatureLayer, color: string): void {
  if (l.geometryType === "polyline") {
    l.elevationInfo = { mode: "relative-to-ground", offset: -NOMINAL_DEPTH_M, featureExpressionInfo: { expression: "0" } };
    const size = sizeField(l);
    l.renderer = new SimpleRenderer({
      symbol: {
        type: "line-3d",
        symbolLayers: [{ type: "path", profile: "circle", width: 0.6, height: 0.6, material: { color }, cap: "round", join: "round" }],
      },
      visualVariables: size
        ? [{ type: "size", field: size, valueUnit: "inches", axis: "width-and-depth" }]
        : [],
    });
  } else {
    // Manholes / inlets: a shaft hanging from the surface down to pipe depth.
    l.elevationInfo = { mode: "relative-to-ground", offset: 0, featureExpressionInfo: { expression: "0" } };
    l.renderer = new SimpleRenderer({
      symbol: {
        type: "point-3d",
        symbolLayers: [
          { type: "object", resource: { primitive: "cylinder" }, width: 1.2, depth: 1.2, height: NOMINAL_DEPTH_M + 0.5, anchor: "top", material: { color } },
        ],
      },
    });
  }
}

/** On the surface: bold lines and dots that read over the mesh and ortho. */
export function styleSurface(l: FeatureLayer, color: string): void {
  l.elevationInfo = { mode: "relative-to-scene", offset: 0.5, featureExpressionInfo: { expression: "0" } };
  l.renderer = new SimpleRenderer({
    symbol:
      l.geometryType === "polyline"
        ? { type: "line-3d", symbolLayers: [{ type: "line", size: 3, material: { color } }] }
        : {
            type: "point-3d",
            symbolLayers: [{ type: "icon", resource: { primitive: "circle" }, size: 7, material: { color }, outline: { color: "#0b1220", size: 1 } }],
          },
  });
}

export interface Conflict {
  id: string;
  building: string;
  layerTitle: string;
  kind: string;
  objectId: number;
  /** e.g. "48 in RCP" */
  spec: string;
  /** Recorded invert, feet (city datum); null if not recorded. */
  invertFt: number | null;
  owner: string | null;
}

/** Utility features that intersect a proposed building footprint. */
export async function findConflicts(layers: FeatureLayer[]): Promise<Conflict[]> {
  const out: Conflict[] = [];
  for (const fp of FOOTPRINTS) {
    const geometry = footprintPolygon(fp.box);
    for (const l of layers) {
      const style = styleFor(l.title ?? "");
      if (!style) continue;
      try {
        const res = await l.queryFeatures({ geometry, spatialRelationship: "intersects", outFields: ["*"], returnGeometry: false });
        for (const f of res.features) {
          const a = f.attributes as Record<string, unknown>;
          const size = a.diameter ?? a.width ?? a.v_size_inches;
          const material = a.material && a.material !== "XXX" ? String(a.material) : "";
          const oid = Number(a[l.objectIdField]);
          out.push({
            id: `${fp.name}:${l.title}:${oid}`,
            building: fp.name,
            layerTitle: l.title ?? "",
            kind: style.label,
            objectId: oid,
            spec: [Number(size) > 0 ? `${size} in` : "", material].filter(Boolean).join(" "),
            invertFt: invertFt(a),
            owner: a.ownedby ? String(a.ownedby) : null,
          });
        }
      } catch (e) {
        console.warn(`[utilities] conflict query failed for ${l.title}`, e);
      }
    }
  }
  return out;
}

/** Footprint outlines + a 3D callout per building with conflicts. */
export function conflictGraphics(conflicts: Conflict[]): Graphic[] {
  const byBuilding = new Map<string, Conflict[]>();
  for (const c of conflicts) byBuilding.set(c.building, [...(byBuilding.get(c.building) ?? []), c]);
  const graphics: Graphic[] = [];
  for (const fp of FOOTPRINTS) {
    const hits = byBuilding.get(fp.name);
    if (!hits) continue;
    const [x0, y0, x1, y1] = fp.box;
    graphics.push(
      new Graphic({
        geometry: footprintPolygon(fp.box),
        symbol: {
          type: "polygon-3d",
          symbolLayers: [{ type: "fill", material: { color: [255, 59, 48, 0.12] }, outline: { color: [255, 90, 78, 1], size: 2.5 } }],
        },
      }),
      new Graphic({
        geometry: { type: "point", longitude: (x0 + x1) / 2, latitude: (y0 + y1) / 2, z: 8, spatialReference: { wkid: 4326 } },
        symbol: {
          type: "point-3d",
          symbolLayers: [
            {
              type: "text",
              text: `⚠ ${hits.length} conflict${hits.length > 1 ? "s" : ""}: ${[...new Set(hits.map((h) => h.kind.toLowerCase()))].join(" + ")} under ${fp.name}`,
              size: 11,
              material: { color: "#ffffff" },
              background: { color: [140, 20, 20, 0.85] },
              font: { weight: "bold" },
            },
          ],
          verticalOffset: { screenLength: 60, maxWorldLength: 200, minWorldLength: 20 },
          callout: { type: "line", size: 1.5, color: "#ff5a4e" },
        },
      }),
    );
  }
  return graphics;
}

/** Site area the networks are clipped to (degrees, with a margin around the development). */
export const SITE_CLIP: [number, number, number, number] = [-104.9945, 39.6955, -104.9875, 39.7015];

/**
 * Replace a city-wide utility layer with a local copy clipped to the site.
 * The live services stream thousands of features and their 3D layer views
 * never settled; a client-side copy of the few hundred we need is instant.
 * The copy keeps the title and sits in the same group, so slides that toggle
 * the "Denver Utilities" group still control it.
 */
export async function clipToSite(l: FeatureLayer): Promise<FeatureLayer> {
  await l.load();
  const res = await l.queryFeatures({
    geometry: footprintPolygon(SITE_CLIP),
    spatialRelationship: "intersects",
    outFields: ["*"],
    returnGeometry: true,
    returnZ: false,
    outSpatialReference: { wkid: 4326 },
  });
  const { default: FL } = await import("@arcgis/core/layers/FeatureLayer");
  const copy = new FL({
    // Same id as the original: authored slides list visible layers BY ID, so a
    // new id would leave the copy hidden on every slide (it was, 2026-10-20).
    id: l.id,
    title: l.title,
    source: res.features,
    fields: l.fields,
    objectIdField: l.objectIdField,
    geometryType: l.geometryType,
    spatialReference: { wkid: 4326 },
    hasZ: false,
    visible: l.visible,
    popupTemplate: l.popupTemplate,
  });
  const parent = l.parent as { layers?: { indexOf(x: unknown): number; add(x: unknown, i?: number): void; remove(x: unknown): void } } | null;
  const collection = parent?.layers;
  if (collection) {
    const i = collection.indexOf(l);
    collection.remove(l);
    collection.add(copy, i);
  }
  await copy.load();
  return copy;
}
