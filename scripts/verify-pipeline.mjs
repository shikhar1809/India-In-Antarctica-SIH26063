/**
 * End-to-end proof that the approval pipeline actually works, using the real
 * production modules rather than a reimplementation of them.
 *
 * It takes a realistic raw dispatch — the shape an older Flutter build would
 * send, Australian station name and all — pushes it through the genuine
 * normalise → summarise → project chain from apps/portal/src/repository, writes
 * the result to publicArchive, and then reads it back over anonymous HTTP the
 * way a member of the public would.
 *
 *   node scripts/verify-pipeline.mjs           # publish and verify, then clean up
 *   node scripts/verify-pipeline.mjs --keep    # leave the record on the site
 *
 * Writes as the signed-in Firebase CLI account, so firestore.rules apply.
 */

import { readFileSync, mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { FS_BASE, accessToken, toValue } from './lib/firebase-rest.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const KEEP = process.argv.includes('--keep');

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
};

/* ── auth (same CLI credentials firebase deploy uses) ──────────────────── */

/* ── load the REAL pipeline modules ────────────────────────────────────── */
// normalise.ts and summarise.ts are pure. publish.ts pulls in the Firebase SDK
// for its write helpers, so only its pure projection is re-exported here via a
// tiny entry file, keeping the test honest: it exercises shipped code.
const tmp = mkdtempSync(join(tmpdir(), 'iia-pipeline-'));
const entry = join(tmp, 'entry.ts');
const portalSrc = join(ROOT, 'apps', 'portal', 'src', 'repository');
const asUrl = (p) => p.replace(/\\/g, '/');

const { writeFileSync } = await import('node:fs');
writeFileSync(entry, `
export { normaliseDispatch } from '${asUrl(join(portalSrc, 'normalise'))}';
export { draftPublicSummary } from '${asUrl(join(portalSrc, 'summarise'))}';
export { toRepositoryRecord, canPublishDispatch, formatIdentifier } from '${asUrl(join(portalSrc, 'publish'))}';
`);

// The bundle has to sit inside apps/portal so Node can resolve the external
// `firebase/*` imports from that package's own node_modules.
const bundle = join(ROOT, 'apps', 'portal', 'node_modules', '.iia-pipeline-check.mjs');
// --packages=external leaves `firebase/*` imports for Node to resolve from
// node_modules rather than inlining the SDK (which drags in grpc and won't
// bundle to ESM). Only this repo's own modules end up in the bundle.
execFileSync('npx', ['esbuild', entry, '--bundle', '--format=esm', '--platform=node',
  '--packages=external', `--outfile=${bundle}`, '--log-level=error'], {
  cwd: join(ROOT, 'apps', 'portal'), shell: process.platform === 'win32', stdio: 'inherit',
});

const { normaliseDispatch, draftPublicSummary, toRepositoryRecord, canPublishDispatch } =
  await import(pathToFileURL(bundle).href);

/* ── the input: exactly what an out-of-date field app sends ────────────── */
const RAW = {
  id: `pipeline-test-${Date.now()}`,
  authorUid: 'test-scientist-uid',
  authorName: 'Dr Meera Iyer',
  observedAt: Date.UTC(2026, 0, 18, 7, 15),
  station: 'Casey Station',              // Australian — must be repaired
  lat: -70.7659, lon: 11.7314, elevationM: 130,
  positionSource: 'GPS',                 // old vocabulary
  activity: 'Sea Ice Survey',            // old vocabulary
  priority: 'notable',
  weather: {                             // Dart field name + METAR code + 16-point wind
    airTempC: -24, windSpeedKt: 31, windDir: 'ENE',
    visibilityKm: 2, cloudOktas: 7, presentWeather: 'BLSN',
  },
  measurements: {                        // legacy flat map, units live in the schema
    siteId: 'MAI-S12', iceThickCm: '164', snowDepthCm: '22', freeboardCm: '11', surface: 'Wind slab',
  },
  notes: 'Stake MAI-S12 re-drilled. Freeboard down 3cm on last visit. Transect 400m NNE.',
  teamMembers: 'A. Sharma, K. Nair',
  sampleIds: 'ICE-2601-A',
  safetyFlag: false,
  voiceUrl: null, imageUrls: [], csvUrl: null, docUrls: [],
  caption: '', status: 'approved',
  publisherName: 'P. Publisher', publisherUid: 'publisher-uid',
  platformCaptions: null, coverImageIndex: null,
  sopChecklist: { facts: true, safety: true, photo: true, credit: true, hashtags: true },
  adminNotes: 'Internal: check the freeboard figure with the glaciology lead.',
  createdAt: Date.now(), updatedAt: Date.now(),
};

console.log('\nEnd-to-end pipeline check\n');

/* ── 1. normalisation repairs the legacy vocabulary ────────────────────── */
console.log('Normalisation');
const { dispatch: clean, measurements, warnings, sourceStation } = normaliseDispatch(RAW);
check('Australian station repaired to Other', clean.station === 'Other', `got "${clean.station}"`);
check('original station preserved for the publisher', sourceStation === 'Casey Station');
check('old activity name mapped', clean.activity === 'Ice / glaciology survey', `got "${clean.activity}"`);
check('METAR BLSN read as Blowing snow', clean.weather.present === 'Blowing snow', `got "${clean.weather.present}"`);
check('16-point wind folded to 8-point', clean.weather.windDir === 'NE', `got "${clean.weather.windDir}"`);
check('legacy measurements gained their units',
  measurements.find((m) => m.fieldId === 'iceThickCm')?.unit === 'cm');
check('the publisher is warned about what changed', warnings.length >= 2, `${warnings.length} warnings`);

/* ── 2. the outreach draft is readable and has a chart ─────────────────── */
console.log('\nOutreach summary');
const summary = draftPublicSummary(clean, measurements);
check('headline is plain language', summary.title === 'Measuring the ice at Other', `got "${summary.title}"`);
check('body avoids the scientist’s shorthand', !summary.body.join(' ').includes('MAI-S12'));
check('a chart was derived from the same-unit readings', !!summary.chart, 'no chart');
check('the chart has three cm readings', summary.chart?.data.length === 3, `${summary.chart?.data.length}`);

/* ── 3. the projection refuses to carry internal material ──────────────── */
console.log('\nProjection');
check('publishing is allowed for this dispatch', canPublishDispatch(clean).ok === true);
const record = toRepositoryRecord(clean, summary, measurements, 'verify-script', 'IIA-2026-9999');
const json = JSON.stringify(record);
check('admin notes are absent', !json.includes('check the freeboard figure'));
check('raw field notes are absent', !json.includes('Transect 400m'));
check('field-party names are absent', !json.includes('K. Nair'));
check('sample ids are absent', !json.includes('ICE-2601-A'));
check('the SOP checklist is absent', !json.includes('sopChecklist'));

/* ── 4. it actually writes, and the public can actually read it ────────── */
console.log('\nLive publish and anonymous read-back');
const token = await accessToken();
const put = await fetch(`${FS_BASE}/publicArchive/${record.id}`, {
  method: 'PATCH',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ fields: toValue(record).mapValue.fields }),
});
check('the record writes to Firestore', put.ok, `HTTP ${put.status}: ${(await put.text()).slice(0, 200)}`);

if (put.ok) {
  const anon = await fetch(`${FS_BASE}/publicArchive/${record.id}`);
  const body = await anon.json();
  check('a signed-out visitor can read it back', anon.status === 200, `HTTP ${anon.status}`);
  check('the headline survived the round trip',
    body?.fields?.title?.stringValue === summary.title,
    `got "${body?.fields?.title?.stringValue}"`);
  check('the chart survived the round trip',
    (body?.fields?.chart?.mapValue?.fields?.data?.arrayValue?.values ?? []).length === 3);
  check('the key facts survived (no nested-array rejection)',
    (body?.fields?.table?.arrayValue?.values ?? []).length > 0);

  if (!KEEP) {
    const del = await fetch(`${FS_BASE}/publicArchive/${record.id}`, {
      method: 'DELETE', headers: { authorization: `Bearer ${token}` },
    });
    check('the test record cleans up after itself', del.ok, `HTTP ${del.status}`);
  } else {
    console.log(`\n  kept: ${record.id} is live on the public site`);
  }
}

console.log(`\n${failures === 0 ? 'PIPELINE OK' : `${failures} FAILURE(S)`}\n`);
process.exit(failures > 0 ? 1 : 0);
