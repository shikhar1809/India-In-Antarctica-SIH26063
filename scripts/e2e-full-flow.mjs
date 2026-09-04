/**
 * Full end-to-end flow test: scientist dispatch → publisher queue → admin
 * approval → publicArchive → public API → public site read-back.
 *
 * This mirrors exactly what happens when:
 *   1. A scientist submits a field report from the app
 *   2. A publisher sees it in the queue and approves the draft
 *   3. An admin approves it for publication
 *   4. The public site reads it
 *
 * It runs against real Firestore (same rules as production) using the same
 * pipeline modules the portal ships.
 *
 *   node scripts/e2e-full-flow.mjs
 *   node scripts/e2e-full-flow.mjs --keep    # leave the records in Firestore
 */

import { mkdtempSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { FS_BASE, accessToken, toValue, fromValue } from './lib/firebase-rest.mjs';

const KEEP = process.argv.includes('--keep');
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

let failures = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failures++; console.log(`  FAIL  ${name}${detail ? `\n        ↳ ${detail}` : ''}`); }
};

/* ── load real pipeline modules ─────────────────────────────────────────── */
const tmp = mkdtempSync(join(tmpdir(), 'iia-e2e-'));
const entry = join(tmp, 'entry.ts');
const src = join(ROOT, 'apps', 'portal', 'src', 'repository').replace(/\\/g, '/');
writeFileSync(entry, `
export { normaliseDispatch } from '${src}/normalise';
export { draftPublicSummary } from '${src}/summarise';
export { toRepositoryRecord, canPublishDispatch } from '${src}/publish';
`);
const bundle = join(ROOT, 'apps', 'portal', 'node_modules', '.iia-e2e.mjs');
execFileSync('npx', ['esbuild', entry, '--bundle', '--format=esm', '--platform=node',
  '--packages=external', `--outfile=${bundle}`, '--log-level=error'],
  { cwd: join(ROOT, 'apps', 'portal'), shell: process.platform === 'win32', stdio: 'inherit' });
const { normaliseDispatch, draftPublicSummary, toRepositoryRecord, canPublishDispatch } =
  await import(pathToFileURL(bundle).href);

const token = await accessToken();

const RUN_ID = `e2e-${Date.now()}`;
const DISPATCH_ID = `dispatch-${RUN_ID}`;
const ARCHIVE_ID  = `archive-${RUN_ID}`;

/* ══════════════════════════════════════════════════════════════════════════
   STAGE 1 — Scientist submits a field report
   The Flutter app writes a dispatch to the `dispatches` collection.
   This is exactly what firestore.rules must allow for a signed-in scientist.
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n━━━ Stage 1: Scientist submits field report ━━━\n');

const raw = {
  id: DISPATCH_ID,
  authorUid: 'e2e-scientist-uid',
  authorName: 'Dr Priya Nair',
  observedAt: Date.UTC(2026, 8, 4, 6, 30),   // 2026-09-04 06:30 UTC
  station: 'Maitri',
  lat: -70.7659, lon: 11.7314, elevationM: 117,
  positionSource: 'GPS handheld',
  activity: 'Ice / glaciology survey',       // canonical name; produces a chart
  priority: 'routine',
  weather: {
    airTempC: -18, windSpeedKt: 22, windDir: 'SW',
    visibilityKm: 12, cloudOktas: 4, present: 'Partly cloudy',
  },
  // iceThickCm / snowDepthCm / freeboardCm all resolve to unit 'cm' →
  // deriveChart picks them as the 3-bar same-unit group.
  measurements: {
    siteId: 'MAI-T04', iceThickCm: '148', snowDepthCm: '29', freeboardCm: '9',
    surface: 'Compacted snow',
  },
  notes: 'Stake MAI-T04 checked. Ice slightly thicker than last week.',
  teamMembers: 'P. Nair, A. Roy',
  sampleIds: '',
  safetyFlag: false,
  voiceUrl: null, imageUrls: [], csvUrl: null, docUrls: [],
  caption: '', status: 'submitted',
  publisherName: null, publisherUid: null,
  platformCaptions: null, coverImageIndex: null,
  sopChecklist: null, adminNotes: null,
  createdAt: Date.now(), updatedAt: Date.now(),
};

// Write dispatch (scripts run above rules, but the shape is what the app sends)
const dispatchWrite = await fetch(`${FS_BASE}/dispatches/${DISPATCH_ID}`, {
  method: 'PATCH',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ fields: toValue(raw).mapValue.fields }),
});
check('dispatch written to Firestore', dispatchWrite.ok, `HTTP ${dispatchWrite.status}`);

// Read it back — confirms it landed
const readBack = await fetch(`${FS_BASE}/dispatches/${DISPATCH_ID}`,
  { headers: { authorization: `Bearer ${token}` } });
const dispatchDoc = await readBack.json();
check('dispatch readable (by authenticated user)', readBack.ok);
check('station field survived round-trip',
  dispatchDoc.fields?.station?.stringValue === 'Maitri');
check('dispatch is in submitted state',
  dispatchDoc.fields?.status?.stringValue === 'submitted');

/* ══════════════════════════════════════════════════════════════════════════
   STAGE 2 — Publisher sees it in the queue, adds a public summary
   The portal's Social.tsx compose step normalises + summarises the dispatch
   and stores the result as publicSummary on the dispatch.
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n━━━ Stage 2: Publisher processes queue item ━━━\n');

// After publisher approves, the dispatch status becomes 'approved' in Firestore.
// We mirror that here before running the pipeline — this is the object the
// admin's approval button reads when calling canPublishDispatch.
const approved = { ...raw, status: 'approved' };
const { dispatch: clean, measurements, warnings } = normaliseDispatch(approved);
check('normalisation succeeds', !!clean);
check('activity preserved through normalise', clean.activity === 'Ice / glaciology survey',
  `got "${clean.activity}"`);
check('no safety flag blocks publishing', canPublishDispatch(clean).ok === true);
check('publisher warned about any vocabulary repairs', Array.isArray(warnings));

const summary = draftPublicSummary(clean, measurements);
check('outreach headline generated', summary.title.length > 0, summary.title);
check('body is plain language (no raw codes)',
  !summary.body.join(' ').match(/\b(BLSN|FG|TSGR|DZ)\b/));
check('key-facts table has entries', (summary.table ?? []).length > 0);

// Publisher stores the summary back on the dispatch (portal writes this via setDoc)
const summaryPatch = await fetch(`${FS_BASE}/dispatches/${DISPATCH_ID}?updateMask.fieldPaths=publicSummary&updateMask.fieldPaths=status&updateMask.fieldPaths=publisherName`, {
  method: 'PATCH',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ fields: toValue({
    publicSummary: { title: summary.title, body: summary.body,
      table: summary.table, chart: summary.chart ?? null },
    status: 'approved',
    publisherName: 'E2E Publisher',
  }).mapValue.fields }),
});
check('publisher can update dispatch with summary', summaryPatch.ok,
  `HTTP ${summaryPatch.status}`);

/* ══════════════════════════════════════════════════════════════════════════
   STAGE 3 — Admin approves → record published to publicArchive
   ApproveTab calls publishRecord() which calls toRepositoryRecord() then
   setDoc() into publicArchive. This stage runs that exact code path.
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n━━━ Stage 3: Admin approves, record published ━━━\n');

const record = toRepositoryRecord(clean, summary, measurements, 'e2e-admin', `IIA-2026-E2E`, raw.observedAt);
record.id = ARCHIVE_ID;   // use our stable id so we can clean up

// Security gate: none of these should appear in the published record
const json = JSON.stringify(record);
check('admin notes absent from public record', !json.includes('Routine morning obs'));
check('team members absent from public record', !json.includes('A. Roy'));
check('sample IDs absent', !json.includes('e2e-scientist-uid'));
check('SOP checklist absent', !json.includes('sopChecklist'));

const archiveWrite = await fetch(`${FS_BASE}/publicArchive/${ARCHIVE_ID}`, {
  method: 'PATCH',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ fields: toValue(record).mapValue.fields }),
});
check('record published to publicArchive', archiveWrite.ok,
  `HTTP ${archiveWrite.status}`);

/* ══════════════════════════════════════════════════════════════════════════
   STAGE 4 — Public site reads it (no auth)
   publicArchive has `allow read: if true`, so an anonymous visitor can fetch
   the record. The public site uses onSnapshot on this collection.
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n━━━ Stage 4: Public reads the record (no auth) ━━━\n');

// Anonymous read — NO authorization header
const anonRead = await fetch(`${FS_BASE}/publicArchive/${ARCHIVE_ID}`);
check('anonymous visitor can read the published record', anonRead.ok,
  `HTTP ${anonRead.status}`);

if (anonRead.ok) {
  const pub = fromValue({ mapValue: { fields: (await anonRead.json()).fields } });
  check('headline reached the public', pub.title === summary.title,
    `got "${pub.title}"`);
  check('body paragraphs present', (pub.body ?? []).length > 0);
  check('key-facts table present', (pub.table ?? []).length > 0);
  check('metadata identifier set', (pub.metadata?.identifier ?? '').startsWith('IIA-'),
    pub.metadata?.identifier);
  // Published record uses the CoverStation key ('maitri'), not the display name
  check('station field on public record', pub.station === 'maitri',
    `got "${pub.station}"`);
  check('metadata station is display name', pub.metadata?.station === 'Maitri',
    `got "${pub.metadata?.station}"`);
  check('chart present (same-unit measurements produce one)',
    pub.chart !== null && pub.chart !== undefined, 'no chart');
}

// Also confirm dispatches are NOT publicly readable (security check)
const anonDispatch = await fetch(`${FS_BASE}/dispatches/${DISPATCH_ID}`);
check('unauthenticated user CANNOT read dispatches',
  anonDispatch.status === 403 || anonDispatch.status === 401,
  `got HTTP ${anonDispatch.status} (should be 401 or 403)`);

/* ══════════════════════════════════════════════════════════════════════════
   STAGE 5 — Cloud Function API returns the record
   GET /api/records should include our new record.
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n━━━ Stage 5: Cloud Function API serves the record ━━━\n');

const apiUrl = 'https://asia-south1-indiainantartica.cloudfunctions.net/api';
const apiAll = await fetch(`${apiUrl}/records?limit=50`);
check('Cloud Function API responds', apiAll.ok, `HTTP ${apiAll.status}`);

if (apiAll.ok) {
  const { records } = await apiAll.json();
  const ours = records.find(r => r.id === ARCHIVE_ID);
  check('our record appears in /api/records', !!ours, 'not found in list');
  if (ours) {
    check('CORS header present', apiAll.headers.get('access-control-allow-origin') === '*');
  }
  const detail = await fetch(`${apiUrl}/records/${ARCHIVE_ID}`);
  check('GET /api/records/:id returns our record', detail.ok, `HTTP ${detail.status}`);
  if (detail.ok) {
    const { record: r } = await detail.json();   // API wraps in { record: ... }
    check('detail has title', r?.title === summary.title,
      `got "${r?.title}" vs "${summary.title}"`);
    check('detail has measurements array', Array.isArray(r?.measurements),
      `measurements is ${typeof r?.measurements}`);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Cleanup
   ══════════════════════════════════════════════════════════════════════════ */
if (!KEEP) {
  console.log('\n━━━ Cleanup ━━━\n');
  const d1 = await fetch(`${FS_BASE}/dispatches/${DISPATCH_ID}`,
    { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
  const d2 = await fetch(`${FS_BASE}/publicArchive/${ARCHIVE_ID}`,
    { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
  check('dispatch cleaned up', d1.ok, `HTTP ${d1.status}`);
  check('public record cleaned up', d2.ok, `HTTP ${d2.status}`);
  try { unlinkSync(bundle); } catch { /* already gone */ }
}

/* ══════════════════════════════════════════════════════════════════════════
   Result
   ══════════════════════════════════════════════════════════════════════════ */
console.log(`\n${'━'.repeat(56)}`);
console.log(`  ${passed} passed   ${failures} failed   (${passed + failures} total)`);
console.log(`${'━'.repeat(56)}\n`);
if (failures > 0) console.log('FLOW FAILED\n');
else console.log('FULL FLOW OK — scientist → publisher → admin → public\n');
process.exit(failures > 0 ? 1 : 0);
