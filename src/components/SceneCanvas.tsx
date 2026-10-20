import { useEffect, useRef, useState } from "react";
import { ArcgisBuildingExplorer, ArcgisExpand, ArcgisLayerList, ArcgisScene, ArcgisSlice } from "@arcgis/map-components-react";
import type { ArcgisBuildingExplorer as BuildingExplorerElement } from "@arcgis/map-components/components/arcgis-building-explorer/customElement";
import type { ArcgisSlice as SliceElement } from "@arcgis/map-components/components/arcgis-slice/customElement";
import type SliceAnalysis from "@arcgis/core/analysis/SliceAnalysis";
import Graphic from "@arcgis/core/Graphic";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Point from "@arcgis/core/geometry/Point";
import Polygon from "@arcgis/core/geometry/Polygon";
import type SceneView from "@arcgis/core/views/SceneView";
import SunLighting from "@arcgis/core/views/3d/environment/SunLighting";
import RainyWeather from "@arcgis/core/views/3d/environment/RainyWeather";
import CloudyWeather from "@arcgis/core/views/3d/environment/CloudyWeather";
import SunnyWeather from "@arcgis/core/views/3d/environment/SunnyWeather";
import type BuildingSceneLayer from "@arcgis/core/layers/BuildingSceneLayer";
import type BuildingComponentSublayer from "@arcgis/core/layers/buildingSublayers/BuildingComponentSublayer";
import type BuildingGroupSublayer from "@arcgis/core/layers/buildingSublayers/BuildingGroupSublayer";
import WebScene from "@arcgis/core/WebScene";
import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer";
import * as webMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import { SITE, WEBSCENE_ID } from "../config/site";
import type { CameraPreset, SceneMode, SlideView } from "../config/tour";
import Camera from "@arcgis/core/Camera";
import { roleOf } from "../config/layers";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import { clipToSite, findConflicts, styleFor, styleSurface, styleUnderground, type Conflict } from "../lib/utilities";
import type { Activity, Decision } from "../domain/types";
import {
  BIM_LAYER_TITLE,
  BUILDING_1,
  DATED_SUBLAYERS,
  partsWhere,
  HIDE_DURING_BUILD,
  statusArcade,
  STRUCTURE_SUBLAYERS,
  type TodayClass,
} from "../lib/bim";
import { ellipseRing } from "../lib/geo";
import type { Twin } from "../state/useTwin";

/** Display status: a decision, postponed work that has been re-planned, or scheduled (no call yet). */
export type Status = Decision | "rescheduled" | "scheduled";

export const DECISION_COLORS: Record<Status, string> = {
  scheduled: "#39d0ff",
  rescheduled: "#a78bfa",
  postpone: "#ff5a4e",
  watch: "#ffb547",
  go: "#3ddc84",
};

/** Our own layers (storm, markers, conflicts). Slides don't know them, so re-show after a slide. */
const APP_LAYER_TITLES = new Set(["Storm cell (scripted)", "Planned activities", "Utility conflicts"]);
export function restoreAppLayers(view: SceneView): void {
  view.map?.layers.forEach((l) => {
    // The conflicts layer is NOT re-shown here: it belongs to the utilities
    // stop only (re-showing it on every slide made the flags flash).
    if (APP_LAYER_TITLES.has(l.title ?? "") && l.title !== "Utility conflicts") l.visible = true;
  });
}

/**
 * Hide the utility networks (group + members). Authored slides after Current
 * Utilities still list them as visible; outside the utilities stop they must
 * stay off (user, 2026-10-20).
 */
export function hideUtilities(view: SceneView): void {
  view.map?.allLayers.forEach((l) => {
    if (l.type !== "graphics" && roleOf(l.title) === "utilities") l.visible = false;
  });
}

export interface CameraRequest {
  /** "none" = leave the camera where it is. */
  preset: CameraPreset | "focus" | "none";
  /** Bump to re-fly to the same preset. */
  key: number;
}

interface Props {
  twin: Twin;
  mode: SceneMode;
  /** Activity the beat is about (work-face zoom + highlight). */
  focusId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  camera: CameraRequest;
  /** Apply layer visibility by role (built-in stops). Authored slides set their own. */
  applyLayers: boolean;
  /** 4D: the date Building 1 is shown as of (site-midnight instant). */
  timelineDay: Date;
  onView?: (view: SceneView) => void;
  /** Slowly orbit Building 1 (while the 4D build-out plays). */
  orbit?: boolean;
  /** The stop being flown TO shows utilities (set at take-off, not landing). */
  allowUtilities?: boolean;
  /** Hide the other buildings (2-4) so the 4D build-out has the stage (and the frame rate). */
  isolateBuilding?: boolean;
  /** Building sublayers to keep off on this stop. */
  hideSublayers?: { layer: string; sublayers: string[] }[];
  /** Only show markers for activities with this decision (null = all). */
  markerFilter?: Decision | null;
  /** Building 1: show only these sublayers (one trade, picked in the progress panel); null = all. */
  onlySublayers?: string[] | null;
  onConflicts?: (c: Conflict[]) => void;
}

const mesh = (color: number[], mix: "tint" | "replace" = "replace") => ({
  type: "mesh-3d" as const,
  symbolLayers: [{ type: "fill" as const, material: { color, colorMixMode: mix } }],
});

const hex = (h: string, a = 1) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(a);

const INSTALLED = mesh([235, 238, 245, 1], "tint");
const HIDDEN = mesh([0, 0, 0, 0]);

function statusRenderer(valueExpression: string) {
  const today = (c: TodayClass, symbol: ReturnType<typeof mesh>) => ({ value: `today-${c}`, symbol });
  return new UniqueValueRenderer({
    valueExpression,
    defaultSymbol: INSTALLED,
    uniqueValueInfos: [
      { value: "installed", symbol: INSTALLED },
      { value: "nodate", symbol: INSTALLED },
      // Not installed yet: hidden, so the building reads as it stands.
      { value: "upcoming", symbol: HIDDEN },
      today("hidden", HIDDEN),
      today("done", INSTALLED),
      today("dim", mesh([200, 205, 215, 1], "tint")),
      today("scheduled", mesh(hex(DECISION_COLORS.scheduled))),
      today("postpone", mesh(hex(DECISION_COLORS.postpone))),
      today("watch", mesh(hex(DECISION_COLORS.watch))),
      today("go", mesh(hex(DECISION_COLORS.go))),
      today("rescheduled", mesh(hex(DECISION_COLORS.rescheduled))),
    ],
  });
}

/** How one sublayer's "today" components show in a given mode. */
function todayClass(mode: SceneMode, decision: Decision, replanned: boolean, inFocus: boolean, hasFocus: boolean): TodayClass {
  switch (mode.bim) {
    case "progress":
      return "hidden";
    case "scheduled":
      return hasFocus && !inFocus ? "dim" : "scheduled";
    case "outcome":
      return decision === "postpone" ? "rescheduled" : "done";
    default:
      if (hasFocus && !inFocus) return "dim";
      return replanned && decision === "postpone" ? "rescheduled" : decision;
  }
}

/** Marker status for an activity in a given mode. */
function markerStatus(mode: SceneMode, decision: Decision, replanned: boolean): Status {
  if (mode.bim === "scheduled") return "scheduled";
  return replanned && decision === "postpone" ? "rescheduled" : decision;
}

/** Minimum clearance of a saved horizontal slice above the ground on the utilities stop (m). */
const SLICE_ABOVE_GRADE_M = 1.5;

/** Envelope sublayers made see-through when the focus work is inside the building. */
const ENVELOPE = ["Walls", "CurtainWallPanels", "CurtainWallMullions", "Roofs"];

/** A point on the terrain surface (absolute z), for camera targets. */
async function onGround(view: SceneView, longitude: number, latitude: number, above = 0): Promise<Point> {
  const p = new Point({ longitude, latitude });
  const ground = view.map!.ground;
  // At startup the ground layers are still loading (and one, Roadway_Ground,
  // isn't public), so wait for them to settle and retry briefly.
  await ground.loadAll().catch(() => undefined);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const sampled = await ground.queryElevation(p);
      const g = sampled.geometry as Point;
      if (Number.isFinite(g.z)) return new Point({ longitude, latitude, z: (g.z ?? 0) + above });
    } catch {
      // fall through to retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.warn("[camera] terrain height unavailable; camera may sit too low");
  return p;
}

interface Shot {
  at: { longitude: number; latitude: number };
  /** Metres above ground to aim at. */
  above?: number;
  scale: number;
  tilt: number;
  heading: number;
}

const mid = (a: { longitude: number; latitude: number }, b: { longitude: number; latitude: number }) => ({
  longitude: (a.longitude + b.longitude) / 2,
  latitude: (a.latitude + b.latitude) / 2,
});

/**
 * The user's two slide views, copied from the original web scene's slides
 * (Web Mercator camera positions, absolute z: Denver is ~1,600 m up; sun times
 * as saved, about 1 pm site time).
 */
const SLIDE_VIEWS: Record<SlideView, { position: { x: number; y: number; z: number }; heading: number; tilt: number; sun: number }> = {
  schedule: { position: { x: -11687800.532987272, y: 4822331.038066762, z: 1694.748021907173 }, heading: 112.80272465343161, tilt: 68.43068231452831, sun: 1773601198000 },
  adjustment: { position: { x: -11687625.02634604, y: 4822451.720885995, z: 1706.327830764465 }, heading: 167.50746775902107, tilt: 60.71242942782043, sun: 1773601198000 },
};
const isSlideView = (p: string): p is SlideView => p in SLIDE_VIEWS;

const SHOTS: Record<Exclude<CameraPreset, SlideView>, Shot> = {
  site: { at: SITE, scale: 3500, tilt: 60, heading: 20 },
  development: { at: mid(SITE, BUILDING_1), scale: 2600, tilt: 62, heading: 340 },
  building: { at: BUILDING_1, above: 30, scale: 900, tilt: 70, heading: 25 },
  overview: { at: SITE, scale: 60_000, tilt: 55, heading: 30 },
  // Low, looking across Buildings 1-2 at pipe depth (where the conflicts are).
  underground: { at: { longitude: -104.99105, latitude: 39.69815 }, above: -2, scale: 900, tilt: 72, heading: 250 },
  storm: { at: { longitude: SITE.longitude - 0.08, latitude: SITE.latitude - 0.06 }, scale: 220_000, tilt: 50, heading: 225 },
};

/**
 * Switch building sublayers off and keep them off: a slide's flight re-applies
 * its saved sublayer visibility asynchronously, after we've hidden them. The
 * returned cleanup puts back what the slide had; the next slide then applies
 * its own visibility on top.
 */
function keepOff(subs: { visible: boolean }[]): () => void {
  const authored = new Map(subs.map((s) => [s, s.visible]));
  subs.forEach((s) => (s.visible = false));
  const handles = subs.map((s) =>
    reactiveUtils.watch(
      () => s.visible,
      (v) => {
        if (!v) return;
        authored.set(s, true);
        s.visible = false;
      },
    ),
  );
  return () => {
    handles.forEach((h) => h.remove());
    authored.forEach((v, s) => (s.visible = v));
  };
}

/** The orbit circles this point on Building 1: metres above its ground, about mid-height of the structure on "Today" (level 8). */
const ORBIT_TARGET_ABOVE_M = 16;

/**
 * Framing for a picked activity (user, 2026-10-20: "zoom in and center more
 * effectively", the same for every point, smooth between them).
 *  - SELECT_SCALE: the same close distance for every pick.
 *  - SELECT_LIFT_M: centre on the drawn pin, which sits on a short leader line
 *    above its anchor (the marker symbol's verticalOffset), not on the anchor.
 *  - Points away from Building 1's core are approached from OUTSIDE: the
 *    camera looks past the point toward the building, so nothing stands
 *    between them (points on the far side were seen through the building).
 */
const SELECT_SCALE = 280;
/** Pins float at least this high above their part on a leader line (marker verticalOffset). */
const MARKER_LIFT_M = 8;
const SELECT_LIFT_M = MARKER_LIFT_M + 1; // the pin icon's centre
const SELECT_TILT = 65;
/** Points closer than this to Building 1's centre (the core, the roof) keep the current heading. */
const SELECT_CORE_M = 8;
const SELECT_FLIGHT = { duration: 1800, easing: "cubic-in-out" } as const;

/** Compass bearing (degrees) from a point to Building 1's centre, and how far it is. */
function towardBuilding(lon: number, lat: number): { heading: number; metres: number } {
  const k = Math.cos((lat * Math.PI) / 180);
  const dx = (BUILDING_1.longitude - lon) * 111_320 * k;
  const dy = (BUILDING_1.latitude - lat) * 110_540;
  return { heading: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360, metres: Math.hypot(dx, dy) };
}

function shotFor(a: Activity): Shot {
  // Wide enough to read the whole band of today's parts on the building.
  return { at: a.location, above: a.location.z, scale: 1000, tilt: 66, heading: a.viewHeading ?? 30 };
}

export default function SceneCanvas({ twin, mode, focusId, selectedId, onSelect, camera, applyLayers, timelineDay, onView, onConflicts, orbit = false, allowUtilities = false, isolateBuilding = false, hideSublayers, markerFilter = null, onlySublayers = null }: Props) {
  const [view, setView] = useState<SceneView | null>(null);
  const [loaded, setLoaded] = useState(false);
  // One WebScene for the life of the app. Letting <arcgis-scene> load it from
  // item-id made it re-create (and abort) the map on re-renders.
  const [map] = useState(() =>
    WEBSCENE_ID
      ? new WebScene({ portalItem: { id: WEBSCENE_ID } })
      : new WebScene({ basemap: "dark-gray-vector", ground: "world-elevation" }),
  );
  const layers = useRef<{ activities: GraphicsLayer; storm: GraphicsLayer; conflicts: GraphicsLayer } | null>(null);
  const utilitiesRef = useRef<FeatureLayer[]>([]);
  const conflictsRef = useRef<Conflict[] | null>(null);
  const onConflictsRef = useRef(onConflicts);
  onConflictsRef.current = onConflicts;
  useEffect(() => {
    if (view) onView?.(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const explorerRef = useRef<BuildingExplorerElement>(null);
  const sliceRef = useRef<SliceElement>(null);
  const allowUtilitiesRef = useRef(allowUtilities);
  allowUtilitiesRef.current = allowUtilities;
  const undergroundRef = useRef(mode.underground);
  undergroundRef.current = mode.underground;

  // A slide can carry its own slice (Scene Viewer saves it in the slide's
  // elements). Hand that slice to the Slice tool so the presenter can move /
  // flip / clear it, instead of the tool starting a second, separate one.
  useEffect(() => {
    if (!view) return;
    const sync = () => {
      const slice = view.analyses.find((a) => a.type === "slice") as SliceAnalysis | undefined;
      if (!slice) return;
      const tool = sliceRef.current;
      if (tool && tool.analysis !== slice) tool.analysis = slice;
      // The pipes must NOT be sliced: a slice hides everything on the cut-away
      // side, so the pipes vanished exactly where the ground was removed (and
      // on the kept side they're under opaque ground). Excluded, they sit in
      // the opening at depth.
      for (const l of utilitiesRef.current) {
        if (!slice.excludedLayers.includes(l)) slice.excludedLayers.add(l);
      }
      // On the utilities stop the slice STARTS above the ground (user): the
      // presenter drags it down live. The slide's saved plane (~1,607 m) already
      // is; if a re-saved one ever dips below grade, lift it just clear of the
      // highest ground under it. Footprint, heading and size are kept.
      const shape = slice.shape;
      if (undergroundRef.current && shape?.position && Math.abs(shape.tilt) < 5 && !checked.has(slice)) {
        checked.add(slice);
        const pos = shape.position;
        // The ground slopes across the footprint, so sample a 3x3 grid over the
        // plane (its width/height are in the position's map units, rotated by
        // its heading) and compare with the HIGHEST point.
        const r = ((shape.heading ?? 0) * Math.PI) / 180;
        const samples: Promise<Point>[] = [];
        for (const u of [-0.5, 0, 0.5])
          for (const w of [-0.5, 0, 0.5]) {
            const dx = u * shape.width;
            const dy = w * shape.height;
            const pt = pos.clone();
            pt.x = pos.x + dx * Math.cos(r) + dy * Math.sin(r);
            pt.y = pos.y - dx * Math.sin(r) + dy * Math.cos(r);
            const ll = webMercatorUtils.webMercatorToGeographic(pt) as Point;
            samples.push(onGround(view, ll.longitude!, ll.latitude!, 0));
          }
        Promise.all(samples).then((pts) => {
          const zs = pts.map((g) => g.z).filter((z): z is number => z !== undefined && Number.isFinite(z));
          if (!zs.length) return;
          const highest = Math.max(...zs);
          if ((pos.z ?? 0) >= highest + SLICE_ABOVE_GRADE_M) return; // already above grade
          const next = shape.clone();
          const p = pos.clone();
          p.z = highest + SLICE_ABOVE_GRADE_M;
          next.position = p;
          slice.shape = next;
        });
      }
    };
    const checked = new WeakSet<object>();
    sync();
    const h = view.analyses.on("change", sync);
    return () => h.remove();
    // Re-run on entering the utilities stop too (the slide may add its slice
    // first); the "already above grade" check makes repeats harmless.
  }, [view, loaded, mode.underground]);
  /** Activity id -> where its components actually are in Building 1 (client-side query). */
  const [placed, setPlaced] = useState<Map<string, Activity["location"]>>(new Map());
  const located = (a: Activity): Activity => ({ ...a, location: placed.get(a.id) ?? a.location });
  const bimRef = useRef<{
    layer: BuildingSceneLayer;
    dated: BuildingComponentSublayer[];
    structure: BuildingComponentSublayer[];
    hide: BuildingComponentSublayer[];
    original: Map<BuildingComponentSublayer, BuildingComponentSublayer["renderer"]>;
    /** Groups holding tracked sublayers, with their as-authored visibility. */
    groups: Map<BuildingGroupSublayer, boolean>;
  } | null>(null);

  // One-time setup once the view is ready: our layers, lighting, click.
  useEffect(() => {
    if (!view || !map) return;
    const storm = new GraphicsLayer({ title: "Storm cell (scripted)", elevationInfo: { mode: "on-the-ground" } });
    const activities = new GraphicsLayer({ title: "Planned activities", elevationInfo: { mode: "relative-to-ground" } });
    const conflicts = new GraphicsLayer({ title: "Utility conflicts", listMode: "hide", elevationInfo: { mode: "relative-to-ground" } });
    map.addMany([storm, activities, conflicts]);
    layers.current = { activities, storm, conflicts };
    view.environment.lighting = new SunLighting({ directShadowsEnabled: true });

    const handle = view.on("click", async (e) => {
      const hit = await view.hitTest(e, { include: [activities] });
      const g = hit.results.find((r) => r.type === "graphic");
      onSelectRef.current(g && g.type === "graphic" ? (g.graphic.attributes?.id ?? null) : null);
    });
    return () => {
      handle.remove();
      map.removeMany([storm, activities, conflicts]);
      layers.current = null;
    };
  }, [view, map]);

  // Wait for the web scene's layers (loadAll rejects if any layer fails, and
  // some aren't public), then prepare Building 1 and the Building Explorer.
  useEffect(() => {
    if (!view || !map) return;
    let cancelled = false;
    (async () => {
      await map.loadAll().catch(() => undefined);
      // The Topographic 3D basemap as designed (user, 2026-10-20): its 3D
      // "Buildings" on (the scene saved them off), but its 3D "Trees" off, as
      // there are no trees anywhere (user), besides the site's Planting
      // (ALWAYS_HIDDEN).
      [...(map.basemap?.baseLayers.toArray() ?? []), ...(map.basemap?.referenceLayers.toArray() ?? [])].forEach((l) => {
        if (/^trees$/i.test(l.title ?? "")) l.visible = false;
        if (/^buildings$/i.test(l.title ?? "")) l.visible = true;
      });
      // A ground layer that failed to load (Roadway_Ground is private) leaves
      // ground-relative layers waiting on elevation forever. Drop it.
      map.ground.layers
        .filter((l) => l.loadStatus === "failed")
        .toArray()
        .forEach((l) => {
          console.info(`[layers] removed failed ground layer "${l.title}"`);
          map.ground.layers.remove(l);
        });
      const unmatched = map.layers
        .filter((l) => l.type !== "graphics" && roleOf(l.title) === null)
        .map((l) => l.title)
        .toArray();
      if (unmatched.length) console.info("[layers] not in LAYER_RULES (left as-is):", unmatched);

      // Utilities: collect them; styled for the surface or underground per stop.
      const cityWide = map.allLayers
        .filter((l) => l.type === "feature" && roleOf(l.title) === "utilities" && !!styleFor(l.title ?? ""))
        .toArray() as FeatureLayer[];
      utilitiesRef.current = (
        await Promise.all(
          cityWide.map((l) =>
            clipToSite(l).catch((e) => {
              console.warn(`[utilities] could not clip ${l.title}; using the live layer`, e);
              return l;
            }),
          ),
        )
      ).filter(Boolean);
      for (const fl of utilitiesRef.current) styleSurface(fl, styleFor(fl.title ?? "")!.color);

      const buildings = map.allLayers
        .filter((l) => l.type === "building-scene" && l.loadStatus === "loaded")
        .toArray() as BuildingSceneLayer[];
      buildings.sort((a, b) => Number(b.title === BIM_LAYER_TITLE) - Number(a.title === BIM_LAYER_TITLE));
      if (explorerRef.current) explorerRef.current.layers = buildings;

      const bsl = buildings.find((l) => l.title === BIM_LAYER_TITLE);
      if (!bsl) console.warn(`[bim] layer "${BIM_LAYER_TITLE}" not found in the web scene`);
      else {
        const pick = (names: string[]) =>
          bsl.allSublayers
            .filter((s) => s.type === "building-component" && names.includes(s.modelName ?? ""))
            .toArray() as BuildingComponentSublayer[];
        const dated = pick(DATED_SUBLAYERS);
        const structure = pick(STRUCTURE_SUBLAYERS);
        const hide = pick(HIDE_DURING_BUILD);
        const all = [...dated, ...structure, ...hide];
        // Each sublayer must be loaded first, or loading overwrites the renderer.
        await Promise.all(all.map((s) => s.load()));
        // The scene ships some discipline groups off (Structural, Piping,
        // Electrical), which hides their trades' parts however they're rendered.
        const tracked = new Set<object>([...dated, ...structure]);
        const groups = new Map<BuildingGroupSublayer, boolean>();
        bsl.allSublayers.forEach((s) => {
          if (s.type === "building-group" && (s as BuildingGroupSublayer).sublayers.some((c) => tracked.has(c)))
            groups.set(s as BuildingGroupSublayer, s.visible);
        });
        bimRef.current = { layer: bsl, dated, structure, hide, groups, original: new Map(all.map((s) => [s, s.renderer?.clone()])) };
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [view, map]);

  // Utilities only ever show on the utilities stop. Slides after it still list
  // them as visible and switch them on part-way through their flight, so watch
  // the layers and switch them straight back off (no flash).
  useEffect(() => {
    if (!view || !map || !loaded) return;
    const nets = map.allLayers
      .filter((l) => l.type !== "graphics" && roleOf(l.title) === "utilities")
      .toArray();
    if (!allowUtilities) nets.forEach((l) => (l.visible = false));
    const handles = nets.map((l) =>
      reactiveUtils.watch(
        () => l.visible,
        (v) => {
          if (v && !allowUtilitiesRef.current) l.visible = false;
        },
      ),
    );
    return () => handles.forEach((h) => h.remove());
  }, [view, map, loaded, allowUtilities]);

  // During the 4D build-out only Building 1 (and the site) draw: Buildings 2-4
  // go off for focus and frame rate (hidden sublayers aren't fetched). The
  // slide's flight re-applies its sublayer visibility after this runs, so keep
  // them off with a watcher. On leaving, put back what the build-out slide had;
  // the next slide then applies its own visibility on top.
  useEffect(() => {
    if (!map || !loaded || !isolateBuilding) return;
    const tops = map.allLayers
      .filter((l) => l.type === "building-scene" && roleOf(l.title) === "proposed")
      .toArray()
      .flatMap((l) => (l as BuildingSceneLayer).sublayers?.toArray() ?? []); // none if it failed to load
    return keepOff(tops);
  }, [map, loaded, isolateBuilding]);

  // Per-stop sublayers off (e.g. the site's Planting on Current Design), same way.
  const hideKey = JSON.stringify(hideSublayers ?? []);
  useEffect(() => {
    const wanted = JSON.parse(hideKey) as NonNullable<Props["hideSublayers"]>;
    if (!map || !loaded || !wanted.length) return;
    const subs = wanted.flatMap(({ layer, sublayers }) => {
      const bsl = map.allLayers.find((l) => l.type === "building-scene" && l.title === layer) as BuildingSceneLayer | undefined;
      return bsl?.allSublayers?.filter((s) => sublayers.includes(s.modelName ?? s.title ?? "")).toArray() ?? [];
    });
    return keepOff(subs);
  }, [map, loaded, hideKey]);

  // Built-in stops set layer visibility by role. (Authored slides set their own.)
  // Group members follow their group (the scene ships the utilities off).
  useEffect(() => {
    if (!map || !loaded || !applyLayers) return;
    const L = mode.layers;
    map.allLayers.forEach((l) => {
      if (l.type === "graphics") return;
      switch (roleOf(l.title)) {
        case "reality":
          l.visible = L.reality;
          break;
        case "utilities":
          l.visible = L.utilities;
          break;
        case "mesh":
          l.visible = L.mesh;
          break;
        case "focusBuilding":
        case "site":
          l.visible = L.proposed !== "none";
          break;
        case "proposed":
          l.visible = L.proposed === "all";
          break;
      }
    });
    // A visible layer inside a hidden group doesn't draw (its view is
    // suspended), e.g. the buildings inside the scene's "Building Design"
    // group. Switch on the parent groups of anything we just showed.
    map.allLayers.forEach((l) => {
      if (l.type === "graphics" || !l.visible || roleOf(l.title) === null) return;
      let parent = (l as { parent?: unknown }).parent as { type?: string; visible?: boolean; parent?: unknown } | undefined;
      while (parent && parent.type === "group") {
        parent.visible = true;
        parent = parent.parent as typeof parent;
      }
    });
  }, [map, loaded, applyLayers, mode.layers]);

  // Underground: see-through ground, pipes at depth, conflicts flagged.
  useEffect(() => {
    if (!view || !map || !loaded) return;
    const ground = map.ground;
    const handles: { remove(): void }[] = [];
    let cancelled = false;
    for (const fl of utilitiesRef.current) {
      const color = styleFor(fl.title ?? "")!.color;
      if (mode.underground) styleUnderground(fl, color);
      else styleSurface(fl, color);
    }
    layers.current?.conflicts.removeAll();
    if (layers.current) layers.current.conflicts.visible = mode.underground;
    if (!mode.underground) {
      hideUtilities(view);
      ground.opacity = 1;
      ground.navigationConstraint = { type: "stay-above" };
      // Don't carry the utilities slide's slice into the next stops.
      view.analyses.removeMany(view.analyses.filter((a) => a.type === "slice"));
      return;
    }
    // Ground stays opaque: the presenter reveals the pipes with the Slice tool
    // (user, 2026-10-20). Allow the camera below grade for the cut view.
    ground.opacity = 1;
    ground.navigationConstraint = { type: "none" };
    (async () => {
      if (!conflictsRef.current) conflictsRef.current = await findConflicts(utilitiesRef.current);
      if (cancelled) return;
      const found = conflictsRef.current;
      onConflictsRef.current?.(found);
      // No 3D conflict flags and no red highlight on the conflicting pipes
      // (both removed per user, 2026-10-20). The conflicts panel remains.
    })();
    return () => {
      cancelled = true;
      handles.forEach((h) => h.remove());
    };
  }, [view, map, loaded, mode.underground]);

  // Building 1: as designed, or filtered to progress and coloured by today's plan.
  useEffect(() => {
    const bim = bimRef.current;
    if (!loaded || !bim) return;
    const focus = twin.assessments.find((a) => a.activity.id === focusId)?.activity;
    const focusSubs = new Set(focus?.bimSublayers ?? []);
    const decisionFor = new Map<string, Decision>();
    for (const { activity, decision } of twin.assessments)
      for (const s of activity.bimSublayers ?? []) decisionFor.set(s, decision);

    // Every Building 1 element renders from its install date: the model's own
    // date, or a DERIVED one by level and trade where the model has none
    // (lib/bim.ts). The structure therefore rises from the ground up in 4D.
    const building = mode.bim === "timeline";
    const design = mode.bim === "design";
    for (const [group, authored] of bim.groups) group.visible = design ? authored : true;
    // A Building Explorer level filter (left on level 8, say) draws that level
    // solid, x-rays the ones below and hides the ones above, which swamps the
    // progress colours. Clear it whenever the app is colouring Building 1.
    const explorer = explorerRef.current;
    if (!design && explorer && !explorer.levelDisabled) explorer.level = undefined;
    for (const sub of [...bim.dated, ...bim.structure]) {
      const name = sub.modelName ?? "";
      if (mode.bim === "design") {
        sub.renderer = bim.original.get(sub)?.clone() ?? null;
        continue;
      }
      if (building) {
        // 4D: in place before the timeline date, that day's work highlighted, the rest hidden.
        sub.renderer = statusRenderer(statusArcade(timelineDay, "scheduled", name));
        continue;
      }
      // Sublayers with work in today's plan take its decision colour; the rest
      // just show what's in place (today's derived work counts as done).
      const cls: TodayClass = decisionFor.has(name)
        ? todayClass(mode, decisionFor.get(name)!, twin.replanned, focusSubs.has(name), !!focus)
        : mode.bim === "progress"
          ? "hidden"
          : "done";
      sub.renderer = statusRenderer(statusArcade(twin.day, cls, name));
    }
    for (const sub of bim.hide) {
      sub.renderer = building ? statusRenderer(`return "upcoming";`) : (bim.original.get(sub)?.clone() ?? null);
    }

    // Inside work: make the envelope see-through so the highlighted parts show.
    const seeThrough = !!focus && focus.type === "interior";
    bim.layer.allSublayers.forEach((s) => {
      if (s.type === "building-component" && ENVELOPE.includes(s.modelName ?? "")) {
        (s as BuildingComponentSublayer).opacity = seeThrough ? 0.15 : 1;
      }
    });
  }, [loaded, mode, focusId, twin.assessments, twin.day, twin.replanned, timelineDay]);

  // A layer picked in the progress panel: only that trade's parts draw.
  const onlyKey = onlySublayers?.join(",") ?? "";
  useEffect(() => {
    const bim = bimRef.current;
    if (!loaded || !bim) return;
    const only = onlyKey ? onlyKey.split(",") : null;
    for (const sub of [...bim.dated, ...bim.structure]) sub.visible = !only || only.includes(sub.modelName ?? "");
  }, [loaded, onlyKey]);

  // Which parts to pin markers to. Keyed by content: the assessments array is
  // rebuilt as the clock moves, and each rebuild cancelled the (slower) pass.
  const bimTargets = JSON.stringify(
    twin.assessments
      .filter(({ activity: a }) => a.bimSublayers?.length)
      .map(({ activity: a }) => [a.id, a.bimWhere ?? "", a.bimSublayers]),
  );

  // Pin each BIM activity's marker on one of its real parts: sample the parts
  // on that level, and take the one nearest the camera (a perimeter column, a
  // panel on the facing façade), keeping markers a few metres apart so labels
  // don't pile up. Before, they sat at the building's centre and stacked over
  // the roof. Falls back to the configured spot.
  useEffect(() => {
    const bim = bimRef.current;
    if (!view || !loaded || !bim || !mode.markers) return;
    let cancelled = false;
    (async () => {
      // Client-side queries only see streamed-in parts: wait for the stop's
      // camera to land and the view to finish loading (or give up after 8 s).
      await Promise.race([
        reactiveUtils.whenOnce(() => view.stationary && !view.updating),
        new Promise((r) => setTimeout(r, 8000)),
      ]);
      if (cancelled) return;
      type Extent = { zmax?: number; center: { x: number; y: number; longitude?: number; latitude?: number } };
      type SubView = {
        sublayer: { modelName?: string; objectIdField?: string };
        queryObjectIds(q: { where: string }): Promise<number[]>;
        queryExtent(q: { where: string }): Promise<{ count: number; extent: Extent | null }>;
      };
      const lv = (await view.whenLayerView(bim.layer)) as unknown as { sublayerViews: { find(fn: (s: SubView) => boolean): SubView | undefined } };
      // Never let a slow query hold the markers up on stage.
      const within = <T,>(p: Promise<T>, ms: number) =>
        Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
      const cam = view.camera.position;
      const taken: { x: number; y: number; z: number }[] = [];
      const SAMPLE = 60;
      const MIN_GAP_M = 6;
      const next = new Map<string, Activity["location"]>();
      const targets = JSON.parse(bimTargets) as [string, string, string[]][];
      // Parts stream in after the camera lands, so a first pass can miss some
      // trades: retry those for up to ~30 s (the app now opens cold on these
      // stops, so nothing is preloaded by earlier slides).
      for (let attempt = 0; attempt < 12 && !cancelled; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, 2500));
        for (const [id, bimWhere, sublayers] of targets) {
          if (next.has(id)) continue;
          const level = Number(bimWhere.match(/BldgLevel = (\d+)/)?.[1]);
          // Interior parts (furniture, fixtures) may not be streamed in at this
          // distance: then anchor on a column of the same level instead.
          const anchors = Number.isFinite(level) ? [...new Set([...sublayers, "StructuralColumns"])] : sublayers;
          for (const name of anchors) {
            const sv = lv.sublayerViews.find((x) => x.sublayer.modelName === name);
            const oid = sv?.sublayer.objectIdField;
            if (!sv || !oid) continue;
            try {
              const where = Number.isFinite(level) ? partsWhere(name, level) : bimWhere || "1=0";
              const ids = await within(sv.queryObjectIds({ where }), 4000);
              if (!ids.length) continue;
              const step = Math.max(1, Math.floor(ids.length / SAMPLE));
              const sample = ids.filter((_, i) => i % step === 0).slice(0, SAMPLE);
              const parts = (await within(Promise.all(sample.map((oidValue) => sv.queryExtent({ where: `${oid} = ${oidValue}` }))), 4000))
                .map((r) => r.extent)
                .filter((e): e is Extent => !!e && e.zmax !== undefined)
                .map((e) => ({ e, d: Math.hypot(e.center.x - cam.x, e.center.y - cam.y) }))
                .sort((a, b) => a.d - b.d);
              const free = (e: Extent) => taken.every((t) => Math.hypot(t.x - e.center.x, t.y - e.center.y, t.z - e.zmax!) >= MIN_GAP_M);
              const pick = (parts.find((x) => free(x.e)) ?? parts[0])?.e;
              if (!pick || pick.center.longitude === undefined) continue;
              taken.push({ x: pick.center.x, y: pick.center.y, z: pick.zmax! });
              const ground = await onGround(view, pick.center.longitude, pick.center.latitude!, 0);
              next.set(id, {
                longitude: pick.center.longitude,
                latitude: pick.center.latitude!,
                z: Math.max(2, pick.zmax! - (ground.z ?? 0)),
              });
              break;
            } catch {
              // keep the configured location
            }
          }
        }
        if (cancelled || next.size === targets.length) break;
        if (next.size) setPlaced((prev) => new Map([...prev, ...next]));
      }
      // Keep earlier finds if this pass found fewer (parts may have unloaded).
      if (!cancelled) setPlaced((prev) => (next.size >= prev.size ? next : new Map([...prev, ...next])));
    })();
    return () => {
      cancelled = true;
    };
  }, [view, loaded, bimTargets, mode.markers, camera]);

  // Activity markers.
  useEffect(() => {
    const layer = layers.current?.activities;
    if (!layer) return;
    layer.removeAll();
    if (!mode.markers) return;
    layer.addMany(
      twin.assessments.filter(({ decision }) => !markerFilter || decision === markerFilter).map(({ activity, decision }) => {
        const a = located(activity);
        const selected = a.id === selectedId || a.id === focusId;
        const color = DECISION_COLORS[markerStatus(mode, decision, twin.replanned)];
        return new Graphic({
          geometry: new Point({ longitude: a.location.longitude, latitude: a.location.latitude, z: a.location.z }),
          attributes: { id: a.id },
          symbol: {
            type: "point-3d",
            symbolLayers: [
              {
                type: "icon",
                resource: { primitive: "circle" },
                size: selected ? 22 : 14,
                material: { color },
                outline: { color: selected ? "#ffffff" : "#0b1220", size: selected ? 3 : 1.5 },
              },
              {
                type: "text",
                text: a.id,
                size: selected ? 11 : 9,
                material: { color: "#ffffff" },
                halo: { color: "#0b1220", size: 1.5 },
                verticalAlignment: "bottom",
              },
            ],
            // At least MARKER_LIFT_M up, so a pin clears the slab overhang or podium it is
            // pinned under when zoomed in close (it was hidden behind them).
            verticalOffset: { screenLength: 24, maxWorldLength: 40, minWorldLength: MARKER_LIFT_M },
            callout: { type: "line", size: 1, color },
          },
        });
      }),
    );
  }, [map, mode, twin.assessments, twin.replanned, selectedId, focusId, placed, markerFilter]);

  // Scripted storm cell: outer rain shield + core, moving with the clock.
  useEffect(() => {
    const layer = layers.current?.storm;
    if (!layer) return;
    layer.removeAll();
    const s = twin.storm;
    if (!s || !mode.storm) return;
    const ring = (rx: number, ry: number) =>
      new Polygon({ rings: [ellipseRing(s.longitude, s.latitude, rx, ry, 90 - s.heading)], spatialReference: { wkid: 4326 } });
    layer.addMany([
      new Graphic({
        geometry: ring(28_000, 16_000),
        symbol: {
          type: "polygon-3d",
          symbolLayers: [{ type: "fill", material: { color: [80, 140, 255, 0.18] }, outline: { color: [120, 170, 255, 0.6], size: 1.5 } }],
        },
      }),
      new Graphic({
        geometry: ring(9_000, 5_000),
        symbol: {
          type: "polygon-3d",
          symbolLayers: [{ type: "fill", material: { color: [255, 80, 120, 0.3] }, outline: { color: [255, 120, 150, 0.9], size: 2 } }],
        },
      }),
    ]);
  }, [map, twin.storm, mode.storm]);

  // Sun follows the clock; scene weather follows conditions (only once the storm is in the story).
  useEffect(() => {
    // Authored slides bring their own lighting and weather: don't override
    // them (the sun used to jump to the app's clock on every slide).
    if (!view || !applyLayers) return;
    const lighting = view.environment.lighting;
    // The slide views keep their saved sun; other stops follow the clock.
    if (lighting instanceof SunLighting) lighting.date = isSlideView(camera.preset) ? new Date(SLIDE_VIEWS[camera.preset].sun) : twin.clock;
    const w = twin.now;
    if (!w || !mode.storm) {
      view.environment.weather = new SunnyWeather({ cloudCover: 0.2 });
    } else if (w.precipitation >= 1) {
      view.environment.weather = new RainyWeather({
        cloudCover: Math.min(1, 0.6 + w.precipitation / 50),
        precipitation: Math.min(1, w.precipitation / 20),
      });
    } else if (w.windSpeed >= 8 || w.precipitation > 0) {
      view.environment.weather = new CloudyWeather({ cloudCover: 0.7 });
    } else {
      view.environment.weather = new SunnyWeather({ cloudCover: 0.2 });
    }
  }, [view, twin.clock, twin.now, mode.storm, applyLayers, camera.preset]);

  // Camera: presets, or the beat's focus activity. Targets are terrain-sampled
  // (a missing z means sea level, ~1,600 m under Denver). The first shot jumps.
  useEffect(() => {
    if (!view || camera.preset === "none") return;
    const animation = camera.key === 0 ? { animate: false } : { duration: 2500 };
    if (isSlideView(camera.preset)) {
      // An exact saved camera: absolute position, no terrain sampling needed.
      const v = SLIDE_VIEWS[camera.preset];
      view
        .goTo(new Camera({ position: new Point({ ...v.position, spatialReference: { wkid: 102100 } }), heading: v.heading, tilt: v.tilt }), animation)
        .catch(() => undefined);
      return;
    }
    let shot: Shot | undefined;
    if (camera.preset === "focus") {
      const a = twin.assessments.find((x) => x.activity.id === focusId)?.activity;
      shot = a ? shotFor(located(a)) : SHOTS.building;
    } else if (camera.preset === "storm" && twin.storm) {
      // Frame the site and wherever the storm is right now, looking toward it.
      const st = twin.storm;
      const km = Math.max(20, Math.abs(st.distanceKm));
      shot = { at: mid(SITE, st), scale: km * 1000 * 4.5, tilt: 52, heading: (st.heading + 180) % 360 };
    } else shot = SHOTS[camera.preset];
    const s = shot;
    let cancelled = false;
    onGround(view, s.at.longitude, s.at.latitude, s.above ?? 0).then((target) => {
      if (cancelled) return;
      view
        .goTo({ target, scale: s.scale, tilt: s.tilt, heading: s.heading }, animation)
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, camera]);

  // Fly to an activity picked in the panel or on the map: the same close,
  // centred framing on its drawn pin every time, approached from outside the
  // building, with one smooth eased flight from wherever the camera is (a new
  // pick mid-flight just takes over). Centred in the visible area: target goTo
  // honours view.padding (the panel).
  useEffect(() => {
    if (!view || !selectedId) return;
    const found = twin.assessments.find((x) => x.activity.id === selectedId)?.activity;
    if (!found) return;
    const a = located(found);
    let cancelled = false;
    const toward = towardBuilding(a.location.longitude, a.location.latitude);
    const heading = toward.metres > SELECT_CORE_M ? toward.heading : view.camera.heading;
    onGround(view, a.location.longitude, a.location.latitude, (a.location.z ?? 0) + SELECT_LIFT_M).then((target) => {
      if (cancelled) return;
      view.goTo({ target, scale: SELECT_SCALE, tilt: SELECT_TILT, heading }, SELECT_FLIGHT).catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedId]);

  // Slow orbit around Building 1 while the build-out plays: keeps the shot alive.
  // It circles the BUILDING (not whatever ground is mid-screen) and keeps it
  // centred in the visible area right of the panel (user, 2026-10-20): each
  // frame frames a fixed point on Building 1, which goTo centres within
  // view.padding. The target has an absolute, terrain-sampled z, so the
  // camera's altitude stays constant (no drift into the site).
  useEffect(() => {
    if (!view || !orbit) return;
    let raf = 0;
    let stopped = false;
    (async () => {
      // Start only once any camera flight has finished, so we never fight it.
      await reactiveUtils.whenOnce(() => view.stationary && !view.animation);
      const target = await onGround(view, BUILDING_1.longitude, BUILDING_1.latitude, ORBIT_TARGET_ABOVE_M);
      if (stopped) return;
      // Keep the shot's distance: the view's scale is measured at its centre,
      // so rescale it to the building's distance from the camera. (Web
      // Mercator stretches x/y by 1/cos(latitude); undo that to compare with z.)
      const cam = view.camera;
      const k = 1 / Math.cos((SITE.latitude * Math.PI) / 180);
      const dist = (pt: { x: number; y: number; z?: number }) =>
        Math.hypot((pt.x - cam.position.x) / k, (pt.y - cam.position.y) / k, (pt.z ?? 0) - (cam.position.z ?? 0));
      const t = webMercatorUtils.geographicToWebMercator(target) as Point;
      const scale = view.scale * (dist(t) / Math.max(1, dist(view.center)));
      const tilt = cam.tilt;
      let heading = cam.heading;
      // Ease the building into the centre, then circle it.
      await view.goTo({ target, heading, tilt, scale }, { duration: 1500 }).catch(() => undefined);
      if (stopped) return;
      const step = () => {
        if (stopped) return;
        heading = (heading + 0.05) % 360; // degrees per frame, gentle: fast orbits starve the per-step redraws
        view.goTo({ target, heading, tilt, scale }, { animate: false }).catch(() => undefined);
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [view, orbit]);

  // Pad the view so its corner UI and camera targets sit in the visible gap
  // between the overlay panels. Re-measured when panels come and go.
  useEffect(() => {
    if (!view) return;
    const measure = () => {
      const rect = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
      const left = rect(".panel-left");
      const right = rect(".panel-right");
      const top = rect(".topbar");
      const presenter = rect(".presenter");
      const gap = 12;
      const padding = {
        left: left ? left.right + gap : 0,
        right: right ? window.innerWidth - right.left + gap : 0,
        top: top ? top.bottom + gap : 0,
        // Keep camera targets above the presenter card.
        bottom: presenter ? window.innerHeight - presenter.top + gap : 0,
      };
      // Authored slides were framed full-screen in Scene Viewer: padding would
      // shift that framing (and re-centre mid-flight as panels come and go).
      view.padding = applyLayers ? padding : { left: 0, right: 0, top: 0, bottom: 0 };
      // Slotted components (the expands) ignore view.padding; offset via CSS.
      const scene = document.querySelector<HTMLElement>(".scene");
      scene?.style.setProperty("--ui-left", `${padding.left}px`);
      scene?.style.setProperty("--ui-top", `${padding.top}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    document.querySelectorAll(".panel, .topbar").forEach((el) => ro.observe(el));
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  });

  return (
    <ArcgisScene
      className="scene calcite-mode-dark"
      map={map}
      // No camera props: they're re-applied on every render (snapping the camera
      // back), and a fixed altitude ends up underground at Denver's ~1,600 m.
      onArcgisViewReadyChange={(e) => {
        const el = e.target as unknown as { view: SceneView; ready: boolean };
        if (el.ready) setView(el.view);
      }}
    >
      {/* Native SDK widgets, collapsed to buttons; one open at a time. */}
      <ArcgisExpand slot="top-left" group="scene-tools" expandIcon="layers" expandTooltip="Layers">
        <ArcgisLayerList showHeading label="Layers" />
      </ArcgisExpand>
      <ArcgisExpand slot="top-left" group="scene-tools" expandIcon="organization" expandTooltip="Building Explorer">
        <ArcgisBuildingExplorer ref={explorerRef} />
      </ArcgisExpand>
      <ArcgisExpand slot="top-left" group="scene-tools" expandIcon="slice" expandTooltip="Slice">
        <ArcgisSlice ref={sliceRef} />
      </ArcgisExpand>
    </ArcgisScene>
  );
}
