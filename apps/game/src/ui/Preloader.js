import { shuffleText } from './Shuffle.js';

/**
 * Preloader.js — the loading screen's word stage, and the warm-up behind it.
 *
 * Two jobs, and they are not the same job:
 *
 *  1. RUN THE WORD STAGE for a guaranteed minimum. Six phrases, shuffled in a
 *     character at a time. This is the visible half.
 *
 *  2. GET EVERY GPU COST OUT OF THE WAY BEFORE PLAY STARTS. This is the half
 *     that actually matters, and it is why the minimum exists at all — the
 *     time is not padding, it is when the work happens. Three separate stalls
 *     used to land *after* the loading screen had already gone:
 *
 *       - Shader compilation. three.js compiles a material's program the first
 *         time it is drawn, not when it is created. Walking into a room whose
 *         materials had never been on screen compiled a dozen programs inside
 *         one frame — a visible hitch, every time, in every new room.
 *       - Texture upload. Same story: a CanvasTexture crosses to the GPU on
 *         first use, and a built-out station has ~150 procedural textures.
 *       - Shadow map population. shadowMap.autoUpdate is off, so the first
 *         needsUpdate costs a full caster pass.
 *
 *     Doing all three up front is what turns "it stutters whenever I walk
 *     somewhere new" into a flat frame time.
 */

export const PHRASES = [
  'Explore',
  'Learn',
  'Experience',
  'Putting On Gloves',
  'Loading Game Area',
  'Fighting A Blizzard'
];

/**
 * Yield to the browser so it can paint between build steps.
 *
 * setTimeout, NOT requestAnimationFrame. A background or hidden tab throttles
 * rAF all the way to zero, so an rAF-based yield never resolves there — and
 * because the whole load sequence awaits these, tabbing away during loading
 * left the game stuck on "Compiling shaders" indefinitely. setTimeout is
 * clamped in a background tab but always fires.
 */
export const yieldToBrowser = () => new Promise(res => setTimeout(res, 0));

export class Preloader {
  /**
   * @param {HTMLElement} wordEl  element the phrases are shuffled into
   * @param {number} [minMs]      floor for the whole loading screen
   */
  constructor(wordEl, minMs = 15000) {
    this.wordEl = wordEl;
    this.minMs = minMs;
    this._running = false;
    this._t0 = 0;
    this._loop = null;
  }

  /** Start cycling phrases. Returns immediately; the loop runs on its own. */
  begin() {
    if (!this.wordEl || this._running) return;
    this._running = true;
    this._t0 = performance.now();
    const slice = this.minMs / PHRASES.length;
    let i = 0;
    const step = async () => {
      while (this._running) {
        // Phrases loop rather than stopping at six, so a slow machine never
        // sits looking at a dead screen waiting for the work to finish.
        shuffleText(this.wordEl, PHRASES[i % PHRASES.length], {
          direction: 'right', duration: 0.35, stagger: 0.03, shuffleTimes: 1
        });
        i++;
        await new Promise(res => setTimeout(res, slice));
      }
    };
    this._loop = step();
  }

  /** Wait out the remainder of the minimum, then stop the loop. */
  async finish() {
    if (!this._running) return;
    const left = this.minMs - (performance.now() - this._t0);
    if (left > 0) await new Promise(res => setTimeout(res, left));
    this._running = false;
    try { await this._loop; } catch { /* loop is fire-and-forget */ }
  }

  stop() { this._running = false; }
}

/**
 * Push every GPU cost we can reach through the driver before play begins.
 *
 * @param {object} engine   Engine instance
 * @param {THREE.Camera} camera
 * @param {(pct:number,msg:string)=>void} [note]  progress reporter
 */
export async function warmUp(engine, camera, note = () => {}) {
  const { renderer, scene, composer } = engine;

  // THE ONE THAT MATTERS.
  //
  // three.js compiles a material's shader program the first time the object is
  // actually drawn, and `compile()` only walks objects that are currently
  // VISIBLE (traverseVisible, internally). Every room the culler will later
  // reveal as you walk into the building was therefore never compiled here,
  // and paid for itself mid-play instead.
  //
  // On ANGLE/D3D11 that bill is brutal — measured at ~430 ms PER PROGRAM,
  // since each is translated GLSL -> HLSL -> D3D bytecode. Running into the
  // station revealed fourteen rooms at once and produced a single SIX SECOND
  // frame. Twice.
  //
  // So everything is made visible for the compile pass. compileAsync is used
  // rather than a brute-force draw of the whole world: it goes through
  // KHR_parallel_shader_compile where the driver has it, so the compilation
  // happens off the main thread instead of freezing it for a minute.
  //
  // Lights are deliberately NOT touched: the light budget keeps most of them
  // invisible on purpose, and switching them on here would change the scene's
  // light count, which recompiles every material twice over for nothing.
  note(0.86, 'Compiling shaders…');
  await yieldToBrowser();

  const savedVis = [];
  scene.traverse(obj => {
    if (obj.isLight) return;
    if (obj.visible && obj.frustumCulled === false) return;
    savedVis.push([obj, obj.visible, obj.frustumCulled]);
    obj.visible = true;
    if ('frustumCulled' in obj) obj.frustumCulled = false;
  });

  // SYNCHRONOUS on purpose. compileAsync goes through
  // KHR_parallel_shader_compile, and where the driver does not actually
  // support it three.js falls back to a poll that can sit there for a minute —
  // observed here hanging the loading screen at "Compiling shaders" with zero
  // programs built. Blocking for a few seconds behind a loading screen is a
  // fine trade for never blocking during play.
  const tCompile = performance.now();
  renderer.compile(scene, camera);
  const compileMs = Math.round(performance.now() - tCompile);
  note(0.90, `Compiling shaders… ${compileMs} ms`);

  note(0.92, 'Uploading textures…');
  await yieldToBrowser();
  const seen = new Set();
  let n = 0;
  scene.traverse(o => {
    if (!o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap',
                         'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap']) {
        const t = m[key];
        if (!t || seen.has(t)) continue;
        seen.add(t);
        try { renderer.initTexture(t); n++; } catch { /* no image yet */ }
      }
    }
  });

  // One real frame with everything still visible, so vertex buffers cross to
  // the GPU too — compileAsync builds programs, not buffers.
  note(0.94, `Uploading geometry… ${n} textures`);
  await yieldToBrowser();
  composer.render(0.016);
  await yieldToBrowser();

  // The shadow pass uses a SEPARATE depth material per object, with its own
  // program — so it has to be baked while everything is still forced visible
  // too, or every hidden room's depth shader compiles the first time it enters
  // the shadow frustum during play instead.
  note(0.95, 'Baking shadows…');
  renderer.shadowMap.needsUpdate = true;
  composer.render(0.016);
  await yieldToBrowser();

  // A couple of headings while still forced visible, so anything keyed on
  // orientation is covered as well.
  const yawStart = camera.rotation.y;
  for (let i = 0; i < 2; i++) {
    camera.rotation.y = yawStart + Math.PI * i;
    camera.updateMatrixWorld(true);
    composer.render(0.016);
    await yieldToBrowser();
  }
  camera.rotation.y = yawStart;
  camera.updateMatrixWorld(true);

  // Put the world back exactly as it was.
  for (const [obj, v, f] of savedVis) { obj.visible = v; if ('frustumCulled' in obj) obj.frustumCulled = f; }
  await yieldToBrowser();

  // A few frames at different headings, so anything that only compiles when it
  // first enters the frustum has already done so.
  note(0.97, 'Warming the view…');
  const yaw0 = camera.rotation.y;
  for (let i = 0; i < 4; i++) {
    camera.rotation.y = yaw0 + (i / 4) * Math.PI * 2;
    camera.updateMatrixWorld(true);
    composer.render(0.016);
    await yieldToBrowser();
  }
  camera.rotation.y = yaw0;
  camera.updateMatrixWorld(true);
  note(1, 'Ready');
}
