/**
 * Client for the editorial reviewer (functions/review.js).
 *
 * The key lives server-side, same as the studio generator — a Cloud
 * Function holds the Gemini credential and returns only text.
 *
 * The reviewer is advisory and always optional. If it is unreachable, slow,
 * unconfigured or returns nonsense, the approvals desk still works on the
 * local checks alone: this resolves to `available: false` rather than
 * throwing, because a reviewer being down must never stop someone
 * approving a dispatch that is perfectly fine.
 */

import type { Dispatch } from '../types';
import type { Severity } from './checks';

const REVIEW_URL =
  (import.meta.env.VITE_REVIEW_API as string | undefined) ??
  'https://asia-south1-indiainantartica.cloudfunctions.net/studio/review';

export type AiFinding = {
  /* The model is never allowed to emit 'blocker' — refusing to publish is a
     rule's decision, and review.js drops any finding claiming otherwise. */
  severity: Exclude<Severity, 'blocker'>;
  label: string;
  detail: string;
  field: 'title' | 'summary' | 'caption' | 'notes' | 'overall';
};

export type AiReview =
  | { available: true; verdict: 'ready' | 'needs-work'; summary: string; findings: AiFinding[] }
  | { available: false; reason: string };

export async function reviewDispatch(d: Dispatch, signal?: AbortSignal): Promise<AiReview> {
  const summary = d.publicSummary;

  try {
    const res = await fetch(REVIEW_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        activity: d.activity,
        station: d.station,
        observedAt: new Date(d.observedAt ?? d.createdAt).toISOString().slice(0, 10),
        notes: d.notes ?? '',
        measurements: d.measurements ?? {},
        weather: d.weather
          ? `${d.weather.airTempC ?? '?'} C, wind ${d.weather.windDir ?? ''} ${d.weather.windSpeedKt ?? '?'} kt`
          : '',
        publicTitle: summary?.title ?? '',
        publicBody: (summary?.body ?? []).join('\n\n'),
        caption: d.caption ?? '',
        captionX: d.platformCaptions?.x ?? '',
        captionLinkedIn: d.platformCaptions?.linkedin ?? '',
        captionInstagram: d.platformCaptions?.instagram ?? '',
      }),
    });

    if (res.status === 503) return { available: false, reason: 'No reviewer configured.' };
    if (!res.ok) return { available: false, reason: `Reviewer returned ${res.status}.` };

    const json = await res.json();
    if (!Array.isArray(json?.findings)) {
      return { available: false, reason: 'Reviewer returned an unexpected shape.' };
    }

    return {
      available: true,
      verdict: json.verdict === 'needs-work' ? 'needs-work' : 'ready',
      summary: String(json.summary ?? ''),
      findings: json.findings as AiFinding[],
    };
  } catch (err) {
    // An aborted request is the approver moving on, not a failure worth
    // reporting to them.
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { available: false, reason: 'cancelled' };
    }
    return { available: false, reason: 'Could not reach the reviewer.' };
  }
}
