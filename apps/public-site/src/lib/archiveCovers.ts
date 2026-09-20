/**
 * archiveCovers.ts — procedural cover art for the archive hero.
 *
 * The hero carousel wants a photograph per record. The archive has exactly
 * one real photograph in the whole project (the owner's own Bharati aerial
 * reference) and four historical entries with no photography attached at
 * all — the honest options were "stretch one photo across nine cards" or
 * "hotlink someone else's stock imagery onto a government archive record",
 * and neither is acceptable for a National Polar Data Archive: a record's
 * cover has to represent THAT record, not decorate the page.
 *
 * So covers are drawn, not photographed — flat, editorial line art in the
 * site's own palette (ink/saffron/green/cyan from index.css), the way an
 * archive draws a generic plate for a record with no photograph on file
 * rather than inventing one. Every cover is an inline SVG data URI: no
 * network request, no broken-image risk, and it scales to any crop the
 * carousel asks for — the full-bleed background and the half-height card
 * sliver are the same vector at two sizes, not two different assets.
 *
 * Every cover renders the same scene as the page's own fixed backdrop
 * (arctic-map-pattern.tsx/css) — a dot-grid ocean and a handful of
 * hand-drawn islands — so the hero and the page it sits on read as one
 * visual system instead of two. A record is told apart from its neighbours
 * by its STATION's palette (a dataset from Bharati and one from Maitri
 * share the same archipelago but never the same colourway) and by its own
 * title/kind/station text in the carousel's overlay, not by a different
 * picture per category.
 */

export type CoverCategory =
  | 'expedition'
  | 'dataset'
  | 'publication'
  | 'media'
  | 'institution'

export type CoverStation = 'maitri' | 'bharati' | 'dakshin' | 'ship' | 'ncpor' | 'himadri'

interface Palette {
  /** Deep field colour, top of the gradient. */
  a: string
  /** Mid field colour, bottom of the gradient. */
  b: string
  /** Line/icon colour — always light, drawn over the field. */
  line: string
  /** Warm or cool accent used sparingly (a flag, a lens ring, a wax seal). */
  accent: string
  /** Matches the `accent` prop HeroCarouselItem grades the backdrop to. */
  grade: string
}

const PALETTES: Record<CoverStation, Palette> = {
  // Schirmacher Oasis: bare rock in the middle of the ice sheet — the one
  // Indian station with actual ground under it, so its palette is the
  // warmest of the four.
  maitri: { a: '#2a1c10', b: '#4a2f16', line: '#f2e6d2', accent: '#ff9933', grade: '#c97a2e' },
  // Larsemann Hills, on stilts over the ice shelf — cold, engineered, blue.
  bharati: { a: '#04121f', b: '#0d2c46', line: '#dff2ff', accent: '#5fd9ff', grade: '#2f7bb0' },
  // Decommissioned, ice-shelf station, first of the three — archival sepia,
  // deliberately the flattest and quietest palette of the set.
  dakshin: { a: '#1b1710', b: '#332a1a', line: '#e8dcc0', accent: '#c9a227', grade: '#8a7233' },
  // The research vessel — open water, the deepest palette.
  ship: { a: '#020a14', b: '#0a1f36', line: '#dbeeff', accent: '#7fb8ff', grade: '#1c4a78' },
  // NCPOR itself — not a field station, so it gets no rock/ice backdrop of
  // its own. The one deliberately institutional palette: indigo and gold,
  // a seal rather than a landscape.
  ncpor: { a: '#0c0a1c', b: '#221a3a', line: '#ece6ff', accent: '#c9a227', grade: '#4a3d7a' },
  // Himadri, Ny-Ålesund — the Arctic station. Green-white, for the only
  // one of these places where the sun sets in winter and the fjord is open
  // water for half the year.
  himadri: { a: '#03161a', b: '#0b3138', line: '#d9fbf4', accent: '#4fe0c0', grade: '#2a7f76' },
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

/**
 * The archipelago itself, as a record cover — the same recipe as the page's
 * own fixed backdrop (arctic-map-pattern.css): a dot-grid ocean and a
 * handful of wobbly, cyan-rimmed islands warped by an SVG turbulence
 * filter. Used as every record's hero image now instead of a category
 * icon — a hero built from a completely different motif per record (a
 * mountain glyph, a book, a camera iris) read as a different visual system
 * from the page it sits on top of, which is what "make the top consistent"
 * was actually pointing at. Category is no longer drawn at all; the record
 * is still identified by its title, kind and station in the text overlay,
 * which is the part actually meant to carry that information.
 */
function archipelagoCover(seed: number): string {
  const rnd = (i: number) => {
    const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453
    return x - Math.floor(x)
  }
  // Six blobs, scattered but seeded so each record gets its own arrangement
  // rather than an identical stamp.
  const islands = Array.from({ length: 6 }, (_, i) => {
    const cx = 60 + rnd(i) * 480
    const cy = 90 + rnd(i + 10) * 560
    const r = 55 + rnd(i + 20) * 70
    return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="url(#islandFill)"/>`
  }).join('')

  return `
    <rect width="600" height="800" fill="url(#dots)"/>
    <g filter="url(#handDrawnNoiseStill)" opacity="0.92">${islands}</g>
  `
}

/**
 * @param cat station's document category — picks the motif
 * @param station picks the colourway and the atmospheric backdrop
 * @param seed varies backdrops between records that share cat+station
 * @param label small caption etched bottom-left, e.g. "MAITRI · 1989"
 */
export function coverArt(
  _cat: CoverCategory,
  station: CoverStation,
  seed = 0,
  label?: string
): string {
  const p = PALETTES[station] ?? PALETTES.maitri
  const archipelago = archipelagoCover(seed)

  const svg = `<svg width="600" height="800" viewBox="0 0 600 800" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${p.a}"/>
        <stop offset="1" stop-color="${p.b}"/>
      </linearGradient>
      <radialGradient id="vig" cx="0.5" cy="0.42" r="0.75">
        <stop offset="0.6" stop-color="#000000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.55"/>
      </radialGradient>
      <radialGradient id="islandFill" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stop-color="${p.line}"/>
        <stop offset="58%" stop-color="${p.line}" stop-opacity="0.75"/>
        <stop offset="88%" stop-color="${p.accent}"/>
        <stop offset="100%" stop-color="${p.accent}" stop-opacity="0"/>
      </radialGradient>
      <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
        <circle cx="13" cy="13" r="1.1" fill="${p.line}" fill-opacity="0.18"/>
      </pattern>
      <!-- Same hand-drawn warp as the page's own fixed backdrop
           (see arctic-map-pattern.tsx), minus the <animate> — this is a
           still cover photo, not a live CSS filter target, so there is
           nothing to keep drifting. -->
      <filter id="handDrawnNoiseStill">
        <feTurbulence result="n" numOctaves="5" baseFrequency="0.012" type="fractalNoise"/>
        <feDisplacementMap yChannelSelector="G" xChannelSelector="R" scale="60" in2="n" in="SourceGraphic"/>
      </filter>
    </defs>
    <rect width="600" height="800" fill="url(#bg)"/>
    ${archipelago}
    <rect width="600" height="800" fill="url(#vig)"/>
    <rect x="14" y="14" width="572" height="772" fill="none" stroke="${p.line}" stroke-opacity="0.18" stroke-width="1"/>
    ${label ? `<text x="34" y="758" font-family="ui-monospace,Menlo,monospace" font-size="15" letter-spacing="2" fill="${p.line}" fill-opacity="0.55">${esc(label.toUpperCase())}</text>` : ''}
  </svg>`

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** The `accent` a HeroCarouselItem should grade its backdrop to for this station. */
export function coverGrade(station: CoverStation): string {
  return PALETTES[station]?.grade ?? PALETTES.maitri.grade
}
