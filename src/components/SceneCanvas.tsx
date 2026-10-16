import { useEffect, useRef, useState } from "react";
import { ArcgisBuildingExplorer, ArcgisExpand, ArcgisLayerList, ArcgisScene } from "@arcgis/map-components-react";
import type { ArcgisBuildingExplorer as BuildingExplorerElement } from "@arcgis/map-components/components/arcgis-building-explorer/customElement";
import Graphic from "@arcgis/core/Graphic";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Point from "@arcgis/core/geometry/Point";
import Polygon from "@arcgis/core/geometry/Polygon";
import type Ground from "@arcgis/core/Ground";
import type SceneView from "@arcgis/core/views/SceneView";
import SunLighting from "@arcgis/core/views/3d/environment/SunLighting";
import RainyWeather from "@arcgis/core/views/3d/environment/RainyWeather";
import CloudyWeather from "@arcgis/core/views/3d/environment/CloudyWeather";
import SunnyWeather from "@arcgis/core/views/3d/environment/SunnyWeather";
import { SITE, WEBSCENE_ID } from "../config/site";
import type { CameraPreset } from "../config/presentation";
import type { Decision } from "../domain/types";
import type BuildingSceneLayer from "@arcgis/core/layers/BuildingSceneLayer";
import type BuildingComponentSublayer from "@arcgis/core/layers/buildingSublayers/BuildingComponentSublayer";
import type WebScene from "@arcgis/core/WebScene";
import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer";
import { BIM_LAYER_TITLE, DATED_SUBLAYERS, statusArcade } from "../lib/bim";
import { ellipseRing } from "../lib/geo";
import type { Twin } from "../state/useTwin";

/** Display status: a decision, or postponed work that has been re-planned. */
export type Status = Decision | "rescheduled";

export const DECISION_COLORS: Record<Status, string> = {
  rescheduled: "#a78bfa",
  postpone: "#ff5a4e",
  watch: "#ffb547",
  go: "#3ddc84",
};

interface Props {
  twin: Twin;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Bump `key` to re-fly to the same preset. */
  camera: { preset: CameraPreset; key: number };
}

const mesh = (color: number[], mix: "tint" | "replace" = "replace") => ({
  type: "mesh-3d" as const,
  symbolLayers: [{ type: "fill" as const, material: { color, colorMixMode: mix } }],
});

const hex = (h: string, a = 1) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(a);

function statusRenderer(valueExpression: string) {
  return new UniqueValueRenderer({
    valueExpression,
    defaultSymbol: mesh([235, 238, 245, 1], "tint"),
    uniqueValueInfos: [
      { value: "installed", label: "Installed", symbol: mesh([235, 238, 245, 1], "tint") },
      { value: "today-postpone", label: "Today: postponed", symbol: mesh(hex(DECISION_COLORS.postpone)) },
      { value: "today-watch", label: "Today: watch", symbol: mesh(hex(DECISION_COLORS.watch)) },
      { value: "today-go", label: "Today: proceed", symbol: mesh(hex(DECISION_COLORS.go)) },
      { value: "today-rescheduled", label: "Today: re-planned", symbol: mesh(hex(DECISION_COLORS.rescheduled)) },
      { value: "upcoming", label: "Not yet installed", symbol: mesh([120, 170, 255, 0.12]) },
    ],
  });
}

/** A point on the terrain surface (absolute z), for camera targets. */
async function onGround(view: SceneView, longitude: number, latitude: number): Promise<Point> {
  const p = new Point({ longitude, latitude });
  const ground = view.map!.ground;
  // At startup the ground layers are still loading (and one, Roadway_Ground,
  // isn't public), so wait for them to settle and retry briefly.
  await ground.loadAll().catch(() => undefined);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const sampled = await ground.queryElevation(p);
      const g = sampled.geometry as Point;
      if (Number.isFinite(g.z)) return g;
    } catch {
      // fall through to retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.warn("[camera] terrain height unavailable; camera may sit too low");
  return p;
}

const CAMERAS: Record<CameraPreset, { scale: number; tilt: number; heading: number; offset?: [number, number] }> = {
  site: { scale: 2200, tilt: 65, heading: 30 },
  crane: { scale: 900, tilt: 70, heading: 10 },
  overview: { scale: 60_000, tilt: 55, heading: 30 },
  storm: { scale: 220_000, tilt: 50, heading: 225, offset: [-0.08, -0.06] },
};

export default function SceneCanvas({ twin, selectedId, onSelect, camera }: Props) {
  const [view, setView] = useState<SceneView | null>(null);
  const layers = useRef<{ activities: GraphicsLayer; storm: GraphicsLayer } | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const explorerRef = useRef<BuildingExplorerElement>(null);

  // One-time layer setup once the view is ready.
  useEffect(() => {
    if (!view) return;
    const storm = new GraphicsLayer({ title: "Storm cell (scripted)", elevationInfo: { mode: "on-the-ground" } });
    const activities = new GraphicsLayer({
      title: "Today's activities",
      elevationInfo: { mode: "relative-to-ground" },
    });
    view.map?.addMany([storm, activities]);
    layers.current = { activities, storm };
    view.environment.lighting = new SunLighting({ directShadowsEnabled: true });

    const handle = view.on("click", async (e) => {
      const hit = await view.hitTest(e, { include: [activities] });
      const g = hit.results.find((r) => r.type === "graphic");
      onSelectRef.current(g && g.type === "graphic" ? (g.graphic.attributes?.id ?? null) : null);
    });
    return () => {
      handle.remove();
      view.map?.removeMany([storm, activities]);
      layers.current = null;
    };
  }, [view]);

  // Building Explorer: give it every Building Scene Layer that loaded (the
  // scene's Bridges layer isn't public and fails). Building 1 goes first.
  useEffect(() => {
    if (!view?.map) return;
    const map = view.map;
    let cancelled = false;
    (map as WebScene).loadAll().catch(() => undefined).then(() => {
      const explorer = explorerRef.current;
      if (cancelled || !explorer) return;
      const buildings = map.allLayers
        .filter((l) => l.type === "building-scene" && l.loadStatus === "loaded")
        .toArray() as BuildingSceneLayer[];
      buildings.sort((a, b) => Number(b.title === BIM_LAYER_TITLE) - Number(a.title === BIM_LAYER_TITLE));
      explorer.layers = buildings;
    });
    return () => {
      cancelled = true;
    };
  }, [view]);

  // Pad the view so its corner UI (Layers, Building Explorer) and camera
  // targets sit in the visible gap between the overlay panels.
  useEffect(() => {
    if (!view) return;
    const measure = () => {
      const rect = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
      const left = rect(".panel-left");
      const right = rect(".panel-right");
      const top = rect(".topbar");
      const gap = 12;
      const padding = {
        left: left ? left.right + gap : 0,
        right: right ? window.innerWidth - right.left + gap : 0,
        top: top ? top.bottom + gap : 0,
        bottom: 0,
      };
      view.padding = padding;
      // Slotted components (the expands) ignore view.padding; offset via CSS.
      const scene = document.querySelector<HTMLElement>(".scene");
      scene?.style.setProperty("--ui-left", `${padding.left}px`);
      scene?.style.setProperty("--ui-top", `${padding.top}px`);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [view]);

  // Building 1 coloured by install status for the demo day: installed (as
  // built), today's work (decision colour), upcoming (ghosted).
  useEffect(() => {
    if (!view?.map) return;
    const map = view.map;
    const decisionFor = new Map<string, Decision>();
    for (const { activity, decision } of twin.assessments)
      for (const s of activity.bimSublayers ?? []) decisionFor.set(s, decision);

    let cancelled = false;
    // The web scene adds its layers after the view is ready, so wait for them.
    // loadAll() rejects if ANY layer fails (some scene layers aren't public),
    // so carry on either way.
    (map as WebScene).loadAll().catch(() => undefined).then(async () => {
      const bsl = map.allLayers.find(
        (l) => l.type === "building-scene" && l.title === BIM_LAYER_TITLE,
      ) as BuildingSceneLayer | undefined;
      if (!bsl) {
        console.warn(`[bim] layer "${BIM_LAYER_TITLE}" not found in the web scene`);
        return;
      }
      await bsl.load();
      const dated = bsl.allSublayers
        .filter((s) => s.type === "building-component" && DATED_SUBLAYERS.includes(s.modelName ?? ""))
        .toArray() as BuildingComponentSublayer[];
      // Each sublayer must be loaded first, or loading overwrites the renderer.
      await Promise.all(dated.map((s) => s.load()));
      if (cancelled) return;
      for (const sub of dated) {
        const decision = decisionFor.get(sub.modelName ?? "") ?? "go";
        const status: Status = twin.replanned && decision === "postpone" ? "rescheduled" : decision;
        sub.renderer = statusRenderer(statusArcade(twin.day, status));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [view, twin.assessments, twin.day, twin.replanned]);

  // Activity markers, coloured by decision.
  useEffect(() => {
    const layer = layers.current?.activities;
    if (!layer) return;
    layer.removeAll();
    layer.addMany(
      twin.assessments.map(({ activity: a, decision }) => {
        const selected = a.id === selectedId;
        const color = DECISION_COLORS[twin.replanned && decision === "postpone" ? "rescheduled" : decision];
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
                material: { color: color },
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
            callout: { type: "line", size: 1, color: color },
          },
        });
      }),
    );
  }, [view, twin.assessments, twin.replanned, selectedId]);

  // Scripted storm cell: outer rain shield + core, moving with the clock.
  useEffect(() => {
    const layer = layers.current?.storm;
    if (!layer) return;
    layer.removeAll();
    const s = twin.storm;
    if (!s) return;
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
  }, [view, twin.storm]);

  // Sun position follows the clock; scene weather follows conditions.
  useEffect(() => {
    if (!view) return;
    const lighting = view.environment.lighting;
    if (lighting instanceof SunLighting) lighting.date = twin.clock;
    const w = twin.now;
    if (!w) return;
    if (w.precipitation >= 1) {
      view.environment.weather = new RainyWeather({
        cloudCover: Math.min(1, 0.6 + w.precipitation / 50),
        precipitation: Math.min(1, w.precipitation / 20),
      });
    } else if (w.windSpeed >= 8 || w.precipitation > 0) {
      view.environment.weather = new CloudyWeather({ cloudCover: 0.7 });
    } else {
      view.environment.weather = new SunnyWeather({ cloudCover: 0.2 });
    }
  }, [view, twin.clock, twin.now]);

  // Camera presets. A centre without z sits at sea level, ~1,600 m under
  // Denver, so aim at the terrain height instead. The opening view (key 0) jumps.
  useEffect(() => {
    if (!view) return;
    const c = CAMERAS[camera.preset];
    const [dLon, dLat] = c.offset ?? [0, 0];
    let cancelled = false;
    onGround(view, SITE.longitude + dLon, SITE.latitude + dLat).then((target) => {
      if (cancelled) return;
      view
        .goTo(
          { target, scale: c.scale, tilt: c.tilt, heading: c.heading },
          camera.key === 0 ? { animate: false } : { duration: 2500 },
        )
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [view, camera]);

  // Fly to a selected activity.
  useEffect(() => {
    if (!view || !selectedId) return;
    const a = twin.assessments.find((x) => x.activity.id === selectedId)?.activity;
    if (!a) return;
    onGround(view, a.location.longitude, a.location.latitude).then((target) =>
      view.goTo({ target, scale: 900, tilt: 68 }, { duration: 1500 }).catch(() => undefined),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedId]);

  return (
    <ArcgisScene
      className="scene calcite-mode-dark"
      // The ground setter accepts "world-elevation" but the getter type is Ground.
      {...(WEBSCENE_ID
        ? { itemId: WEBSCENE_ID }
        : { basemap: "dark-gray-vector", ground: "world-elevation" as unknown as Ground })}
      // No camera props: they're re-applied on every render (snapping the camera
      // back), and a fixed altitude ends up underground at Denver's ~1,600 m.
      // The opening view comes from the camera-preset effect instead.
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
