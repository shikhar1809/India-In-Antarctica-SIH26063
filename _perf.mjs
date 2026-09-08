import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5176/';
const W = Number(process.env.PERF_W || 1440);
const H = Number(process.env.PERF_H || 900);

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

/* Count WebGL work directly. A rAF counter is useless on this page because
 * Lenis runs its own permanent rAF loop; draw calls are unambiguously ours.
 * three.js clears once per render, so clears == frames actually produced. */
await page.addInitScript(() => {
  window.__gl = { draws: 0, frames: 0 };
  // Attribute work to the shelf's own context. The page has another WebGL
  // canvas that ticks along at one draw per frame, and counting globally
  // makes a parked shelf look busy.
  const mine = (ctx) => {
    const c = ctx.canvas;
    return !!(c && c.closest && c.closest('.shelf-canvas'));
  };
  for (const P of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!P) continue;
    for (const fn of ['drawElements', 'drawArrays']) {
      const orig = P.prototype[fn];
      if (!orig) continue;
      P.prototype[fn] = function (...a) {
        if (mine(this)) window.__gl.draws++;
        return orig.apply(this, a);
      };
    }
    const clear = P.prototype.clear;
    P.prototype.clear = function (...a) {
      if (mine(this)) window.__gl.frames++;
      return clear.apply(this, a);
    };
  }
});

const gl = () => page.evaluate(() => ({ ...window.__gl }));
const delta = (a, b) => ({ draws: b.draws - a.draws, frames: b.frames - a.frames });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.shelf-stage', { timeout: 60000 });
await page.waitForTimeout(2500);

const deferred = !(await page.evaluate(() => !!document.querySelector('.shelf-canvas canvas')));

await (await page.$('.shelf-stage')).scrollIntoViewIfNeeded();
await page.waitForTimeout(5000);

const built = await page.evaluate(() => {
  const cv = document.querySelector('.shelf-canvas canvas');
  return cv ? [cv.width, cv.height] : null;
});

// Idle: the loop should have parked entirely.
const i0 = await gl();
await page.waitForTimeout(2500);
const i1 = await gl();
const idle = delta(i0, i1);

// Poke it: it must wake, animate, then park again.
await page.evaluate(() => {
  const c = document.querySelector('.shelf-canvas canvas');
  const r = c.getBoundingClientRect();
  const at = (t, x) => c.dispatchEvent(new PointerEvent(t, {
    clientX: r.left + x, clientY: r.top + r.height / 2, bubbles: true, pointerId: 1, isPrimary: true,
  }));
  at('pointerdown', r.width / 2);
  at('pointermove', r.width / 2 - 150);
  at('pointerup', r.width / 2 - 150);
});
await page.waitForTimeout(2000);
const p1 = await gl();
const poke = delta(i1, p1);

// And parked again after the motion settles — sampled over several windows
// so a slow convergence is distinguishable from a loop that never stops.
const settleWindows = [];
let prev = p1;
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(2000);
  const now = await gl();
  settleWindows.push(delta(prev, now));
  prev = now;
}
const settled = settleWindows[settleWindows.length - 1];

// Off-screen: scroll away, nothing should render at all.
await page.mouse.wheel(0, -14000);
await page.waitForTimeout(2500);
const o0 = await gl();
await page.waitForTimeout(2500);
const o1 = await gl();
const offscreen = delta(o0, o1);

console.log(JSON.stringify({
  sceneDeferredUntilNearViewport: deferred,
  canvas: built,
  idle_2_5s: idle,
  afterOneDrag: poke,
  drawCallsPerFrame: poke.frames ? +(poke.draws / poke.frames).toFixed(1) : null,
  settleWindows_2s_each: settleWindows,
  settledAgain: settled,
  offscreen_2_5s: offscreen,
  consoleErrors: errors.slice(0, 5),
}, null, 2));

await browser.close();
