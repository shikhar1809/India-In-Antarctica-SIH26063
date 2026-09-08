/**
 * What the front-page hero shows: the archive's own social media activity,
 * not three fixed stock photos and not just "whatever published most
 * recently".
 *
 * The hero features records that were actually posted about — each slide
 * is, specifically, evidence that this record was shared, on named
 * platforms, and the caption's "View in archive" link goes to the record
 * that post was about. A record with no confirmed social post does not
 * appear here even if it was published five minutes ago; publishing to the
 * archive and disseminating it are different events (see
 * repository/publish.ts vs. the portal's dissemination queue), and this
 * hero is specifically the second one, not the first.
 *
 * A record also needs a cover photo — there is nothing to put in a
 * slideshow frame otherwise. If fewer than three published, photographed,
 * *actually-shared* records exist (a fresh deployment, or simply before
 * anyone has run a post through the portal's "Mark as posted" flow yet —
 * true of every record as of this writing), the original three station
 * photographs fill the remainder, so the hero is never emptier than it was
 * before this existed.
 *
 * This file stays plain data (`.ts`, no JSX) on purpose — puck.config.tsx's
 * HeroBlockRender is what turns a slide into the actual caption markup
 * (title, platform badges, the "View in archive" link), so a slide here is
 * *what to show*, not *how*.
 */

import { useMemo } from 'react';
import { useRepository, recordSlug } from '../api/repository';
import type { SocialPlatform } from './SocialBadge';

export interface HeroSlide {
  image: string;
  title: string;
  station?: string;
  /** Set only on a slide sourced from a real record — the archive page for
   *  it, and also what makes the caption clickable at all. */
  href?: string;
  /** Distinct platforms this record was disseminated to, most-recent post
   *  first. Never empty on a generated slide — see the module doc comment:
   *  having at least one platform is what qualifies a record for the hero
   *  at all now, not an optional extra shown when present. Empty only on
   *  the three static fallback slides, which are not about any record. */
  platforms: SocialPlatform[];
}

const FALLBACK_SLIDES: HeroSlide[] = [
  { image: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/An_aerial_view_of_the_Indian_Station_Maitri%2C_Antarctica_on_February_2%2C_2005.jpg', title: 'Maitri Research Station', platforms: [] },
  { image: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Bharati_permanent_Antarctic_research_station.jpg', title: 'Bharati Research Station', platforms: [] },
  { image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/%E0%A4%A6%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%BF%E0%A4%A3_%E0%A4%97%E0%A4%82%E0%A4%97%E0%A5%8B%E0%A4%A4%E0%A5%8D%E0%A4%B0%E0%A5%80%2C_%E0%A4%85%E0%A4%82%E0%A4%9F%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%95%E0%A4%9F%E0%A4%BF%E0%A4%95%E0%A4%BE.jpg/1280px-%E0%A4%A6%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%BF%E0%A4%A3_%E0%A4%97%E0%A4%82%E0%A4%97%E0%A5%8B%E0%A4%A4%E0%A5%8D%E0%A4%B0%E0%A5%80%2C_%E0%A4%85%E0%A4%82%E0%A4%9F%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%95%E0%A4%9F%E0%A4%BF%E0%A4%95%E0%A4%BE.jpg', title: 'Dakshin Gangotri', platforms: [] },
];

const MAX_SLIDES = 5;
const MIN_SLIDES = 3;

/** True once at least one slide is a real, generated record rather than the
 *  three static fallbacks — the Site / Media hubs use this to say honestly
 *  whether the hero is "live" yet. */
export function useHeroSlides(): { slides: HeroSlide[]; live: boolean } {
  const { records } = useRepository();

  return useMemo(() => {
    const generated: HeroSlide[] = records
      // Both conditions matter: a photo to show, and at least one confirmed
      // social post — see the module doc comment for why "published" alone
      // no longer qualifies a record for this specific slideshow.
      .filter((r) => r.photoUrls?.[0] && r.socialPosts?.length)
      // Most recently *shared*, not most recently published — this is a
      // feed of dissemination activity, so its own freshest event is the
      // right sort key.
      .sort((a, b) => {
        const latest = (r: typeof a) => Math.max(...r.socialPosts!.map((p) => p.postedAt));
        return latest(b) - latest(a);
      })
      .slice(0, MAX_SLIDES)
      .map((r) => ({
        image: r.photoUrls[0],
        title: r.title,
        station: r.metadata?.station,
        href: `/archive/${recordSlug(r)}`,
        platforms: [...new Set(
          [...r.socialPosts!].sort((a, b) => b.postedAt - a.postedAt).map((p) => p.platform),
        )],
      }));

    if (generated.length >= MIN_SLIDES) {
      return { slides: generated, live: true };
    }
    // Pad with the static fallback rather than showing an unevenly short
    // strip — a hero that is mostly real activity and a little filler still
    // reads as "the archive", not as an empty placeholder. This is the
    // common case today: nothing has gone through "Mark as posted" yet, so
    // every slide is currently a fallback until the first real post is
    // confirmed sent.
    return {
      slides: [...generated, ...FALLBACK_SLIDES].slice(0, Math.max(MIN_SLIDES, generated.length)),
      live: generated.length > 0,
    };
  }, [records]);
}
