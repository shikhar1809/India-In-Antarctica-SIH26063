/**
 * The network half of the agent's research steps. insight.ts turns what
 * comes back into findings; this only fetches.
 *
 *   reach      — the accounts' own analytics (functions/engagement.js),
 *                which needs a signed-in publisher or admin
 *   trends     — Wikipedia interest and recent news (functions/research.js)
 *   sources    — background summaries and papers (functions/research.js)
 *
 * Each can fail on its own; the agent step that called it says so and the
 * run carries on without it.
 */

import { fetchAccountAnalytics, type AccountStats } from '../social/engagementClient';
import { upcomingObservances, type SourceFindings, type TrendFindings } from './insight';

const STUDIO = 'https://asia-south1-indiainantartica.cloudfunctions.net/studio';

export async function fetchReachAccounts(): Promise<AccountStats[]> {
  const r = await fetchAccountAnalytics(false);
  if (!r.ok) throw new Error(r.reason);
  if (!r.data.configured) throw new Error(r.data.message ?? 'No social accounts are connected.');
  return r.data.accounts;
}

async function post<T>(path: string, body: unknown, ms: number): Promise<T> {
  const res = await fetch(`${STUDIO}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ms),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `${path} returned ${res.status}`);
  return json as T;
}

export async function fetchTrends(terms: string[], text: string, now = Date.now()): Promise<TrendFindings> {
  const observances = upcomingObservances(text, now);
  try {
    const body = await post<Omit<TrendFindings, 'observances'>>('/trends', { terms }, 25000);
    return { ...body, observances };
  } catch (err) {
    // The calendar needs no network, so a failed call still leaves a finding.
    return {
      interest: null, news: null, observances, answered: [],
      failed: [{ provider: 'trends', reason: err instanceof Error ? err.message : String(err) }],
    };
  }
}

export async function fetchSources(terms: string[], paperQuery?: string): Promise<SourceFindings> {
  return post<SourceFindings>('/sources', { terms, paperQuery }, 25000);
}
