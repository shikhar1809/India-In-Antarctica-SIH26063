/**
 * What the front-page hero shows: the archive itself, newest and most
 * widely shared first.
 *
 * Slides are chosen in three tiers, and the order is the point:
 *
 *   1. Records that were actually posted about, most recently shared
 *      first. These are the best slides available — the caption can carry
 *      the platforms the post went to, which is the visible evidence that
 *      publishing and disseminating both happened.
 *   2. Published records with a cover photograph, newest first. Not shared
 *      yet, so no platform badges, but still a real record with a real
 *      photograph and a working "View in archive" link.
 *   3. Three station photographs, only if the archive has no photographed
 *      records at all.
 *
 * Tier 2 exists because tier 3 used to run in its place, and that was
 * wrong: with nine photographed records published, the front page was
 * showing three stock station photographs that were about no record, linked
 * to nothing, and — since the caption's badges and archive link are both
 * conditional on a slide having a record behind it — carried neither. A
 * hero whose premise is "this is the archive" should fall back to the
 * archive long before it falls back to stock imagery.
 *
 * A record still needs a cover photograph to appear at all; there is
 * nothing to put in a slideshow frame otherwise.
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
   *  first. Empty on a record that has been published but not yet shared,
   *  and on the station-photograph fallbacks — the caption simply shows no
   *  badges in that case rather than claiming a post that did not happen. */
  platforms: SocialPlatform[];
}

/** Last resort only: shown when the archive has no photographed record
 *  to put on the front page at all. */
const FALLBACK_SLIDES: HeroSlide[] = [
  { image: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/An_aerial_view_of_the_Indian_Station_Maitri%2C_Antarctica_on_February_2%2C_2005.jpg', title: 'Maitri Research Station', platforms: [] },
  { image: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Bharati_permanent_Antarctic_research_station.jpg', title: 'Bharati Research Station', platforms: [] },
  { image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/%E0%A4%A6%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%BF%E0%A4%A3_%E0%A4%97%E0%A4%82%E0%A4%97%E0%A5%8B%E0%A4%A4%E0%A5%8D%E0%A4%B0%E0%A5%80%2C_%E0%A4%85%E0%A4%82%E0%A4%9F%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%95%E0%A4%9F%E0%A4%BF%E0%A4%95%E0%A4%BE.jpg/1280px-%E0%A4%A6%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%BF%E0%A4%A3_%E0%A4%97%E0%A4%82%E0%A4%97%E0%A5%8B%E0%A4%A4%E0%A5%8D%E0%A4%B0%E0%A5%80%2C_%E0%A4%85%E0%A4%82%E0%A4%9F%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%95%E0%A4%9F%E0%A4%BF%E0%A4%95%E0%A4%BE.jpg', title: 'Dakshin Gangotri', platforms: [] },
];

const MAX_SLIDES = 5;
const MIN_SLIDES = 3;

/** `live` is true once at least one slide is a real archive record rather
 *  than a station photograph — i.e. whenever the hero is showing the
 *  archive at all, which is the honest thing for a status panel to report. */
export function useHeroSlides(): { slides: HeroSlide[]; live: boolean } {
  const { records } = useRepository();

  return useMemo(() => {
    const slideFor = (r: (typeof records)[number]): HeroSlide => ({
      image: r.photoUrls[0],
      title: r.title,
      station: r.metadata?.station,
      // Every record-backed slide gets this, and it is what the caption's
      // "View in archive" link and platform badges hang off — a slide with
      // no href renders as a bare photograph.
      href: `/knowledge-repository/${recordSlug(r)}`,
      platforms: [...new Set(
        [...(r.socialPosts ?? [])].sort((a, b) => b.postedAt - a.postedAt).map((p) => p.platform),
      )],
    });

    const photographed = records.filter((r) => r.photoUrls?.[0]);

    // Tier 1 — shared records, most recently shared first. Dissemination is
    // its own event, so its freshest timestamp is the right sort key here
    // rather than the publication date.
    const shared = photographed
      .filter((r) => r.socialPosts?.length)
      .sort((a, b) => {
        const latest = (r: typeof a) => Math.max(...r.socialPosts!.map((p) => p.postedAt));
        return latest(b) - latest(a);
      })
      .map(slideFor);

    // Tier 2 — everything else that has a photograph, newest published
    // first, skipping anything tier 1 already used.
    const sharedIds = new Set(shared.map((s) => s.href));
    const published = [...photographed]
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
      .map(slideFor)
      .filter((s) => !sharedIds.has(s.href));

    const fromArchive = [...shared, ...published].slice(0, MAX_SLIDES);

    // Tier 3 — station photographs, and only if the archive gave us
    // nothing. Padding a short-but-real strip with stock imagery would put
    // a slide that is about no record next to slides that are about one.
    if (fromArchive.length === 0) {
      return { slides: FALLBACK_SLIDES.slice(0, MIN_SLIDES), live: false };
    }

    return { slides: fromArchive, live: true };
  }, [records]);
}
