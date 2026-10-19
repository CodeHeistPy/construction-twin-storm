import { useCallback, useEffect, useMemo, useState } from "react";
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
import SceneCanvas, { restoreAppLayers, type CameraRequest } from "./components/SceneCanvas";
import SchedulePanel from "./components/SchedulePanel";
import TimeScrubber from "./components/TimeScrubber";
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

export default function App() {
  const twin = useTwin();
  const [view, setView] = useState<SceneView | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [index, setIndex] = useState(-1);
  const [behaviour, setBehaviour] = useState<StopBehaviour>(PLAIN);
  const [applyLayers, setApplyLayers] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [camera, setCamera] = useState<CameraRequest>({ preset: "site", key: 0 });
  const [showComms, setShowComms] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [timelineDay, setTimelineDay] = useState<Date>(twin.day);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);

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
        const useAuthored = force === "slides" || (force !== "builtin" && covered >= 4);
        if (!useAuthored)
          console.info(`[tour] authored slides cover ${covered}/${STOP_RULES.length} stops (see SLIDES.md); using built-in stops`);
        setEntries(
          useAuthored
            ? authored
            : STOP_RULES.map((rule) => ({ stop: { id: rule.key, title: rule.builtIn.title }, rule })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [view]);

  const fly = useCallback((preset: CameraPreset | "focus") => setCamera((c) => ({ preset, key: c.key + 1 })), []);

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
      if (e.slide) {
        // The slide owns camera, layers and ground; we re-show our own overlays.
        setApplyLayers(false);
        e.slide
          .applyTo(view, { duration: 3500 })
          .then(() => restoreAppLayers(view))
          .catch(() => undefined);
        restoreAppLayers(view);
      } else if (e.rule) {
        setApplyLayers(true);
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

  const timeline = behaviour.scene.bim === "timeline";

  return (
    <div className="app">
      <SceneCanvas
        twin={twin}
        mode={behaviour.scene}
        focusId={focusId}
        selectedId={selectedId}
        onSelect={setSelectedId}
        camera={camera}
        applyLayers={applyLayers}
        timelineDay={timelineDay}
        onView={setView}
        onConflicts={setConflicts}
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
        {timeline && <BuildTimeline key={index} today={twin.day} value={timelineDay} onChange={setTimelineDay} />}
        {behaviour.conditions && <TimeScrubber twin={twin} />}
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
