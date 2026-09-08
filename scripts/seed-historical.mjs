/**
 * Seeds the historical records into the publicArchive collection.
 *
 * The portal has an admin-only "Refresh records" button that does
 * exactly this from inside the app; this script is the same operation for a
 * terminal, reusing the Firebase CLI's own stored credentials (the ones
 * `firebase deploy` already uses) rather than asking for a service account.
 *
 * It writes as the signed-in CLI user, so the same firestore.rules apply — if
 * that account is not an admin, the write is refused exactly as it should be.
 *
 *   node scripts/seed-historical.mjs
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { FS_BASE, accessToken, toValue } from './lib/firebase-rest.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/* ── load the generated records (TypeScript → bundled → imported) ───────── */
const tmp = mkdtempSync(join(tmpdir(), 'iia-seed-'));
const bundle = join(tmp, 'records.mjs');
execFileSync('npx', ['esbuild', join(ROOT, 'apps', 'portal', 'src', 'repository', 'historicalRecords.ts'),
  '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=error'], {
  cwd: join(ROOT, 'apps', 'portal'), shell: process.platform === 'win32', stdio: 'inherit',
});
const { HISTORICAL_RECORDS } = await import(pathToFileURL(bundle).href);

const token = await accessToken();

console.log(`\nSeeding ${HISTORICAL_RECORDS.length} historical records as the signed-in CLI account…\n`);

let written = 0;
for (const record of HISTORICAL_RECORDS) {
  // PATCH with an explicit document id = create-or-replace, so re-running is
  // idempotent rather than duplicating the archive.
  const res = await fetch(`${FS_BASE}/publicArchive/${encodeURIComponent(record.id)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: toValue(record).mapValue.fields }),
  });

  if (res.ok) {
    written++;
    console.log(`  ok    ${record.metadata.identifier}  ${record.title}`);
  } else {
    const err = await res.text();
    console.error(`  FAIL  ${record.id}: HTTP ${res.status}`);
    console.error(`        ${err.slice(0, 300)}`);
    if (res.status === 403) {
      console.error('\n  The signed-in account is not an admin in roles/{uid}.');
      console.error('  Use the portal\'s own "Refresh records" button instead,');
      console.error('  or switch that account to Admin with the role switcher first.\n');
    }
    process.exit(1);
  }
}

console.log(`\n${written} records published to publicArchive.\n`);
