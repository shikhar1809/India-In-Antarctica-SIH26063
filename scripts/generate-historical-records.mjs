/**
 * Converts the 11 hand-authored archive records that used to be hardcoded in
 * apps/public-site/src/data/archiveData.ts into RepositoryRecord documents, and
 * writes them as a TypeScript module the portal can import and seed into the
 * `publicArchive` Firestore collection.
 *
 * Why generate rather than hand-copy: the prose is long, and a copy would
 * silently drift from the original. Re-run this if archiveData.ts changes.
 *
 *   node scripts/generate-historical-records.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SOURCE = join(ROOT, 'apps', 'public-site', 'src', 'data', 'archiveData.ts');
const OUT = join(ROOT, 'apps', 'portal', 'src', 'repository', 'historicalRecords.ts');

// archiveData.ts imports from sibling modules, so it has to be bundled before
// Node can evaluate it.
const tmp = mkdtempSync(join(tmpdir(), 'iia-records-'));
const bundle = join(tmp, 'archiveData.mjs');
execFileSync('npx', ['esbuild', SOURCE, '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=error'], {
  cwd: join(ROOT, 'apps', 'public-site'),
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

const { RECORDS } = await import(pathToFileURL(bundle).href);

/** "1983–84" → 1983, "Ongoing" → null. */
function parseYear(year) {
  const m = String(year).match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

const STATION_NAME = {
  maitri: 'Maitri',
  bharati: 'Bharati',
  dakshin: 'Dakshin Gangotri',
  ship: 'Other',
  ncpor: 'Other',
};

const RESOURCE_TYPE = {
  expedition: 'Report',
  dataset: 'Dataset',
  publication: 'Publication',
  media: 'Image',
  institution: 'Institutional',
};

/** Real coordinates for each station, so a historical record is placed on the
 *  map rather than carrying an empty spatial block. Maitri 70°45'57"S
 *  11°43'56"E; Bharati 69°24'24"S 76°11'33"E; Dakshin Gangotri 70°05'S 12°E;
 *  NCPOR's own headquarters are at Vasco da Gama, Goa. A record made aboard a
 *  resupply vessel genuinely has no fixed position. */
const STATION_POSITION = {
  maitri:  { lat: -70.7659, lon: 11.7314, elevationM: 117 },
  bharati: { lat: -69.4067, lon: 76.1913, elevationM: 25 },
  dakshin: { lat: -70.0833, lon: 12.0, elevationM: 40 },
  ncpor:   { lat: 15.3500, lon: 73.8300, elevationM: 5 },
  ship:    { lat: null, lon: null, elevationM: null },
};

/** The credit line means different things depending on the record. On a
 *  paper it is the journal it appeared in; on an expedition report or a
 *  dataset it is the body that produced it. Treating both as "creator" would
 *  claim Polar Science wrote the paper. */
const JOURNAL_CREDITS = ['POLAR SCIENCE', 'JOURNAL OF EARTH SYSTEM SCIENCE'];

/** The source credits are shouted ("EIGHTH INDIAN ANTARCTIC EXPEDITION").
 *  A citation reads better in title case. Split on spaces rather than using a
 *  word-boundary regex, so hyphenated and accented names survive intact. */
const LOWER_WORDS = new Set(['of', 'and', 'the', 'for', 'in', 'to']);

function titleCase(s) {
  return s
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (word === '') return word;
      if (i > 0 && LOWER_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/** Instrument / method, read out of the record's own facts table rather than
 *  left null. "Proxy = δ18O, δD" is the method; "Variables = Temp, pressure"
 *  describes what the instrument recorded. */
function deriveMethod(table) {
  if (!table) return { instrument: null, method: null };
  const get = (label) => table.find(([k]) => k.toLowerCase() === label)?.[1] ?? null;
  return {
    instrument: get('variables') ?? get('proxy') ?? null,
    method: get('interval') ?? get('foundation') ?? get('survey method') ?? null,
  };
}

const records = RECORDS.map((r, i) => {
  // India's first Antarctic expedition sailed in 1981; anything undated
  // belongs to the programme as a whole rather than to a single season.
  const year = parseYear(r.year) ?? 1981;
  const observedAt = Date.UTC(year, 0, 1);

  const resourceType = RESOURCE_TYPE[r.cat] ?? 'Report';
  const credit = (r.credit ?? '').trim();
  const isJournal = JOURNAL_CREDITS.includes(credit.toUpperCase());
  const { instrument, method } = deriveMethod(r.table);
  const pos = STATION_POSITION[r.station] ?? STATION_POSITION.ship;

  // A named expedition or department is the actual creator of the record;
  // NCPOR is only the fallback when the source credits nobody.
  const creators = credit && !isJournal
    ? [{ name: titleCase(credit), affiliation: 'NCPOR, Ministry of Earth Sciences' }]
    : [{ name: 'National Centre for Polar and Ocean Research', affiliation: 'Ministry of Earth Sciences' }];

  return {
    id: `historical-${r.id}`,
    cat: r.cat,
    kind: r.kind,
    title: r.title.replace(/\n/g, ' '),
    station: r.station,
    year: String(r.year),
    pills: r.pills ?? [],
    body: r.body ?? [],
    // Firestore rejects nested arrays, so [label, value] tuples become maps.
    ...(r.table ? { table: r.table.map(([label, value]) => ({ label, value })) } : {}),
    ...(r.credit ? { credit: r.credit } : {}),
    photoUrls: [],
    videoUrl: null,
    measurements: [],
    metadata: {
      identifier: `IIA-${year}-${String(9000 + i).padStart(4, '0')}`,
      creators,
      ...(isJournal ? { publishedIn: titleCase(credit) } : {}),
      publisher: 'NCPOR',
      publicationYear: year,
      resourceType,
      station: STATION_NAME[r.station] ?? 'Other',
      spatial: { ...pos, datum: 'WGS84', accuracyM: null },
      temporal: { observedAt },
      license: 'CC BY 4.0',
      rights: 'Creative Commons Attribution 4.0 International',
      instrument,
      method,
      provenance: {
        sourceType: 'historical',
        sourceId: r.id,
        approvedBy: 'NCPOR',
        approvedAt: observedAt,
      },
    },
    // Sorted into the timeline by when it happened, so newly published field
    // reports naturally sit above the historical record rather than below it.
    publishedAt: observedAt,
  };
});

const banner = `/* GENERATED FILE — do not edit by hand.
 *
 * The historical records that make up India's Antarctic programme before this
 * system existed: the first expedition, the building of each station, the
 * datasets and publications that came out of them. They used to be hardcoded
 * in apps/public-site/src/data/archiveData.ts, which meant the public archive was a
 * fixed list rather than a repository.
 *
 * Seeded into the publicArchive collection by the admin "Import historical
 * records" action, so every record the public site shows — historical and
 * newly published alike — comes from the same live collection.
 *
 * Regenerate with: node scripts/generate-historical-records.mjs
 */

import type { RepositoryRecord } from './contract';

export const HISTORICAL_RECORDS: RepositoryRecord[] = ${JSON.stringify(records, null, 2)};
`;

writeFileSync(OUT, banner);
console.log(`wrote ${records.length} historical records → ${OUT}`);
