/**
 * Client for the screening model (functions/screen.js). Admin-only: the
 * request carries a raw report's text, so it goes with the signed-in
 * admin's ID token. Resolves to `available: false` rather than throwing —
 * the rule-based findings stand on their own if the model is unreachable.
 */

import { auth } from '../firebase';
import type { Finding, ScreenField } from './detect';

const SCREEN_URL =
  (import.meta.env.VITE_SCREEN_API as string | undefined) ??
  'https://asia-south1-indiainantartica.cloudfunctions.net/studio/screen';

export type ModelScreening =
  | {
      available: true;
      summary: string;
      recommendation: 'publish' | 'publish-after-redaction' | 'hold';
      findings: Omit<Finding, 'id' | 'source'>[];
    }
  | { available: false; reason: string };

export async function screenWithModel(
  fields: Partial<Record<ScreenField, string>>,
  context: { station?: string; activity?: string },
  signal?: AbortSignal,
): Promise<ModelScreening> {
  const user = auth.currentUser;
  if (!user) return { available: false, reason: 'Sign in as an admin to use the screening model.' };
  try {
    const token = await user.getIdToken();
    const res = await fetch(SCREEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...fields, ...context }),
      signal,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { available: false, reason: body?.error ?? `The screening model returned ${res.status}.` };
    return { available: true, summary: body.summary, recommendation: body.recommendation, findings: body.findings ?? [] };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return { available: false, reason: 'cancelled' };
    return { available: false, reason: 'Could not reach the screening model.' };
  }
}
