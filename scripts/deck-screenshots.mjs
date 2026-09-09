/**
 * Captures the prototype screenshots the SIH deck needs.
 *
 *   node scripts/deck-screenshots.mjs           # everything
 *   node scripts/deck-screenshots.mjs public    # only the live public site
 *   node scripts/deck-screenshots.mjs portal    # only the studio (needs the dev server)
 *
 * Writes PNGs to Desktop/Sih_Slides/screenshots/, which is where the deck kit
 * expects them.
 *
 * THE ONE THING THAT MATTERS HERE: fonts are blocked.
 *
 * Playwright's `page.screenshot()` waits on `document.fonts`, and the public
 * site pulls its display faces from Google Fonts. When those responses are
 * slow the screenshot never returns — the whole capture times out while the
 * page itself is sitting there perfectly rendered. Four of seven shots failed
 * this way before the cause was found, and it looked like the WebGL archive
 * being heavy, which it was not. Aborting font requests removes the
 * dependency: the fallback stack renders instantly and a slide screenshot
 * cares about layout, not the exact typeface.
 *
 * The portal shots need the dev server first:  npm run dev:portal
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'C:/Users/royal/Desktop/Sih_Slides/screenshots';
const PORTAL = 'http://localhost:5173';
const PUBLIC = 'https://iia-public.web.app';
const RECORD = `${PUBLIC}/archive/IIA-1999-9004`;

const only = (process.argv[2] || 'all').toLowerCase();
const wants = (group) => only === 'all' || only === group;

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  // The archive shelf is a WebGL scene; without a software renderer the
  // canvas comes back blank in headless.
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Freezes CSS animation so nothing is caught mid-transition. */
const FREEZE = '*,*::before,*::after{animation:none!important;transition:none!important}';

async function page(viewport = { width: 1500, height: 1000 }) {
  const p = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await p.route('**/*', (route) => {
    const url = route.request().url();
    return route.request().resourceType() === 'font' || url.includes('fonts.g')
      ? route.abort()
      : route.continue();
  });
  return p;
}

async function shot(p, name) {
  await p.addStyleTag({ content: FREEZE }).catch(() => {});
  await p.screenshot({ path: `${OUT}/${name}.png`, timeout: 60000 });
  console.log(`  wrote ${name}.png`);
}

/* ────────────────────────────────────────────── the agentic studio ───── */

if (wants('portal')) {
  console.log('\nPortal — the agentic studio (needs `npm run dev:portal`)\n');

  // Two shots from one run: the agent mid-reasoning with the live web-search
  // panel open, then the three finished options. Running the pipeline twice
  // would cost two generator calls for no gain.
  const p = await page({ width: 1600, height: 1000 });
  try {
    await p.goto(`${PORTAL}/__studio`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.waitForSelector('.stu-rail-start .stu-primary', { timeout: 30000 });
    await p.click('.stu-rail-start .stu-primary');

    await p.waitForSelector('.agent-vision', { timeout: 90000 });
    await sleep(2500);
    await shot(p, '01-agent-thinking');

    await p.waitForSelector('.stu-variants', { timeout: 180000 });
    await sleep(1500);
    await shot(p, '02-three-options');
  } catch (err) {
    console.log(`  SKIPPED portal shots: ${err.message.split('\n')[0]}`);
    console.log('  (is the dev server running on :5173?)');
  } finally {
    await p.close();
  }
}

/* ──────────────────────────────────────────────── the public archive ─── */

if (wants('public')) {
  console.log('\nPublic site — the archive\n');

  // Three shots off one record page: the dataset block, the chart, and a
  // citation card. Same page, three scroll positions.
  const rec = await page({ width: 1500, height: 1080 });
  try {
    await rec.goto(RECORD, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await rec.waitForSelector('.rep-dataset', { timeout: 90000 });

    await rec.evaluate(() => {
      const el = document.querySelector('.rep-dataset');
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 30);
    });
    await sleep(1500);
    await shot(rec, '04-dataset-record');

    await rec.evaluate(() => {
      const el = document.querySelector('.rep-figure');
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 40);
    });
    await sleep(1500);
    await shot(rec, '06-ozone-chart');

    await rec.evaluate(() => window.scrollTo(0, 0));
    await sleep(800);
    const marker = await rec.$('.arch2-detail-body button[aria-label^="Source"]');
    if (marker) {
      await marker.hover();
      await sleep(1500);
      await shot(rec, '05-citations');
    }
  } catch (err) {
    console.log(`  FAILED record shots: ${err.message.split('\n')[0]}`);
  } finally {
    await rec.close();
  }

  // The 3D shelf, which needs the longest settle — the scene builds on scroll
  // and the spines are textured from live archive records.
  const shelf = await page({ width: 1600, height: 950 });
  try {
    await shelf.goto(`${PUBLIC}/archive`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await shelf.waitForSelector('canvas', { timeout: 90000 });
    await sleep(12000);
    await shot(shelf, '03-archive-shelf');
  } catch (err) {
    console.log(`  FAILED shelf shot: ${err.message.split('\n')[0]}`);
  } finally {
    await shelf.close();
  }

  const home = await page({ width: 1600, height: 1000 });
  try {
    await home.goto(`${PUBLIC}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await sleep(9000);
    await shot(home, '07-public-home');
  } catch (err) {
    console.log(`  FAILED home shot: ${err.message.split('\n')[0]}`);
  } finally {
    await home.close();
  }
}

await browser.close();
console.log(`\nDone -> ${OUT}\n`);
