/**
 * The deterministic layer of the post studio.
 *
 * Everything in this file is fixed by the institution, not by a model. The
 * generator picks the words and (sometimes) the background image; these
 * tokens decide what the result actually looks like — palette, type scale,
 * logo placement, safe margins, output dimensions. That split is the whole
 * reason posts from this tool look like they came from one organisation:
 * an image model asked to lay out a post gives a different answer every
 * time, and garbles the wordmark on the way.
 *
 * Changing a value here changes every post made from now on. Nothing in the
 * studio UI writes to this file at runtime.
 */

/* ─────────────────────────────────────────────────────────── platforms ── */

export type PlatformId = 'instagram' | 'story' | 'x' | 'linkedin';

export interface PlatformSpec {
  id: PlatformId;
  label: string;
  /** Native export size in pixels — what the PNG is rendered at. */
  w: number;
  h: number;
  /** Safe area inset in px at native size: nothing important goes outside
   *  this, because platform chrome (avatars, action bars, story UI) sits
   *  over the edges of the frame on at least one client. */
  safe: number;
  note: string;
}

export const PLATFORM_SPECS: Record<PlatformId, PlatformSpec> = {
  instagram: { id: 'instagram', label: 'Instagram post', w: 1080, h: 1080, safe: 72, note: '1:1 — the default feed size' },
  story:     { id: 'story',     label: 'Instagram story', w: 1080, h: 1920, safe: 140, note: '9:16 — keep text clear of the top and bottom bars' },
  x:         { id: 'x',         label: 'X',               w: 1600, h: 900,  safe: 64,  note: '16:9 — crops to 2:1 in some timeline views' },
  linkedin:  { id: 'linkedin',  label: 'LinkedIn',        w: 1200, h: 628,  safe: 56,  note: '1.91:1 — the link-card ratio' },
};

export const PLATFORM_ORDER: PlatformId[] = ['instagram', 'x', 'linkedin', 'story'];

/* ──────────────────────────────────────────────────────────── palettes ── */

export interface Palette {
  id: string;
  label: string;
  /** Base surface behind everything when the template shows one. */
  ground: string;
  /** Text on `ground`. */
  ink: string;
  /** Secondary text on `ground`. */
  inkDim: string;
  /** The one saturated colour — rules, kickers, the accent bar. */
  accent: string;
  /** Text that sits on `accent`. */
  onAccent: string;
  /** Scrim gradient laid over photography so text stays legible. */
  scrim: string;
}

/* Four options, not free colour choice. A publisher clicking "different
 * colour" cycles these; each one is already checked for contrast against
 * both light and dark photography. */
export const PALETTES: Palette[] = [
  {
    id: 'polar',
    label: 'Polar',
    ground: '#061019',
    ink: '#eef6fc',
    inkDim: '#9fbdd6',
    accent: '#5fd9ff',
    onAccent: '#04121c',
    scrim: 'linear-gradient(to top, rgba(4,12,20,0.94) 0%, rgba(4,12,20,0.72) 34%, rgba(4,12,20,0.12) 68%, rgba(4,12,20,0) 100%)',
  },
  {
    id: 'tricolour',
    label: 'Tricolour',
    ground: '#0a1420',
    ink: '#fff8f0',
    inkDim: '#e0c4a4',
    accent: '#ff9933',
    onAccent: '#1a0c00',
    scrim: 'linear-gradient(to top, rgba(10,12,14,0.95) 0%, rgba(12,10,8,0.74) 34%, rgba(12,10,8,0.14) 68%, rgba(12,10,8,0) 100%)',
  },
  {
    id: 'ice',
    label: 'Ice',
    ground: '#eef5fa',
    ink: '#08192a',
    inkDim: '#4a6b84',
    accent: '#0077a8',
    onAccent: '#ffffff',
    scrim: 'linear-gradient(to top, rgba(238,245,250,0.96) 0%, rgba(238,245,250,0.78) 34%, rgba(238,245,250,0.16) 68%, rgba(238,245,250,0) 100%)',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    ground: '#050608',
    ink: '#f4f4f5',
    inkDim: '#a1a1aa',
    accent: '#128807',
    onAccent: '#ffffff',
    scrim: 'linear-gradient(to top, rgba(2,3,4,0.95) 0%, rgba(2,3,4,0.75) 34%, rgba(2,3,4,0.14) 68%, rgba(2,3,4,0) 100%)',
  },
];

export const DEFAULT_PALETTE = PALETTES[0];

export function paletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? DEFAULT_PALETTE;
}

/* ─────────────────────────────────────────────────────────── identity ── */

/** The mark and wordmark are drawn identically on every post, at a size
 *  proportional to the frame. This is the part an image model cannot be
 *  trusted with — it approximates a logo rather than reproducing one. */
export const IDENTITY = {
  logoSrc: '/logo.png',
  wordmark: 'India in Antarctica',
  organisation: 'NCPOR · Ministry of Earth Sciences',
  /** Shown small on every frame so a screenshot always traces back. */
  handle: 'ncpor.gov.in',
} as const;

export const FONTS = {
  display: "'Barlow Condensed', 'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
} as const;

/** Type sizes are expressed as a fraction of the frame's short edge, so one
 *  template renders correctly at 1080×1080 and at 1600×900 without a second
 *  set of numbers. */
export const TYPE_SCALE = {
  kicker: 0.026,
  headline: 0.082,
  headlineLong: 0.062,
  standfirst: 0.030,
  footer: 0.021,
  stat: 0.20,
} as const;
