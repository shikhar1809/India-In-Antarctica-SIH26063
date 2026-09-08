/**
 * What the front-page hero shows: the archive's own most recent work,
 * not three fixed stock photos.
 *
 * Every slide here is generated on the outreach portal — a scientist's field
 * dispatch, drafted for a public audience, approved by an admin — and
 * projected into `publicArchive` by `publish.ts`. The moment that projection
 * happens, the record is eligible to appear here: there is no separate step
 * to "feature" something on the homepage, because the newest published work
 * IS the featured work.
 *
 * A record needs a cover photo to become a slide — text-only records (most
 * publications, some datasets) do not have imagery to show, so they are
 * skipped rather than shown as a blank frame. If fewer than three published
 * records currently have a photo (a fresh deployment, or an unlucky run of
 * publication-only records), the original three station photographs fill
 * the remainder, so the hero is never emptier than it was before this
 * existed.
 */

import { useMemo } from 'react';
import { useRepository, recordSlug } from '../api/repository';

/** MorphSlider's own item shape — `image` and `caption`, nothing more. */
export interface HeroSlide {
  image: string;
  caption: string;
  /** Present only on a slide sourced from a real record — used to make the
   *  caption a link to the full record rather than plain text. */
  href?: string;
}

const FALLBACK_SLIDES: HeroSlide[] = [
  { image: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/An_aerial_view_of_the_Indian_Station_Maitri%2C_Antarctica_on_February_2%2C_2005.jpg', caption: 'Maitri Research Station' },
  { image: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Bharati_permanent_Antarctic_research_station.jpg', caption: 'Bharati Research Station' },
  { image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/%E0%A4%A6%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%BF%E0%A4%A3_%E0%A4%97%E0%A4%82%E0%A4%97%E0%A5%8B%E0%A4%A4%E0%A5%8D%E0%A4%B0%E0%A5%80%2C_%E0%A4%85%E0%A4%82%E0%A4%9F%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%95%E0%A4%9F%E0%A4%BF%E0%A4%95%E0%A4%BE.jpg/1280px-%E0%A4%A6%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%BF%E0%A4%A3_%E0%A4%97%E0%A4%82%E0%A4%97%E0%A5%8B%E0%A4%A4%E0%A5%8D%E0%A4%B0%E0%A5%80%2C_%E0%A4%85%E0%A4%82%E0%A4%9F%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%95%E0%A4%9F%E0%A4%BF%E0%A4%95%E0%A4%BE.jpg', caption: 'Dakshin Gangotri' },
];

const MAX_SLIDES = 5;
const MIN_SLIDES = 3;

/** True once at least one slide is a real, generated record rather than the
 *  three static fallbacks — the Site Management / Media hubs use this to
 *  say honestly whether the hero is "live" yet. */
export function useHeroSlides(): { slides: HeroSlide[]; live: boolean } {
  const { records } = useRepository();

  return useMemo(() => {
    const generated: HeroSlide[] = records
      .filter((r) => r.photoUrls?.[0])
      .slice(0, MAX_SLIDES)
      .map((r) => ({
        image: r.photoUrls[0],
        caption: [r.title, r.metadata?.station].filter(Boolean).join(' — '),
        href: `/archive/${recordSlug(r)}`,
      }));

    if (generated.length >= MIN_SLIDES) {
      return { slides: generated, live: true };
    }
    // Pad with the static fallback rather than showing an unevenly short
    // strip — a hero that is mostly real records and a little filler still
    // reads as "the archive", not as an empty placeholder.
    return {
      slides: [...generated, ...FALLBACK_SLIDES].slice(0, Math.max(MIN_SLIDES, generated.length)),
      live: generated.length > 0,
    };
  }, [records]);
}
