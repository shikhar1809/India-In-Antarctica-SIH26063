import './arctic-map-pattern.css'

export interface ArcticMapBackgroundProps {
  /** Extra classes for the fixed backdrop layer. @default undefined */
  className?: string
}

/**
 * ArcticMapBackground — a hand-drawn-looking archipelago backdrop.
 *
 * The trick is entirely the SVG filter: `island-backdrop` is drawn as
 * ordinary crisp CSS radial-gradient circles, and `feTurbulence` +
 * `feDisplacementMap` warps every pixel of it by a smooth noise field, which
 * turns perfect circles into the ragged, hand-inked coastlines in the
 * reference — no hand-authored path data, no image asset. The `<animate>`
 * on the turbulence's `baseFrequency` drifts that noise field slowly, so
 * the coastlines breathe instead of sitting perfectly static.
 *
 * Adapted from the supplied component: the original bundled its own demo
 * heading and card inside `.content`. This version is backdrop-only —
 * `position: fixed`, behind whatever the page actually renders — since
 * Archive supplies its own hero and record content on top rather than the
 * demo copy.
 */
export function ArcticMapBackground({ className }: ArcticMapBackgroundProps) {
  return (
    <div className={`arctic-pattern-wrapper ${className ?? ''}`} aria-hidden>
      <div className="arctic-ocean-backdrop">
        <div className="arctic-island-backdrop" />
      </div>
      <div className="arctic-snow" />

      {/* SVG filter definition — zero-size, referenced by CSS `filter: url(#handDrawnNoise)`. */}
      <svg height="0" width="0" style={{ position: 'absolute' }}>
        <filter id="handDrawnNoise">
          <feTurbulence result="noise" numOctaves={5} baseFrequency="0.0065" type="fractalNoise">
            {/* Slow drift in the noise field: a subtle, living coastline rather than a static warp. */}
            <animate attributeName="baseFrequency" dur="60s" values="0.0065;0.008;0.0065" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap yChannelSelector="G" xChannelSelector="R" scale="220" in2="noise" in="SourceGraphic" />
        </filter>
      </svg>
    </div>
  )
}
