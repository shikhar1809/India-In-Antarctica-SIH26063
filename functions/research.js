/**
 * The studio agent's research: what the public is paying attention to, and
 * what the post can be grounded in. Two routes on the studio function:
 *
 *   POST /studio/trends   { terms }  → public interest + recent coverage
 *   POST /studio/sources  { terms }  → background summaries + papers
 *
 * Every provider here is free, needs no key, and returns data a reader can
 * check at the link given:
 *
 *   - Wikipedia page views (Wikimedia REST API): daily human views of the
 *     article for each subject. The last seven days against the thirty
 *     before is a real, dated measure of whether interest is rising — not a
 *     guess, and not a proxy invented for the demo.
 *   - Google News RSS: the most recent coverage for the subject. Headlines
 *     are shown with source and date and linked; they are offered to the
 *     writer as a possible hook, never as facts to repeat.
 *   - Wikipedia summaries: a neutral paragraph on each subject, given to the
 *     writer as background it may lean on — and as a check on its claims.
 *   - OpenAlex: peer-reviewed papers on the subject, with DOIs, as further
 *     reading a post can point to.
 *
 * WHY NOT GDELT, GOOGLE TRENDS. GDELT's news API was tried first and
 * refuses anything faster than one request per five seconds per IP — shared
 * Cloud Functions egress hits that permanently. Google Trends has no public
 * API. Both would demo once and fail the second time.
 *
 * Each provider can fail on its own without failing the request; the reply
 * says which answered. Results are cached per instance for ten minutes —
 * the same brief researched twice in a row should not cost eight calls.
 */

const UA = 'IIA-Portal/1.0 (https://iia-public.web.app; NCPOR polar outreach portal)';
const WIKI = 'https://en.wikipedia.org';
const PAGEVIEWS = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user';
const OPENALEX = 'https://api.openalex.org/works';
const GNEWS = 'https://news.google.com/rss/search';

const DAY = 86_400_000;
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

const t = (ms) => AbortSignal.timeout(ms);

async function getJson(url, ms = 8000) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA }, signal: t(ms) });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
  return res.json();
}

function cleanTerms(raw) {
  return [...new Set((Array.isArray(raw) ? raw : [])
    .map((s) => String(s || '').trim().slice(0, 60))
    .filter(Boolean))].slice(0, 4);
}

async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/* ───────────────────────────────────────────────────────────── wikipedia ── */

/** A subject name → the Wikipedia article it most plausibly means. */
async function resolveTitle(term) {
  const url = `${WIKI}/w/api.php?action=opensearch&search=${encodeURIComponent(term)}&limit=1&namespace=0&format=json`;
  const body = await getJson(url, 6000);
  const title = body?.[1]?.[0];
  return title ? { term, title, url: body[3][0] } : null;
}

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

/** Daily views for the last 37 complete days, and the week against the
 *  month before it. Yesterday is the newest day Wikimedia has finalised. */
async function interestFor(subject) {
  const end = Date.now() - DAY;
  const start = end - 36 * DAY;
  const url = `${PAGEVIEWS}/${encodeURIComponent(subject.title.replace(/ /g, '_'))}/daily/${ymd(start)}/${ymd(end)}`;
  const body = await getJson(url, 8000);
  const series = (body.items || []).map((i) => ({
    date: `${i.timestamp.slice(0, 4)}-${i.timestamp.slice(4, 6)}-${i.timestamp.slice(6, 8)}`,
    views: i.views,
  }));
  if (series.length < 14) return { ...subject, series, recentAvg: null, priorAvg: null, changePct: null };
  const avg = (xs) => xs.reduce((a, b) => a + b.views, 0) / xs.length;
  const recent = series.slice(-7);
  const prior = series.slice(0, -7);
  const recentAvg = Math.round(avg(recent));
  const priorAvg = Math.round(avg(prior));
  return {
    ...subject,
    series,
    recentAvg,
    priorAvg,
    changePct: priorAvg > 0 ? Math.round(((recentAvg - priorAvg) / priorAvg) * 100) : null,
  };
}

async function summaryFor(subject) {
  const body = await getJson(`${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(subject.title.replace(/ /g, '_'))}`, 6000);
  const extract = String(body.extract || '');
  // Two sentences is background; a whole lead is a second brief.
  const short = (extract.match(/[^.!?]+[.!?]+/g) || [extract]).slice(0, 2).join('').trim();
  return {
    title: body.title || subject.title,
    extract: short,
    url: body.content_urls?.desktop?.page || subject.url,
  };
}

/* ─────────────────────────────────────────────────────────────── news ── */

const decode = (s) => String(s)
  .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function newsFor(query) {
  const url = `${GNEWS}?q=${encodeURIComponent(`${query} when:30d`)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: t(8000) });
  if (!res.ok) throw new Error(`news ${res.status}`);
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const it = m[1];
    const pick = (tag) => (it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [])[1];
    const source = decode(pick('source') || '');
    let title = decode(pick('title') || '');
    // Google appends " - Source" to every headline; the source is shown separately.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const date = Date.parse(pick('pubDate') || '');
    return { title, source, url: decode(pick('link') || ''), publishedAt: Number.isFinite(date) ? date : null };
  }).filter((i) => i.title && i.url);

  items.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  const weekAgo = Date.now() - 7 * DAY;
  return {
    query,
    total: items.length,
    lastWeek: items.filter((i) => (i.publishedAt ?? 0) >= weekAgo).length,
    items: items.slice(0, 6),
  };
}

/** News for the main subject. Two subjects AND-ed together ("Ozone layer
 *  Maitri station") usually match nothing, so this searches the first
 *  subject in its polar context, then the subject alone, and stops at the
 *  first query that finds coverage — reporting which one it was. */
async function newsWithFallback(terms) {
  const main = terms[0];
  const polar = /antarctic|arctic|polar/i.test(main) ? main : `${main} Antarctica`;
  const tries = [...new Set([polar, main])];
  let last = null;
  for (const q of tries) {
    last = await newsFor(q);
    if (last.total > 0) return last;
  }
  return last;
}

/* ──────────────────────────────────────────────────────────── openalex ── */

async function papersFor(query) {
  const params = new URLSearchParams({
    search: query,
    filter: 'has_doi:true,type:article',
    sort: 'relevance_score:desc',
    // More candidates than are shown: the client keeps only those whose
    // titles are on the post's subject, so it needs some to choose from.
    'per-page': '8',
    select: 'doi,title,publication_year,cited_by_count,authorships,primary_location',
  });
  const body = await getJson(`${OPENALEX}?${params}`, 9000);
  return (body.results || []).map((w) => ({
    title: String(w.title || '').replace(/<[^>]+>/g, ''),
    year: w.publication_year ?? null,
    doi: w.doi || null,
    citedBy: w.cited_by_count ?? 0,
    venue: w.primary_location?.source?.display_name ?? null,
    firstAuthor: w.authorships?.[0]?.author?.display_name ?? null,
    authors: w.authorships?.length ?? 0,
  })).filter((p) => p.title && p.doi);
}

/* ─────────────────────────────────────────────────────────────── routes ── */

/** Runs each provider independently and records which answered. */
async function settle(tasks) {
  const names = Object.keys(tasks);
  const results = await Promise.allSettled(names.map((n) => tasks[n]()));
  const out = { answered: [], failed: [] };
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { out[names[i]] = r.value; out.answered.push(names[i]); }
    else { out[names[i]] = null; out.failed.push({ provider: names[i], reason: String(r.reason?.message || r.reason) }); }
  });
  return out;
}

async function handleTrends(req, res) {
  const terms = cleanTerms(req.body?.terms);
  if (!terms.length) return res.status(400).json({ error: 'No terms to research.' });
  try {
    const data = await cached(`trends:${terms.join('|')}`, async () => {
      const subjects = (await Promise.allSettled(terms.slice(0, 3).map(resolveTitle)))
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter(Boolean);
      const unique = subjects.filter((s, i) => subjects.findIndex((x) => x.title === s.title) === i);
      const out = await settle({
        interest: async () => (await Promise.allSettled(unique.map(interestFor)))
          .filter((r) => r.status === 'fulfilled').map((r) => r.value),
        news: () => newsWithFallback(terms),
      });
      return { terms, ...out, fetchedAt: Date.now() };
    });
    return res.json(data);
  } catch (err) {
    console.error('studio/trends failed', err);
    return res.status(502).json({ error: err.message || 'Trend research failed.' });
  }
}

async function handleSources(req, res) {
  const terms = cleanTerms(req.body?.terms);
  if (!terms.length) return res.status(400).json({ error: 'No terms to research.' });
  try {
    const data = await cached(`sources:${terms.join('|')}`, async () => {
      const subjects = (await Promise.allSettled(terms.slice(0, 2).map(resolveTitle)))
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter(Boolean);
      const out = await settle({
        background: async () => (await Promise.allSettled(subjects.map(summaryFor)))
          .filter((r) => r.status === 'fulfilled' && r.value.extract).map((r) => r.value),
        // The client sends a subject-first query when it has one; the full
        // term list, stations included, drifts towards anything from the
        // same place.
        papers: () => papersFor(String(req.body?.paperQuery || '').slice(0, 120) || terms.join(' ')),
      });
      return { terms, ...out, fetchedAt: Date.now() };
    });
    return res.json(data);
  } catch (err) {
    console.error('studio/sources failed', err);
    return res.status(502).json({ error: err.message || 'Source research failed.' });
  }
}

module.exports = { handleTrends, handleSources, _test: { newsFor, interestFor, resolveTitle, papersFor, summaryFor } };
