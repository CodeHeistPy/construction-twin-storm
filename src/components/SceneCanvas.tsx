import { useEffect, useRef, useState } from "react";
import { ArcgisBuildingExplorer, ArcgisExpand, ArcgisLayerList, ArcgisScene } from "@arcgis/map-components-react";
import type { ArcgisBuildingExplorer as BuildingExplorerElement } from "@arcgis/map-components/components/arcgis-building-explorer/customElement";
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
import WebScene from "@arcgis/core/WebScene";
import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer";
import { SITE, WEBSCENE_ID } from "../config/site";
import type { CameraPreset, SceneMode } from "../config/presentation";
import { roleOf, UTILITY_STYLES } from "../config/layers";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import SimpleRenderer from "@arcgis/core/renderers/SimpleRenderer";
import type { Activity, Decision } from "../domain/types";
import { BIM_LAYER_TITLE, BUILDING_1, DATED_SUBLAYERS, statusArcade, type TodayClass } from "../lib/bim";
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

export interface CameraRequest {
  preset: CameraPreset | "focus";
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

const SHOTS: Record<CameraPreset, Shot> = {
  site: { at: SITE, scale: 3500, tilt: 60, heading: 20 },
  development: { at: mid(SITE, BUILDING_1), scale: 2600, tilt: 62, heading: 340 },
  building: { at: BUILDING_1, above: 30, scale: 900, tilt: 70, heading: 25 },
  overview: { at: SITE, scale: 60_000, tilt: 55, heading: 30 },
  storm: { at: { longitude: SITE.longitude - 0.08, latitude: SITE.latitude - 0.06 }, scale: 220_000, tilt: 50, heading: 225 },
};

function shotFor(a: Activity): Shot {
  // Wide enough to read the whole band of today's parts on the building.
  return { at: a.location, above: a.location.z, scale: 1000, tilt: 66, heading: a.viewHeading ?? 30 };
}

export default function SceneCanvas({ twin, mode, focusId, selectedId, onSelect, camera }: Props) {
  const [view, setView] = useState<SceneView | null>(null);
  const [loaded, setLoaded] = useState(false);
  // One WebScene for the life of the app. Letting <arcgis-scene> load it from
  // item-id made it re-create (and abort) the map on re-renders.
  const [map] = useState(() =>
    WEBSCENE_ID
      ? new WebScene({ portalItem: { id: WEBSCENE_ID } })
      : new WebScene({ basemap: "dark-gray-vector", ground: "world-elevation" }),
  );
  const layers = useRef<{ activities: GraphicsLayer; storm: GraphicsLayer } | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const explorerRef = useRef<BuildingExplorerElement>(null);
  const bimRef = useRef<{ layer: BuildingSceneLayer; dated: BuildingComponentSublayer[]; original: Map<BuildingComponentSublayer, BuildingComponentSublayer["renderer"]> } | null>(null);

  // One-time setup once the view is ready: our layers, lighting, click.
  useEffect(() => {
    if (!view || !map) return;
    const storm = new GraphicsLayer({ title: "Storm cell (scripted)", elevationInfo: { mode: "on-the-ground" } });
    const activities = new GraphicsLayer({ title: "Today's activities", elevationInfo: { mode: "relative-to-ground" } });
    map.addMany([storm, activities]);
    layers.current = { activities, storm };
    view.environment.lighting = new SunLighting({ directShadowsEnabled: true });

    const handle = view.on("click", async (e) => {
      const hit = await view.hitTest(e, { include: [activities] });
      const g = hit.results.find((r) => r.type === "graphic");
      onSelectRef.current(g && g.type === "graphic" ? (g.graphic.attributes?.id ?? null) : null);
    });
    return () => {
      handle.remove();
      map.removeMany([storm, activities]);
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
      const unmatched = map.layers
        .filter((l) => l.type !== "graphics" && roleOf(l.title) === null)
        .map((l) => l.title)
        .toArray();
      if (unmatched.length) console.info("[layers] not in LAYER_RULES (left as-is):", unmatched);

      // Utilities: bold symbols, and sit them on the mesh/scene surface (draped
      // on the terrain they hide under the integrated mesh).
      map.allLayers.forEach((l) => {
        if (l.type !== "feature" || roleOf(l.title) !== "utilities") return;
        const style = UTILITY_STYLES.find((u) => u.match.test(l.title ?? ""));
        if (!style) return;
        const fl = l as FeatureLayer;
        // The city data carries absolute z (~1,590 m); ignore it, or it is added
        // as an offset and the network floats 1.6 km up.
        fl.elevationInfo = { mode: "relative-to-scene", offset: 0.5, featureExpressionInfo: { expression: "0" } };
        fl.renderer = new SimpleRenderer({
          symbol:
            fl.geometryType === "polyline"
              ? { type: "line-3d", symbolLayers: [{ type: "line", size: 3, material: { color: style.color } }] }
              : {
                  type: "point-3d",
                  symbolLayers: [
                    { type: "icon", resource: { primitive: "circle" }, size: 7, material: { color: style.color }, outline: { color: "#0b1220", size: 1 } },
                  ],
                },
        });
      });

      const buildings = map.allLayers
        .filter((l) => l.type === "building-scene" && l.loadStatus === "loaded")
        .toArray() as BuildingSceneLayer[];
      buildings.sort((a, b) => Number(b.title === BIM_LAYER_TITLE) - Number(a.title === BIM_LAYER_TITLE));
      if (explorerRef.current) explorerRef.current.layers = buildings;

      const bsl = buildings.find((l) => l.title === BIM_LAYER_TITLE);
      if (!bsl) console.warn(`[bim] layer "${BIM_LAYER_TITLE}" not found in the web scene`);
      else {
        const dated = bsl.allSublayers
          .filter((s) => s.type === "building-component" && DATED_SUBLAYERS.includes(s.modelName ?? ""))
          .toArray() as BuildingComponentSublayer[];
        // Each sublayer must be loaded first, or loading overwrites the renderer.
        await Promise.all(dated.map((s) => s.load()));
        bimRef.current = { layer: bsl, dated, original: new Map(dated.map((s) => [s, s.renderer?.clone()])) };
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [view, map]);

  // Which layers each beat shows. Group members follow their group (the
  // scene ships the utilities group and its layers switched off).
  useEffect(() => {
    if (!map || !loaded) return;
    map.allLayers.forEach((l) => {
      if (l.type === "graphics") return;
      switch (roleOf(l.title)) {
        case "reality":
          l.visible = mode.reality;
          break;
        case "utilities":
          l.visible = mode.utilities;
          break;
        case "mesh":
          l.visible = mode.mesh;
          break;
        case "focusBuilding":
        case "site":
          l.visible = mode.proposed !== "none";
          break;
        case "proposed":
          l.visible = mode.proposed === "all";
          break;
      }
    });
  }, [map, loaded, mode.reality, mode.utilities, mode.mesh, mode.proposed]);

  // Building 1: as designed, or filtered to progress and coloured by today's plan.
  useEffect(() => {
    const bim = bimRef.current;
    if (!loaded || !bim) return;
    const focus = twin.assessments.find((a) => a.activity.id === focusId)?.activity;
    const focusSubs = new Set(focus?.bimSublayers ?? []);
    const decisionFor = new Map<string, Decision>();
    for (const { activity, decision } of twin.assessments)
      for (const s of activity.bimSublayers ?? []) decisionFor.set(s, decision);

    for (const sub of bim.dated) {
      const name = sub.modelName ?? "";
      if (mode.bim === "design") {
        sub.renderer = bim.original.get(sub)?.clone() ?? null;
        continue;
      }
      const cls = todayClass(mode, decisionFor.get(name) ?? "go", twin.replanned, focusSubs.has(name), !!focus);
      sub.renderer = statusRenderer(statusArcade(twin.day, cls));
    }
    // Inside work: make the envelope see-through so the highlighted parts show.
    const seeThrough = !!focus && focus.type === "interior";
    bim.layer.allSublayers.forEach((s) => {
      if (s.type === "building-component" && ENVELOPE.includes(s.modelName ?? "")) {
        (s as BuildingComponentSublayer).opacity = seeThrough ? 0.15 : 1;
      }
    });
  }, [loaded, mode, focusId, twin.assessments, twin.day, twin.replanned]);

  // Activity markers.
  useEffect(() => {
    const layer = layers.current?.activities;
    if (!layer) return;
    layer.removeAll();
    if (!mode.markers) return;
    layer.addMany(
      twin.assessments.map(({ activity: a, decision }) => {
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
            verticalOffset: { screenLength: 36, maxWorldLength: 120, minWorldLength: 8 },
            callout: { type: "line", size: 1, color },
          },
        });
      }),
    );
  }, [map, mode, twin.assessments, twin.replanned, selectedId, focusId]);

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
    if (!view) return;
    const lighting = view.environment.lighting;
    if (lighting instanceof SunLighting) lighting.date = twin.clock;
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
  }, [view, twin.clock, twin.now, mode.storm]);

  // Camera: presets, or the beat's focus activity. Targets are terrain-sampled
  // (a missing z means sea level, ~1,600 m under Denver). The first shot jumps.
  useEffect(() => {
    if (!view) return;
    let shot: Shot | undefined;
    if (camera.preset === "focus") {
      const a = twin.assessments.find((x) => x.activity.id === focusId)?.activity;
      shot = a ? shotFor(a) : SHOTS.building;
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
        .goTo({ target, scale: s.scale, tilt: s.tilt, heading: s.heading }, camera.key === 0 ? { animate: false } : { duration: 2500 })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, camera]);

  // Fly to an activity picked in the panel or on the map.
  useEffect(() => {
    if (!view || !selectedId) return;
    const a = twin.assessments.find((x) => x.activity.id === selectedId)?.activity;
    if (!a) return;
    const s = shotFor(a);
    onGround(view, s.at.longitude, s.at.latitude, s.above).then((target) =>
      view.goTo({ target, scale: s.scale, tilt: s.tilt, heading: s.heading }, { duration: 1500 }).catch(() => undefined),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedId]);

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
