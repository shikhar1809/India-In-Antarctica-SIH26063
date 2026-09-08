/**
 * Pulls the real Maitri ozone measurements out of the WOUDC archive and
 * writes them as downloadable files for the public site.
 *
 * Why this exists: the archive's dataset records used to describe data that
 * did not exist. A repository record that lists a schema and a row count and
 * offers no file is a mock-up. These are real measurements — made at India's
 * Maitri station by the India Meteorological Department, archived by the WMO
 * Global Atmosphere Watch through the World Ozone and UV Radiation Data
 * Centre — and this script is what puts them behind the download button.
 *
 *   node scripts/ingest-woudc-maitri.mjs
 *
 * Writes:
 *   apps/public-site/public/data/maitri-total-column-ozone-1999-2006.csv
 *   apps/public-site/public/data/maitri-ozone-profiles-1994-2011.csv
 *   scripts/.woudc-summary.json   (the figures the record prose quotes)
 *
 * Attribution is a condition of use, not a courtesy: WOUDC data is free and
 * unrestricted for scientific, educational and policy use provided the
 * contributing agency and the WOUDC are credited. Every file this writes
 * carries that credit in its header, and the published records carry it in
 * their citation block.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT_DIR = join(ROOT, 'apps', 'public-site', 'public', 'data');
const API = 'https://api.woudc.org/collections';
const STATION = '400'; // Maitri, GAW ID MTR

const CREDIT = [
  '# Total column ozone and ozone profiles measured at Maitri, Antarctica.',
  '# Station: Maitri (WOUDC station 400, GAW ID MTR), 70.45 S, 11.45 E, 330 m.',
  '# Measured by: India Meteorological Department (IMD).',
  '# Station operated by: National Centre for Polar and Ocean Research (NCPOR).',
  '# Archived by: WMO Global Atmosphere Watch / World Ozone and Ultraviolet',
  '#   Radiation Data Centre (WOUDC), https://woudc.org',
  '# Retrieved from the WOUDC data registry API, https://api.woudc.org',
  '# Free and unrestricted for scientific, educational and policy use, on the',
  '# condition that the contributing agency (IMD) and the WOUDC are credited.',
  '# Republished unmodified by NCPOR as part of the Indian Antarctic archive.',
];

async function fetchAll(collection, limit = 1000) {
  const rows = [];
  // Advance by what the server actually returned, not by what was asked for:
  // WOUDC caps some collections below the requested limit, and stepping by
  // the request size then skips whole pages. This cost 43 of 143 flights
  // before it was caught.
  for (let offset = 0; ; ) {
    const url = `${API}/${collection}/items?station_id=${STATION}&limit=${limit}&offset=${offset}&f=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${collection}: HTTP ${res.status}`);
    const body = await res.json();
    const page = (body.features ?? []).map((f) => f.properties);
    if (page.length === 0) break;
    rows.push(...page);
    offset += page.length;
    if (rows.length >= (body.numberMatched ?? rows.length)) break;
  }
  return rows;
}

const csvCell = (v) => (v === null || v === undefined ? '' : String(v));

/* ─────────────────────────────────────────── total column ozone ─────── */

const totals = await fetchAll('totalozone');
const daily = totals
  .filter((r) => r.daily_date && r.daily_columno3 !== null)
  .map((r) => ({
    date: r.daily_date.slice(0, 10),
    columnO3: r.daily_columno3,
    columnSO2: r.daily_columnso2,
    nObs: r.daily_nobs,
    wlCode: r.daily_wlcode,
    obsCode: r.daily_obscode,
    instrument: `${r.instrument_name} ${r.instrument_model} #${r.instrument_serial}`,
  }))
  .sort((a, b) => a.date.localeCompare(b.date));

const totalHeader = 'date_utc,column_o3_du,column_so2_du,n_observations,wavelength_code,observation_code,instrument';
const totalCsv = [
  ...CREDIT,
  '# Column ozone and column sulphur dioxide in Dobson Units (DU).',
  '# One row per observation day.',
  totalHeader,
  ...daily.map((d) => [
    d.date, csvCell(d.columnO3), csvCell(d.columnSO2), csvCell(d.nObs),
    csvCell(d.wlCode), csvCell(d.obsCode), d.instrument,
  ].join(',')),
].join('\n');

/* ───────────────────────────────────────────── ozone profiles ───────── */

const sondes = await fetchAll('ozonesonde', 200);
const flights = sondes
  .filter((r) => r.timestamp_date && Array.isArray(r.pressure))
  .map((r) => ({
    date: r.timestamp_date.slice(0, 10),
    levels: r.pressure.length,
    totalO3: r.flight_totalo3,
    correction: r.flight_correctionfactor,
    obsType: r.flight_obstype,
    pressure: r.pressure,
    temperature: r.temperature ?? [],
    o3pp: r.o3partialpressure ?? [],
  }))
  .sort((a, b) => a.date.localeCompare(b.date));

// One row per measured level, which is what the data actually is — a flight
// is 26 to 88 of these, and flattening them is what makes the file usable.
const profileHeader = 'flight_date_utc,level_index,pressure_hpa,temperature_c,o3_partial_pressure_mpa,flight_total_o3_du,correction_factor';
const profileRows = [];
for (const f of flights) {
  for (let i = 0; i < f.levels; i++) {
    profileRows.push([
      f.date, i + 1, csvCell(f.pressure[i]), csvCell(f.temperature[i]), csvCell(f.o3pp[i]),
      csvCell(f.totalO3), csvCell(f.correction),
    ].join(','));
  }
}
const profileCsv = [
  ...CREDIT,
  '# Balloon-borne ozonesonde profiles. One row per measured level.',
  '# Ozone partial pressure in millipascals; pressure in hectopascals.',
  profileHeader,
  ...profileRows,
].join('\n');

/* ───────────────────────────────────────────────── the figures ──────── */

const byMonth = {};
for (const d of daily) {
  const m = d.date.slice(5, 7);
  (byMonth[m] ??= []).push(d.columnO3);
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const climatology = Object.entries(byMonth)
  .map(([m, vs]) => ({
    month: MONTHS[Number(m) - 1],
    mean: Math.round(vs.reduce((a, b) => a + b, 0) / vs.length),
    days: vs.length,
  }))
  .sort((a, b) => MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month));

const sorted = [...daily].sort((a, b) => a.columnO3 - b.columnO3);
const yearsCovered = [...new Set(daily.map((d) => d.date.slice(0, 4)))].sort();

const summary = {
  retrievedAt: new Date().toISOString().slice(0, 10),
  totalOzone: {
    rows: daily.length,
    from: daily[0].date,
    to: daily.at(-1).date,
    years: yearsCovered,
    minimum: sorted[0],
    maximum: sorted.at(-1),
    climatology,
    sampleRows: daily.slice(0, 6),
    csvBytes: Buffer.byteLength(totalCsv),
  },
  profiles: {
    flights: flights.length,
    from: flights[0].date,
    to: flights.at(-1).date,
    levels: profileRows.length,
    dataPoints: profileRows.length * 3,
    minLevels: Math.min(...flights.map((f) => f.levels)),
    maxLevels: Math.max(...flights.map((f) => f.levels)),
    withIntegratedTotal: flights.filter((f) => f.totalO3).length,
    sampleRows: profileRows.slice(0, 6).map((r) => r.split(',')),
    csvBytes: Buffer.byteLength(profileCsv),
  },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'maitri-total-column-ozone-1999-2006.csv'), totalCsv);
writeFileSync(join(OUT_DIR, 'maitri-ozone-profiles-1994-2011.csv'), profileCsv);
writeFileSync(join(ROOT, 'scripts', '.woudc-summary.json'), JSON.stringify(summary, null, 2));

const kb = (n) => `${Math.max(1, Math.round(n / 1024))} KB`;
console.log(`\nTotal column ozone : ${daily.length} days, ${summary.totalOzone.from} to ${summary.totalOzone.to}, ${kb(summary.totalOzone.csvBytes)}`);
console.log(`Ozone profiles     : ${flights.length} flights, ${profileRows.length} levels, ${kb(summary.profiles.csvBytes)}`);
console.log(`Lowest column      : ${summary.totalOzone.minimum.columnO3} DU on ${summary.totalOzone.minimum.date}`);
console.log(`Highest column     : ${summary.totalOzone.maximum.columnO3} DU on ${summary.totalOzone.maximum.date}`);
console.log(`\nWrote both CSVs to apps/public-site/public/data/\n`);
