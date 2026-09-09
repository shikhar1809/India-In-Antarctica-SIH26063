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
 * With none set, refreshEngagement() still runs — it just reports zero
 * platforms connected rather than failing, the same "still works end to end
 * with no credentials" shape as studio.js falling back to an offline draft.
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

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/** Unlike studio.js/review.js (advisory text, no privileged access), this
 *  endpoint writes to Firestore via the Admin SDK — which bypasses
 *  firestore.rules entirely — and spends real API quota against NCPOR's own
 *  platform apps. Both are reasons to check who is calling, not just that
 *  someone is. */
async function requireStaff(req) {
  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    const err = new Error('Sign in first.');
    err.status = 401;
    throw err;
  }
  const decoded = await getAuth().verifyIdToken(match[1]);
  const snap = await db.collection('roles').doc(decoded.uid).get();
  const role = snap.data()?.role;
  if (role !== 'admin' && role !== 'publisher') {
    const err = new Error('Publishers and admins only.');
    err.status = 403;
    throw err;
  }
}

exports.engagement = onRequest({ region: 'asia-south1', cors: true }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST is supported.' });

  try {
    await requireStaff(req);
  } catch (err) {
    return res.status(err.status ?? 401).json({ error: err.message });
  }

  const connected = Object.entries(FETCHERS)
    .filter(([, { envVar }]) => Boolean(process.env[envVar]))
    .map(([platform]) => platform);

  if (connected.length === 0) {
    return res.json({
      connected: [],
      checked: 0,
      updated: 0,
      message: 'No platform credentials configured. Set X_BEARER_TOKEN, INSTAGRAM_ACCESS_TOKEN and/or LINKEDIN_ACCESS_TOKEN in functions/.env, then redeploy.',
    });
  }

  const snap = await db.collection(SOCIAL_COLLECTION).where('status', '==', 'posted').get();

  let updated = 0;
  const errors = [];
  for (const doc of snap.docs) {
    const post = { id: doc.id, ...doc.data() };
    const platform = FETCHERS[post.platform];
    if (!platform || !connected.includes(post.platform)) continue;
    try {
      const engagementData = await platform.fn(post, process.env[platform.envVar]);
      if (engagementData) {
        await doc.ref.update({ engagement: engagementData });
        updated += 1;
      }
    } catch (err) {
      errors.push({ postId: post.id, message: String(err?.message || err) });
    }
  }

  return res.json({ connected, checked: snap.size, updated, errors });
});
