/**
 * Dev harness: the "Published content" tab against fixtures — one record
 * whose posts are all live, one with a post deleted on one platform, one
 * whose every post was deleted, and one never posted. Mirrors what
 * functions/liveness.js writes onto socialPosts rows.
 */

import type { Dispatch } from '../types';
import type { ScheduledPost } from '../social/queue';
import { FeedTab } from './Social';
import './Social.css';

const NOW = Date.now();
const H = 3_600_000;

const dispatch = (id: string, identifier: string, caption: string, station: string): Dispatch => ({
  id, status: 'approved', publicIdentifier: identifier, caption, station,
  authorName: 'Asha Rao', updatedAt: NOW - 30 * H, imageUrls: [],
} as unknown as Dispatch);

const post = (id: string, identifier: string, platform: ScheduledPost['platform'], state: 'live' | 'removed' | 'unknown', note?: string): ScheduledPost => ({
  id, recordId: identifier, recordIdentifier: identifier, platform, caption: '…', imageUrl: null,
  scheduledFor: NOW - 20 * H, status: 'posted', createdBy: 'u', createdAt: NOW - 21 * H, postedAt: NOW - 20 * H,
  externalUrl: platform === 'x' ? 'https://x.com/a/status/1' : 'https://example.org/post', postedVia: platform, error: null,
  liveCheck: { state, how: platform === 'x' ? 'x-syndication' : platform === 'linkedin' ? 'linkedin-embed' : 'instagram-api', note, checkedAt: NOW - 4 * 60_000 },
  removedAt: state === 'removed' ? NOW - 2 * H : null,
});

const ITEMS = [
  dispatch('d1', 'IIA-2026-0101', 'Seven years of total column ozone from Maitri, now open to everyone.', 'Maitri'),
  dispatch('d2', 'IIA-2026-0102', 'The first full transect of the Schirmacher shelf this season: twelve stakes, one surprise.', 'Maitri'),
  dispatch('d3', 'IIA-2026-0103', 'Pipeline test — please ignore.', 'Bharati'),
  dispatch('d4', 'IIA-2026-0104', 'Midwinter at Bharati: the crew, the dark, and the aurora.', 'Bharati'),
];

const POSTS = [
  post('p1', 'IIA-2026-0101', 'x', 'live'),
  post('p2', 'IIA-2026-0101', 'linkedin', 'live'),
  post('p3', 'IIA-2026-0102', 'x', 'live'),
  post('p4', 'IIA-2026-0102', 'instagram', 'removed', 'Instagram no longer returns this post, while the account itself reads normally.'),
  post('p5', 'IIA-2026-0102', 'linkedin', 'unknown', 'LinkedIn returned 429.'),
  post('p6', 'IIA-2026-0103', 'x', 'removed', 'This Post was deleted by the Post author.'),
  post('p7', 'IIA-2026-0103', 'linkedin', 'removed', 'LinkedIn reports the post no longer exists.'),
];

export function PublishedHarness() {
  return (
    <div className="fld-page fld-page-compact">
      <div className="fld-center">
        <p style={{ fontSize: 12, color: 'var(--warn)', border: '1px dashed var(--warn)', borderRadius: 8, padding: '8px 12px', margin: '0 0 16px' }}>
          Dev harness — the Published content tab against fixtures. The live page cross-checks with the platforms itself.
        </p>
        <FeedTab items={ITEMS} posts={POSTS} preview />
      </div>
    </div>
  );
}
