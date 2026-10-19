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
 * The web scene's slides as a filmstrip (like Scene Viewer's). Arrow keys and
 * clicker PageUp/PageDown step through them.
 */
export default function TourStrip({ stops, index, onGo, source }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (["ArrowRight", "PageDown"].includes(e.key)) onGo(Math.min(stops.length - 1, index + 1));
      else if (["ArrowLeft", "PageUp"].includes(e.key)) onGo(Math.max(0, index - 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stops.length, index, onGo]);

  if (!stops.length) return null;
  return (
    <nav className="tour-strip" aria-label="Slides" data-source={source}>
      {stops.map((s, i) => (
        <button
          key={s.id}
          type="button"
          className={`slide ${i === index ? "on" : ""}`}
          onClick={() => onGo(i)}
          aria-current={i === index ? "step" : undefined}
        >
          {s.thumbnail ? <img src={s.thumbnail} alt="" /> : <span className="thumb-blank">{i + 1}</span>}
          <span className="slide-title">{s.title}</span>
        </button>
      ))}
    </nav>
  );
}
