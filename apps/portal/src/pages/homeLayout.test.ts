import { describe, expect, it } from 'vitest';
import { asPublished } from './homeLayout';
import { config } from '../puck.config';

/* The editor used to show a page nobody had seen in months: the saved
 * content, not the page the public site builds from it. These are the two
 * halves of keeping them in step. */

describe('the editor shows the page as published', () => {
  const saved = {
    content: [
      { type: 'HeroBlock', props: { id: 'hero-1', badge: 'old field' } },
      { type: 'StatsBlock', props: { id: 'stats-1' } },
      { type: 'TextBlock', props: { id: 'text-1', heading: "India's Polar Legacy" } },
      { type: 'AnnouncementsBlock', props: { id: 'ann-1', heading: 'Latest Updates' } },
      { type: 'BannerBlock', props: { id: 'banner-1', ctaUrl: 'https://iia-game.web.app' } },
    ],
  };

  it('matches the live sequence of sections', () => {
    expect(asPublished(saved).content?.map((b) => b.type)).toEqual([
      'HeroBlock', 'StatsBlock', 'ParallaxLegacyBlock', 'GalleryBlock', 'BannerBlock',
    ]);
  });

  it('leaves an announcements block that is not the retired one', () => {
    const kept = { content: [{ type: 'AnnouncementsBlock', props: { heading: 'Expedition notices' } }] };
    expect(asPublished(kept).content).toHaveLength(1);
  });

  it('is idempotent — publishing the transformed page does not double up', () => {
    const once = asPublished(saved);
    expect(asPublished(once).content?.map((b) => b.type)).toEqual(once.content?.map((b) => b.type));
  });

  it('drops the banner that repeats the gallery’s own call to action', () => {
    const withDup = {
      content: [
        { type: 'TextBlock', props: { heading: "India's Polar Legacy" } },
        { type: 'BannerBlock', props: { ctaUrl: '/gallery' } },
      ],
    };
    expect(asPublished(withDup).content?.map((b) => b.type)).toEqual(['ParallaxLegacyBlock', 'GalleryBlock']);
  });

  it('offers every block the live page uses', () => {
    for (const type of ['HeroBlock', 'StatsBlock', 'ParallaxLegacyBlock', 'GalleryBlock', 'BannerBlock']) {
      expect(config.components, type).toHaveProperty(type);
    }
  });
});
