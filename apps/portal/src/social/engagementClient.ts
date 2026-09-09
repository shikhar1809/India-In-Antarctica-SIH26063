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
  message?: string;
  errors?: { postId: string; message: string }[];
}

export async function refreshEngagement(): Promise<
  { ok: true; result: EngagementRefreshResult } | { ok: false; reason: string }
> {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: 'Sign in first.' };

  try {
    const token = await user.getIdToken();
    const res = await fetch(ENGAGEMENT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
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
