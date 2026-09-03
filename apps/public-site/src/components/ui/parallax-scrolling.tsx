'use client';

/**
 * parallax-scrolling.tsx — layered scroll-reveal hero.
 *
 * Adapted from the supplied Osmo component. What changed and why:
 *  - `@studio-freight/lenis` is gone. This project already runs Lenis
 *    (the current package, `@studio-freight/lenis`'s successor) globally —
 *    the gallery section right below this one mounts `<ReactLenis root>`
 *    (see sticky-scroll.tsx). A second, independent `new Lenis()` here
 *    would drive the SAME window scroll with its own physics, competing
 *    with the first on every scroll gesture. Instead this hooks into the
 *    existing instance with `useLenis` from `lenis/react` — it reads a
 *    module-level store the root instance publishes to, works from
 *    anywhere in the tree (no wrapping required), and is a harmless no-op
 *    when no Lenis is mounted at all (reduced motion), which is exactly
 *    the fallback ScrollTrigger needs: it has its own native-scroll
 *    listener and doesn't require Lenis to function.
 *  - Content is prop-driven (three real photographs + eyebrow/title/
 *    subtitle/body) instead of the demo's hardcoded CDN placeholder images
 *    and Osmo logo/credits, since this replaces a real content section.
 *  - The body copy is overlaid on the hero images themselves (in the same
 *    text block as the title), not split into a second full-bleed photo
 *    section below. An earlier version of this component did exactly that
 *    — a separate image-plus-text block with its own photo — and it read
 *    as a random extra section wedged between the hero and the gallery,
 *    not as part of the hero. One overlay, on the images already doing
 *    the work, is the actual fix.
 *  - Each layer photo carries its own small caption — the station name
 *    plus a plain line of real info about it, printed right on the photo
 *    — instead of being unlabeled until the title overlay settles in. A
 *    "More Info" link elsewhere was tried first and dropped: the ask was
 *    for the information itself to be there, not a pointer to it.
 *  - `gsap.context()` scopes every tween/ScrollTrigger this component
 *    creates to its own root, so `ctx.revert()` on unmount is a complete,
 *    order-independent teardown — the original's manual
 *    `ScrollTrigger.getAll().forEach(st => st.kill())` would kill every
 *    ScrollTrigger on the page, including ones other sections own.
 *  - Respects `prefers-reduced-motion`: the layered scroll-tween is
 *    skipped entirely and every layer renders in its settled position,
 *    matching the reduced-motion handling already established for the
 *    gallery section right below.
 */

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useLenis } from 'lenis/react';
import './parallax-scrolling.css';

export interface ParallaxLayerImage {
  src: string;
  alt: string;
  /** Caption shown on the photo itself: the station name. */
  label?: string;
  /** A line of plain info about the station, printed right on the photo —
   *  not a link elsewhere. */
  info?: string;
}

export interface ParallaxComponentProps {
  /** Front-most layer — travels fastest, clears first. */
  frontImage: ParallaxLayerImage;
  /** Second layer — travels at a middle rate. */
  midImage: ParallaxLayerImage;
  /** Back-most layer — travels slowest, settles as the reveal payoff. */
  backImage: ParallaxLayerImage;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Body copy, overlaid on the images with the title — not a separate
   *  section. */
  body?: string;
}

/** The eyebrow/title/subtitle/body text, shared by the animated and
 *  reduced-motion layouts so the two can't drift out of sync with each
 *  other. */
function ParallaxCopy({
  eyebrow,
  title,
  subtitle,
  body,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  body?: string;
}) {
  return (
    <>
      {eyebrow ? <span className="parallax__eyebrow">{eyebrow}</span> : null}
      <h2 className="parallax__title">{title}</h2>
      {subtitle ? <p className="parallax__subtitle">{subtitle}</p> : null}
      <span className="parallax__tricolor" aria-hidden="true" />
      {body ? <p className="parallax__body-copy">{body}</p> : null}
    </>
  );
}

/** A photo's own caption — the station name, plainly, plus a short line
 *  of real info about it printed right there on the photo. Sits inside
 *  the same translating layer as its photo, so it travels with it rather
 *  than staying pinned to the viewport. */
function ParallaxCaption({ label, info }: { label?: string; info?: string }) {
  if (!label) return null;
  return (
    <div className="parallax__layer-caption">
      <span className="parallax__layer-caption-label">{label}</span>
      {info ? <span className="parallax__layer-caption-info">{info}</span> : null}
    </div>
  );
}

function useReducedMotion() {
  const ref = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  return ref.current;
}

export function ParallaxComponent({
  frontImage,
  midImage,
  backImage,
  eyebrow,
  title,
  subtitle,
  body,
}: ParallaxComponentProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  // Nudges ScrollTrigger to recompute against Lenis's smoothed position
  // rather than the raw native scroll event it'd otherwise poll — only
  // meaningfully different from ScrollTrigger's own listener when a root
  // Lenis instance exists at all (see file header).
  useLenis(() => ScrollTrigger.update());

  useEffect(() => {
    if (reducedMotion) return undefined;
    const root = rootRef.current;
    const stage = root?.querySelector<HTMLElement>('[data-parallax-layers]');
    if (!root || !stage) return undefined;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: stage,
          start: '0% 0%',
          end: '100% 0%',
          scrub: 0,
        },
      });

      const layers: { layer: string; yPercent: number }[] = [
        { layer: '1', yPercent: 70 },
        { layer: '2', yPercent: 55 },
        { layer: '3', yPercent: 40 },
        { layer: '4', yPercent: 10 },
      ];

      layers.forEach((l, idx) => {
        tl.to(
          stage.querySelectorAll(`[data-parallax-layer="${l.layer}"]`),
          { yPercent: l.yPercent, ease: 'none' },
          idx === 0 ? undefined : '<'
        );
      });
    }, root);

    return () => ctx.revert();
  }, [reducedMotion]);

  // Under reduced motion the layered stack never animates, which means the
  // opaque, full-bleed front layer would sit forever on top of the title
  // and back image with nothing to reveal them — losing the section's
  // actual content, not just its motion. A plain static hero (the payoff
  // image with the title over it) is the honest reduced-motion version of
  // this section, not an unanimated copy of the layered one.
  if (reducedMotion) {
    return (
      <div className="parallax parallax--static">
        <section className="parallax__header">
          <div className="parallax__visuals">
            <img src={backImage.src} alt={backImage.alt} loading="eager" className="parallax__static-img" />
            <ParallaxCaption label={backImage.label} info={backImage.info} />
            <div className="parallax__layer-title parallax__layer-title--static">
              <ParallaxCopy eyebrow={eyebrow} title={title} subtitle={subtitle} body={body} />
            </div>
            <div className="parallax__fade" />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="parallax" ref={rootRef}>
      <section className="parallax__header">
        <div className="parallax__visuals">
          <div data-parallax-layers className="parallax__layers">
            <div data-parallax-layer="1" className="parallax__layer parallax__layer--front">
              <img src={frontImage.src} alt={frontImage.alt} loading="eager" />
              <ParallaxCaption label={frontImage.label} info={frontImage.info} />
            </div>
            <div data-parallax-layer="2" className="parallax__layer parallax__layer--mid">
              <img src={midImage.src} alt={midImage.alt} loading="eager" />
              <ParallaxCaption label={midImage.label} info={midImage.info} />
            </div>
            <div data-parallax-layer="3" className="parallax__layer-title">
              <ParallaxCopy eyebrow={eyebrow} title={title} subtitle={subtitle} body={body} />
            </div>
            <div data-parallax-layer="4" className="parallax__layer parallax__layer--back">
              <img src={backImage.src} alt={backImage.alt} loading="eager" />
              <ParallaxCaption label={backImage.label} info={backImage.info} />
            </div>
          </div>
          <div className="parallax__fade" />
        </div>
      </section>
    </div>
  );
}
