'use client'

// A sticky-column photo gallery: the outer two columns scroll normally while
// the centre column stays pinned for the length of that scroll, then releases.
// That's the whole trick, and it only works with three real columns side by
// side — on a phone there's no "other column" to scroll past, so mobile drops
// the grid entirely and renders one plain stacked list instead of faking the
// effect at a width where it can't exist.
//
// Adapted from the supplied component. What changed and why:
//  - The demo's own hero banner ("Create Gallery In a Better Way") and huge
//    footer wordmark are gone — this is one section of an existing page, not
//    a standalone page with its own chrome.
//  - The 13 placeholder images (hotlinked from a third-party CDN) are gone.
//    The centre column is the three real stations — Maitri, Bharati, Dakshin
//    Gangotri — captioned as such; the two side columns use this project's
//    own generated cover art (see lib/archiveCovers.ts, already used on the
//    Archive page) instead of stock photography with no connection to the
//    subject.
//  - `ReactLenis root` is skipped when the visitor has asked for reduced
//    motion — smooth-scroll easing is a comfort feature, not a requirement,
//    and overriding that preference site-wide for one section would be the
//    wrong trade.
import * as React from 'react'
import { ReactLenis } from 'lenis/react'

export interface GalleryImage {
  src: string
  alt: string
  caption?: string
}

export interface StickyScrollGalleryProps {
  /** Three images for the pinned centre column — station photographs. */
  center: GalleryImage[]
  /** Images for the left column. */
  left: GalleryImage[]
  /** Images for the right column. */
  right: GalleryImage[]
  className?: string
}

function useGalleryReducedMotion() {
  const [reduced, setReduced] = React.useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function Frame({ img, tall }: { img: GalleryImage; tall?: boolean }) {
  return (
    <figure className="group relative w-full overflow-hidden rounded-lg">
      <img
        src={img.src}
        alt={img.alt}
        loading="lazy"
        className={`block w-full object-cover align-bottom transition-transform duration-500 ease-out group-hover:scale-[1.04] ${
          tall ? 'h-64 md:h-full' : 'h-64 md:h-80'
        }`}
      />
      {img.caption ? (
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent px-4 py-3 font-medium text-white [font-family:var(--font-disp)]">
          {img.caption}
        </figcaption>
      ) : null}
    </figure>
  )
}

export function StickyScrollGallery({ center, left, right, className }: StickyScrollGalleryProps) {
  const reducedMotion = useGalleryReducedMotion()

  // Below md: one plain stacked column, no sticky column, no grid — the
  // pin-and-scroll-past effect needs a second column still moving beside the
  // pinned one, and a phone-width viewport doesn't have room for that at any
  // size worth looking at. Faking it (e.g. a short sticky height) reads as a
  // glitch, not an effect, so mobile gets the honest simpler layout instead.
  const body = (
    <section className={`bg-black py-10 md:py-16 ${className ?? ''}`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 md:hidden">
        {[...center, ...left, ...right].map((img, i) => (
          <Frame key={i} img={img} />
        ))}
      </div>

      <div className="mx-auto hidden max-w-6xl grid-cols-12 gap-3 px-4 md:grid">
        <div className="col-span-4 grid gap-3">
          {left.map((img, i) => <Frame key={i} img={img} />)}
        </div>
        <div className="sticky top-16 col-span-4 grid h-[calc(100svh-4rem)] grid-rows-3 gap-3">
          {center.map((img, i) => <Frame key={i} img={img} tall />)}
        </div>
        <div className="col-span-4 grid gap-3">
          {right.map((img, i) => <Frame key={i} img={img} />)}
        </div>
      </div>
      
      <div className="mt-16 text-center flex flex-col items-center">
        <h3 className="text-3xl font-medium text-white mb-3" style={{ fontFamily: 'var(--font-disp)' }}>Explore More at Gallery</h3>
        <p className="text-[#8da9c4] mb-8 max-w-md text-center">Discover our complete collection of photographs, historical archives, and expedition logs.</p>
        <a href="/gallery" className="btn-primary-pub" style={{ textDecoration: 'none' }}>View Full Gallery</a>
      </div>
    </section>
  )

  // Lenis binds to the whole window (`root`), so it is skipped outright
  // under reduced motion rather than mounted and immediately fighting a
  // "no smoothing" preference — there is no partial version of "override
  // the visitor's own scroll physics" that respects the setting.
  if (reducedMotion) return body
  return <ReactLenis root>{body}</ReactLenis>
}

/** Default content: three real station photographs centre, more real
 *  Antarctic photography (see lib/galleryArt.ts — sourced from Wikimedia
 *  Commons, each frame's actual origin credited there) filling the two
 *  side columns.
 *
 *  The side columns carry MORE images than the centre on purpose — a CSS
 *  Grid row stretches every column to the tallest one by default, so if
 *  centre/left/right all held the same 3 images, the row (the sticky
 *  column's own containing block) would end up exactly as tall as the
 *  sticky column itself. That leaves zero room for it to travel before
 *  it "unpins," which is indistinguishable from `position: static` while
 *  scrolling — the bug this once had. Extra images on the sides make the
 *  row taller than the pinned centre, giving the pin-and-scroll-past
 *  effect actual distance to happen over. */
export function ArchiveGallerySection() {
  /* Ten photographs exist (public/photos, credited in lib/galleryArt.ts)
   * and every one appears exactly once. The columns used to ask for
   * fifteen frames between them, so five were repeats — the same station
   * and the same icebreaker twice in one view, which reads as a bug
   * rather than a gallery. Fewer frames, all different, is the honest
   * version of this section. */
  const center: GalleryImage[] = [
    { src: '/photos/maitri-aerial.jpg', alt: 'Maitri research station', caption: 'Maitri — Schirmacher Oasis' },
    { src: '/photos/bharati-station.jpg', alt: 'Bharati research station', caption: 'Bharati — Larsemann Hills' },
    { src: '/photos/dakshin-station.jpg', alt: 'Dakshin Gangotri station', caption: 'Dakshin Gangotri — 1984–1990' },
  ]
  const left: GalleryImage[] = [
    { src: '/photos/maitri-flag.jpg', alt: 'Indian flag over Maitri', caption: 'Flag over Maitri, 2005' },
    { src: '/photos/dakshin-aerial.jpg', alt: 'Dakshin Gangotri under construction', caption: 'Dakshin Gangotri — under construction, 1983' },
    { src: '/photos/aurora.jpg', alt: 'Aurora australis over Antarctica', caption: 'Aurora australis, from the ISS' },
    { src: '/photos/lake-priyadarshini.jpg', alt: 'Lake Priyadarshini', caption: 'Lake Priyadarshini, near Maitri' },
  ]
  const right: GalleryImage[] = [
    { src: '/photos/aurora-panorama.jpg', alt: 'Aurora australis panorama', caption: 'Aurora, wide panorama' },
    { src: '/photos/icebreaker.jpg', alt: 'Icebreaker in Antarctic waters', caption: 'Resupply icebreaker' },
    { src: '/photos/field-camp.jpg', alt: 'Tent field camp, Union Glacier', caption: 'Field camp, Union Glacier' },
  ]

  return <StickyScrollGallery center={center} left={left} right={right} />
}
