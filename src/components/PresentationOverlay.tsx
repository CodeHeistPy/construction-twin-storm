import { useEffect } from "react";
import { PRESENTATION } from "../config/presentation";

interface Props {
  step: number;
  onStep: (n: number) => void;
  onExit: () => void;
}

/** Presenter card: one beat per step, arrow keys / clicker to advance. */
export default function PresentationOverlay({ step, onStep, onExit }: Props) {
  const s = PRESENTATION[step];
  const last = PRESENTATION.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " "].includes(e.key)) onStep(Math.min(last, step + 1));
      else if (["ArrowLeft", "PageUp"].includes(e.key)) onStep(Math.max(0, step - 1));
      else if (e.key === "Escape") onExit();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, last, onStep, onExit]);

  return (
    <div className="presenter">
      <div className="presenter-meta">
        Step {step + 1} / {PRESENTATION.length}
      </div>
      <h2>{s.title}</h2>
      <p>{s.narration}</p>
      <div className="presenter-actions">
        <button type="button" disabled={step === 0} onClick={() => onStep(step - 1)}>
          ‹ Back
        </button>
        <button type="button" className="primary" disabled={step === last} onClick={() => onStep(step + 1)}>
          Next ›
        </button>
        <button type="button" className="ghost" onClick={onExit} aria-label="Exit presentation">
          ✕
        </button>
      </div>
    </div>
  );
}
