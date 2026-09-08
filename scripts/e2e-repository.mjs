/**
 * Browser end-to-end check of the public Knowledge Repository.
 *
 * Drives the deployed site with a real browser and asserts the things a
 * screenshot can't: that the records on the page genuinely came from
 * Firestore rather than a hardcoded array, that a chart is actually drawn
 * with the right number of marks, that the accessible table matches it, and
 * that the console is clean.
 *
 *   node scripts/e2e-repository.mjs
 *   node scripts/e2e-repository.mjs http://localhost:5174   # against a dev server
 *
 * Uses the `playwright` package already present at the repo root.
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'https://iia-public.web.app';
const API = 'https://asia-south1-indiainantartica.cloudfunctions.net/api/records';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
};

console.log(`\nBrowser E2E against ${BASE}\n`);

// What the API says is published — the page must agree with it.
const apiRecords = (await (await fetch(API)).json()).records ?? [];
console.log(`API reports ${apiRecords.length} published records\n`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

try {
  // Not 'networkidle': the page holds an open Firestore listener for live
  // updates, so the network never actually goes idle. Waiting for the rows
  // themselves is both faster and the thing we actually care about.
  await page.goto(`${BASE}/archive`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // The archive is a two-screen PS5-style flow: a carousel that SELECTS a
  // record, then a detail screen for the one chosen. There is no list, so the
  // page is driven through the same affordances a player uses.
  // Wait for the count to SETTLE, not merely to become non-zero. The page
  // renders a static fallback catalogue first and replaces it wholesale when
  // the Firestore snapshot lands, so the first non-zero value it shows is a
  // number the repository never claimed. Waiting for the live total is what
  // the assertion below is actually about; if it never arrives, the check
  // fails on the real value rather than on a transient one.
  await page
    .waitForFunction(
      (expected) => document.querySelector('.arch2-page')?.dataset.recordCount === String(expected),
      apiRecords.length,
      { timeout: 45000 },
    )
    .catch(() => {});

  const apiTitles = apiRecords.map((r) => r.title.replace(/\n/g, ' '));

  /** Open a record by its own address. The shelf is a 3D scene whose books
   *  are picked by clicking the model, which is not something a test should
   *  be aiming a cursor at; every record is addressable at /archive/<id>,
   *  so the test opens them the way a shared link does. */
  const openRecord = async (record) => {
    await page.goto(`${BASE}/archive/${record.metadata?.identifier ?? record.id}`,
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.arch2-page[data-view="detail"]', { timeout: 20000 });
  };

  /* ── 1. The page is driven by live data ─────────────────────────────── */
  console.log('Live data');
  const pageCount = Number(await page.getAttribute('.arch2-page', 'data-record-count'));
  check('the page holds one record per published record',
    pageCount === apiRecords.length, `page ${pageCount}, API ${apiRecords.length}`);

  // (The archive used to print a record counter in its header. The PS5
  //  two-screen redesign removed it, and data-record-count above already
  //  asserts the same thing against live data.)

  const activeId = await page.getAttribute('.arch2-page', 'data-active-record');
  check('the selected record is one the repository actually lists',
    apiRecords.some((r) => r.id === activeId), `active "${activeId}"`);

  /* ── 2. Every record has an address of its own ──────────────────────── */
  const sample = apiRecords[0];
  await openRecord(sample);
  const openedTitle = await page.$eval('.arch2-detail-title', (e) => e.textContent.trim());
  check('a record opens straight from its own URL',
    openedTitle === sample.title.replace(/\n/g, ' '), `got "${openedTitle}"`);
  check('the opened record’s title came from the repository',
    apiTitles.includes(openedTitle), `got "${openedTitle}"`);

  // The citable identifier is the address, and case is not part of it.
  if (sample.metadata?.identifier) {
    await page.goto(`${BASE}/archive/${sample.metadata.identifier.toLowerCase()}`,
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.arch2-page[data-view="detail"]', { timeout: 20000 });
    const lower = await page.$eval('.arch2-detail-title', (e) => e.textContent.trim());
    check('the identifier works as a link however it is cased', lower === openedTitle, `got "${lower}"`);
  }

  // An address that names nothing must not fall through to whatever record
  // happens to sit at that position.
  await page.goto(`${BASE}/archive/not-a-real-record`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.arch2-page[data-view="selector"]', { timeout: 20000 });
  check('an unknown record id falls back to the shelf', true);

  await openRecord(sample);
  await page.click('.arch2-back-btn');
  await page.waitForSelector('.arch2-page[data-view="selector"]', { timeout: 10000 });
  check('the back control returns to the selector', true);
  check('going back drops the record from the URL',
    new URL(page.url()).pathname.replace(/\/$/, '') === '/archive', page.url());

  /* ── 3. Charts ──────────────────────────────────────────────────────── */
  console.log('\nCharts');
  const charted = apiRecords.find((r) => r.chart);
  if (!charted) {
    console.log('  SKIP  no published record currently carries a chart');
  } else {
    await openRecord(charted);
    await page.waitForSelector('.rc-figure .recharts-surface', { timeout: 15000 });

    const bars = await page.$$eval('.recharts-rectangle', (els) => els.length);
    check('the chart draws one mark per reading',
      bars === charted.chart.data.length, `${bars} marks, ${charted.chart.data.length} readings`);

    const barFills = await page.$$eval('.recharts-rectangle', (els) => [...new Set(els.map((e) => e.getAttribute('fill')))]);
    check('all marks share one validated series colour',
      barFills.length === 1 && barFills[0] === '#2f9fc9', barFills.join(', '));

    const tableRows = await page.$$eval('.rc-table tr', (els) => els.map((e) => e.textContent));
    check('an accessible table carries the same values',
      charted.chart.data.every((d) => tableRows.some((r) => r.includes(d.label) && r.includes(String(d.value)))),
      tableRows.join(' | '));

    const axisText = await page.$$eval('.recharts-surface text', (els) => els.map((e) => e.textContent));
    check('axis ticks carry the unit',
      axisText.some((t) => t.includes(charted.chart.unit)), axisText.join(', '));
    check('axis labels are not truncated or run together',
      charted.chart.data.every((d) => axisText.some((t) => t.replace(/\s+/g, '') === d.label.replace(/\s+/g, ''))),
      axisText.join(', '));
  }

  /* ── 4. Metadata is present and citable ─────────────────────────────── */
  console.log('\nMetadata');
  // The citation block lives on the detail screen; make sure we are on one
  // whichever branch the chart section above took.
  if (await page.getAttribute('.arch2-page', 'data-view') !== 'detail') {
    await openRecord(sample);
  }
  const metaText = await page.$eval('.arch2-meta', (e) => e.textContent).catch(() => '');
  check('the citation block is on the page', metaText.length > 0);
  check('it shows a repository identifier', /IIA-\d{4}-\d{4}/.test(metaText), metaText.slice(0, 120));
  check('it states the coordinate datum or the publisher', /WGS84|NCPOR/.test(metaText));

  /* ── 5. Category filters ────────────────────────────────────────────── */
  console.log('\nInteraction');
  // Category filters used to be chips on the selector screen; the two-screen
  // redesign moved them into the shelf's Menu.
  if (await page.getAttribute('.arch2-page', 'data-view') === 'detail') {
    await page.click('.arch2-back-btn');
    await page.waitForSelector('.arch2-page[data-view="selector"]', { timeout: 10000 });
  }
  await page.click('.arch2-topbar-btn:has-text("Menu")');
  await page.waitForSelector('.arch2-menu', { timeout: 10000 });
  const filterCount = await page.$$eval('.arch2-menu-item', (els) => els.length);
  check('category filters are rendered', filterCount >= 5, `${filterCount} filters`);

  // Pick a category the repository actually holds records in, so a failure
  // means a broken jump rather than an empty category.
  const CATEGORY_LABEL = {
    expedition: 'Expedition Reports', dataset: 'Datasets', publication: 'Publications',
    media: 'Photographs & Video', institution: 'Institutional',
  };
  const cat = Object.keys(CATEGORY_LABEL).find((c) => apiRecords.some((r) => r.cat === c));
  await page.click(`.arch2-menu-item:has-text("${CATEGORY_LABEL[cat]}")`);
  await page.waitForTimeout(600);
  const afterFilter = await page.getAttribute('.arch2-page', 'data-active-record');
  const landedOn = apiRecords.find((r) => r.id === afterFilter);
  check('choosing a category moves the selection to a record of that type',
    !!landedOn && landedOn.cat === cat, `active "${afterFilter}" (${landedOn?.cat}), wanted ${cat}`);

  /* ── 6. Console hygiene ─────────────────────────────────────────────── */
  console.log('\nConsole');
  const realErrors = consoleErrors.filter((e) => !/favicon|net::ERR_|third-party cookie/i.test(e));
  check('no console errors', realErrors.length === 0, realErrors.slice(0, 3).join('\n        '));

  /* ── 7. Mobile ──────────────────────────────────────────────────────── */
  console.log('\nResponsive');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow on a phone viewport', overflow <= 2, `${overflow}px`);
} catch (err) {
  failures++;
  console.log(`  FAIL  the run threw: ${err.message}`);
} finally {
  await browser.close();
}

console.log(`\n${failures === 0 ? 'E2E OK' : `${failures} FAILURE(S)`}\n`);
process.exit(failures > 0 ? 1 : 0);
