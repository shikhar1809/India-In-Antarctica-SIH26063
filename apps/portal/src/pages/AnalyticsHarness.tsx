/**
 * Dev-only harness for the outreach dashboard, at /__analytics.
 *
 * The real page needs a Google sign-in, a role with analytics access, and a
 * live Upload-Post key behind the engagement function — none of which a
 * layout check should depend on. This mounts AnalyticsView against fixtures
 * instead.
 *
 * Every number here is synthetic, and the handles are obviously so. The
 * real account analytics describe real people's followers (age, city,
 * country), which is not something to commit to a repository as a fixture.
 *
 * Fixtures fill only the fields the view reads, cast to the full types.
 * Excluded from production by the `import.meta.env.DEV` guard in App.tsx.
 */

import { useState } from 'react';
import { AnalyticsView, type AccountState } from './Analytics';
import type { RepositoryRecord } from '../repository/contract';
import type { Dispatch } from '../types';
import type { ScheduledPost } from '../social/queue';
import type { AccountStats } from '../social/engagementClient';

const NOW = Date.UTC(2026, 8, 10, 9, 30);
const DAY = 86_400_000;

/** 30 days ending yesterday, shaped by `f(i)` (i = 0 is 29 days ago). */
function series(f: (i: number) => number, withToday = true) {
  const out = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(NOW - (29 - i) * DAY).toISOString().slice(0, 10),
    value: Math.max(0, Math.round(f(i))),
  }));
  // The API includes today's partial day; the view must drop it.
  if (withToday) out[out.length - 1].value = 12;
  return out;
}

const ACCOUNTS: AccountStats[] = [
  {
    platform: 'instagram', handle: 'harness_insta', available: true,
    metricType: 'reach', primaryLabel: 'Unique Reach',
    followers: 1284, reach: 18400, impressions: 26950, likes: 1210, comments: 88,
    shares: 342, saves: 510, profileViews: 930, profileViewsLabel: 'Accounts Engaged',
    series: series((i) => 380 + 260 * Math.sin(i / 3.2) + i * 14),
    page: null,
    demographics: {
      age: [
        { label: '13-17', value: 38 }, { label: '18-24', value: 512 }, { label: '25-34', value: 401 },
        { label: '35-44', value: 190 }, { label: '45-54', value: 82 }, { label: '55-64', value: 41 },
        { label: '65+', value: 20 },
      ],
      gender: [{ label: 'M', value: 640 }, { label: 'F', value: 520 }, { label: 'U', value: 124 }],
      country: [
        { label: 'IN', value: 1030 }, { label: 'NP', value: 44 }, { label: 'US', value: 38 },
        { label: 'AU', value: 31 }, { label: 'GB', value: 22 }, { label: 'NO', value: 9 },
      ],
      city: [
        { label: 'Goa, Goa', value: 160 }, { label: 'Delhi, Delhi', value: 142 },
        { label: 'Pune, Maharashtra', value: 96 }, { label: 'Bengaluru, Karnataka', value: 88 },
        { label: 'Kolkata, West Bengal', value: 61 }, { label: 'Chennai, Tamil Nadu', value: 47 },
      ],
    },
  },
  {
    platform: 'linkedin', handle: 'Harness Page', available: true,
    metricType: 'reach', primaryLabel: 'Unique Reach',
    followers: 412, reach: 1890, impressions: 5120, likes: null, comments: null, shares: null,
    saves: null, profileViews: null, profileViewsLabel: 'Profile views',
    series: series((i) => 40 + (i % 7 === 2 ? 110 : 0) + i * 2),
    page: { views: 640, uniqueViews: 212, desktop: 402, mobile: 238 },
    demographics: null,
  },
  {
    platform: 'x', handle: 'harness_x', available: true,
    metricType: 'impressions', primaryLabel: 'Impressions',
    followers: 96, reach: null, impressions: 0, likes: null, comments: null, shares: null,
    saves: null, profileViews: null, profileViewsLabel: 'Profile views',
    series: series(() => 0),
    page: null,
    demographics: null,
  },
];

const rec = (id: string, cat: string, station: string, daysBack: number): RepositoryRecord => ({
  id, cat, title: id,
  publishedAt: NOW - daysBack * DAY,
  metadata: {
    identifier: id, station,
    publicationYear: new Date(NOW - daysBack * DAY).getUTCFullYear(),
    provenance: { sourceId: `d-${id}`, approvedAt: NOW - daysBack * DAY },
  },
} as unknown as RepositoryRecord);

const RECORDS: RepositoryRecord[] = [
  rec('IIA-2025-0003', 'expedition', 'maitri', 290),
  rec('IIA-2025-0011', 'dataset', 'bharati', 220),
  rec('IIA-2026-0001', 'dataset', 'maitri', 160),
  rec('IIA-2026-0004', 'publication', 'ncpor', 120),
  rec('IIA-2026-0007', 'media', 'bharati', 64),
  rec('IIA-2026-0009', 'dataset', 'maitri', 21),
  rec('IIA-2026-0012', 'expedition', 'dakshin', 400),
  rec('IIA-2026-0013', 'dataset', 'maitri', 6),
];

const dispatch = (id: string, status: string, daysBack: number, safetyFlag = false): Dispatch => ({
  id, status, safetyFlag, createdAt: NOW - daysBack * DAY,
} as unknown as Dispatch);

const DISPATCHES: Dispatch[] = [
  ...RECORDS.map((r) => dispatch(`d-${r.id}`, 'published', Math.round((NOW - r.publishedAt) / DAY) + 3)),
  dispatch('d-new-1', 'raw', 2), dispatch('d-new-2', 'drafted', 9), dispatch('d-new-3', 'flagged', 4),
  dispatch('d-unsafe', 'raw', 12, true),
];

const post = (p: Partial<ScheduledPost> & Pick<ScheduledPost, 'id' | 'platform' | 'status'>): ScheduledPost => ({
  recordId: 'IIA-2026-0009', recordIdentifier: 'IIA-2026-0009',
  caption: 'Surface ozone at Maitri, 2026 season — the record behind it is open in the archive.',
  imageUrl: null, scheduledFor: NOW - DAY, createdBy: 'harness', createdAt: NOW - 2 * DAY,
  postedAt: null, externalUrl: null, postedVia: null, error: null,
  ...p,
});

const POSTS: ScheduledPost[] = [
  post({
    id: 'p1', platform: 'instagram', status: 'posted', postedAt: NOW - 3 * DAY,
    externalUrl: 'https://example.invalid/p1', postedVia: 'instagram',
    engagement: { likes: 214, comments: 17, shares: 41, views: 3820, reach: 2900, saves: 66, fetchedAt: NOW },
  }),
  post({
    id: 'p2', platform: 'x', status: 'posted', postedAt: NOW - 3 * DAY, recordIdentifier: 'IIA-2026-0013',
    recordId: 'IIA-2026-0013', caption: 'New in the archive: daily sea-ice extent off Bharati, 2026.',
    externalUrl: 'https://example.invalid/p2', postedVia: 'x',
    engagement: { likes: 9, comments: 1, shares: 3, views: 610, fetchedAt: NOW },
  }),
  post({
    id: 'p3', platform: 'linkedin', status: 'posted', postedAt: NOW - 2 * DAY,
    externalUrl: 'https://example.invalid/p3', postedVia: 'linkedin',
    engagementNote: 'LinkedIn post metrics are only available for posts published to a LinkedIn Page.',
  }),
  post({ id: 'p4', platform: 'instagram', status: 'queued', scheduledFor: NOW + DAY }),
  post({ id: 'p5', platform: 'x', status: 'failed', error: 'Rate limited' }),
];

export function AnalyticsHarness() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('accounts'); // ?accounts=loading | error | none
  const initial: AccountState =
    mode === 'loading' ? { status: 'loading' }
      : mode === 'error' ? { status: 'error', error: 'Could not reach the analytics service.' }
        : mode === 'none' ? { status: 'ready', data: { configured: false, accounts: [], message: 'Set UPLOAD_POST_API_KEY in functions/.env to read account analytics.' } }
          : { status: 'ready', data: { configured: true, profile: 'harness', fetchedAt: NOW, accounts: ACCOUNTS } };
  const [accounts, setAccounts] = useState<AccountState>(initial);

  return (
    <AnalyticsView
      role="admin"
      records={RECORDS}
      recordsLoading={false}
      dispatches={DISPATCHES}
      posts={POSTS}
      accounts={accounts}
      now={NOW}
      onSync={async () => {
        setAccounts((prev) => ({ status: 'loading', data: prev.data }));
        await new Promise((r) => setTimeout(r, 900));
        setAccounts(initial);
        return 'Harness: fixtures reloaded — nothing was fetched.';
      }}
    />
  );
}
