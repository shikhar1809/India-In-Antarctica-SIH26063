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
  await page.waitForSelector('.arch2-row', { timeout: 45000 });

  /* ── 1. The page is driven by live data ─────────────────────────────── */
  console.log('Live data');
  const rowTitles = await page.$$eval('.arch2-row-title', (els) => els.map((e) => e.textContent.trim()));
  check('the page renders one row per published record',
    rowTitles.length === apiRecords.length,
    `page ${rowTitles.length}, API ${apiRecords.length}`);

  const apiTitles = apiRecords.map((r) => r.title.replace(/\n/g, ' '));
  check('every row title matches a record from the API',
    rowTitles.every((t) => apiTitles.includes(t)),
    `unmatched: ${rowTitles.filter((t) => !apiTitles.includes(t)).join(' | ')}`);

  const countLabel = await page.$eval('.arch2-count', (e) => e.textContent.trim());
  check('the record counter reflects the live total',
    countLabel.startsWith(String(apiRecords.length)), `got "${countLabel}"`);

  /* ── 2. The old hardcoded content is genuinely gone ─────────────────── */
  // These 11 came from archiveData.ts and are now Firestore documents; the
  // ones that would prove a regression are records the API does NOT list.
  const staleOnPage = rowTitles.filter((t) => !apiTitles.includes(t));
  check('no record on the page is absent from the repository', staleOnPage.length === 0,
    staleOnPage.join(' | '));

  /* ── 3. Charts ──────────────────────────────────────────────────────── */
  console.log('\nCharts');
  const charted = apiRecords.find((r) => r.chart);
  if (!charted) {
    console.log('  SKIP  no published record currently carries a chart');
  } else {
    await page.evaluate((title) => {
      const btn = [...document.querySelectorAll('.arch2-row')]
        .find((b) => b.textContent.includes(title));
      btn?.click();
    }, charted.title);
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
  const metaText = await page.$eval('.arch2-meta', (e) => e.textContent).catch(() => '');
  check('the citation block is on the page', metaText.length > 0);
  check('it shows a repository identifier', /IIA-\d{4}-\d{4}/.test(metaText), metaText.slice(0, 120));
  check('it states the coordinate datum or the publisher', /WGS84|NCPOR/.test(metaText));

  /* ── 5. Category filters ────────────────────────────────────────────── */
  console.log('\nInteraction');
  const chipCount = await page.$$eval('.arch2-chip', (els) => els.length);
  check('category filters are rendered', chipCount >= 5, `${chipCount} chips`);

  await page.click('.arch2-chip:nth-child(3)');
  await page.waitForTimeout(400);
  const afterFilter = await page.$eval('.arch2-detail-title', (e) => e.textContent.trim());
  check('choosing a category moves focus to a record', afterFilter.length > 0);

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
