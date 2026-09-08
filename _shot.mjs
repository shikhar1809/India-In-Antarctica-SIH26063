import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5176/';
const OUT = process.argv[3] ?? 'shelf.png';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({
  viewport: {
    width: Number(process.env.SHOT_W || 1440),
    height: Number(process.env.SHOT_H || 900),
  },
});
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
// The section's markup exists from the start; the WebGL scene does not — it
// is only built once the shelf nears the viewport, so scroll first and wait
// for the canvas after.
await page.waitForSelector('.shelf-stage', { timeout: 60000 });
// Wait for the live archive records to land, so spines carry real titles.
await page.waitForFunction(
  () => document.querySelectorAll('.shelf-marker').length === 19 &&
        !document.querySelector('.shelf-marker')?.getAttribute('aria-label')?.startsWith('Expedition Reports'),
  null, { timeout: 30000 },
).catch(() => console.log('(records did not load; showing padding volumes)'));

const target = await page.$(process.env.SHOT_SEL || '.shelf-section');
await target.scrollIntoViewIfNeeded();
await page.waitForSelector('.shelf-canvas canvas', { timeout: 45000 });
await page.waitForTimeout(3500);
if (process.env.SHOT_CLICK) {
  await page.click(process.env.SHOT_CLICK);
  await page.waitForTimeout(2000);
}
// Clip a viewport shot rather than an element shot: the element shot waits
// for the node to be "stable", and a canvas rendering every frame never is.
const box = await target.boundingBox();
// Generous: this harness runs on SwiftShader, so a frame that is instant on
// a GPU can take seconds here.
await page.screenshot({ path: OUT, clip: box, timeout: 180000 });

const info = await page.evaluate(() => {
  const cv = document.querySelector('.shelf-canvas canvas');
  return {
    canvas: [cv.width, cv.height],
    caption: document.querySelector('.shelf-caption strong')?.textContent,
    markers: document.querySelectorAll('.shelf-marker').length,
  };
});
console.log(JSON.stringify(info));
console.log(errors.length ? `ERRORS:\n${errors.slice(0, 5).join('\n')}` : 'console clean');

await browser.close();
