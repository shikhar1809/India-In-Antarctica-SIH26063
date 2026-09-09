/**
 * The client half of the visual reference search.
 *
 * Talks to the studio function's /refs endpoint, which proxies Wikimedia
 * Commons, NASA's image library, Openverse, and Google Programmable Search
 * when it is configured. The proxy exists for two reasons that are not
 * negotiable from a browser: those APIs do not all send CORS headers, and
 * the Google key must not ship inside a JavaScript bundle.
 *
 * Queries are issued one at a time rather than in one batch, so the panel
 * showing what the agent is looking at can fill in as results arrive. A
 * batch call would be marginally faster and would leave the publisher
 * watching a blank box until all of it landed, which defeats the point of
 * showing the search at all.
 */

const REFS_URL = 'https://asia-south1-indiainantartica.cloudfunctions.net/studio/refs';

export interface StyleReference {
  id: string;
  provider: 'openverse' | 'wikimedia' | 'nasa' | 'google';
  title: string;
  thumbUrl: string | null;
  fullUrl: string;
  pageUrl: string;
  /** Always present, and worth reading before reuse — Google results carry
   *  no licence information at all and say so. */
  license: string;
  attribution: string;
  width: number | null;
  height: number | null;
  matchedQuery?: string;
}

export interface ReferenceSearchRun {
  results: StyleReference[];
  /** Which providers answered, in aggregate across every query. */
  answered: string[];
  searched: { query: string; count: number; answered: string[] }[];
  unavailable: { provider: string; reason: string }[];
}

const EMPTY: ReferenceSearchRun = { results: [], answered: [], searched: [], unavailable: [] };

/**
 * Runs each query in turn, reporting after every one.
 *
 * A failing query is not a failing search: Commons rate-limiting one call
 * still leaves the results from the other two, and the run reports which
 * queries answered so the UI never implies coverage it did not get.
 */
export async function searchReferences(
  queries: string[],
  onPartial?: (run: ReferenceSearchRun) => void,
): Promise<ReferenceSearchRun> {
  if (!queries.length) return EMPTY;

  const seen = new Set<string>();
  const run: ReferenceSearchRun = { results: [], answered: [], searched: [], unavailable: [] };

  for (const query of queries) {
    try {
      const res = await fetch(REFS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: [query] }),
      });
      if (!res.ok) throw new Error(`refs ${res.status}`);
      const body = await res.json();

      const fresh: StyleReference[] = (body.results ?? []).filter((r: StyleReference) => {
        if (!r.thumbUrl || seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      run.results = [...run.results, ...fresh];
      run.searched = [
        ...run.searched,
        { query, count: fresh.length, answered: body.searched?.[0]?.answered ?? [] },
      ];
      run.answered = [...new Set([...run.answered, ...(body.searched?.[0]?.answered ?? [])])];
      run.unavailable = body.providersUnavailable ?? run.unavailable;
    } catch {
      // Recorded as a query that found nothing rather than thrown: one bad
      // query should not lose the results already gathered.
      run.searched = [...run.searched, { query, count: 0, answered: [] }];
    }

    onPartial?.({ ...run, results: [...run.results], searched: [...run.searched] });
  }

  return run;
}
