/**
 * Sending queued posts, server side.
 *
 * A post in the socialPosts queue used to go out only when someone had the
 * portal's Queue tab open at the right moment and pressed "Post now". A post
 * scheduled for 06:00 therefore went out whenever a publisher next looked —
 * or never. Two things here close that gap:
 *
 *   sendDuePosts   runs every five minutes and sends every queued post whose
 *                  time has come.
 *   POST /studio/send  sends one row now — what "Post now" and the approve
 *                  desk's "Approve & post" call. Publishers and admins only.
 *
 * Both go through sendRow(), which is the only writer of a send's outcome:
 * it claims the row in a transaction (so the scheduler and a person pressing
 * the button at the same moment cannot post it twice), publishes through
 * publishpost.js, and records the permalink — or the platform's own reason
 * it refused — on the row, and a sent post on its public record.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { publishOne } = require('./publishpost');

if (!getApps().length) initializeApp();
const db = getFirestore();

const COLLECTION = 'socialPosts';
const LIMITS = { x: 280, linkedin: 3000, instagram: 2200 };
/** A claim older than this belongs to a send that died mid-flight. */
const CLAIM_TTL_MS = 5 * 60 * 1000;

/** Why this row cannot go out as it stands, or null. Mirrors the portal's
 *  validatePost() so a row the portal accepted is not refused here. */
function problemWith(row) {
  const caption = String(row.caption || '').trim();
  if (!LIMITS[row.platform]) return `Unsupported platform: ${row.platform}`;
  if (!caption) return 'The caption is empty.';
  if (caption.length > LIMITS[row.platform]) return `The caption is ${caption.length} characters; the limit is ${LIMITS[row.platform]}.`;
  if (row.platform === 'instagram' && !row.imageUrl) return 'Instagram posts must have an image.';
  return null;
}

/**
 * Sends one queue row and records the outcome. Returns what happened.
 * `force` sends a row even before its time — a person pressing "Post now".
 */
async function sendRow(id, { force = false, now = Date.now() } = {}) {
  const ref = db.collection(COLLECTION).doc(id);

  // Claim it. Only a queued, ready or failed row can be sent, and only one
  // sender at a time.
  const row = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { skip: 'No such post in the queue.' };
    const d = snap.data();
    if (!['queued', 'ready', 'failed'].includes(d.status)) return { skip: `Already ${d.status}.` };
    if (!force && d.scheduledFor > now) return { skip: 'Not due yet.' };
    if (d.sendingAt && now - d.sendingAt < CLAIM_TTL_MS) return { skip: 'Already being sent.' };
    tx.update(ref, { sendingAt: now });
    return { ...d, id };
  });
  if (row.skip) return { ok: false, skipped: true, error: row.skip };

  const key = process.env.UPLOAD_POST_API_KEY || '';
  const problem = key ? problemWith(row) : 'No publishing credential is configured on the server.';
  let result;
  if (problem) {
    result = { ok: false, error: problem };
  } else {
    try {
      result = await publishOne({
        key,
        profile: process.env.UPLOAD_POST_PROFILE || 'default',
        platform: row.platform,
        caption: String(row.caption).trim(),
        imageUrl: row.imageUrl || null,
        externalId: id,
      });
    } catch (err) {
      result = { ok: false, error: err.message || 'The publisher could not be reached.' };
    }
  }

  if (result.ok) {
    const postedAt = Date.now();
    await ref.update({
      status: 'posted', postedAt, postedVia: row.platform, externalUrl: result.url,
      platformPostId: result.postId || null, error: null, sendingAt: FieldValue.delete(),
    });
    // What the public site shows under the record. Best effort — the queue
    // row is the audit trail and is already written.
    await db.collection('publicArchive').doc(row.recordId).update({
      socialPosts: FieldValue.arrayUnion({ platform: row.platform, url: result.url, postedAt, caption: String(row.caption).trim() }),
    }).catch((e) => console.warn('socialPosts projection failed', row.recordId, e.message));
    return { ok: true, url: result.url, postId: result.postId || null };
  }

  await ref.update({
    status: 'failed', error: result.error || 'The platform rejected the post.', sendingAt: FieldValue.delete(),
  });
  return { ok: false, error: result.error, pending: !!result.pending };
}

/** POST /studio/send { postId } — publishers and admins only. */
async function handleSend(req, res) {
  try {
    const match = (req.get('Authorization') || '').match(/^Bearer (.+)$/);
    if (!match) return res.status(401).json({ error: 'Sign in first.' });
    const decoded = await getAuth().verifyIdToken(match[1]);
    const role = ((await db.collection('roles').doc(decoded.uid).get()).data() || {}).role;
    if (role !== 'admin' && role !== 'publisher') return res.status(403).json({ error: 'Publishers and admins only.' });
  } catch {
    return res.status(401).json({ error: 'Your sign-in could not be verified.' });
  }
  const postId = String((req.body || {}).postId || '');
  if (!postId) return res.status(400).json({ error: 'Which post?' });
  try {
    const result = await sendRow(postId, { force: true });
    return res.status(result.ok ? 200 : result.skipped ? 409 : 502).json(result);
  } catch (err) {
    console.error('studio/send failed', postId, err);
    return res.status(500).json({ ok: false, error: err.message || 'Could not send the post.' });
  }
}

/** Every five minutes: send whatever is due. */
const sendDuePosts = onSchedule(
  { schedule: 'every 5 minutes', region: 'asia-south1', timeoutSeconds: 300 },
  async () => {
    const now = Date.now();
    const queued = await db.collection(COLLECTION).where('status', '==', 'queued').get();
    const due = queued.docs.filter((d) => (d.data().scheduledFor || 0) <= now);
    for (const d of due) {
      const r = await sendRow(d.id, { now }).catch((e) => ({ ok: false, error: e.message }));
      console.log(`sendDuePosts ${d.id}: ${r.ok ? `posted ${r.url}` : r.error}`);
    }
  },
);

module.exports = { sendRow, handleSend, sendDuePosts, problemWith };
