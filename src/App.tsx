import { useCallback, useEffect, useMemo, useState } from "react";
import { BUILDING_BLOCKS, type BlockId } from "./config/buildingBlocks";
import { FREE_MODE, PRESENTATION, type CameraPreset, type PresentationStep } from "./config/presentation";
import { SITE } from "./config/site";
import { BlocksRail } from "./components/BlocksRail";
import CommsDialog from "./components/CommsDialog";
import ConditionsPanel from "./components/ConditionsPanel";
import OutcomeCard from "./components/OutcomeCard";
import PresentationOverlay from "./components/PresentationOverlay";
import ProgressPanel from "./components/ProgressPanel";
import SceneCanvas, { type CameraRequest } from "./components/SceneCanvas";
import SchedulePanel from "./components/SchedulePanel";
import TimeScrubber from "./components/TimeScrubber";
import WeatherAlert from "./components/WeatherAlert";
import { useTwin } from "./state/useTwin";

const ALL_BLOCKS = new Set<BlockId>(BUILDING_BLOCKS.map((b) => b.id));
/** Clock hour of the alert beat, for the outcome card's "hours of warning". */
const ALERT_HOUR = PRESENTATION.find((s) => s.alert)?.hour ?? 9;

export default function App() {
  const twin = useTwin();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [camera, setCamera] = useState<CameraRequest>({ preset: "site", key: 0 });
  const [showComms, setShowComms] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [step, setStep] = useState(0);

  const beat: PresentationStep = presenting ? PRESENTATION[step] : FREE_MODE;

  // The activity a work-face beat is about.
  const focusId = useMemo(() => {
    const f = beat.scene.focus;
    if (!f) return null;
    const bim = twin.assessments.filter((a) => a.activity.source === "bim");
    const pick = f === "postponed" ? bim.find((a) => a.decision === "postpone") : bim.find((a) => a.decision !== "postpone");
    return pick?.activity.id ?? null;
  }, [beat, twin.assessments]);

  const fly = useCallback((preset: CameraPreset | "focus") => setCamera((c) => ({ preset, key: c.key + 1 })), []);

  const goToStep = useCallback(
    (n: number) => {
      const s = PRESENTATION[n];
      setStep(n);
      setSelectedId(null);
      if (s.hour !== undefined) twin.setHour(s.hour);
      if (s.camera) fly(s.camera);
      setShowComms(!!s.showComms);
      setShowAlert(!!s.alert);
      twin.setReplanned(!!s.replan);
    },
    [twin, fly],
  );

  // Outside presentation mode, pop the alert once shortly after load if the
  // forecast threatens today's work.
  useEffect(() => {
    if (presenting) return;
    const t = window.setTimeout(() => {
      if (twin.assessments.some((a) => a.decision === "postpone")) setShowAlert(true);
    }, 4000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting]);

  const lit = useMemo(() => (presenting ? new Set<BlockId>(beat.blocks) : ALL_BLOCKS), [presenting, beat]);

  return (
    <div className={`app ${presenting ? "presenting" : ""}`}>
      <SceneCanvas
        twin={twin}
        mode={beat.scene}
        focusId={focusId}
        selectedId={selectedId}
        onSelect={setSelectedId}
        camera={camera}
      />

      <header className="topbar">
        <div className="brand">
          <div className="eyebrow">Construction digital twin</div>
          <h1>Storm readiness{` · ${SITE.name}`}</h1>
        </div>
        <BlocksRail lit={lit} />
        <div className="topbar-actions">
          <button type="button" onClick={() => setShowComms(true)}>
            Notify crews
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (presenting) {
                setPresenting(false);
                setShowAlert(false);
              } else {
                setPresenting(true);
                goToStep(0);
              }
            }}
          >
            {presenting ? "Exit presentation" : "Present"}
          </button>
        </div>
      </header>

      {beat.left === "progress" && <ProgressPanel twin={twin} endOfDay={!!beat.outcome} />}
      {beat.left === "schedule" && (
        <SchedulePanel
          twin={twin}
          selectedId={selectedId}
          onSelect={setSelectedId}
          decisions={beat.decisions !== false}
          focusId={focusId}
        />
      )}
      {beat.conditions && <ConditionsPanel twin={twin} />}

      {!beat.outcome && (
        <div className="bottom">
          {!presenting && (
            <div className="camera-presets">
              {(["site", "development", "building", "storm"] as CameraPreset[]).map((p) => (
                <button key={p} type="button" onClick={() => fly(p)}>
                  {p[0].toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          )}
          {(beat.conditions || !presenting) && <TimeScrubber twin={twin} />}
        </div>
      )}

      {showAlert && <WeatherAlert twin={twin} onClose={() => setShowAlert(false)} />}
      {beat.outcome && <OutcomeCard twin={twin} alertHour={ALERT_HOUR} />}
      {presenting && <PresentationOverlay step={step} onStep={goToStep} onExit={() => setPresenting(false)} />}
      {showComms && <CommsDialog twin={twin} onClose={() => setShowComms(false)} />}
    </div>
  );
}
