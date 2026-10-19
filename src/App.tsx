import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type SceneView from "@arcgis/core/views/SceneView";
import type WebScene from "@arcgis/core/WebScene";
import type Slide from "@arcgis/core/webscene/Slide";
import { PLAIN, ruleFor, STOP_RULES, type CameraPreset, type StopBehaviour, type StopRule } from "./config/tour";
import { SITE } from "./config/site";
import BuildTimeline from "./components/BuildTimeline";
import CommsDialog from "./components/CommsDialog";
import ConditionsPanel from "./components/ConditionsPanel";
import ConflictsPanel from "./components/ConflictsPanel";
import OutcomeCard from "./components/OutcomeCard";
import ProgressPanel from "./components/ProgressPanel";
import SceneCanvas, { hideUtilities, restoreAppLayers, type CameraRequest } from "./components/SceneCanvas";
import SchedulePanel from "./components/SchedulePanel";
import TourStrip, { type TourStop } from "./components/TourStrip";
import WeatherAlert from "./components/WeatherAlert";
import type { Conflict } from "./lib/utilities";
import { useTwin } from "./state/useTwin";

/** Clock hour of the weather stop, for the outcome card's "hours of warning". */
const ALERT_HOUR = STOP_RULES.find((r) => r.behaviour.alert)?.behaviour.hour ?? 9;

interface Entry {
  stop: TourStop;
  rule?: StopRule;
  /** Present when the stop is an authored web scene slide. */
  slide?: Slide;
}

/**
 * Authored slides, plus a camera-less stop for each `insertIfMissing` rule no
 * slide covers, placed after the last slide of an earlier storyline rule
 * (e.g. "What could change it" lands after "Construction Schedule").
 */
function withInserted(authored: Entry[]): Entry[] {
  const out = [...authored];
  const covered = new Set(authored.map((e) => e.rule?.key));
  STOP_RULES.forEach((rule, ruleIndex) => {
    if (!rule.insertIfMissing || covered.has(rule.key)) return;
    const earlier = new Set(STOP_RULES.slice(0, ruleIndex).map((r) => r.key));
    let at = 0;
    out.forEach((e, i) => {
      if (e.rule && earlier.has(e.rule.key)) at = i + 1;
    });
    out.splice(at, 0, { stop: { id: rule.key, title: rule.builtIn.title }, rule });
  });
  return out;
}

export default function App() {
  const twin = useTwin();
  const [view, setView] = useState<SceneView | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [index, setIndex] = useState(-1);
  const [behaviour, setBehaviour] = useState<StopBehaviour>(PLAIN);
  // What the 3D scene shows. Applied only once a slide's camera has landed, so
  // re-rendering the building / pipes / markers never stutters the flight.
  const [sceneMode, setSceneMode] = useState(PLAIN.scene);
  const goToken = useRef(0);
  const [applyLayers, setApplyLayers] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [camera, setCamera] = useState<CameraRequest>({ preset: "site", key: 0 });
  const [showComms, setShowComms] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [timelineDay, setTimelineDay] = useState<Date>(twin.day);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [building, setBuilding] = useState(false);

  // Stops = the web scene's slides, matched to behaviours by title. If none
  // of the authored slides match yet, fall back to the built-in storyline.
  useEffect(() => {
    if (!view?.map) return;
    let cancelled = false;
    (view.map as WebScene)
      .when()
      .then((scene: WebScene) => {
        if (cancelled) return;
        const slides = scene.presentation?.slides?.toArray() ?? [];
        const authored: Entry[] = slides.map((slide) => ({
          stop: { id: slide.id, title: slide.title?.text ?? "Slide", thumbnail: slide.thumbnail?.url ?? undefined },
          rule: ruleFor(slide.title?.text ?? ""),
          slide,
        }));
        // Use the authored slides once they cover most of the storyline (so a
        // stray "Overview" slide doesn't hijack it). ?stops=slides|builtin forces either.
        const covered = new Set(authored.map((e) => e.rule?.key).filter(Boolean)).size;
        const force = new URLSearchParams(location.search).get("stops");
        const useAuthored = force === "slides" || (force !== "builtin" && covered >= 3);
        if (!useAuthored)
          console.info(`[tour] authored slides cover ${covered}/${STOP_RULES.length} stops (see SLIDES.md); using built-in stops`);
        setEntries(
          useAuthored
            ? withInserted(authored)
            : STOP_RULES.map((rule) => ({ stop: { id: rule.key, title: rule.builtIn.title }, rule })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [view]);

  const fly = useCallback((preset: CameraPreset | "focus" | "none") => setCamera((c) => ({ preset, key: c.key + 1 })), []);

  const go = useCallback(
    (i: number) => {
      const e = entries[i];
      if (!e || !view) return;
      const b = e.rule?.behaviour ?? PLAIN;
      setIndex(i);
      setBehaviour(b);
      setSelectedId(null);
      setShowComms(false);
      setShowAlert(!!b.alert);
      if (b.hour !== undefined) twin.setHour(b.hour);
      if (b.replan !== undefined) twin.setReplanned(b.replan);
      if (b.scene.bim !== "timeline") setTimelineDay(twin.day);
      const token = ++goToken.current;
      // Overlays the next stop doesn't have go NOW (at take-off); new ones
      // arrive when the camera lands. Otherwise the utilities stop's flags and
      // pipes linger through the flight to the next slide.
      setSceneMode((prev) => ({
        ...prev,
        underground: prev.underground && b.scene.underground,
        markers: prev.markers && b.scene.markers,
        storm: prev.storm && b.scene.storm,
      }));
      const keepUtilitiesOff = () => {
        if (!b.scene.underground) hideUtilities(view);
      };
      if (e.slide) {
        // The slide owns camera, layers, ground and lighting, and flies at the
        // SDK's own adaptive pace (as in Scene Viewer). We re-show our overlays
        // and apply our scene changes once it lands.
        setApplyLayers(false);
        restoreAppLayers(view);
        // A deliberate glide (the default is near-instant for short hops).
        const flight = e.slide.applyTo(view, { speedFactor: 0.45, maxDuration: 4500 });
        keepUtilitiesOff(); // the slide turns its layers on at take-off
        flight
          .then(() => {
            restoreAppLayers(view);
            keepUtilitiesOff();
            if (goToken.current === token) setSceneMode(b.scene);
          })
          .catch(() => {
            // Interrupted by the next click: that stop takes over.
            if (goToken.current === token) setSceneMode(b.scene);
          });
      } else if (e.rule) {
        // A camera-less stop (weather) leaves the previous slide's layers alone too.
        setApplyLayers(e.rule.builtIn.camera !== "none");
        keepUtilitiesOff();
        setSceneMode(b.scene);
        fly(e.rule.builtIn.camera);
      }
    },
    [entries, view, twin, fly],
  );

  // Open on the first stop once the tour is known.
  useEffect(() => {
    if (entries.length && index === -1) go(0);
  }, [entries, index, go]);

  // The activity a stop is about.
  const focusId = useMemo(() => {
    const f = behaviour.scene.focus;
    if (!f) return null;
    const bim = twin.assessments.filter((a) => a.activity.source === "bim");
    const pick = f === "postponed" ? bim.find((a) => a.decision === "postpone") : bim.find((a) => a.decision !== "postpone");
    return pick?.activity.id ?? null;
  }, [behaviour, twin.assessments]);

  // The 4D build-out starts once the schedule slide has landed.
  const timeline = sceneMode.bim === "timeline";

  return (
    <div className="app">
      <SceneCanvas
        twin={twin}
        mode={sceneMode}
        focusId={focusId}
        selectedId={selectedId}
        onSelect={setSelectedId}
        camera={camera}
        applyLayers={applyLayers}
        timelineDay={timelineDay}
        onView={setView}
        onConflicts={setConflicts}
        orbit={building && timeline}
        allowUtilities={behaviour.scene.underground}
        isolateBuilding={behaviour.scene.bim === "timeline"}
      />

      <header className="topbar">
        <div className="brand">
          <div className="eyebrow">Design &amp; construction digital twin</div>
          <h1>{SITE.name}</h1>
        </div>
        {behaviour.decisions && (
          <div className="topbar-actions">
            <button type="button" onClick={() => setShowComms(true)}>
              Notify crews
            </button>
          </div>
        )}
      </header>

      {behaviour.left === "conflicts" && <ConflictsPanel conflicts={conflicts} />}
      {behaviour.left === "progress" && (
        <ProgressPanel twin={twin} endOfDay={!!behaviour.outcome} asOf={timeline ? timelineDay : undefined} />
      )}
      {behaviour.left === "schedule" && (
        <SchedulePanel
          twin={twin}
          selectedId={selectedId}
          onSelect={setSelectedId}
          decisions={behaviour.decisions !== false}
          focusId={focusId}
        />
      )}
      {behaviour.conditions && <ConditionsPanel twin={twin} />}

      <div className="bottom">
        {timeline && <BuildTimeline key={index} today={twin.day} value={timelineDay} onChange={setTimelineDay} onPlayingChange={setBuilding} />}
        <TourStrip
          stops={entries.map((e) => e.stop)}
          index={index}
          onGo={go}
          source={entries.some((e) => e.slide) ? "slides" : "built-in"}
        />
      </div>

      {showAlert && <WeatherAlert twin={twin} onClose={() => setShowAlert(false)} />}
      {behaviour.outcome && <OutcomeCard twin={twin} alertHour={ALERT_HOUR} />}
      {showComms && <CommsDialog twin={twin} onClose={() => setShowComms(false)} />}
    </div>
  );
}
