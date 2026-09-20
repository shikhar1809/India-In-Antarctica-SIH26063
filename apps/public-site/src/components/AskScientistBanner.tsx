/**
 * "Ask a scientist at ground zero" — the invitation that sits under the
 * Knowledge Repository shelf on the home page.
 *
 * The shelf above it is the finished, published record; this is the other
 * direction — a student with a question, and a person on the ice who can
 * answer it.
 *
 * The globe is cobe (components/ui/cobe-globe-pulse), turned to the south
 * pole and pinned at the three places an answer can come from: Maitri,
 * Bharati and Dakshin Gangotri, plus NCPOR in Goa, where the questions are
 * read. It turns on its own and ignores the mouse: the card underneath is
 * a link, and a globe that grabs the pointer would fight it.
 *
 * The whole card is the link. It is one decision — "I want to ask" — so
 * making the student, the globe and the words all clickable is truer to the
 * intent than a small button they have to find.
 */

import { Link } from 'react-router-dom';
import { GlobePulse } from './ui/cobe-globe-pulse';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import './AskScientistBanner.css';

/** Where an answer comes from. Locations are [latitude, longitude]. */
const STATIONS = [
  { id: 'maitri',   location: [-70.766, 11.733] as [number, number], delay: 0 },
  { id: 'bharati',  location: [-69.407, 76.187] as [number, number], delay: 0.5 },
  { id: 'gangotri', location: [-70.083, 12.000] as [number, number], delay: 1 },
  { id: 'ncpor',    location: [15.396, 73.812]  as [number, number], delay: 1.5 },
];

/** The faces on the card. Drawings, not photographs: nobody real is being
 *  put on a government page to stand in for "a student". */
const STUDENTS = [
  { src: '/ask/s1.png', initials: 'A' },
  { src: '/ask/s2.png', initials: 'B' },
  { src: '/ask/student.png', initials: 'C' },
  { src: '/ask/s3.png', initials: 'D' },
];

export function AskScientistBanner() {
  return (
    <section id="section-ask" className="ask-banner-wrap" aria-labelledby="ask-banner-title">
      <Link to="/ask" className="ask-banner">
        {/* ── the globe, turned to Antarctica ───────────────────────── */}
        <div className="ask-globe">
          <GlobePulse
            markers={STATIONS}
            theta={-0.68}
            speed={0.0022}
            dark={0.22}
            diffuse={0.45}
            mapBrightness={2.1}
            opacity={1}
            baseColor={[0.93, 0.96, 1]}
            markerColor={[1, 0.58, 0.16]}
            glowColor={[0.62, 0.76, 0.92]}
            pulseColor="#ff9933"
            interactive={false}
          />
        </div>

        {/* ── the words ─────────────────────────────────────────────── */}
        <div className="ask-banner-copy">
          <p className="ask-banner-eyebrow">Ask a Scientist</p>
          <h2 id="ask-banner-title">
            Ask your questions directly to scientists at <span>ground zero</span>
          </h2>
          <p className="ask-banner-sub">
            Life on the ice, blizzards, penguins, or how the science is actually done —
            ask the team wintering at Maitri and Bharati. They answer from Antarctica.
          </p>
          {/* The button fills with water: a dark shell, a lit surface line
              that rolls across it, and bright sea underneath. The wave is one
              path drawn twice, side by side, sliding by its own width — so
              the loop has no seam. */}
          <span className="ask-banner-cta">
            <span className="lq-liquid" aria-hidden="true">
              <svg className="lq-wave" viewBox="0 0 480 60" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="lqSea" gradientUnits="userSpaceOnUse" x1="0" y1="12" x2="0" y2="60">
                    <stop offset="0%" stopColor="#7fe3ff" />
                    <stop offset="35%" stopColor="#23a7e8" />
                    <stop offset="100%" stopColor="#0a63b4" />
                  </linearGradient>
                  {/* The same curve twice: closed for the water, open for
                      the light on its surface — a closed path would stroke
                      its own sides and leave a seam where the tiles meet. */}
                  <path
                    id="lqBody"
                    d="M0 22 C 20 12, 40 32, 60 22 S 100 12, 120 22 S 160 32, 180 22 S 220 12, 240 22 L 240 60 L 0 60 Z"
                  />
                  <path
                    id="lqCrestLine"
                    d="M0 22 C 20 12, 40 32, 60 22 S 100 12, 120 22 S 160 32, 180 22 S 220 12, 240 22"
                  />
                </defs>
                {/* Deep water, drawn flat and still: the rolling copies
                    above only have to paint the surface, so the hairline
                    where two tiles meet never shows as a gap. */}
                <rect x="0" y="33" width="480" height="27" fill="url(#lqSea)" />
                <g className="lq-roll">
                  <use href="#lqBody" fill="url(#lqSea)" />
                  <use href="#lqBody" x="239.5" fill="url(#lqSea)" />
                  <use href="#lqCrestLine" className="lq-crest" />
                  <use href="#lqCrestLine" x="239.5" className="lq-crest" />
                </g>
              </svg>
            </span>
            <span className="lq-label">
              Ask your question
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2.5 8h10M9 4.5L12.5 8 9 11.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </span>
        </div>

        {/* ── the students asking ───────────────────────────────── */}
        <div className="ask-student">
          <span className="ask-bubble" aria-hidden="true">?</span>
          <div className="ask-avatars">
            {STUDENTS.map((st) => (
              <Avatar key={st.src} className="ask-avatar">
                <AvatarImage src={st.src} alt="" />
                <AvatarFallback className="text-xs">{st.initials}</AvatarFallback>
              </Avatar>
            ))}
          </div>
          <p className="ask-student-label">Students across India</p>
        </div>
      </Link>
    </section>
  );
}

export default AskScientistBanner;
