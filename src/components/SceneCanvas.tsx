import { useEffect, useMemo, useRef, useState } from "react";
import { ArcgisBuildingExplorer, ArcgisExpand, ArcgisLayerList, ArcgisScene } from "@arcgis/map-components-react";
import type { ArcgisBuildingExplorer as BuildingExplorerElement } from "@arcgis/map-components/components/arcgis-building-explorer/customElement";
import Graphic from "@arcgis/core/Graphic";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Point from "@arcgis/core/geometry/Point";
import type SceneView from "@arcgis/core/views/SceneView";
import SunLighting from "@arcgis/core/views/3d/environment/SunLighting";
import SunnyWeather from "@arcgis/core/views/3d/environment/SunnyWeather";
import type BuildingSceneLayer from "@arcgis/core/layers/BuildingSceneLayer";
import type BuildingComponentSublayer from "@arcgis/core/layers/buildingSublayers/BuildingComponentSublayer";
import type BuildingGroupSublayer from "@arcgis/core/layers/buildingSublayers/BuildingGroupSublayer";
import WebScene from "@arcgis/core/WebScene";
import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer";
import * as webMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import { SITE, WEBSCENE_ID } from "../config/site";
import type { SceneMode, SlideView } from "../config/tour";
import Camera from "@arcgis/core/Camera";
import { roleOf } from "../config/layers";
import type { Activity, Decision } from "../domain/types";
import {
  BIM_LAYER_TITLE,
  BUILDING_1,
  DATED_SUBLAYERS,
  partsWhere,
  HIDE_DURING_BUILD,
  levelAt,
  splitTrade,
  statusArcade,
  STRUCTURE_SUBLAYERS,
  TRADES,
  type TodayClass,
} from "../lib/bim";
import type { Twin } from "../state/useTwin";

/** Display status: a decision, postponed work that has been re-planned, or scheduled (no call yet). */
export type Status = Decision | "rescheduled" | "scheduled";

/**
 * The level going in during the 4D build-out (user, 2026-10-20: the cyan read
 * as confusing). A soft sage green, a shade apart from Proceed's green.
 */
const BUILD_OUT_COLOR = "#7ccf8b";

export const DECISION_COLORS: Record<Status, string> = {
  scheduled: "#39d0ff",
  rescheduled: "#a78bfa",
  postpone: "#ff5a4e",
  watch: "#ffb547",
  go: "#3ddc84",
};

export interface CameraRequest {
  preset: SlideView;
  /** Bump to re-fly to the same preset. */
  key: number;
}

interface Props {
  twin: Twin;
  mode: SceneMode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  camera: CameraRequest;
  /** 4D: the date Building 1 is shown as of (site-midnight instant). */
  timelineDay: Date;
  onView?: (view: SceneView) => void;
  /** Slowly orbit Building 1 (while the 4D build-out plays). */
  orbit?: boolean;
  /** Hide the other buildings (2-4) so Building 1 has the stage (and the frame rate). */
  isolateBuilding?: boolean;
  /** Building sublayers to keep off. */
  hideSublayers?: { layer: string; sublayers: string[] }[];
  /** Metres above Building 1's ground the orbit circles (mid-height of what's built). */
  orbitTargetAbove?: number;
  /** Only show markers for activities with this decision (null = all). */
  markerFilter?: Decision | null;
  /** Building 1: show only these sublayers (one trade, picked in the progress panel); null = all. */
  onlySublayers?: string[] | null;
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
      today("building", mesh(hex(BUILD_OUT_COLOR))),
      today("postpone", mesh(hex(DECISION_COLORS.postpone))),
      today("watch", mesh(hex(DECISION_COLORS.watch))),
      today("go", mesh(hex(DECISION_COLORS.go))),
      today("rescheduled", mesh(hex(DECISION_COLORS.rescheduled))),
    ],
  });
}

/** How one sublayer's "today" components show in a given mode. */
function todayClass(mode: SceneMode, decision: Decision, replanned: boolean): TodayClass {
  if (mode.bim === "scheduled") return "scheduled";
  return replanned && decision === "postpone" ? "rescheduled" : decision;
}

/** Marker status for an activity in a given mode. */
function markerStatus(mode: SceneMode, decision: Decision, replanned: boolean): Status {
  if (mode.bim === "scheduled") return "scheduled";
  return replanned && decision === "postpone" ? "rescheduled" : decision;
}

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

/**
 * The views' cameras, copied from the user's slides in the original web scene
 * (Web Mercator camera positions, absolute z: Denver is ~1,600 m up; sun times
 * as saved, about 1 pm site time).
 */
const SLIDE_VIEWS: Record<SlideView, { position: { x: number; y: number; z: number }; heading: number; tilt: number; sun: number }> = {
  schedule: { position: { x: -11687800.532987272, y: 4822331.038066762, z: 1694.748021907173 }, heading: 112.80272465343161, tilt: 68.43068231452831, sun: 1773601198000 },
  // Completed Building: the schedule view's heading, pulled back 1.75x and
  // aimed at mid-height of the finished 16-level tower (~33 m up).
  completion: { position: { x: -11687978.246085212, y: 4822395.644396591, z: 1747.5090383375527 }, heading: 110, tilt: 70.1, sun: 1773601198000 },
  adjustment: { position: { x: -11687625.02634604, y: 4822451.720885995, z: 1706.327830764465 }, heading: 167.50746775902107, tilt: 60.71242942782043, sun: 1773601198000 },
};
/**
 * Switch building sublayers off and keep them off (the scene can re-apply its
 * saved visibility asynchronously, after we've hidden them). The returned
 * cleanup puts back what was there.
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

/** The orbit circles this point on Building 1: metres above its ground (the build-out view's framing). */
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
const SELECT_SCALE = 200; // user, 2026-10-21: "a little more closely" (was 280)
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

export default function SceneCanvas({ twin, mode, selectedId, onSelect, camera, timelineDay, onView, orbit = false, isolateBuilding = false, hideSublayers, markerFilter = null, onlySublayers = null, orbitTargetAbove = ORBIT_TARGET_ABOVE_M }: Props) {
  const [view, setView] = useState<SceneView | null>(null);
  const [loaded, setLoaded] = useState(false);
  // One WebScene for the life of the app. Letting <arcgis-scene> load it from
  // item-id made it re-create (and abort) the map on re-renders.
  const [map] = useState(() =>
    WEBSCENE_ID
      ? new WebScene({ portalItem: { id: WEBSCENE_ID } })
      : new WebScene({ basemap: "dark-gray-vector", ground: "world-elevation" }),
  );
  const activitiesRef = useRef<GraphicsLayer | null>(null);
  useEffect(() => {
    if (view) onView?.(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const explorerRef = useRef<BuildingExplorerElement>(null);

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

  // One-time setup once the view is ready: the markers layer, lighting, click.
  useEffect(() => {
    if (!view || !map) return;
    const activities = new GraphicsLayer({ title: "Planned activities", elevationInfo: { mode: "relative-to-ground" } });
    map.add(activities);
    activitiesRef.current = activities;
    view.environment.lighting = new SunLighting({ directShadowsEnabled: true });
    view.environment.weather = new SunnyWeather({ cloudCover: 0.2 });

    const handle = view.on("click", async (e) => {
      const hit = await view.hitTest(e, { include: [activities] });
      const g = hit.results.find((r) => r.type === "graphic");
      onSelectRef.current(g && g.type === "graphic" ? (g.graphic.attributes?.id ?? null) : null);
    });
    return () => {
      handle.remove();
      map.remove(activities);
      activitiesRef.current = null;
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

  // Only Building 1 (and the site) draw: Buildings 2-4 go off for focus and
  // frame rate (hidden sublayers aren't fetched), kept off with a watcher.
  useEffect(() => {
    if (!map || !loaded || !isolateBuilding) return;
    const tops = map.allLayers
      .filter((l) => l.type === "building-scene" && roleOf(l.title) === "proposed")
      .toArray()
      .flatMap((l) => (l as BuildingSceneLayer).sublayers?.toArray() ?? []); // none if it failed to load
    return keepOff(tops);
  }, [map, loaded, isolateBuilding]);

  // Sublayers kept off (the site's Planting), the same way.
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

  // Layer visibility by role. Group members follow their group.
  useEffect(() => {
    if (!map || !loaded) return;
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
  }, [map, loaded, mode.layers]);

  // A picked Proceed activity on a floor below the top: cut Building 1 away
  // above that floor so the work inside shows (user, 2026-10-21). Postponed,
  // top-floor and site picks (or none) show the whole building.
  const cutAbove = useMemo(() => {
    const picked = twin.assessments.find((x) => x.activity.id === selectedId);
    if (!picked || picked.decision !== "go") return null;
    const level = Number(picked.activity.bimWhere?.match(/BldgLevel = (\d+)/)?.[1]);
    return Number.isFinite(level) && level < levelAt(twin.day) ? level : null;
  }, [selectedId, twin.assessments, twin.day]);

  // Building 1: as designed, or filtered to progress and coloured by today's plan.
  useEffect(() => {
    const bim = bimRef.current;
    if (!loaded || !bim) return;
    const decisionFor = new Map<string, Decision>();
    for (const { activity, decision } of twin.assessments)
      for (const s of activity.bimSublayers ?? []) decisionFor.set(s, decision);

    // Every Building 1 element renders from its trade's working level on the
    // date (lib/bim.ts), so the building rises from the ground up in 4D.
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
        sub.renderer = statusRenderer(statusArcade(timelineDay, "building", name));
        continue;
      }
      // Sublayers with work in today's plan take its decision colour; the rest
      // just show what's in place.
      const classFor = (sublayer: string): TodayClass =>
        decisionFor.has(sublayer) ? todayClass(mode, decisionFor.get(sublayer)!, twin.replanned) : "done";
      // Split-off parts (core shear walls, curtain-wall doors) take their own
      // trade's call: a curtain-wall door goes red with the postponed glazing.
      const splitKey = splitTrade(name);
      const splitRep = splitKey ? TRADES.find((t) => t.key === splitKey)?.sublayers[0] : undefined;
      const cls = classFor(name);
      sub.renderer = statusRenderer(statusArcade(twin.day, cls, name, cutAbove, splitRep ? classFor(splitRep) : cls));
    }
    for (const sub of bim.hide) {
      sub.renderer = building ? statusRenderer(`return "upcoming";`) : (bim.original.get(sub)?.clone() ?? null);
    }
  }, [loaded, mode, twin.assessments, twin.day, twin.replanned, timelineDay, cutAbove]);

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
      // trades: retry those for up to ~30 s (the app opens cold, so nothing is
      // preloaded).
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
    const layer = activitiesRef.current;
    if (!layer) return;
    layer.removeAll();
    if (!mode.markers) return;
    layer.addMany(
      twin.assessments.filter(({ decision }) => !markerFilter || decision === markerFilter).map(({ activity, decision }) => {
        const a = located(activity);
        const selected = a.id === selectedId;
        // With a pin picked, the rest fade so the picked one stands out (user, 2026-10-20).
        const faded = !!selectedId && !selected;
        const alpha = faded ? 0.22 : 1;
        const color = hex(DECISION_COLORS[markerStatus(mode, decision, twin.replanned)], alpha);
        return new Graphic({
          geometry: new Point({ longitude: a.location.longitude, latitude: a.location.latitude, z: a.location.z }),
          attributes: { id: a.id },
          symbol: {
            type: "point-3d",
            // Pins sat on parts of the same colour (a green pin on green work,
            // red on red) and vanished (user, 2026-10-21): keep the decision
            // colour, but on a dark backing disc with a white ring, and a white
            // leader with a dark edge, so they read on any background.
            symbolLayers: [
              {
                type: "icon",
                resource: { primitive: "circle" },
                size: (selected ? 22 : 14) + 7,
                material: { color: hex("#0b1220", faded ? 0.2 : 0.9) },
              },
              {
                type: "icon",
                resource: { primitive: "circle" },
                size: selected ? 22 : 14,
                material: { color },
                outline: { color: hex("#ffffff", faded ? 0.25 : 1), size: selected ? 3 : 2 },
              },
              {
                type: "text",
                text: a.id,
                size: selected ? 11 : 9,
                material: { color: hex("#ffffff", faded ? 0.3 : 1) },
                halo: { color: hex("#0b1220", faded ? 0.15 : 1), size: 1.5 },
                verticalAlignment: "bottom",
              },
            ],
            // At least MARKER_LIFT_M up, so a pin clears the slab overhang or podium it is
            // pinned under when zoomed in close (it was hidden behind them).
            verticalOffset: { screenLength: 24, maxWorldLength: 40, minWorldLength: MARKER_LIFT_M },
            callout: { type: "line", size: 1.5, color: hex("#ffffff", faded ? 0.2 : 0.95), border: { color: hex("#0b1220", faded ? 0.15 : 0.9) } },
          },
        });
      }),
    );
  }, [map, mode, twin.assessments, twin.replanned, selectedId, placed, markerFilter]);

  // Camera: the view's exact saved camera (absolute position, no terrain
  // sampling needed) and its saved sun. The first shot jumps.
  useEffect(() => {
    if (!view) return;
    const v = SLIDE_VIEWS[camera.preset];
    const lighting = view.environment.lighting;
    if (lighting instanceof SunLighting) lighting.date = new Date(v.sun);
    view
      .goTo(new Camera({ position: new Point({ ...v.position, spatialReference: { wkid: 102100 } }), heading: v.heading, tilt: v.tilt }), camera.key === 0 ? { animate: false } : { duration: 2500 })
      .catch(() => undefined);
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
  // The camera circles a fixed point on the building at its CURRENT distance
  // and height (the saved view's), and aims a little left / up of it so the
  // building sits centred in the visible area right of the panel (user,
  // 2026-10-20). Built from real distances only: deriving the distance from
  // view.scale / view.center went wrong on a cold load (the camera flew out
  // ~2.7 km), because the centre's ground wasn't loaded yet.
  useEffect(() => {
    if (!view || !orbit) return;
    let raf = 0;
    let stopped = false;
    (async () => {
      // Start only once any camera flight has finished, so we never fight it.
      await reactiveUtils.whenOnce(() => view.stationary && !view.animation);
      const ground = await onGround(view, BUILDING_1.longitude, BUILDING_1.latitude, orbitTargetAbove);
      if (stopped) return;
      const t = webMercatorUtils.geographicToWebMercator(ground) as Point;
      // Web Mercator stretches x/y by k = 1/cos(latitude); work in true metres.
      const k = 1 / Math.cos((SITE.latitude * Math.PI) / 180);
      const c = view.camera.position;
      const east = (c.x - t.x) / k;
      const north = (c.y - t.y) / k;
      const up = (c.z ?? 0) - (t.z ?? 0);
      const radius = Math.hypot(east, north); // horizontal distance, kept
      const height = up; // height above the target, kept
      let bearing = (Math.atan2(-east, -north) * 180) / Math.PI; // camera -> building
      const lookTilt = (Math.atan2(radius, height) * 180) / Math.PI; // 0 = down, 90 = level
      // Aim offset so the target lands mid-way in the padded (visible) area,
      // not mid-screen (the panel covers the left). Start from EXACTLY the
      // current camera (the view's saved camera already frames the building), so the
      // first orbit frame doesn't move; then each frame measure where the target
      // lands and drift the aim gently toward the visible centre. (A computed
      // first guess overshot: the camera panned left, then swung back; user,
      // 2026-10-22.)
      const f = Math.hypot(view.width, view.height) / 2 / Math.tan(((view.camera.fov ?? 55) * Math.PI) / 360);
      const visibleCentre = () => {
        const pad = view.padding;
        return {
          x: (pad.left ?? 0) + (view.width - (pad.left ?? 0) - (pad.right ?? 0)) / 2,
          y: (pad.top ?? 0) + (view.height - (pad.top ?? 0) - (pad.bottom ?? 0)) / 2,
        };
      };
      const deg = (r: number) => (r * 180) / Math.PI;
      const cam0 = view.camera;
      let aimLeft = ((bearing - cam0.heading + 540) % 360) - 180; // heading = bearing - aimLeft
      let aimUp = cam0.tilt - lookTilt;
      const correctAim = (dt: number) => {
        const sp = view.toScreen(t);
        if (!sp) return;
        const c = visibleCentre();
        // Right of centre -> turn right (less aimLeft); below -> tilt down (less aimUp).
        // Eased over ~1 s whatever the frame rate: never overshoots.
        const gain = 1 - Math.exp(-dt / 400);
        aimLeft -= gain * deg(Math.atan((sp.x - c.x) / f));
        aimUp -= gain * deg(Math.atan((sp.y - c.y) / f));
      };
      const cameraAt = (b: number) => {
        const r = (b * Math.PI) / 180;
        const cam = view.camera.clone();
        cam.position = new Point({
          x: t.x - Math.sin(r) * radius * k,
          y: t.y - Math.cos(r) * radius * k,
          z: (t.z ?? 0) + height,
          spatialReference: view.spatialReference,
        });
        cam.heading = (b - aimLeft + 360) % 360;
        cam.tilt = Math.min(89, lookTilt + aimUp);
        return cam;
      };
      // Circle the building from where the camera already is, refining the aim.
      let last = performance.now();
      const step = (now: number) => {
        if (stopped) return;
        correctAim(Math.min(250, now - last));
        last = now;
        bearing = (bearing + 0.05) % 360; // degrees per frame, gentle: fast orbits starve the per-step redraws
        view.goTo(cameraAt(bearing), { animate: false }).catch(() => undefined);
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [view, orbit, orbitTargetAbove]);

  // Pad the view so its corner UI and camera targets sit in the visible gap
  // between the overlay panels. Re-measured when panels come and go.
  useEffect(() => {
    if (!view) return;
    const measure = () => {
      const rect = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
      const left = rect(".panel-left");
      const top = rect(".topbar");
      const gap = 12;
      const padding = { left: left ? left.right + gap : 0, right: 0, top: top ? top.bottom + gap : 0, bottom: 0 };
      view.padding = padding;
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
    </ArcgisScene>
  );
}
