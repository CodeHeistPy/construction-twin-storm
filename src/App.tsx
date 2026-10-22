import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type SceneView from "@arcgis/core/views/SceneView";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import type WebScene from "@arcgis/core/WebScene";
import type Slide from "@arcgis/core/webscene/Slide";
import { ALWAYS_HIDDEN, APP_STOPS, PLAIN, ruleFor, STOP_RULES, type CameraPreset, type StopBehaviour, type StopRule } from "./config/tour";
import { presenterToday, SITE } from "./config/site";
import BuildTimeline from "./components/BuildTimeline";
import ConditionsPanel from "./components/ConditionsPanel";
import ConflictsPanel from "./components/ConflictsPanel";
import OutcomeCard from "./components/OutcomeCard";
import ProgressPanel from "./components/ProgressPanel";
import SceneCanvas, { hideUtilities, restoreAppLayers, type CameraRequest } from "./components/SceneCanvas";
import SchedulePanel from "./components/SchedulePanel";
import TourStrip, { type TourStop } from "./components/TourStrip";
import WeatherAlert from "./components/WeatherAlert";
import type { Conflict } from "./lib/utilities";
import type { Decision } from "./domain/types";
import { useTwin } from "./state/useTwin";
import { buildStart, TRADES } from "./lib/bim";
import type IntegratedMesh3DTilesLayer from "@arcgis/core/layers/IntegratedMesh3DTilesLayer";
import { presenterCredential, presenterSignIn, SIGN_IN_AVAILABLE } from "./lib/arcgis";
import { createPhotorealLayer, fetchGoogleTilesKey, probeGoogleTiles, redact } from "./lib/photoreal";

/** Clock hour of the weather stop, for the outcome card's "hours of warning". */
const ALERT_HOUR = STOP_RULES.find((r) => r.behaviour.alert || r.behaviour.alertButton)?.behaviour.hour ?? 9;

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
  const [camera, setCamera] = useState<CameraRequest>({ preset: "schedule", key: 0 });
  const [showAlert, setShowAlert] = useState(false);
  // Presenter sign-in -> Google Photorealistic tiles for the Completed Building
  // view (lib/photoreal.ts). "checked" hides the Sign in button until we know.
  const [signIn, setSignIn] = useState<{ checked: boolean; signedIn: boolean }>({ checked: !SIGN_IN_AVAILABLE, signedIn: false });
  const [photoLayer, setPhotoLayer] = useState<IntegratedMesh3DTilesLayer | null>(null);
  // Why the photorealistic tiles aren't showing, for a signed-in presenter (null = fine).
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!SIGN_IN_AVAILABLE) return;
    let cancelled = false;
    (async () => {
      const cred = await presenterCredential();
      if (cancelled) return;
      setSignIn({ checked: true, signedIn: !!cred });
      if (!cred) return;
      const { key, problem } = await fetchGoogleTilesKey(cred.token);
      if (cancelled) return;
      if (!key) return setPhotoProblem(problem ?? "no Google 3D tiles key");
      const refused = await probeGoogleTiles(key);
      if (cancelled) return;
      if (refused) return setPhotoProblem(refused);
      const layer = createPhotorealLayer(key);
      try {
        await layer.load();
        if (!cancelled) setPhotoLayer(layer);
      } catch (e) {
        if (!cancelled) setPhotoProblem(redact(`the Google tiles layer failed to load (${(e as Error).message})`, key));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // On a stop with alertButton: has the presenter revealed the weather calls yet?
  const [weatherShown, setWeatherShown] = useState(false);
  // The app opens on the build-out: start at the ground, so the wait for the
  // scene to load shows an empty site, not the finished state.
  const [timelineDay, setTimelineDay] = useState<Date>(() => buildStart());
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
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
  // download, and the app now OPENS on the build-out (nothing is preloaded).
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

  // Stops = the web scene's slides, matched to behaviours by title. If none
  // of the authored slides match yet, fall back to the built-in storyline.
  useEffect(() => {
    if (!view?.map) return;
    let cancelled = false;
    (view.map as WebScene)
      .when()
      .then((scene: WebScene) => {
        if (cancelled) return;
        // Only the slides for this app's stops (APP_STOPS), in the scene's order.
        const authored: Entry[] = (scene.presentation?.slides?.toArray() ?? [])
          .map((slide) => ({
            stop: { id: slide.id, title: slide.title?.text ?? "Slide", thumbnail: slide.thumbnail?.url ?? undefined },
            rule: ruleFor(slide.title?.text ?? ""),
            slide,
          }))
          .filter((e) => e.rule && APP_STOPS.includes(e.rule.key));
        // The two views are built into the app (tour.ts SlideView), so the
        // scene's own slides are only used when asked for with ?stops=slides.
        const useAuthored = new URLSearchParams(location.search).get("stops") === "slides" && authored.length > 0;
        setEntries(
          useAuthored
            ? withInserted(authored)
            : STOP_RULES.filter((rule) => APP_STOPS.includes(rule.key)).map((rule) => ({ stop: { id: rule.key, title: rule.builtIn.title }, rule })),
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
      setDecisionFilter(null);
      setLayerFilter(null);
      setShowAlert(!!b.alert);
      setWeatherShown(false);
      if (b.hour !== undefined) twin.setHour(b.hour);
      if (b.replan !== undefined) twin.setReplanned(b.replan);
      // The build-out starts at the ground; the Completed Building view plays on from today.
      setTimelineDay(b.scene.bim === "timeline" ? (b.completion ? today : buildStart()) : twin.day);
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
  // Before the weather is revealed (alertButton stops), the stop shows the plain
  // schedule: every activity listed, building and pins in "scheduled" colours.
  const decided = !behaviour.alertButton || weatherShown;
  const shownMode = useMemo(
    () => (decided || sceneMode.bim !== "decision" ? sceneMode : { ...sceneMode, bim: "scheduled" as const }),
    [sceneMode, decided],
  );

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
        markerFilter={decisionFilter}
        onlySublayers={layerFilter ? (TRADES.find((t) => t.label === layerFilter)?.sublayers ?? null) : null}
        twin={twin}
        mode={shownMode}
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
        // The finished tower is ~67 m: circle its mid-height on the completion view.
        orbitTargetAbove={behaviour.completion ? 33 : undefined}
        photoLayer={photoLayer}
        photoreal={!!behaviour.completion && !!photoLayer}
        // Buildings 2-4 off for the build-out and the adjustment (user,
        // 2026-10-20); on for the completed site (user, 2026-10-22).
        isolateBuilding={!behaviour.completion && (behaviour.scene.bim === "timeline" || behaviour.scene.bim === "decision")}
        hideSublayers={[...ALWAYS_HIDDEN, ...(behaviour.hideSublayers ?? [])]}
      />

      <header className="topbar">
        <div className="brand">
          <div className="eyebrow">Design &amp; construction digital twin</div>
          <h1>{SITE.name}</h1>
        </div>
        {/* Presenter sign-in for the photorealistic finale: only until signed in,
            so nothing auth-related is on screen during the talk. */}
        {signIn.checked && SIGN_IN_AVAILABLE && !signIn.signedIn && (
          <div className="topbar-actions">
            <button type="button" className="ghost sign-in" onClick={presenterSignIn} title="Presenter sign-in: enables the photorealistic Completed Building view">
              Sign in
            </button>
          </div>
        )}
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

      {behaviour.left === "conflicts" && <ConflictsPanel conflicts={conflicts} />}
      {behaviour.left === "progress" && (
        <ProgressPanel
          twin={twin}
          endOfDay={!!behaviour.outcome}
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
          focusId={focusId}
          filter={decisionFilter}
          onFilter={(d) => {
            setDecisionFilter(d);
            setSelectedId(null);
          }}
        />
      )}
      {behaviour.conditions && <ConditionsPanel twin={twin} />}

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
        <TourStrip
          stops={entries.map((e) => e.stop)}
          index={index}
          onGo={go}
          source={entries.some((e) => e.slide) ? "slides" : "built-in"}
        />
      </div>

      {behaviour.completion && photoLayer && <div className="photoreal-credit">Photorealistic 3D: Google</div>}
      {/* Signed-in presenter only: say why the photorealistic finale isn't on. */}
      {behaviour.completion && signIn.signedIn && !photoLayer && photoProblem && (
        <div className="photoreal-credit problem">Photorealistic unavailable: {photoProblem}</div>
      )}
      {showAlert && <WeatherAlert twin={twin} onClose={() => setShowAlert(false)} />}
      {behaviour.outcome && <OutcomeCard twin={twin} alertHour={ALERT_HOUR} />}
    </div>
  );
}
