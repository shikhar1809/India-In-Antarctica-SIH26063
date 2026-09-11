/**
 * Engagement harness — pulls real performance numbers (likes, comments,
 * shares, views) for posts already confirmed sent, from each platform's own
 * API. This is the read-only cousin of the automatic posting adapter
 * social/queue.ts documents: the manual posting path is complete with no
 * credential at all, and an automatic path (posting or, here, reading
 * engagement back) registers per platform the moment its credential exists.
 * An API key belongs server-side for the same reason GEMINI_API_KEY does
 * (see studio.js) — a key shipped in the portal's JS bundle is a published
 * key, and this one would bill against NCPOR's real X/Meta/LinkedIn apps.
 *
 * Configure whichever platforms you actually have credentials for in
 * functions/.env (gitignored) — any subset is fine, this only ever queries
 * the platforms it has a token for:
 *
 *   X_BEARER_TOKEN=...            X API v2, app-only bearer token
 *   INSTAGRAM_ACCESS_TOKEN=...    Meta Graph API, long-lived token
 *   LINKEDIN_ACCESS_TOKEN=...     LinkedIn Marketing API access token
 *
 * Or, simpler, one credential for all three:
 *
 *   UPLOAD_POST_API_KEY=...       the same key publishpost.js posts with
 *   UPLOAD_POST_PROFILE=...       the Upload-Post profile the accounts sit on
 *
 * Upload-Post already holds the OAuth grants it posted with, so it can read
 * the numbers back through one API instead of three developer apps. A
 * platform-specific token, if one is set, still wins for that platform — it
 * is the more direct source and was configured on purpose.
 *
 * With none set, refreshEngagement() still runs — it just reports zero
 * platforms connected rather than failing, the same "still works end to end
 * with no credentials" shape as studio.js falling back to an offline draft.
 *
 * ── Two views ──────────────────────────────────────────────────────────
 *   POST /engagement   per-post: writes likes/comments/shares/views onto
 *                      every posted socialPosts row it can look up.
 *   GET  /engagement   per-account: followers, reach, the 30-day series and
 *                      (Instagram only) audience demographics, for the
 *                      accounts the portal posts as. Read-only; nothing is
 *                      stored.
 *
 *   POST /engagement   also cross-checks that each sent post is still up
 *                      (liveness.js) and records the verdict as `liveCheck`.
 *                      A post found removed gets no engagement written, and
 *                      its entry is taken off the public record's
 *                      "posted on" list. Body {mode:'live'} runs only this.
 *
 * The two answer different questions and are kept apart on the page. An
 * account's reach includes everything that account ever posted — for a
 * shared or personal account, most of it has nothing to do with this
 * portal — so it is never presented as the result of the portal's posts.
 *
 * ── Why X is different from Instagram and LinkedIn ─────────────────────
 * A tweet's numeric id is the last path segment of its own permalink
 * (x.com/<user>/status/<id>), so fetchX can run off `externalUrl` alone —
 * the one thing every posted row already has. Instagram's Graph API and
 * LinkedIn's social-actions API are both addressed by an id/URN the public
 * permalink does not contain, and this portal posts by hand (there is no
 * automatic adapter for any platform yet), so nothing captured that id at
 * publish time. `platformPostId`, entered by hand on the "mark as posted"
 * form for those two platforms (see QueueTab.tsx), is what makes them
 * fetchable at all — a row without one is skipped, not guessed at.
 */

const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { checkLive } = require('./liveness');
const { getAuth } = require('firebase-admin/auth');

if (!getApps().length) initializeApp();
const db = getFirestore();

const SOCIAL_COLLECTION = 'socialPosts';

/* ── per-platform fetchers ────────────────────────────────────────────────
 * Each takes one posted queue entry and the platform's token, and returns
 * an EngagementSnapshot or null. A single post failing (deleted, expired
 * token, rate limited) returns null rather than throwing, so one bad row
 * never aborts the rest of the batch — see the loop in refreshEngagement. */

async function fetchX(post, token) {
  const match = post.externalUrl?.match(/status\/(\d+)/);
  if (!match) return null;
  const res = await fetch(
    `https://api.x.com/2/tweets/${match[1]}?tweet.fields=public_metrics`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const body = await res.json();
  const m = body?.data?.public_metrics;
  if (!m) return null;
  return {
    likes: m.like_count ?? 0,
    comments: m.reply_count ?? 0,
    shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0),
    views: m.impression_count ?? null,
    fetchedAt: Date.now(),
  };
}

async function fetchInstagram(post, token) {
  const mediaId = post.platformPostId;
  if (!mediaId) return null;
  const res = await fetch(
    `https://graph.facebook.com/v20.0/${encodeURIComponent(mediaId)}?fields=like_count,comments_count&access_token=${encodeURIComponent(token)}`,
  );
  if (!res.ok) return null;
  const body = await res.json();
  if (typeof body.like_count !== 'number' && typeof body.comments_count !== 'number') return null;
  return {
    likes: body.like_count ?? 0,
    comments: body.comments_count ?? 0,
    shares: 0, // the Graph API's media node has no share count to report.
    views: null,
    fetchedAt: Date.now(),
  };
}

async function fetchLinkedin(post, token) {
  const urn = post.platformPostId;
  if (!urn) return null;
  const res = await fetch(
    `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(urn)}`,
    { headers: { Authorization: `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' } },
  );
  if (!res.ok) return null;
  const body = await res.json();
  return {
    likes: body?.likesSummary?.totalLikes ?? 0,
    comments: body?.commentsSummary?.totalComments ?? 0,
    shares: 0,
    views: null,
    fetchedAt: Date.now(),
  };
}

const FETCHERS = {
  x: { fn: fetchX, envVar: 'X_BEARER_TOKEN' },
  instagram: { fn: fetchInstagram, envVar: 'INSTAGRAM_ACCESS_TOKEN' },
  linkedin: { fn: fetchLinkedin, envVar: 'LINKEDIN_ACCESS_TOKEN' },
};

/* ── Upload-Post: one credential, all three platforms ─────────────────── */

const UPLOAD_POST = 'https://api.upload-post.com';
const PLATFORMS = ['x', 'linkedin', 'instagram'];

const uploadPostKey = () => process.env.UPLOAD_POST_API_KEY || '';
const uploadPostProfile = () => process.env.UPLOAD_POST_PROFILE || 'default';

/** A fetch failure that should reach the publisher in the platform's own
 *  words — "LinkedIn post metrics are only available for posts published to
 *  a LinkedIn Page" is actionable in a way "no data" is not. */
class PlatformNote extends Error {}

/**
 * The platform's own id for a posted row.
 *
 * Rows posted by the Upload-Post adapter carry it (publishpost.js returns
 * it and queue.ts stores it). For older rows it is recovered from the
 * permalink where the permalink contains it — X's status id and LinkedIn's
 * share URN both do. Instagram's permalink carries a shortcode, which the
 * Graph API cannot look up, so an Instagram row without a stored id is
 * skipped rather than guessed at.
 */
function platformPostIdFor(post) {
  if (post.platformPostId) return String(post.platformPostId);
  const url = post.externalUrl || '';
  if (post.platform === 'x') return url.match(/status\/(\d+)/)?.[1] ?? null;
  if (post.platform === 'linkedin') {
    return url.match(/urn:li:(?:share|ugcPost|activity):\d+/)?.[0] ?? null;
  }
  return null;
}

/** Numbers only where the platform reported them. A missing field stays
 *  null — "0 views" is a claim about the post, "no number" is a claim about
 *  the API, and the page renders them differently. */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function fetchViaUploadPost(post, key) {
  const id = platformPostIdFor(post);
  if (!id) {
    throw new PlatformNote(
      post.platform === 'instagram'
        ? 'No Instagram media id was recorded for this post, so its metrics cannot be looked up.'
        : 'No platform post id could be recovered for this post.',
    );
  }

  const qs = new URLSearchParams({
    platform_post_id: id, platform: post.platform, user: uploadPostProfile(),
  });
  const res = await fetch(`${UPLOAD_POST}/api/uploadposts/post-analytics?${qs}`, {
    headers: { Authorization: `Apikey ${key}` },
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || `Upload-Post returned ${res.status}`);

  const node = body.platforms?.[post.platform];
  if (!node) throw new Error('Upload-Post returned no data for this platform.');
  if (node.post_metrics_error) throw new PlatformNote(node.post_metrics_error);

  const m = node.post_metrics || {};
  const sum = (...xs) => xs.map(num).filter((x) => x !== null).reduce((a, b) => a + b, 0);

  return {
    likes: num(m.likes) ?? 0,
    // X reports replies; everything else reports comments.
    comments: sum(m.comments, m.replies),
    // Reposts and quotes are X's shares; Instagram and LinkedIn call them shares.
    shares: sum(m.shares, m.reposts, m.quotes),
    views: num(m.impressions) ?? num(m.views),
    reach: num(m.reach),
    saves: num(m.saves) ?? num(m.bookmarks),
    source: 'upload-post',
    fetchedAt: Date.now(),
  };
}

/** Which fetcher, with which credential, serves a platform — or null. */
function resolveFetcher(platform) {
  const direct = FETCHERS[platform];
  if (direct && process.env[direct.envVar]) {
    return { fn: direct.fn, token: process.env[direct.envVar] };
  }
  if (uploadPostKey()) return { fn: fetchViaUploadPost, token: uploadPostKey() };
  return null;
}

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/** Unlike studio.js/review.js (advisory text, no privileged access), this
 *  endpoint writes to Firestore via the Admin SDK — which bypasses
 *  firestore.rules entirely — and spends real API quota against NCPOR's own
 *  platform apps. Both are reasons to check who is calling, not just that
 *  someone is. */
async function requireStaff(req, { allowAnalyticsAccess = false } = {}) {
  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    const err = new Error('Sign in first.');
    err.status = 401;
    throw err;
  }
  const decoded = await getAuth().verifyIdToken(match[1]);
  const snap = await db.collection('roles').doc(decoded.uid).get();
  const data = snap.data() || {};
  const staff = data.role === 'admin' || data.role === 'publisher';
  // Reading account totals writes nothing, so anyone an admin has granted
  // analytics access to may see them — the same grant that opens the page.
  if (staff || (allowAnalyticsAccess && data.analyticsAccess === true)) return;
  const err = new Error(allowAnalyticsAccess ? 'You do not have analytics access.' : 'Publishers and admins only.');
  err.status = 403;
  throw err;
}

/* ── the account view (GET) ───────────────────────────────────────────── */

/** Account totals move slowly, and every dashboard load would otherwise be
 *  a live call per platform. Held per function instance; `?fresh=1` skips
 *  it for the refresh button. */
const ACCOUNT_TTL_MS = 5 * 60 * 1000;
let accountCache = null;

/** Instagram demographics arrive as { segment: count } maps; the page wants
 *  sorted rows. Empty maps (accounts under Meta's 100-follower floor) come
 *  back as null, so "not enough data yet" never renders as an empty chart. */
function toRows(map, limit) {
  if (!map || typeof map !== 'object') return null;
  const rows = Object.entries(map)
    .map(([label, value]) => ({ label, value: num(value) ?? 0 }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  if (!rows.length) return null;
  return limit ? rows.slice(0, limit) : rows;
}

const AGE_BANDS = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];

function normaliseAccount(platform, raw, handle) {
  if (!raw || typeof raw !== 'object' || raw.error) {
    return {
      platform, handle, available: false,
      note: (raw && typeof raw === 'object' && (raw.error || raw.message)) || String(raw || 'No data returned.'),
    };
  }
  const available = Array.isArray(raw.available_metrics) ? raw.available_metrics : [];
  const labels = raw.metric_labels || {};
  const has = (k) => available.includes(k);
  const primaryField = raw.primary_impressions_field || (has('reach') ? 'reach' : 'impressions');

  const demo = raw.follower_demographics;
  const ages = demo && demo.age && typeof demo.age === 'object'
    ? AGE_BANDS.map((label) => ({ label, value: num(demo.age[label]) ?? 0 }))
    : null;
  const hasAges = !!ages && ages.some((a) => a.value > 0);
  // LinkedIn returns demographics too, but keyed by opaque geo/function
  // URNs that need a second lookup to name — only Instagram's are shown.
  const demographics = platform === 'instagram' && demo && (hasAges || toRows(demo.country))
    ? { age: hasAges ? ages : null, gender: toRows(demo.gender), country: toRows(demo.country, 8), city: toRows(demo.city, 6) }
    : null;

  const page = raw.page_statistics;

  return {
    platform,
    handle,
    available: true,
    metricType: raw.metric_type || primaryField,
    primaryLabel: labels[primaryField] || (primaryField === 'reach' ? 'Reach' : 'Impressions'),
    followers: num(raw.followers),
    reach: has('reach') ? num(raw.reach) : null,
    impressions: has('impressions') || has('views') ? (num(raw.impressions) ?? num(raw.views)) : null,
    likes: has('likes') ? num(raw.likes) : null,
    comments: has('comments') ? num(raw.comments) : null,
    shares: has('shares') ? num(raw.shares) : null,
    saves: has('saves') ? num(raw.saves) : null,
    profileViews: has('profileViews') ? num(raw.profileViews) : null,
    profileViewsLabel: labels.profileViews || 'Profile views',
    series: Array.isArray(raw.reach_timeseries)
      ? raw.reach_timeseries
        .map((pt) => ({ date: String(pt.date), value: num(pt.value) ?? 0 }))
        .sort((a, b) => a.date.localeCompare(b.date))
      : [],
    // Company-page traffic: the LinkedIn number that exists even for a page
    // that posts rarely.
    page: page ? {
      views: num(page.page_views),
      uniqueViews: num(page.unique_page_views),
      desktop: num(page.desktop_page_views),
      mobile: num(page.mobile_page_views),
    } : null,
    demographics,
  };
}

/** Which handle each platform is connected as. Handles change about never,
 *  and the users call is occasionally slow upstream — slow enough, once in
 *  testing, to time out mid-read and blank every handle on the page. So they
 *  are held for an hour, and a failed read falls back to the last known set
 *  rather than to nothing. */
const HANDLE_TTL_MS = 60 * 60 * 1000;
let handleCache = null;

async function linkedAccounts(headers, profile) {
  if (handleCache && Date.now() - handleCache.at < HANDLE_TTL_MS) return handleCache.linked;
  try {
    const res = await fetch(`${UPLOAD_POST}/api/uploadposts/users`, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`users returned ${res.status}`);
    const users = await res.json();
    const found = (users.profiles || []).find((p) => p.username === profile);
    const linked = (found && found.social_accounts) || {};
    handleCache = { at: Date.now(), linked };
    return linked;
  } catch (err) {
    console.warn('engagement: could not read linked handles', err.message);
    return handleCache ? handleCache.linked : {};
  }
}

async function accountAnalytics() {
  const key = uploadPostKey();
  if (!key) {
    return { configured: false, accounts: [], message: 'Set UPLOAD_POST_API_KEY in functions/.env to read account analytics.' };
  }
  const profile = uploadPostProfile();
  const headers = { Authorization: `Apikey ${key}` };

  const [linked, statsRes] = await Promise.all([
    linkedAccounts(headers, profile),
    fetch(`${UPLOAD_POST}/api/analytics/${encodeURIComponent(profile)}?platforms=${PLATFORMS.join(',')}`, {
      headers, signal: AbortSignal.timeout(30000),
    }),
  ]);

  if (!statsRes.ok) {
    const body = await statsRes.json().catch(() => ({}));
    throw new Error(body.message || body.error || `Upload-Post analytics returned ${statsRes.status}`);
  }
  const stats = await statsRes.json();

  const handleOf = (p) => (linked[p] && typeof linked[p] === 'object' && linked[p].handle) || null;

  return {
    configured: true,
    profile,
    fetchedAt: Date.now(),
    accounts: PLATFORMS
      .filter((p) => handleOf(p) || stats[p])
      .map((p) => normaliseAccount(p, stats[p], handleOf(p))),
  };
}

exports.engagement = onRequest({ region: 'asia-south1', cors: true }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');

  if (req.method === 'GET') {
    try {
      await requireStaff(req, { allowAnalyticsAccess: true });
    } catch (err) {
      return res.status(err.status ?? 401).json({ error: err.message });
    }
    try {
      const fresh = req.query.fresh === '1';
      if (!fresh && accountCache && Date.now() - accountCache.at < ACCOUNT_TTL_MS) {
        return res.json({ ...accountCache.data, cached: true });
      }
      const data = await accountAnalytics();
      if (data.configured) accountCache = { at: Date.now(), data };
      return res.json(data);
    } catch (err) {
      console.error('engagement accounts failed', err);
      return res.status(502).json({ error: err.message || 'Could not read account analytics.' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Only GET and POST are supported.' });

  try {
    await requireStaff(req);
  } catch (err) {
    return res.status(err.status ?? 401).json({ error: err.message });
  }

  const connected = PLATFORMS.filter((platform) => resolveFetcher(platform));

  const liveOnly = req.body?.mode === 'live';
  const snap = await db.collection(SOCIAL_COLLECTION).where('status', '==', 'posted').get();

  /* ── first: is each post still up? ── */
  // Instagram's "removed" needs proof the token works; the account read is it.
  let instagramOk = false;
  if (uploadPostKey() && snap.docs.some((d) => d.data().platform === 'instagram')) {
    try {
      const acc = (accountCache && Date.now() - accountCache.at < ACCOUNT_TTL_MS) ? accountCache.data : await accountAnalytics();
      instagramOk = !!acc.accounts?.find((a) => a.platform === 'instagram' && a.available);
    } catch { instagramOk = false; }
  }
  const ctx = { key: uploadPostKey(), profile: uploadPostProfile(), accountOk: instagramOk };
  const verdicts = await Promise.all(snap.docs.map((doc) => checkLive({ id: doc.id, ...doc.data() }, ctx)));

  const removed = [];
  await Promise.all(snap.docs.map(async (doc, i) => {
    const v = verdicts[i];
    const post = doc.data();
    const was = post.liveCheck?.state;
    const update = { liveCheck: v };
    if (v.state === 'removed' && was !== 'removed') update.removedAt = v.checkedAt;
    if (v.state === 'live' && was === 'removed') update.removedAt = null; // reinstated
    await doc.ref.update(update).catch(() => {});
    if (v.state === 'removed') {
      removed.push(doc.id);
      // The public site shows "posted on X" from the record's own list; a
      // post that is gone must not stay advertised there.
      if (post.recordId && post.externalUrl) {
        const ref = db.collection('publicArchive').doc(post.recordId);
        await db.runTransaction(async (tx) => {
          const rec = await tx.get(ref);
          const list = rec.exists ? rec.data().socialPosts : null;
          if (!Array.isArray(list)) return;
          const kept = list.filter((e) => e?.url !== post.externalUrl);
          if (kept.length !== list.length) tx.update(ref, { socialPosts: kept });
        }).catch((err) => console.error('could not unlist removed post', doc.id, err.message));
      }
    }
  }));
  const liveness = {
    checked: snap.size,
    live: verdicts.filter((v) => v.state === 'live').length,
    removed: removed.length,
    unknown: verdicts.filter((v) => v.state === 'unknown').length,
  };

  if (liveOnly) return res.json({ connected, checked: snap.size, updated: 0, liveness });

  // X and LinkedIn liveness needs no credential; engagement does.
  if (connected.length === 0) {
    return res.json({
      connected: [],
      checked: snap.size,
      updated: 0,
      liveness,
      message: 'No platform credentials configured. Set UPLOAD_POST_API_KEY (or X_BEARER_TOKEN / INSTAGRAM_ACCESS_TOKEN / LINKEDIN_ACCESS_TOKEN) in functions/.env, then redeploy.',
    });
  }

  /* ── then: engagement, for the posts still up ── */
  let updated = 0;
  const errors = [];
  for (const [i, doc] of snap.docs.entries()) {
    if (verdicts[i].state === 'removed') continue;
    const post = { id: doc.id, ...doc.data() };
    const fetcher = resolveFetcher(post.platform);
    if (!fetcher) continue;
    try {
      const engagementData = await fetcher.fn(post, fetcher.token);
      if (engagementData) {
        await doc.ref.update({ engagement: engagementData, engagementNote: null });
        updated += 1;
      }
    } catch (err) {
      const message = String(err?.message || err);
      // A platform explaining why it has no numbers is stored on the row, so
      // the dashboard can show the reason beside the post instead of a blank.
      if (err instanceof PlatformNote) {
        await doc.ref.update({ engagementNote: message }).catch(() => {});
      }
      errors.push({ postId: post.id, message });
    }
  }

  return res.json({ connected, checked: snap.size, updated, errors, liveness });
});

exports._test = { platformPostIdFor, normaliseAccount, toRows, accountAnalytics, fetchViaUploadPost };
