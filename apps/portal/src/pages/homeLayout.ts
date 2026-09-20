/**
 * What the public home page is actually made of.
 *
 * The public site does not render the saved page verbatim: on the way to the
 * screen it swaps the plain "India's Polar Legacy" text section for the
 * parallax one, drops the old "Latest Updates" block, and inserts the station
 * gallery after the legacy section (see public-site/src/pages/Home.tsx,
 * withGalleryAfterLegacy).
 *
 * That transform is why the editor looked like a different website: it was
 * showing the saved content, and the saved content has been behind the live
 * page for months. Applying the same rules here, on load, puts the editor and
 * the page back in agreement — and because the editor saves what it is
 * showing, the first publish after this makes the stored page honest too, at
 * which point the transform on the public side is a no-op.
 *
 * Kept as its own module, in plain data, so it can be read next to the
 * public-site function it mirrors rather than buried in the editor.
 */

export interface PuckBlock { type: string; props?: Record<string, unknown> }
export interface PuckData { content?: PuckBlock[]; root?: unknown; zones?: unknown }

const LEGACY_HEADING = "India's Polar Legacy";

export function asPublished(data: PuckData | null | undefined): PuckData {
  const content = data?.content;
  if (!Array.isArray(content)) return (data ?? {}) as PuckData;

  let next: PuckBlock[] = [...content];

  // The legacy section is the parallax one on the live page.
  next = next.map((b) =>
    b?.type === 'TextBlock' && (b.props as { heading?: string } | undefined)?.heading === LEGACY_HEADING
      ? { ...b, type: 'ParallaxLegacyBlock' }
      : b,
  );

  // "Latest Updates" was taken off the page.
  next = next.filter(
    (b) => !(b?.type === 'AnnouncementsBlock' && (b.props as { heading?: string } | undefined)?.heading === 'Latest Updates'),
  );

  // The station gallery sits directly after the legacy section.
  const legacyAt = next.findIndex((b) => (b.props as { heading?: string } | undefined)?.heading === LEGACY_HEADING);
  if (legacyAt !== -1 && next[legacyAt + 1]?.type !== 'GalleryBlock') {
    next.splice(legacyAt + 1, 0, { type: 'GalleryBlock', props: { id: 'gallery-station-photos' } });
  }

  // The gallery carries its own "view the full gallery" call to action, so a
  // banner immediately after it was a second one saying the same thing.
  const galleryAt = next.findIndex((b) => b?.type === 'GalleryBlock');
  const after = galleryAt === -1 ? null : next[galleryAt + 1];
  if (after?.type === 'BannerBlock' && (after.props as { ctaUrl?: string } | undefined)?.ctaUrl === '/gallery') {
    next.splice(galleryAt + 1, 1);
  }

  return { ...data, content: next };
}
