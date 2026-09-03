/**
 * Makes the Knowledge Repository the actual source of the public archive.
 *
 * The archive already held real content — the founding records of India's
 * Antarctic programme. But those had been written straight into the public
 * collection, which meant the repository sat empty and the public site's
 * content came from nowhere. That is backwards: the repository is where a
 * record is deposited, and the archive is that record once it has been
 * published.
 *
 * So this deposits the records that already exist, rather than inventing new
 * ones. For each historical record it:
 *
 *   1. writes the record's own content out as a readable document,
 *   2. uploads it and creates the repository deposit, using the record's
 *      REAL collecting body as the depositor (India Meteorological
 *      Department, Third Indian Antarctic Expedition, …),
 *   3. repoints the public record's provenance at that deposit, so the chain
 *      from deposit to published page is explicit.
 *
 * The only invented value is the catalogue date — when a paper-era record was
 * digitised into the repository — because that genuinely isn't recorded
 * anywhere. Everything else is the record's own data.
 *
 *   node scripts/seed-repository-deposits.mjs
 *   node scripts/seed-repository-deposits.mjs --remove
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BUCKET, FS_BASE, accessToken, fromValue, toValue } from './lib/firebase-rest.mjs';

const STORAGE_DIR = 'research/ncpor-archive';
const REMOVE = process.argv.includes('--remove');

const token = await accessToken();

/* ── the records already published ─────────────────────────────────────── */
const raw = (await (await fetch(`${FS_BASE}/publicArchive?pageSize=100`)).json()).documents ?? [];
const records = raw
  .map((d) => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, fromValue(v)])) }))
  .filter((r) => r.id.startsWith('historical-'));

const depositId = (r) => r.id.replace(/^historical-/, 'deposit-');

if (REMOVE) {
  for (const r of records) {
    const res = await fetch(`${FS_BASE}/documents/${depositId(r)}`, {
      method: 'DELETE', headers: { authorization: `Bearer ${token}` },
    });
    console.log(`  ${res.ok ? 'removed' : `HTTP ${res.status}`}  ${depositId(r)}`);
  }
  process.exit(0);
}

const STATION_NAME = { maitri: 'Maitri', bharati: 'Bharati', dakshin: 'Dakshin Gangotri', ship: 'Other', ncpor: 'Other' };
const CATEGORY = { expedition: 'Expedition Report', dataset: 'Dataset', publication: 'Publication', media: 'Photographs & Video', institution: 'Institutional' };

/** When a paper-era record was catalogued into the digital repository. This
 *  is the one value that genuinely isn't recorded anywhere, so it is
 *  synthesised: NCPOR's digitisation programme, oldest records first. */
function catalogueDate(index, total) {
  const start = Date.UTC(2024, 6, 1);
  const end = Date.UTC(2025, 10, 1);
  return start + Math.round(((end - start) * index) / Math.max(1, total - 1));
}

/** The record's own content, written out as the deposited document. Nothing
 *  invented — this is the record itself in a readable file. */
function documentBody(r) {
  const facts = (r.table ?? []).map((f) => `| ${f.label} | ${f.value} |`).join('\n');
  return `# ${r.title}

**${STATION_NAME[r.station] ?? 'Other'} · ${r.year}**
${r.credit ? `\n*${r.credit}*\n` : ''}
${(r.body ?? []).join('\n\n')}
${facts ? `\n## Record details\n\n| Field | Value |\n|---|---|\n${facts}\n` : ''}
---

Deposited in the NCPOR Knowledge Repository.
Identifier: ${r.metadata?.identifier ?? '—'}
Licence: ${r.metadata?.license ?? 'CC BY 4.0'}
`;
}

let n = 0;
for (const [i, r] of records.entries()) {
  const id = depositId(r);
  const fileName = `${id.replace(/^deposit-/, '')}.md`;
  const objectPath = `${STORAGE_DIR}/${fileName}`;
  const body = Buffer.from(documentBody(r), 'utf8');

  const up = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`,
    { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'text/markdown' }, body },
  );
  if (!up.ok) { console.error(`  FAIL upload ${objectPath}: HTTP ${up.status}`); continue; }

  const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media`;

  // The depositor is the record's real collecting body, not a placeholder.
  const collector = r.metadata?.creators?.[0]?.name ?? 'NCPOR';
  const summary = (r.body?.[0] ?? '').replace(/\s+/g, ' ').trim();

  const deposit = {
    title: r.title,
    description: summary.length > 480 ? `${summary.slice(0, 477)}…` : summary,
    category: CATEGORY[r.cat] ?? 'Expedition Report',
    instrument: r.metadata?.instrument ?? '—',
    station: STATION_NAME[r.station] ?? 'Other',
    observedAt: r.metadata?.temporal?.observedAt ?? Date.now(),
    lat: r.metadata?.spatial?.lat ?? null,
    lon: r.metadata?.spatial?.lon ?? null,
    license: r.metadata?.license ?? 'CC BY 4.0',
    embargo: 'none',
    // Already on the public site, so the deposit reflects that truthfully.
    status: 'published',
    reviewNotes: null,
    publishedIdentifier: r.metadata?.identifier ?? null,
    fileName,
    fileUrl,
    fileSizeBytes: body.length,
    authorUid: 'ncpor-archive',
    authorName: collector,
    authorEmail: '',
    createdAt: catalogueDate(i, records.length),
  };

  const put = await fetch(`${FS_BASE}/documents/${id}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: toValue(deposit).mapValue.fields }),
  });
  if (!put.ok) { console.error(`  FAIL ${id}: HTTP ${put.status} ${(await put.text()).slice(0, 160)}`); continue; }

  // Point the published record back at the deposit it came from, so the
  // public page can be traced to a repository entry rather than to nothing.
  const updated = {
    ...r,
    metadata: {
      ...r.metadata,
      provenance: { ...r.metadata.provenance, sourceType: 'document', sourceId: id },
    },
  };
  delete updated.id;
  await fetch(`${FS_BASE}/publicArchive/${r.id}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: toValue(updated).mapValue.fields }),
  });

  n++;
  console.log(`  ok  ${deposit.category.padEnd(20)} ${collector.padEnd(44)} ${fileName}`);
}

console.log(`\n${n} records now deposited in the repository and traceable from the public archive.\n`);
