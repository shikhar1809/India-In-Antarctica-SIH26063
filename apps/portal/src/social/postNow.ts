/**
 * Posting an approved post to its platforms, now.
 *
 * "Approve & post" on the approve desk and "Post now" on the live feed both
 * land here. Each platform the publisher wrote a caption for becomes a row in
 * the socialPosts queue, timed for now, and is sent straight away through the
 * server (functions/socialsender.js), which records the permalink or the
 * platform's reason on the row. So a post that fails is not lost — it sits in
 * the Queue tab as Failed, with the reason, and can be retried from there.
 */

import { saveScheduledPost } from '../hooks/useSocialQueue';
import type { RepositoryRecord } from '../repository/contract';
import type { Dispatch } from '../types';
import { PLATFORM_LIMITS, SOCIAL_PLATFORMS, schedulePost, type SocialPlatform } from './queue';
import { sendNow } from './uploadPostAdapter';

export interface PostOutcome {
  platform: SocialPlatform;
  label: string;
  ok: boolean;
  url?: string;
  note?: string;
}

/** The platforms this post was written for — those with a caption. */
export function platformsOf(d: Pick<Dispatch, 'platformCaptions'>): SocialPlatform[] {
  return SOCIAL_PLATFORMS.filter((p) => !!d.platformCaptions?.[p]?.trim());
}

export async function postToPlatforms(
  record: RepositoryRecord & { id: string },
  d: Pick<Dispatch, 'platformCaptions' | 'postGraphics'>,
  createdBy: string,
  only: SocialPlatform[] = platformsOf(d),
): Promise<PostOutcome[]> {
  const now = Date.now();
  const out: PostOutcome[] = [];
  for (const platform of only) {
    const label = PLATFORM_LIMITS[platform].label;
    const caption = d.platformCaptions?.[platform]?.trim() ?? '';
    // The finished graphic made for this platform, words and all; failing
    // that, the record's photograph.
    const imageUrl = d.postGraphics?.[platform] ?? record.photoUrls?.[0] ?? null;
    const { post, issues } = schedulePost(record, platform, caption, now, createdBy, imageUrl, now);
    const blocking = issues.find((i) => i.level === 'error');
    if (blocking) { out.push({ platform, label, ok: false, note: blocking.message }); continue; }
    try {
      await saveScheduledPost(post);
      const r = await sendNow(post.id);
      out.push({ platform, label, ok: r.ok, url: r.externalUrl, note: r.error });
    } catch (e) {
      out.push({ platform, label, ok: false, note: e instanceof Error ? e.message : 'Could not queue the post.' });
    }
  }
  return out;
}
