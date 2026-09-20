import { useState, useEffect, useCallback } from "react";

const SLIDES = [
  {
    src: "/game/Screenshot (8).png",
    caption: "Maitri Station · Queen Maud Land, Antarctica",
  },
  {
    src: "/game/Screenshot (9).png",
    caption: "Cargo Drop · A Season's Supply on One Helicopter",
  },
  {
    src: "/game/Screenshot (10).png",
    caption: "Radio / OPS Room · Talk to the Field Team",
  },
  {
    src: "/game/Screenshot (11).png",
    caption: "Bharati Station · Larsemann Hills, East Antarctica",
  },
  {
    src: "/game/Screenshot (12).png",
    caption: "Power Plant · Keeping the Lights On at Bharati",
  },
];

export function GameSlideshow() {
  const [current, setCurrent] = useState(0);
  const [animating, setAnimating] = useState(false);

  const go = useCallback((dir: 1 | -1) => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => {
      setCurrent((c) => (c + dir + SLIDES.length) % SLIDES.length);
      setAnimating(false);
    }, 220);
  }, [animating]);

  // Auto-advance
  useEffect(() => {
    const t = setInterval(() => go(1), 4500);
    return () => clearInterval(t);
  }, [go]);

  return (
    <div className="relative w-full h-full select-none overflow-hidden rounded-2xl bg-black">
      {/* Slides */}
      {SLIDES.map((s, i) => (
        <div
          key={i}
          className="absolute inset-0 transition-opacity duration-300"
          style={{ opacity: i === current ? 1 : 0, pointerEvents: i === current ? "auto" : "none" }}
        >
          {/* Crop: negative inset removes browser chrome (top), taskbar+HUD (bottom), sides */}
          <div className="absolute" style={{ inset: "-26% -3% -14% -3%" }}>
            <img
              src={s.src}
              alt={s.caption}
              draggable={false}
              className="w-full h-full object-cover"
              style={{ opacity: animating && i === current ? 0.4 : 1, transition: "opacity 0.22s ease" }}
            />
          </div>
          {/* Dark vignette so caption text is always readable */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
        </div>
      ))}

      {/* Caption */}
      <div className="absolute bottom-4 left-4 right-20 z-10">
        <p
          className="text-white/80 text-xs md:text-sm font-mono tracking-widest uppercase"
          style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
        >
          {SLIDES[current].caption}
        </p>
      </div>

      {/* Dot indicators */}
      <div className="absolute bottom-4 right-4 z-10 flex gap-1.5">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Slide ${i + 1}`}
            onClick={() => { if (!animating) { setAnimating(true); setTimeout(() => { setCurrent(i); setAnimating(false); }, 220); } }}
            className="rounded-full transition-all duration-200"
            style={{
              width: i === current ? 20 : 6,
              height: 6,
              background: i === current ? "#22d3ee" : "rgba(255,255,255,0.4)",
            }}
          />
        ))}
      </div>

      {/* Left arrow */}
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous"
        className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/65 backdrop-blur-sm transition-all duration-150"
        style={{ width: 36, height: 36 }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Right arrow */}
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next"
        className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/65 backdrop-blur-sm transition-all duration-150"
        style={{ width: 36, height: 36 }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M6 3l5 5-5 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

    </div>
  );
}
