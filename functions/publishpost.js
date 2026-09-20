/**
 * Actually posting to X, LinkedIn and Instagram, through Upload-Post.
 *
 * Until now the dissemination queue prepared a post and a human sent it. The
 * seam for automation was already there — social/queue.ts's PlatformAdapter,
 * with the manual adapter as the honest default — and this is the other side
 * of it: one HTTP endpoint the portal calls, which talks to Upload-Post's
 * unified publishing API.
 *
 * WHY SERVER SIDE. The Upload-Post key is a bearer credential for the
 * institution's real social accounts. In a React bundle it is a published
 * key: anyone who opens the portal can read it out of the JavaScript and post
 * to NCPOR's accounts. So it lives here, in an environment variable the
 * browser cannot reach, exactly like GEMINI_API_KEY.
 *
 *   functions/.env          UPLOAD_POST_API_KEY=...      (gitignored)
 *   production              firebase functions:secrets:set UPLOAD_POST_API_KEY
 *
 * With no key set this returns 503 and the queue keeps working the way it
 * always has — a publisher posts by hand and confirms with the permalink.
 * That is a working state, not a broken one.
 *
 * WHAT IT WILL NOT DO. It posts one platform per call and returns that
 * platform's real permalink, or a real error. It never reports success it
 * cannot evidence: a post with no returned URL comes back as a failure,
 * because a 'posted' row with no link is exactly the unverifiable claim the
 * queue was designed to avoid.
 */

const UPLOAD_POST = 'https://api.upload-post.com';

/** Upload-Post's own ids for the three platforms this project targets. */
const PLATFORM_ID = { x: 'x', linkedin: 'linkedin', instagram: 'instagram' };

/** Instagram cannot accept a text-only post — the platform requires media.
 *  This mirrors PLATFORM_LIMITS.instagram.imageRequired on the client, and
 *  the studio agent already refuses to generate for Instagram without a
 *  photograph, so reaching here without one is a bug rather than a user
 *  mistake. It is still checked, because this endpoint is public HTTP. */
const NEEDS_IMAGE = new Set(['instagram']);

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function json(res, code, body) {
  return res.status(code).json(body);
}

/** Pulls the rendered card out of Firebase Storage so it can be forwarded as
 *  multipart. Upload-Post takes `photos[]` as files, not URLs, so the image
 *  has to pass through this function rather than being handed over by link. */
async function fetchImage(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`could not read the image (${res.status})`);
  const type = (res.headers.get('content-type') || 'image/png').split(';')[0];
  if (!type.startsWith('image/')) throw new Error('that URL is not an image');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('image is too large to post');
  return { blob: new Blob([buf], { type }), filename: `post.${type.split('/')[1] || 'png'}` };
}

/**
 * Digs the permalink and the platform's own post id out of the response.
 *
 * The shape varies by platform and by endpoint, so this looks in the places
 * it is known to appear rather than assuming one. Returning nothing is a
 * meaningful answer — the caller treats a missing URL as a failed publish.
 */
function readResult(body, platform) {
  const results = body && body.results;
  const per = results && (results[platform] || results[PLATFORM_ID[platform]]);
  const node = per || body || {};

  const url =
    node.url || node.post_url || node.permalink || node.link ||
    (body && (body.url || body.permalink)) || null;

  const id =
    node.post_id || node.id || node.media_id || node.urn ||
    (body && body.post_id) || null;

  return { url: url ? String(url) : null, id: id ? String(id) : null };
}

/**
 * Publishes one caption to one platform.
 *
 * One platform per call on purpose. The studio writes a different caption for
 * each — 280 characters on X, a Unicode-headed opener on LinkedIn, hashtags
 * after the text on Instagram — and Upload-Post's multi-platform form takes a
 * single `title`. Fanning out here would mean posting the same words
 * everywhere, which is the thing the studio exists to avoid.
 */
async function publishOne({ key, profile, platform, caption, imageUrl, externalId }) {
  const target = PLATFORM_ID[platform];
  if (!target) return { ok: false, error: `Unsupported platform: ${platform}` };

  const form = new FormData();
  form.append('user', profile);
  form.append('platform[]', target);
  form.append('title', caption);
  if (externalId) form.append('external_id', externalId);

  let endpoint = '/api/upload_text';

  if (imageUrl) {
    const img = await fetchImage(imageUrl);
    form.append('photos[]', img.blob, img.filename);
    endpoint = '/api/upload_photos';
  } else if (NEEDS_IMAGE.has(platform)) {
    return { ok: false, error: 'Instagram cannot post without an image.' };
  }

  const res = await fetch(`${UPLOAD_POST}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Apikey ${key}`,
      /* Retrying a timed-out publish must not post twice. Keyed on the queue
       * row and platform, so the same row retried is recognised as the same
       * upload while a genuinely new row is not. */
      'Idempotency-Key': `${externalId || 'post'}:${platform}`,
    },
    body: form,
    signal: AbortSignal.timeout(90000),
  });

  const text = await res.text();
  let body = {};
  try { body = JSON.parse(text); } catch { /* non-JSON error page */ }

  if (!res.ok) {
    const detail = (body && (body.message || body.error)) || text.slice(0, 200);
    return { ok: false, error: `${platform}: ${detail || `HTTP ${res.status}`}`, status: res.status };
  }

  const { url, id } = readResult(body, platform);

  /* Accepted-but-not-yet-published is a real state: an upload over ~59
   * seconds, or a scheduled one, comes back with a job to poll rather than a
   * permalink. Reporting that honestly is better than calling it posted. */
  if (!url && (body.request_id || body.job_id)) {
    return {
      ok: false,
      pending: true,
      requestId: body.request_id || body.job_id || null,
      error: 'The platform accepted the upload but has not returned a link yet.',
    };
  }

  if (!url) {
    return { ok: false, error: `${platform}: published, but no link was returned.` };
  }

  return { ok: true, url, postId: id };
}

/* ══════════════════════════════════════════════════════════════ router ══ */

/**
 * POST /studio/publish
 *
 * Body: { platform, caption, imageUrl?, externalId?, profile? }
 * Returns: { ok, url, postId } or { ok: false, error }
 */
async function requireStaff(req) {
  const { getAuth } = require('firebase-admin/auth');
  const { getFirestore } = require('firebase-admin/firestore');
  const match = (req.get('Authorization') || '').match(/^Bearer (.+)$/);
  if (!match) return 'Sign in first.';
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    const role = ((await getFirestore().collection('roles').doc(decoded.uid).get()).data() || {}).role;
    return role === 'admin' || role === 'publisher' ? null : 'Publishers and admins only.';
  } catch {
    return 'Your sign-in could not be verified.';
  }
}

async function handle(req, res) {
  /* This posts to the institution's real accounts, so it checks who is
   * asking. It used to be open to anyone who found the URL. */
  const refused = await requireStaff(req);
  if (refused) return json(res, 403, { error: refused });

  const key = process.env.UPLOAD_POST_API_KEY || '';
  if (!key) {
    // The queue treats this as "no automatic adapter", which is its normal
    // default — a publisher posts by hand and confirms the link.
    return json(res, 503, { error: 'No publishing credential configured.' });
  }

  const body = req.body || {};
  const platform = String(body.platform || '');
  const caption = String(body.caption || '').trim();
  const imageUrl = body.imageUrl ? String(body.imageUrl) : null;
  const profile = String(body.profile || process.env.UPLOAD_POST_PROFILE || 'default');

  if (!PLATFORM_ID[platform]) return json(res, 400, { error: 'Unknown platform.' });
  if (!caption) return json(res, 400, { error: 'A caption is required.' });

  try {
    const result = await publishOne({
      key, profile, platform, caption, imageUrl,
      externalId: body.externalId ? String(body.externalId) : null,
    });
    return json(res, result.ok ? 200 : 502, result);
  } catch (err) {
    console.error('studio/publish failed', err);
    return json(res, 502, { ok: false, error: err.message || 'The publisher could not be reached.' });
  }
}

/** GET /studio/publish-status — which platforms can actually be posted to.
 *  The portal asks this at startup so it only shows "Post now" where it
 *  genuinely works, instead of offering a button that always fails. */
async function handleStatus(req, res) {
  const key = process.env.UPLOAD_POST_API_KEY || '';
  if (!key) return json(res, 200, { configured: false, platforms: [] });

  try {
    const profile = process.env.UPLOAD_POST_PROFILE || 'default';
    const r = await fetch(`${UPLOAD_POST}/api/uploadposts/users`, {
      headers: { Authorization: `Apikey ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return json(res, 200, { configured: true, platforms: [], error: `HTTP ${r.status}` });

    const body = await r.json();
    const found = (body.profiles || []).find((p) => p.username === profile);
    const accounts = (found && found.social_accounts) || {};

    // A connected account is one with a handle; an empty string means the
    // slot exists but nothing is linked to it.
    const platforms = Object.keys(PLATFORM_ID).filter((p) => {
      const a = accounts[PLATFORM_ID[p]];
      return a && typeof a === 'object' && a.handle;
    });

    return json(res, 200, {
      configured: true,
      profile,
      platforms,
      handles: Object.fromEntries(
        platforms.map((p) => [p, accounts[PLATFORM_ID[p]].handle]),
      ),
    });
  } catch (err) {
    return json(res, 200, { configured: true, platforms: [], error: err.message });
  }
}

module.exports = { handle, handleStatus, publishOne, readResult, PLATFORM_ID };
