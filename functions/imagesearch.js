/**
 * Style references for the post studio — real image search, server side.
 *
 * The publisher's agent looks at existing imagery before it proposes a
 * layout: what a good Antarctic institutional post actually looks like,
 * which palettes recur, which crops read well at feed size. This module is
 * where those references come from.
 *
 * WHY NOT PINTEREST OR GOOGLE IMAGES DIRECTLY
 *
 * Both were asked for. Neither can be honestly shipped as a scraper:
 *
 *  - Pinterest has no open search API. The v5 API needs an OAuth app
 *    approved by Pinterest against a named business use case, and scraping
 *    the web UI breaches their terms and is actively blocked. A "Pinterest
 *    search" built by scraping works on a laptop and fails in a demo, which
 *    is the worst of both worlds.
 *  - Google Images likewise has no public search API. The legitimate route
 *    is the Programmable Search Engine JSON API with searchType=image,
 *    which needs an API key and a search-engine id and is capped at 100
 *    free queries a day. That IS supported here — set GOOGLE_CSE_KEY and
 *    GOOGLE_CSE_CX and the provider turns itself on.
 *
 * So the default providers are the three that work with no credentials at
 * all, return proper licence metadata, and do not mind being called:
 *
 *  - Openverse (WordPress Foundation): openly-licensed images at scale.
 *  - Wikimedia Commons: the source of much real Antarctic station imagery,
 *    and already where this project's own fallback photographs come from.
 *  - NASA's image library: public domain, and unusually rich in ice-shelf
 *    and polar-orbit imagery.
 *
 * Any one of them can be down without failing the request — searchReferences
 * reports which answered, and the studio shows that rather than implying it
 * searched everything.
 *
 * Everything returned carries its licence and a link back to the original,
 * because these are *references* a designer looks at, and anything actually
 * reused has to be attributable. The studio never bakes one into a
 * published graphic on its own.
 */

const OPENVERSE = 'https://api.openverse.org/v1/images/';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const GOOGLE_CSE = 'https://www.googleapis.com/customsearch/v1';
const NASA = 'https://images-api.nasa.gov/search';

/** Hard ceiling per provider — this feeds a strip of thumbnails, not a
 *  gallery, and every extra result is latency the publisher waits through. */
const PER_PROVIDER = 8;

/** Both public APIs tolerate anonymous callers but neither likes an unnamed
 *  one; a real UA with a contact URL is the polite minimum and is what keeps
 *  Commons from rate-limiting the deployment. */
const UA = 'IIA-Portal/1.0 (https://iia-public.web.app; NCPOR polar outreach portal)';

const timeout = (ms) => AbortSignal.timeout(ms);

/* ─────────────────────────────────────────────────────────── openverse ── */

async function searchOpenverse(query) {
  const url = `${OPENVERSE}?q=${encodeURIComponent(query)}&page_size=${PER_PROVIDER}&mature=false`;
  /* A short leash on purpose. Openverse has been intermittently unreachable
   * from both a laptop and the deployed function, and every second it spends
   * timing out is a second the publisher watches the reference step sit
   * still. Three seconds is enough for a healthy response and cheap enough
   * to lose; the other providers carry the strip when it fails. */
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: timeout(3000) });
  if (!res.ok) throw new Error(`openverse ${res.status}`);
  const body = await res.json();

  return (body.results || []).map((r) => ({
    id: `ov-${r.id}`,
    provider: 'openverse',
    title: r.title || 'Untitled',
    thumbUrl: r.thumbnail || r.url,
    fullUrl: r.url,
    pageUrl: r.foreign_landing_url || r.url,
    license: [r.license, r.license_version].filter(Boolean).join(' ').toUpperCase(),
    attribution: r.creator || r.source || 'Unknown',
    width: r.width || null,
    height: r.height || null,
  }));
}

/* ──────────────────────────────────────────────────── wikimedia commons ── */

/**
 * Commons needs two things at once: `generator=search` to find the files and
 * `prop=imageinfo` to return their URLs and metadata. Both go in one query,
 * which is why this reads heavier than the Openverse call while costing the
 * same single round trip.
 */
async function searchCommons(query) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: String(PER_PROVIDER),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size',
    iiurlwidth: '400',
  });
  const res = await fetch(`${COMMONS}?${params}`, {
    headers: { 'User-Agent': UA },
    signal: timeout(8000),
  });
  if (!res.ok) throw new Error(`commons ${res.status}`);
  const body = await res.json();
  const pages = body && body.query && body.query.pages ? Object.values(body.query.pages) : [];

  const strip = (v) => String((v && v.value) || '').replace(/<[^>]*>/g, '').trim();

  return pages
    .map((p) => {
      const info = p.imageinfo && p.imageinfo[0];
      if (!info) return null;
      const meta = info.extmetadata || {};
      return {
        id: `wc-${p.pageid}`,
        provider: 'wikimedia',
        title: String(p.title || '').replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
        thumbUrl: info.thumburl || info.url,
        fullUrl: info.url,
        pageUrl: info.descriptionurl || info.url,
        license: strip(meta.LicenseShortName) || 'See Commons',
        attribution: strip(meta.Artist) || 'Wikimedia Commons',
        width: info.width || null,
        height: info.height || null,
      };
    })
    .filter(Boolean);
}

/* ───────────────────────────────────────────────────────────────── nasa ── */

/**
 * NASA's image library: no key, public domain, and unusually well stocked
 * with exactly the subject matter this archive is about — ice shelves,
 * polar orbits, field camps. Public domain also makes it the one provider
 * whose results a publisher can reuse outright rather than only study.
 */
async function searchNasa(query) {
  const params = new URLSearchParams({ q: query, media_type: 'image' });
  const res = await fetch(`${NASA}?${params}`, {
    headers: { 'User-Agent': UA },
    signal: timeout(8000),
  });
  if (!res.ok) throw new Error(`nasa ${res.status}`);
  const body = await res.json();
  const items = (body && body.collection && body.collection.items) || [];

  return items.slice(0, PER_PROVIDER).map((it, i) => {
    const data = (it.data && it.data[0]) || {};
    const link = (it.links && it.links[0]) || {};
    return {
      id: `nasa-${data.nasa_id || i}`,
      provider: 'nasa',
      title: data.title || 'Untitled',
      thumbUrl: link.href || null,
      // The thumbnail href points at ~thumb.jpg / ~small.jpg; the original
      // sits beside it under the same asset id.
      fullUrl: String(link.href || '').replace(/~(thumb|small)\.jpg$/, '~orig.jpg'),
      pageUrl: data.nasa_id ? `https://images.nasa.gov/details/${data.nasa_id}` : (link.href || ''),
      license: 'Public domain (NASA)',
      attribution: data.center ? `NASA ${data.center}` : 'NASA',
      width: null,
      height: null,
    };
  });
}

/* ────────────────────────────────────────────── google programmable cse ── */

/** Only runs when both credentials are configured — see the module header
 *  for why this is the only legitimate "Google Images" route. */
async function searchGoogle(query) {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) return [];

  const params = new URLSearchParams({
    key,
    cx,
    q: query,
    searchType: 'image',
    num: String(Math.min(PER_PROVIDER, 10)),
    safe: 'active',
  });
  const res = await fetch(`${GOOGLE_CSE}?${params}`, { signal: timeout(8000) });
  if (!res.ok) throw new Error(`google ${res.status}`);
  const body = await res.json();

  return (body.items || []).map((r, i) => ({
    id: `g-${i}-${String(r.link || '').slice(-24)}`,
    provider: 'google',
    title: r.title || 'Untitled',
    thumbUrl: (r.image && r.image.thumbnailLink) || r.link,
    fullUrl: r.link,
    pageUrl: (r.image && r.image.contextLink) || r.link,
    // Google returns no licence field. Saying so is the honest thing: a
    // publisher must not assume anything here is reusable.
    license: 'Unknown — check the source before reuse',
    attribution: r.displayLink || 'Unknown',
    width: (r.image && r.image.width) || null,
    height: (r.image && r.image.height) || null,
  }));
}

const PROVIDERS = {
  openverse: searchOpenverse,
  wikimedia: searchCommons,
  nasa: searchNasa,
  google: searchGoogle,
};

/** Which providers can actually answer right now, so the UI can say what it
 *  searched rather than implying it searched everything. */
function availableProviders() {
  const out = ['openverse', 'wikimedia', 'nasa'];
  if (process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX) out.push('google');
  return out;
}

/**
 * Runs every available provider in parallel and merges the results.
 *
 * One provider failing is not the request failing: a strip with Commons
 * results and no Openverse results is still useful. The caller is told which
 * providers answered and which did not, so the "what the agent searched"
 * panel stays truthful rather than implying full coverage.
 */
async function searchReferences(query, requested) {
  const usable = availableProviders();
  const names = (requested && requested.length ? requested : usable)
    .filter((n) => PROVIDERS[n] && usable.includes(n));

  const settled = await Promise.allSettled(names.map((n) => PROVIDERS[n](query)));

  const results = [];
  const answered = [];
  const failed = [];

  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') {
      answered.push(names[i]);
      results.push(...s.value);
    } else {
      failed.push({ provider: names[i], reason: String((s.reason && s.reason.message) || s.reason) });
    }
  });

  return { results, answered, failed, unavailable: ['pinterest'] };
}

module.exports = {
  searchReferences,
  availableProviders,
  searchOpenverse,
  searchCommons,
  searchNasa,
  searchGoogle,
  PROVIDERS,
  PER_PROVIDER,
};
