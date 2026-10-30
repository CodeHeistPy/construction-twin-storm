import { useCallback, useEffect, useMemo, useState } from "react";
import type SceneView from "@arcgis/core/views/SceneView";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import type WebScene from "@arcgis/core/WebScene";
import { ALWAYS_HIDDEN, PLAIN, STOP_RULES, type StopBehaviour } from "./config/tour";
import { presenterToday, SITE } from "./config/site";
import BuildTimeline from "./components/BuildTimeline";
import ProgressPanel from "./components/ProgressPanel";
import SceneCanvas, { type CameraRequest } from "./components/SceneCanvas";
import SchedulePanel from "./components/SchedulePanel";
import TourStrip from "./components/TourStrip";
import WeatherAlert from "./components/WeatherAlert";
import type { Decision } from "./domain/types";
import { useTwin } from "./state/useTwin";
import { buildStart, TRADES } from "./lib/bim";

const STOPS = STOP_RULES.map((r) => ({ id: r.key, title: r.title }));

export default function App() {
  const twin = useTwin();
  const [view, setView] = useState<SceneView | null>(null);
  const [index, setIndex] = useState(-1);
  const [behaviour, setBehaviour] = useState<StopBehaviour>(PLAIN);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [camera, setCamera] = useState<CameraRequest>({ preset: "schedule", key: 0 });
  const [showAlert, setShowAlert] = useState(false);
  // On a stop with alertButton: has the presenter revealed the weather calls yet?
  const [weatherShown, setWeatherShown] = useState(false);
  // The app opens on the build-out: start at the ground, so the wait for the
  // scene to load shows an empty site, not the finished state.
  const [timelineDay, setTimelineDay] = useState<Date>(() => buildStart());
  const [building, setBuilding] = useState(false);
  // Bumped by the progress panel's Reset: remounts the build-out, which then
  // replays from the ground up to Today.
  const [replay, setReplay] = useState(0);
  // The day before the storm (site.ts PLAN_AHEAD_DAYS): where the build-out stops.
  const today = useMemo(() => presenterToday(), []);
  // Construction Progress's layer filter: one trade's parts in the 3D building.
  const [layerFilter, setLayerFilter] = useState<string | null>(null);
  // Schedule Adjustment's Postponed / Proceed filter (list + map markers).
  const [decisionFilter, setDecisionFilter] = useState<Decision | null>(null);
  // The scene has streamed in since the stop changed (or 20 s passed). The 4D
  // and its orbit wait for this: a camera move every frame starves the first
  // download, and the app OPENS on the build-out (nothing is preloaded).
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!view) return;
    setSettled(false);
    let cancelled = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 500)); // let the stop's flight start
      await Promise.race([
        reactiveUtils.whenOnce(() => view.stationary && !view.updating),
        new Promise((r) => setTimeout(r, 20_000)),
      ]);
      if (!cancelled) setSettled(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [view, index]);

  const go = useCallback(
    (i: number) => {
      const rule = STOP_RULES[i];
      if (!rule || !view) return;
      const b = rule.behaviour;
      setIndex(i);
      setBehaviour(b);
      setSelectedId(null);
      setDecisionFilter(null);
      setLayerFilter(null);
      setShowAlert(false);
      setWeatherShown(false);
      if (b.replan !== undefined) twin.setReplanned(b.replan);
      // The build-out starts at the ground; the Completed Building view plays on from today.
      setTimelineDay(b.scene.bim === "timeline" ? (b.completion ? today : buildStart()) : twin.day);
      setCamera((c) => ({ preset: rule.camera, key: c.key + 1 }));
    },
    [view, twin, today],
  );

  // Open on the first view once the web scene has loaded.
  useEffect(() => {
    if (!view?.map || index !== -1) return;
    let cancelled = false;
    (view.map as WebScene)
      .when()
      .then(() => !cancelled && go(0))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [view, index, go]);

  // Before the weather is revealed (alertButton stops), the stop shows the plain
  // schedule: every activity listed, building and pins in "scheduled" colours.
  const decided = !behaviour.alertButton || weatherShown;
  const shownMode = useMemo(
    () => (decided || behaviour.scene.bim !== "decision" ? behaviour.scene : { ...behaviour.scene, bim: "scheduled" as const }),
    [behaviour, decided],
  );

  const timeline = behaviour.scene.bim === "timeline";

  return (
    <div className="app">
      <SceneCanvas
        markerFilter={decisionFilter}
        onlySublayers={layerFilter ? (TRADES.find((t) => t.label === layerFilter)?.sublayers ?? null) : null}
        twin={twin}
        mode={shownMode}
        selectedId={selectedId}
        onSelect={setSelectedId}
        camera={camera}
        timelineDay={timelineDay}
        onView={setView}
        orbit={building && timeline}
        // The finished tower is ~67 m: circle its mid-height on the completion view.
        orbitTargetAbove={behaviour.completion ? 33 : undefined}
        // Buildings 2-4 off in all three views: Building 1 alone, from build-out
        // to completion (user, 2026-10-20 and 2026-10-22; the completed park is a
        // separate scene).
        isolateBuilding={index >= 0}
        hideSublayers={ALWAYS_HIDDEN}
      />

      <header className="topbar">
        <div className="brand">
          <div className="eyebrow">Design &amp; construction digital twin</div>
          <h1>{SITE.name}</h1>
        </div>
        {behaviour.alertButton && (
          <div className="topbar-actions">
            <button
              type="button"
              className={`alert-btn ${weatherShown ? "" : "pulse"}`}
              onClick={() => {
                setShowAlert(true);
                setWeatherShown(true);
              }}
            >
              <span aria-hidden>⚠</span> Weather alert
            </button>
          </div>
        )}
      </header>

      {behaviour.left === "progress" && (
        <ProgressPanel
          twin={twin}
          asOf={timeline ? timelineDay : undefined}
          today={today}
          onReset={timeline ? () => setReplay((n) => n + 1) : undefined}
          layerFilter={layerFilter}
          onLayerFilter={setLayerFilter}
          showFinish={!!behaviour.completion}
        />
      )}
      {behaviour.left === "schedule" && (
        <SchedulePanel
          twin={twin}
          selectedId={selectedId}
          onSelect={setSelectedId}
          decisions={behaviour.decisions !== false && decided}
          filter={decisionFilter}
          onFilter={(d) => {
            setDecisionFilter(d);
            setSelectedId(null);
          }}
        />
      )}

      <div className="bottom">
        {timeline && settled && (
          <BuildTimeline
            key={`${index}-${replay}`}
            today={today}
            value={timelineDay}
            onChange={setTimelineDay}
            onPlayingChange={setBuilding}
            toFinish={!!behaviour.completion}
          />
        )}
        <TourStrip stops={STOPS} index={index} onGo={go} />
      </div>

      {showAlert && <WeatherAlert twin={twin} onClose={() => setShowAlert(false)} />}
    </div>
  );
}
