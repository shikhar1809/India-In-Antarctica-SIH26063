/**
 * Dev-only harness for the post renderer, at /__canvas.
 *
 * Every template against every palette, plus one row of platform sizes, on
 * a single page. The studio itself sits behind Google auth, so without this
 * the only way to look at a layout change is to sign in and drive a
 * five-step wizard to reach it — which is slow enough that in practice
 * nobody checks the templates they did not touch.
 *
 * Excluded from production by the `import.meta.env.DEV` guard in App.tsx.
 */

import { useState } from 'react';
import { PALETTES, PLATFORM_ORDER, PLATFORM_SPECS } from './brand';
import { TEMPLATES } from './templates';
import { PostCanvas } from './PostCanvas';
import type { PostCopy } from './copy';

/* A deliberately awkward sample: a headline long enough to wrap, a real
 * measurement with a unit, and the kind of station/activity pair the field
 * app actually sends. Layouts that only look right with three short words
 * are the ones that break in production. */
const SAMPLE: PostCopy = {
  kicker: 'MAITRI · ICE / GLACIOLOGY SURVEY',
  headline: '164 cm of ice thickness recorded across the Schirmacher shelf',
  standfirst: 'Twelve stakes measured this week, the first full transect of the season.',
  stat: '164 cm',
  statLabel: 'Mean ice thickness, 12 stakes',
  captions: { x: '', linkedin: '', instagram: '' },
};

/* A synthetic stand-in for station photography: an ice horizon under a low
 * sun, which is the tonal range these templates actually have to survive —
 * bright top, dark foreground, text crossing the boundary. Inline so the
 * harness needs no network and renders identically every time. */
const PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#7fb2d9"/>
          <stop offset="55%" stop-color="#dbe9f2"/>
          <stop offset="100%" stop-color="#f2f6f8"/>
        </linearGradient>
        <linearGradient id="ice" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#dfeaf1"/>
          <stop offset="100%" stop-color="#8fa6b5"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="1200" fill="url(#sky)"/>
      <circle cx="880" cy="300" r="70" fill="#fff6e0" opacity="0.9"/>
      <path d="M0 620 L260 500 L430 600 L640 470 L820 585 L1010 505 L1200 600 L1200 1200 L0 1200 Z" fill="#b9cbd6"/>
      <path d="M0 760 L300 690 L560 780 L900 700 L1200 790 L1200 1200 L0 1200 Z" fill="url(#ice)"/>
      <path d="M0 980 L1200 930 L1200 1200 L0 1200 Z" fill="#5d7385"/>
    </svg>`,
  );

export function CanvasGallery() {
  const [photo, setPhoto] = useState<string | null>(PHOTO);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const palette = PALETTES[paletteIdx];

  return (
    <div style={{ padding: 24, background: '#061019', minHeight: '100vh', color: '#e6f2fb' }}>
      <h1 style={{ font: '600 20px/1.2 Inter, sans-serif', marginBottom: 4 }}>Post canvas — dev harness</h1>
      <p style={{ color: '#9fbdd6', fontSize: 13, marginBottom: 20 }}>
        Not part of the shipped portal. Every template rendered with the same copy so a layout
        change can be judged across all of them at once.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {PALETTES.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setPaletteIdx(i)}
            style={{
              padding: '7px 13px', borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${i === paletteIdx ? p.accent : 'rgba(150,200,240,0.16)'}`,
              background: i === paletteIdx ? 'rgba(95,217,255,0.1)' : 'transparent',
              color: i === paletteIdx ? p.accent : '#9fbdd6',
              font: '500 12.5px/1 Inter, sans-serif',
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setPhoto((v) => (v ? null : PHOTO))}
          style={{
            padding: '7px 13px', borderRadius: 999, cursor: 'pointer',
            border: '1px dashed rgba(150,200,240,0.32)', background: 'transparent',
            color: '#9fbdd6', font: '500 12.5px/1 Inter, sans-serif',
          }}
        >
          {photo ? 'Remove photo' : 'Add photo'}
        </button>
      </div>

      <h2 style={{ font: '600 14px/1 Inter, sans-serif', margin: '0 0 12px' }}>
        Templates · Instagram 1080×1080
      </h2>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 36 }}>
        {TEMPLATES.map((t) => (
          <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <PostCanvas
              platform="instagram"
              template={t}
              palette={palette}
              copy={SAMPLE}
              photoUrl={photo}
              scale={0.28}
            />
            <span style={{ font: '500 11px/1 JetBrains Mono, monospace', color: '#6c8399' }}>{t.label}</span>
          </div>
        ))}
      </div>

      <h2 style={{ font: '600 14px/1 Inter, sans-serif', margin: '0 0 12px' }}>
        Platform sizes · photo-led
      </h2>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {PLATFORM_ORDER.map((p) => (
          <div key={p} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <PostCanvas
              platform={p}
              template={TEMPLATES[0]}
              palette={palette}
              copy={SAMPLE}
              photoUrl={photo}
              scale={p === 'story' ? 0.14 : 0.2}
            />
            <span style={{ font: '500 11px/1 JetBrains Mono, monospace', color: '#6c8399' }}>
              {PLATFORM_SPECS[p].label} · {PLATFORM_SPECS[p].w}×{PLATFORM_SPECS[p].h}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
