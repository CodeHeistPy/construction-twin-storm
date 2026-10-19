import { useEffect } from "react";

export interface TourStop {
  id: string;
  title: string;
  thumbnail?: string;
}

interface Props {
  stops: TourStop[];
  index: number;
  onGo: (i: number) => void;
  /** Authored slides vs built-in fallback. */
  source: "slides" | "built-in";
}

/**
 * The web scene's slides as a slim bar: ‹ title › plus a dot per slide (click
 * to jump, hover for the title). Arrow keys and clicker PageUp/PageDown step.
 * Kept small on purpose (user, 2026-10-20): the scene is the show.
 */
export default function TourStrip({ stops, index, onGo, source }: Props) {
  const last = stops.length - 1;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (["ArrowRight", "PageDown"].includes(e.key)) onGo(Math.min(last, index + 1));
      else if (["ArrowLeft", "PageUp"].includes(e.key)) onGo(Math.max(0, index - 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last, index, onGo]);

  if (!stops.length) return null;
  const current = stops[index];
  return (
    <nav className="tour-bar" aria-label="Slides" data-source={source}>
      <button type="button" className="step" onClick={() => onGo(Math.max(0, index - 1))} disabled={index <= 0} aria-label="Previous slide">
        ‹
      </button>
      <div className="tour-current">
        <span className="tour-count">
          {index + 1}/{stops.length}
        </span>
        <span className="tour-title">{current?.title ?? ""}</span>
      </div>
      <div className="tour-dots">
        {stops.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`dot ${i === index ? "on" : ""}`}
            onClick={() => onGo(i)}
            title={`${i + 1}. ${s.title}`}
            aria-label={`${i + 1}. ${s.title}`}
            aria-current={i === index ? "step" : undefined}
          />
        ))}
      </div>
      <button type="button" className="step" onClick={() => onGo(Math.min(last, index + 1))} disabled={index >= last} aria-label="Next slide">
        ›
      </button>
    </nav>
  );
}
