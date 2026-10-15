import { useCallback, useMemo, useState } from "react";
import { BUILDING_BLOCKS, type BlockId } from "./config/buildingBlocks";
import { PRESENTATION, type CameraPreset } from "./config/presentation";
import { SITE } from "./config/site";
import { BlocksRail } from "./components/BlocksRail";
import CommsDialog from "./components/CommsDialog";
import ConditionsPanel from "./components/ConditionsPanel";
import PresentationOverlay from "./components/PresentationOverlay";
import SceneCanvas from "./components/SceneCanvas";
import SchedulePanel from "./components/SchedulePanel";
import TimeScrubber from "./components/TimeScrubber";
import { useTwin } from "./state/useTwin";

const ALL_BLOCKS = new Set<BlockId>(BUILDING_BLOCKS.map((b) => b.id));

export default function App() {
  const twin = useTwin();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [camera, setCamera] = useState<{ preset: CameraPreset; key: number }>({ preset: "site", key: 0 });
  const [showComms, setShowComms] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [step, setStep] = useState(0);

  const fly = useCallback((preset: CameraPreset) => setCamera((c) => ({ preset, key: c.key + 1 })), []);

  const goToStep = useCallback(
    (n: number) => {
      const s = PRESENTATION[n];
      setStep(n);
      setSelectedId(null);
      if (s.hour !== undefined) twin.setHour(s.hour);
      if (s.camera) fly(s.camera);
      setShowComms(!!s.showComms);
    },
    [twin, fly],
  );

  const lit = useMemo(
    () => (presenting ? new Set<BlockId>(PRESENTATION[step].blocks) : ALL_BLOCKS),
    [presenting, step],
  );

  return (
    <div className={`app ${presenting ? "presenting" : ""}`}>
      <SceneCanvas twin={twin} selectedId={selectedId} onSelect={setSelectedId} camera={camera} />

      <header className="topbar">
        <div className="brand">
          <div className="eyebrow">Construction digital twin</div>
          <h1>Storm readiness{SITE.isPlaceholder ? " · Denver" : ` · ${SITE.name}`}</h1>
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
              if (presenting) setPresenting(false);
              else {
                setPresenting(true);
                goToStep(0);
              }
            }}
          >
            {presenting ? "Exit presentation" : "Present"}
          </button>
        </div>
      </header>

      <SchedulePanel twin={twin} selectedId={selectedId} onSelect={setSelectedId} />
      <ConditionsPanel twin={twin} />

      <div className="bottom">
        <div className="camera-presets">
          {(["site", "crane", "overview", "storm"] as CameraPreset[]).map((p) => (
            <button key={p} type="button" onClick={() => fly(p)}>
              {p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <TimeScrubber twin={twin} />
      </div>

      {presenting && <PresentationOverlay step={step} onStep={goToStep} onExit={() => setPresenting(false)} />}
      {showComms && <CommsDialog twin={twin} onClose={() => setShowComms(false)} />}
    </div>
  );
}
