import { useEffect, useRef, useState } from "react";
import { ArcgisScene } from "@arcgis/map-components-react";
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
import { ellipseRing } from "../lib/geo";
import type { Twin } from "../state/useTwin";

export const DECISION_COLORS: Record<Decision, string> = {
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

  // Activity markers, coloured by decision.
  useEffect(() => {
    const layer = layers.current?.activities;
    if (!layer) return;
    layer.removeAll();
    layer.addMany(
      twin.assessments.map(({ activity: a, decision }) => {
        const selected = a.id === selectedId;
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
                material: { color: DECISION_COLORS[decision] },
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
            callout: { type: "line", size: 1, color: DECISION_COLORS[decision] },
          },
        });
      }),
    );
  }, [view, twin.assessments, selectedId]);

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

  // Camera presets.
  useEffect(() => {
    if (!view) return;
    const c = CAMERAS[camera.preset];
    const [dLon, dLat] = c.offset ?? [0, 0];
    view
      .goTo(
        { center: [SITE.longitude + dLon, SITE.latitude + dLat], scale: c.scale, tilt: c.tilt, heading: c.heading },
        { duration: 2500 },
      )
      .catch(() => undefined);
  }, [view, camera]);

  // Fly to a selected activity.
  useEffect(() => {
    if (!view || !selectedId) return;
    const a = twin.assessments.find((x) => x.activity.id === selectedId)?.activity;
    if (!a) return;
    view
      .goTo({ center: [a.location.longitude, a.location.latitude, a.location.z], scale: 900, tilt: 68 }, { duration: 1500 })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedId]);

  return (
    <ArcgisScene
      className="scene"
      // The ground setter accepts "world-elevation" but the getter type is Ground.
      {...(WEBSCENE_ID
        ? { itemId: WEBSCENE_ID }
        : { basemap: "dark-gray-vector", ground: "world-elevation" as unknown as Ground })}
      cameraPosition={[SITE.longitude - 0.01, SITE.latitude - 0.012, 1200]}
      cameraTilt={65}
      cameraHeading={30}
      onArcgisViewReadyChange={(e) => {
        const el = e.target as unknown as { view: SceneView; ready: boolean };
        if (el.ready) setView(el.view);
      }}
    />
  );
}
