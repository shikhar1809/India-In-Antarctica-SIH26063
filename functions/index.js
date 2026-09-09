/**
 * Public read API for the NCPOR Knowledge Repository.
 *
 * The `publicArchive` Firestore collection is already world-readable, so it
 * can be fetched straight from the Firestore REST endpoint with no server at
 * all. That endpoint works, but it returns Google's typed-value wrapper —
 * {"title":{"stringValue":"…"}} — which is awkward for anyone consuming it.
 * This function serves the same records as plain JSON, with CORS open, so a
 * third party (a school, a newsroom, another MoES system) can use one fetch.
 *
 * Endpoints
 *   GET /api/records                     every published record, newest first
 *   GET /api/records?station=maitri      filter by station key
 *   GET /api/records?category=dataset    filter by record category
 *   GET /api/records?limit=10            cap the result count (default 100)
 *   GET /api/records/:id                 one record
 *   GET /api/stats                       counts by category and station
 *
 * Read-only by design: there is no write path here. Publishing happens in the
 * portal, behind Firebase Auth and the firestore.rules admin check.
 */

const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const COLLECTION = 'publicArchive';
const MAX_LIMIT = 200;

const CATEGORIES = ['expedition', 'dataset', 'publication', 'media', 'institution'];
const STATIONS = ['maitri', 'bharati', 'dakshin', 'ship', 'ncpor'];

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  // Published records change rarely; let intermediaries hold them briefly.
  res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
}

/** The record as the API presents it — the stored shape minus nothing, since
 *  publicArchive is already the public projection. Only `id` is added. */
function present(doc) {
  return { id: doc.id, ...doc.data() };
}

exports.api = onRequest({ region: 'asia-south1', cors: true }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Only GET is supported.' });

  // onRequest gives the path after the function name, e.g. "/records/abc".
  const path = (req.path || '/').replace(/\/+$/, '') || '/';

  try {
    /* ── GET /api/records/:id ──────────────────────────────────────────── */
    const single = path.match(/^\/records\/(.+)$/);
    if (single) {
      const snap = await db.collection(COLLECTION).doc(decodeURIComponent(single[1])).get();
      if (!snap.exists) return res.status(404).json({ error: 'No published record with that id.' });
      return res.json({ record: present(snap) });
    }

    /* ── GET /api/records ──────────────────────────────────────────────── */
    if (path === '/records') {
      const { station, category } = req.query;

      if (station && !STATIONS.includes(String(station))) {
        return res.status(400).json({ error: `Unknown station. Expected one of: ${STATIONS.join(', ')}` });
      }
      if (category && !CATEGORIES.includes(String(category))) {
        return res.status(400).json({ error: `Unknown category. Expected one of: ${CATEGORIES.join(', ')}` });
      }

      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || 100));

      let q = db.collection(COLLECTION);
      if (station) q = q.where('station', '==', String(station));
      if (category) q = q.where('cat', '==', String(category));

      // Ordering by publishedAt alongside an equality filter needs a
      // composite index; sorting the page in memory keeps the API
      // deployable without one, and the collection is small.
      const snap = await q.limit(limit).get();
      const records = snap.docs.map(present).sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));

      return res.json({
        count: records.length,
        records,
        license: 'Records are published under their individual licence; see record.metadata.license.',
        source: 'National Centre for Polar and Ocean Research (NCPOR), Ministry of Earth Sciences',
      });
    }

    /* ── GET /api/stats ────────────────────────────────────────────────── */
    if (path === '/stats') {
      const snap = await db.collection(COLLECTION).get();
      const byCategory = {};
      const byStation = {};
      let earliest = null;
      let latest = null;

      for (const doc of snap.docs) {
        const d = doc.data();
        byCategory[d.cat] = (byCategory[d.cat] ?? 0) + 1;
        byStation[d.station] = (byStation[d.station] ?? 0) + 1;
        const observed = d.metadata?.temporal?.observedAt;
        if (typeof observed === 'number') {
          if (earliest === null || observed < earliest) earliest = observed;
          if (latest === null || observed > latest) latest = observed;
        }
      }

      return res.json({
        total: snap.size,
        byCategory,
        byStation,
        observationRange: earliest && latest
          ? { from: new Date(earliest).toISOString(), to: new Date(latest).toISOString() }
          : null,
      });
    }

    /* ── GET /api ──────────────────────────────────────────────────────── */
    return res.json({
      service: 'NCPOR Knowledge Repository API',
      endpoints: {
        'GET /api/records': 'Every published record, newest first. Filters: station, category, limit.',
        'GET /api/records/:id': 'A single published record.',
        'GET /api/stats': 'Counts by category and station, plus the observation date range.',
      },
      stations: STATIONS,
      categories: CATEGORIES,
    });
  } catch (err) {
    console.error('API error', err);
    return res.status(500).json({ error: 'The repository could not be read just now.' });
  }
});

/* The post studio's copy generator lives in its own module — it is a write
 * path with a secret, which has nothing in common with this read-only API
 * beyond sharing a deployment. */
exports.studio = require('./studio').studio;

/* The engagement harness — fetches real like/comment/share counts from
 * each platform's own API for posts already confirmed sent. See
 * engagement.js for the credentials it needs and why it is a function
 * rather than portal-side code. */
exports.engagement = require('./engagement').engagement;
