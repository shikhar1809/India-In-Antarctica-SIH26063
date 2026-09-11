/**
 * The sign-in security check, server side.
 *
 * Every visit to the portal runs a short check before anything renders
 * (portal: components/SecurityCheck.tsx). Two parts of it must not be the
 * browser's word:
 *
 *   - the IP address. A page can claim any IP it likes; the address Google's
 *     front end saw the request arrive from is the one worth recording.
 *   - the decision. Whether this account has been granted access is read
 *     from `roles/{uid}` here, with the Admin SDK, and the log entry is
 *     written here too — so an unauthorised attempt is on record even if
 *     the visitor closes the tab the instant they see the warning.
 *
 * The location is different: only the browser can ask the device where it
 * is, so it arrives from the client and is recorded as reported, alongside
 * whether the person allowed it.
 *
 *   GET  /access   → { ip }                                   (signed in)
 *   POST /access   → { status, role, ip } and one auditLog entry
 *                    body: { location, device }
 *
 * status: 'granted'    — a roles doc exists and is not revoked
 *         'unassigned' — signed in with Google, but nobody granted a role
 *         'revoked'    — an admin revoked this account
 */

const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

if (!getApps().length) initializeApp();
const db = getFirestore();

const ROLE_LABEL = {
  scientist: 'Scientist', publisher: 'Publisher', admin: 'Admin', site_manager: 'Site Manager',
};

/** The first address in X-Forwarded-For is the client; everything after it
 *  is proxies. Falls back to the socket address for local emulation. */
function clientIp(req) {
  const fwd = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  return fwd || req.ip || 'unknown';
}

async function verify(req) {
  const m = (req.get('Authorization') || '').match(/^Bearer (.+)$/);
  if (!m) {
    const err = new Error('Sign in first.');
    err.status = 401;
    throw err;
  }
  return getAuth().verifyIdToken(m[1]);
}

const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The location is client-reported, so every field is type-checked and
 *  clipped before it goes near the log. */
function cleanLocation(raw) {
  const l = raw && typeof raw === 'object' ? raw : {};
  const source = ['gps', 'ip', 'none'].includes(l.source) ? l.source : 'none';
  return {
    source,
    permission: ['granted', 'denied', 'unavailable'].includes(l.permission) ? l.permission : 'unavailable',
    lat: num(l.lat), lon: num(l.lon), accuracyM: num(l.accuracyM),
    city: str(l.city, 80), region: str(l.region, 80), country: str(l.country, 80),
  };
}

function describeLocation(loc) {
  const place = [loc.city, loc.region, loc.country].filter(Boolean).join(', ');
  if (loc.source === 'gps') {
    const coords = loc.lat !== null && loc.lon !== null ? `${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}` : '';
    const acc = loc.accuracyM ? ` ±${Math.round(loc.accuracyM)} m` : '';
    return place ? `${place} (${coords}${acc})` : `${coords}${acc}` || 'coordinates unavailable';
  }
  if (loc.source === 'ip') return `${place || 'unknown'} (approximate, from IP)`;
  return 'Not available';
}

exports.access = onRequest({ region: 'asia-south1', cors: true }, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');

  let decoded;
  try {
    decoded = await verify(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message || 'Invalid sign-in.' });
  }

  const ip = clientIp(req);
  if (req.method === 'GET') return res.json({ ip });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only GET and POST are supported.' });

  const body = req.body || {};
  const location = cleanLocation(body.location);
  const device = str(body.device, 120) || 'Unknown device';

  const snap = await db.collection('roles').doc(decoded.uid).get();
  const data = snap.exists ? snap.data() : null;
  const role = data && ROLE_LABEL[data.role] ? data.role : null;
  const status = !data || !role ? 'unassigned' : data.revoked === true ? 'revoked' : 'granted';

  const action = status === 'granted'
    ? `Signed in as ${ROLE_LABEL[role]}`
    : status === 'revoked'
      ? 'Access attempt by a revoked account'
      : 'Unauthorised access attempt — no role granted';

  try {
    await db.collection('auditLog').add({
      at: FieldValue.serverTimestamp(),
      actorUid: decoded.uid,
      actorName: decoded.name || null,
      actorEmail: decoded.email || null,
      actorRole: role || 'unknown',
      category: 'Security',
      tool: 'Sign-in check',
      action,
      target: null,
      changes: [
        `IP address: ${ip}`,
        `Location: ${describeLocation(location)}`,
        `Location permission: ${location.permission}`,
        `Device: ${device}`,
      ],
      // Structured copies of the same facts, for anything that wants to
      // query them rather than read the sentences.
      ip,
      location,
      device,
      alert: status !== 'granted',
      recordedBy: 'server',
    });
  } catch (err) {
    console.error('access: could not write the log entry', err);
  }

  return res.json({ status, role, ip });
});

exports._test = { clientIp, cleanLocation, describeLocation };
