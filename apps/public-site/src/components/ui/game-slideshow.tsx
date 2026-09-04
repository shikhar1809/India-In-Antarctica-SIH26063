import { useState, useEffect, useCallback } from "react";

// Game screenshots — replace these URLs with actual uploaded game screenshots.
// Crop applied via object-position so the HUD chrome is trimmed on all sides.
const SLIDES = [
  {
    src: "https://images.unsplash.com/photo-1551415923-a2297c7fda79?w=1400&q=90",
    caption: "Maitri Station · Queen Maud Land, Antarctica",
  },
  {
    src: "https://images.unsplash.com/photo-1609385510105-81ae06198c53?w=1400&q=90",
    caption: "Blizzard Warning · Visibility dropping fast",
  },
  {
    src: "https://images.unsplash.com/photo-1642928614293-ba6ff94b4a75?w=1400&q=90",
    caption: "Cargo Delivery · Supply chain until next summer",
  },
  {
    src: "https://images.unsplash.com/photo-1535752385016-16aa049b6a8d?w=1400&q=90",
    caption: "Bharati Station · Larsemann Hills, East Antarctica",
  },
  {
    src: "https://images.unsplash.com/photo-1493329025335-18542a61595f?w=1400&q=90",
    caption: "Radio / OPS Room · Talk to the field team",
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
          {/* Crop: use negative inset so HUD chrome disappears on all sides */}
          <div className="absolute" style={{ inset: "-6% -4%" }}>
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

      {/* Launch CTA overlay */}
      <a
        href="https://iia-game.web.app"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-14 right-4 z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide uppercase"
        style={{
          background: "rgba(34,211,238,0.15)",
          border: "1px solid rgba(34,211,238,0.4)",
          color: "#22d3ee",
          backdropFilter: "blur(6px)",
          textDecoration: "none",
        }}
      >
        Play Now
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
          <path d="M6 3l5 5-5 5" stroke="#22d3ee" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </a>
    </div>
  );
}
