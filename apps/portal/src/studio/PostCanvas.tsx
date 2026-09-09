/**
 * The renderer. Photograph + words + template + palette → pixels.
 *
 * This is the component that replaces "ask an image model for a finished
 * post". Everything here is ordinary DOM laid out by CSS, which buys three
 * things a generated raster cannot give you: the wordmark is the real file
 * rather than an approximation of it, the type is selectable and correctly
 * spelled, and the same inputs render identically every single time.
 *
 * The frame is always built at the platform's native pixel size and then
 * scaled down for display with a transform, so what a publisher previews is
 * exactly what `exportPng` will write out — no second layout path.
 */

import { IDENTITY, FONTS, TYPE_SCALE, PLATFORM_SPECS } from './brand';
import type { Palette, PlatformId } from './brand';
import type { Template } from './templates';
import type { PostCopy } from './copy';
import './PostCanvas.css';

export interface PostCanvasProps {
  platform: PlatformId;
  template: Template;
  palette: Palette;
  copy: PostCopy;
  photoUrl: string | null;
  /** Fires when the browser refuses or fails to load the photograph, so a
   *  host page can say so rather than showing flat colour and nothing. */
  onPhotoError?: (url: string) => void;
  /** Display scale. 1 renders at native size; the studio previews at ~0.3. */
  scale?: number;
  /** Set on the node that `exportPng` serialises. */
  exportRef?: React.Ref<HTMLDivElement>;
  className?: string;
}

export function PostCanvas({
  platform,
  template,
  palette,
  copy,
  photoUrl,
  onPhotoError,
  scale = 1,
  exportRef,
  className,
}: PostCanvasProps) {
  const spec = PLATFORM_SPECS[platform];
  const { w, h, safe } = spec;

  /* Type is sized off the short edge so one template works at 1:1 and at
   * 16:9 without a second set of numbers. */
  const short = Math.min(w, h);
  /* `template.textScale` comes in here rather than at each call site so a
   * template that gives text less room shrinks all of its type together —
   * shrinking only the headline leaves the standfirst looking oversized. */
  const px = (fraction: number) => Math.round(short * fraction * template.textScale);
  /* Frame geometry must NOT be scaled by textScale — only type is. */
  const geo = (fraction: number) => Math.round(short * fraction);

  const headlineIsLong = copy.headline.split(/\s+/).length > template.headlineWords;
  const headlineSize = px(headlineIsLong ? TYPE_SCALE.headlineLong : TYPE_SCALE.headline);

  /* The photograph's height and the text block's top edge are one decision,
   * not two: if they disagree the headline climbs over the picture. */
  const photoPct = (template.photoHeight ?? 0.58) * 100;

  /* The identity block is anchored bottom-right at a known height, so the
   * text above it gets exactly that much clearance plus a gap. A CSS
   * percentage was close enough to look right and still let the standfirst
   * run under the wordmark at some frame sizes. */
  const identityH = geo(0.058);
  const textClearance = identityH + geo(0.022);

  const onPhoto = template.textOn === 'photo';
  const textColour = onPhoto ? '#ffffff' : palette.ink;
  const dimColour = onPhoto ? 'rgba(255,255,255,0.78)' : palette.inkDim;

  /* Where the photograph goes. `top-band` and `inset` leave flat ground
   * showing, which is what makes those templates readable when the
   * photograph is busy. */
  const photoStyle: React.CSSProperties =
    template.photo === 'full-bleed'
      ? { inset: 0 }
      : template.photo === 'top-band'
        ? { top: 0, left: 0, right: 0, height: `${photoPct}%` }
        : template.photo === 'inset'
          ? { top: safe, left: safe, right: safe, height: `${photoPct}%`, borderRadius: geo(0.02) }
          : { display: 'none' };

  const textBlockStyle: React.CSSProperties =
    template.align === 'centre'
      ? { inset: `${safe}px`, justifyContent: 'center', alignItems: 'center', textAlign: 'center' }
      : template.align === 'bottom-band'
        ? { left: safe, right: safe, bottom: safe, top: `${photoPct + 2}%`, justifyContent: 'flex-end', paddingBottom: textClearance }
        : { left: safe, right: safe, bottom: safe, justifyContent: 'flex-end', paddingBottom: textClearance };

  return (
    <div
      className={`pc-shell${className ? ' ' + className : ''}`}
      style={{ width: w * scale, height: h * scale }}
    >
      <div
        ref={exportRef}
        className="pc-frame"
        style={{
          width: w,
          height: h,
          transform: `scale(${scale})`,
          background: palette.ground,
          fontFamily: FONTS.body,
        }}
      >
        {/* ── photograph ── */}
        {photoUrl && template.photo !== 'none' && (
          <div className="pc-photo" style={photoStyle}>
            {/* No crossOrigin here, deliberately.
             *
             * It used to carry crossOrigin="anonymous" so the canvas would
             * stay untainted for PNG export. It bought nothing — export.ts
             * clones the frame and rewrites every img src to a data URI
             * before rasterising, so the live element is never the thing
             * drawn — and it cost the feature: an image whose host does not
             * send Access-Control-Allow-Origin is refused by the browser
             * outright, so the photograph uploaded fine, was set as the
             * cover, and then simply did not appear. Silently, because a
             * blocked img fires error and renders nothing.
             *
             * onError is what makes the next such failure visible instead
             * of leaving a publisher staring at flat colour. */}
            <img
              src={photoUrl}
              alt=""
              onError={() => onPhotoError?.(photoUrl)}
            />
          </div>
        )}

        {/* ── scrim: only where text sits directly on the photograph ── */}
        {onPhoto && photoUrl && (
          <div
            className="pc-scrim"
            style={{
              background: template.align === 'centre'
                ? `linear-gradient(to bottom, rgba(0,0,0,0.42), rgba(0,0,0,0.62))`
                : palette.scrim,
            }}
          />
        )}

        {/* ── accent rule: the one saturated element, fixed by the palette ── */}
        {template.align !== 'centre' && (
          <div
            className="pc-rule"
            style={{
              left: safe,
              bottom: safe,
              width: geo(0.11),
              height: Math.max(3, geo(0.006)),
              background: palette.accent,
            }}
          />
        )}

        {/* ── text ── */}
        <div className="pc-text" style={textBlockStyle}>
          {template.slots.kicker && copy.kicker && (
            <span
              className="pc-kicker"
              style={{
                fontFamily: FONTS.mono,
                fontSize: px(TYPE_SCALE.kicker),
                color: palette.accent,
                letterSpacing: '0.12em',
                marginBottom: px(0.022),
              }}
            >
              {copy.kicker}
            </span>
          )}

          {template.slots.stat && copy.stat && (
            <span
              className="pc-stat"
              style={{
                fontFamily: FONTS.display,
                fontSize: px(TYPE_SCALE.stat),
                color: textColour,
                lineHeight: 0.9,
              }}
            >
              {copy.stat}
            </span>
          )}

          {template.slots.stat && copy.statLabel && (
            <span
              className="pc-stat-label"
              style={{
                fontFamily: FONTS.body,
                fontSize: px(TYPE_SCALE.standfirst),
                color: dimColour,
                marginTop: px(0.014),
              }}
            >
              {copy.statLabel}
            </span>
          )}

          {template.slots.headline && copy.headline && (
            <h1
              className="pc-headline"
              style={{
                fontFamily: FONTS.display,
                fontSize: headlineSize,
                color: textColour,
                lineHeight: 1.02,
                maxWidth: template.align === 'centre' ? '86%' : '94%',
              }}
            >
              {copy.headline}
            </h1>
          )}

          {template.slots.standfirst && copy.standfirst && (
            <p
              className="pc-standfirst"
              style={{
                fontFamily: FONTS.body,
                fontSize: px(TYPE_SCALE.standfirst),
                color: dimColour,
                marginTop: px(0.022),
                maxWidth: template.align === 'centre' ? '72%' : '78%',
                lineHeight: 1.42,
              }}
            >
              {copy.standfirst}
            </p>
          )}
        </div>

        {/* ── identity: drawn the same way on every frame, always ── */}
        <div
          className="pc-identity"
          style={{
            right: safe,
            bottom: safe,
            gap: geo(0.014),
          }}
        >
          <img
            src={IDENTITY.logoSrc}
            alt=""
            crossOrigin="anonymous"
            style={{ height: identityH, width: 'auto' }}
          />
          <div className="pc-identity-text" style={{ gap: geo(0.004) }}>
            <span
              style={{
                fontFamily: FONTS.display,
                fontSize: px(TYPE_SCALE.footer * 1.25),
                color: textColour,
                letterSpacing: '0.02em',
                lineHeight: 1,
              }}
            >
              {IDENTITY.wordmark}
            </span>
            <span
              style={{
                fontFamily: FONTS.mono,
                fontSize: px(TYPE_SCALE.footer * 0.78),
                color: dimColour,
                letterSpacing: '0.06em',
                lineHeight: 1,
              }}
            >
              {IDENTITY.organisation}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
