/**
 * Integration test against the DEPLOYED project — no emulator, no SDK, no
 * credentials. Plain anonymous HTTP, exactly as a member of the public (or a
 * third party consuming the API) would see it.
 *
 * This is the check that matters most for the wiring: it proves the published
 * repository really is world-readable, and that raw dispatches really are not.
 * A rules emulator could only approximate that; this asserts it against the
 * rules that are actually live.
 *
 *   node scripts/verify-api.mjs
 *
 * Exits non-zero on any failure, so it is CI-usable as-is.
 */

const PROJECT = 'indiainantartica';
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const FUNCTION_API = `https://asia-south1-${PROJECT}.cloudfunctions.net/api/records`;

let failures = 0;
let checks = 0;

function check(name, ok, detail = '') {
  checks++;
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
  }
}

async function get(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error page */ }
  return { status: res.status, body, headers: res.headers };
}

console.log(`\nVerifying the public API of ${PROJECT}\n`);

/* ── 1. The published repository is readable with no auth at all ───────── */
console.log('Public read access');
const pub = await get(`${FIRESTORE}/publicArchive?pageSize=100`);
check('publicArchive is readable anonymously', pub.status === 200, `got HTTP ${pub.status}`);

const docs = pub.body?.documents ?? [];
check('publicArchive returns at least one published record', docs.length > 0,
  'none found — run the "Refresh records" action in the portal, or approve a dispatch');

/* ── 2. Raw dispatches are NOT readable. The security assertion. ───────── */
console.log('\nPrivate data stays private');
const disp = await get(`${FIRESTORE}/dispatches?pageSize=1`);
check('dispatches is NOT readable anonymously', disp.status === 403 || disp.status === 401,
  `expected 401/403, got HTTP ${disp.status} — raw field reports may be exposed`);

const docsPrivate = await get(`${FIRESTORE}/roles?pageSize=1`);
check('roles is NOT readable anonymously', docsPrivate.status === 403 || docsPrivate.status === 401,
  `expected 401/403, got HTTP ${docsPrivate.status}`);

/* ── 3. Published records carry no internal fields ─────────────────────── */
console.log('\nPublished records are clean');
if (docs.length > 0) {
  const forbidden = ['notes', 'teamMembers', 'adminNotes', 'sopChecklist', 'safetyFlag',
                     'publisherUid', 'authorUid', 'platformCaptions', 'sampleIds', 'csvUrl'];
  const leaked = new Set();
  const raw = JSON.stringify(docs);
  for (const f of forbidden) {
    // Firestore REST wraps every field as {"fieldName": {"stringValue": …}},
    // so a leaked field shows up as a quoted key.
    if (raw.includes(`"${f}"`)) leaked.add(f);
  }
  check('no internal field names appear in any published record',
    leaked.size === 0, `leaked: ${[...leaked].join(', ')}`);

  const first = docs[0].fields ?? {};
  check('records carry a citable identifier',
    !!first.metadata?.mapValue?.fields?.identifier?.stringValue,
    'metadata.identifier missing');
  check('records state their coordinate datum',
    first.metadata?.mapValue?.fields?.spatial?.mapValue?.fields?.datum?.stringValue === 'WGS84',
    'metadata.spatial.datum is not WGS84');
  check('records name a licence',
    !!first.metadata?.mapValue?.fields?.license?.stringValue,
    'metadata.license missing');

  // Metadata that is identical on every record is decoration, not metadata.
  // The first cut of the historical import filled creators with "NCPOR" and
  // left instrument and position null everywhere, so the citation block read
  // the same on all eleven records.
  const meta = (d) => d.fields?.metadata?.mapValue?.fields ?? {};
  const creators = docs.map((d) => {
    const list = meta(d).creators?.arrayValue?.values ?? [];
    return list.map((c) => c.mapValue?.fields?.name?.stringValue).join('+');
  });
  check('records are attributed to different creators',
    new Set(creators).size >= 3,
    `only ${new Set(creators).size} distinct: ${[...new Set(creators)].join(' | ')}`);

  // Not "every record has coordinates" — a repository-wide document (a
  // metadata profile, a cross-station summary) genuinely isn't at a place.
  // What matters is that the records which DO have a position have real,
  // differing ones, rather than every record sharing a placeholder.
  const positions = docs
    .map((d) => meta(d).spatial?.mapValue?.fields)
    .filter((sp) => sp?.lat?.doubleValue !== undefined)
    .map((sp) => `${sp.lat.doubleValue},${sp.lon?.doubleValue}`);
  check('located records sit at more than one real place',
    new Set(positions).size >= 3,
    `${positions.length} located, ${new Set(positions).size} distinct`);
  check('every record states a datum, positioned or not',
    docs.every((d) => meta(d).spatial?.mapValue?.fields?.datum?.stringValue === 'WGS84'),
    'a record is missing spatial.datum');

  // Every public record must trace back to something: a field dispatch, or a
  // deposit in the Knowledge Repository. Content that appears on the public
  // site from nowhere is content nobody can verify.
  const sources = docs.map((d) => meta(d).provenance?.mapValue?.fields);
  check('every public record names its source',
    sources.every((p) => ['dispatch', 'document'].includes(p?.sourceType?.stringValue)),
    `unsourced: ${sources.filter((p) => !['dispatch','document'].includes(p?.sourceType?.stringValue)).length}`);
  check('every public record points at a real source id',
    sources.every((p) => (p?.sourceId?.stringValue ?? '').length > 0));

  const identifiers = docs.map((d) => meta(d).identifier?.stringValue);
  check('every identifier is unique',
    new Set(identifiers).size === identifiers.length,
    `${identifiers.length - new Set(identifiers).size} duplicate(s)`);
} else {
  console.log('  SKIP  record-shape checks (no records published yet)');
}

/* ── 4. The JSON API, if it has been deployed ──────────────────────────── */
console.log('\nJSON API');
try {
  const api = await get(FUNCTION_API);
  if (api.status === 404 || api.status === 403) {
    console.log('  SKIP  Cloud Function not deployed yet (the Firestore REST endpoint above is live regardless)');
  } else {
    check('GET /api/records returns 200', api.status === 200, `got HTTP ${api.status}`);
    check('response has a records array', Array.isArray(api.body?.records));
    check('CORS is open for third-party consumers',
      api.headers.get('access-control-allow-origin') === '*',
      `got "${api.headers.get('access-control-allow-origin')}"`);
    if (Array.isArray(api.body?.records) && api.body.records.length > 0) {
      const r = api.body.records[0];
      check('records are plain, unwrapped JSON', typeof r.title === 'string',
        'title is not a plain string — the Firestore value wrapper is leaking through');
    }
  }
} catch (e) {
  console.log(`  SKIP  Cloud Function unreachable (${e.message})`);
}

console.log(`\n${checks - failures}/${checks} checks passed\n`);
process.exit(failures > 0 ? 1 : 0);
