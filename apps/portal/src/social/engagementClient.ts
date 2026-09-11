/**
 * Client for the engagement harness (functions/engagement.js).
 *
 * Unlike the studio/reviewer clients, this call carries the signed-in
 * user's ID token — the function writes to Firestore and spends real API
 * quota against NCPOR's own platform apps, so it checks who is asking
 * rather than accepting any caller the way the advisory-text endpoints do.
 */

import { auth } from '../firebase';

const ENGAGEMENT_URL =
  (import.meta.env.VITE_ENGAGEMENT_API as string | undefined) ??
  'https://asia-south1-indiainantartica.cloudfunctions.net/engagement';

export interface EngagementRefreshResult {
  connected: string[];
  checked: number;
  updated: number;
  /** The cross-check of which sent posts are still up. */
  liveness?: { checked: number; live: number; removed: number; unknown: number };
  message?: string;
  errors?: { postId: string; message: string }[];
}

export type AccountPlatform = 'x' | 'linkedin' | 'instagram';

export interface Row { label: string; value: number }

/** One connected account's totals, as functions/engagement.js normalises
 *  them. Every metric is null where the platform does not report it — X on
 *  the free API tier gives followers and impressions and nothing else, and
 *  the page says "not reported" there rather than showing a zero. */
export interface AccountStats {
  platform: AccountPlatform;
  handle: string | null;
  available: boolean;
  note?: string;
  metricType?: string;
  primaryLabel?: string;
  followers?: number | null;
  reach?: number | null;
  impressions?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  profileViews?: number | null;
  profileViewsLabel?: string;
  series?: { date: string; value: number }[];
  page?: { views: number | null; uniqueViews: number | null; desktop: number | null; mobile: number | null } | null;
  demographics?: {
    age: Row[] | null;
    gender: Row[] | null;
    country: Row[] | null;
    city: Row[] | null;
  } | null;
}

export interface AccountAnalytics {
  configured: boolean;
  profile?: string;
  fetchedAt?: number;
  cached?: boolean;
  message?: string;
  accounts: AccountStats[];
}

/** Account-level analytics for the handles the portal posts as. Read-only;
 *  `fresh` skips the function's five-minute cache. */
export async function fetchAccountAnalytics(fresh = false): Promise<
  { ok: true; data: AccountAnalytics } | { ok: false; reason: string }
> {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: 'Sign in first.' };
  try {
    const token = await user.getIdToken();
    const res = await fetch(`${ENGAGEMENT_URL}${fresh ? '?fresh=1' : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, reason: body?.error || `Account analytics returned ${res.status}.` };
    return { ok: true, data: body as AccountAnalytics };
  } catch {
    return { ok: false, reason: 'Could not reach the analytics service.' };
  }
}

/** Only the cross-check: asks each platform whether every sent post is
 *  still up, and records the answer on the post. Fast, and needs no
 *  platform credential for X or LinkedIn. */
export function checkLiveness() {
  return refreshEngagement('live');
}

export async function refreshEngagement(mode?: 'live'): Promise<
  { ok: true; result: EngagementRefreshResult } | { ok: false; reason: string }
> {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: 'Sign in first.' };

  try {
    const token = await user.getIdToken();
    const res = await fetch(ENGAGEMENT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(mode ? { mode } : {}),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, reason: body?.error || `The engagement harness returned ${res.status}.` };
    }
    const result = (await res.json()) as EngagementRefreshResult;
    return { ok: true, result };
  } catch {
    return { ok: false, reason: 'Could not reach the engagement harness.' };
  }
}
