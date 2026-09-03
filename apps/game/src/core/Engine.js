import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Stats } from '../ui/Stats.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Engine — renderer, camera, composer, resize and the fixed-step render loop.
 *
 * PIXEL ACCURACY
 * --------------
 * The canvas is laid out by CSS at 100% × 100%. The drawing buffer is sized
 * from getBoundingClientRect() (fractional CSS pixels) multiplied by the device
 * pixel ratio, then rounded. That gives one framebuffer texel per physical
 * device pixel — no browser rescale of the canvas, which is what actually
 * causes the soft, smeared look people mistake for "low quality WebGL".
 *
 * Two details matter and are easy to get wrong:
 *   1. setSize(w, h, false) — the `false` stops three from writing inline
 *      style.width/height, which would fight the CSS layout and re-introduce
 *      a fractional scale.
 *   2. The composer and every pass must be resized with the SAME rounded
 *      buffer dimensions, or post-processing samples off-by-half a texel and
 *      the whole image blurs.
 *
 * ANTIALIASING
 * ------------
 * SMAA, not MSAA. This is a deliberate choice, not a fallback:
 *
 *   - `antialias: true` on WebGLRenderer does nothing once you render into a
 *     render target, which EffectComposer always does.
 *   - Setting `samples` on the composer's target enables MSAA, but a
 *     multisampled target cannot be sampled as a texture without an explicit
 *     resolve. UnrealBloomPass reads the previous buffer's texture directly
 *     mid-chain, gets an unresolved attachment, and outputs pure black —
 *     which is exactly the failure this pipeline hit.
 *   - SMAA is a post-process pass. It runs on a resolved colour buffer, costs
 *     roughly one full-screen pass, and composes correctly with everything
 *     after it.
 */
export class Engine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;

    // --- capability probe -------------------------------------------------
    this.caps = detectCapabilities();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,          // handled by the composer's MSAA target
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    });

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Snow is the brightest natural surface there is; ACES needs headroom
    // above 1.0 or a correctly-lit polar scene tone-maps down to grey.
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;   // sun is static; we update manually
    this.renderer.info.autoReset = false;

    this.scene = new THREE.Scene();
    // Far plane is a DRAW DISTANCE, not a safety margin. It used to be 6000,
    // which meant the whole thousand-metre terrain, every field instrument and
    // the ship were submitted every frame from anywhere on the map. Pulled in
    // hard and hidden behind fog (see _applyQualityCaps), the way every
    // open-world game of the PS2 era did it — you never see the edge because
    // the fog closes before the clip plane does.
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.15, 900);

    // --- quality tiers ----------------------------------------------------
    // 'high' | 'medium' | 'low' — drives DPR cap, shadow map size, bloom, particle budgets.
    this.quality = opts.quality || this.caps.suggestedQuality;
    this._applyQualityCaps();

    // --- post processing --------------------------------------------------
    // samples: 0 is load-bearing — see the ANTIALIASING note above.
    const rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
      samples: 0
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // Bloom: subtle. It exists for the interaction beacons, the aurora and the
    // sun halo — not to make snow glow.
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.72, 0.9);
    this.composer.addPass(this.bloomPass);
    this.bloomPass.enabled = this.quality !== 'low';

    this.smaaPass = new SMAAPass();
    this.composer.addPass(this.smaaPass);
    this.smaaPass.enabled = this.quality !== 'low';

    this.composer.addPass(new OutputPass());

    // --- loop state -------------------------------------------------------
    this.clock = new THREE.Clock();
    this.updaters = new Set();
    this._running = false;
    this._accum = 0;
    this.fixedStep = 1 / 60;
    this.maxSubSteps = 5;

    // --- light budget -----------------------------------------------------
    // See LightBudget below. Built once here; rebuilt whenever the world
    // changes (main.js calls lightBudget.rebuild after a site loads).
    this.lightBudget = new LightBudget(this.scene, this.quality === 'low' ? 4 : this.quality === 'medium' ? 6 : 9);

    // On-screen readout (F3) and quality switch (F4). Costs nothing until
    // shown, and it is the only way anyone can tell us what is actually
    // happening on the machine that is struggling.
    this.stats = new Stats(this);

    // rolling FPS for the adaptive resolution governor
    this._fpsSamples = [];
    this._starved = 0;
    this._adaptiveScale = 1;
    this.adaptive = opts.adaptive !== false;

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    // devicePixelRatio changes when the window moves between monitors or the
    // user zooms; matchMedia is the only reliable notification for it.
    this._watchDPR();

    this.resize();
  }

  _applyQualityCaps() {
    const q = this.quality;
    // DPR cap: retina phones report 3+, which quadruples fill cost for a
    // difference nobody can see at arm's length. 2 is the sane ceiling.
    // Fill rate is quadratic in this number and it is the single biggest cost
    // on a high-DPI laptop. 1.25 on a 1440p panel is still visually crisp and
    // costs less than half what 1.75 does.
    this.dprCap = q === 'high' ? 1.25 : q === 'medium' ? 1 : 0.85;
    // Draw distance and the fog that hides it. These two numbers must move
    // together: fog thick enough that the far plane is already invisible by
    // the time geometry reaches it.
    this.drawDistance = q === 'high' ? 620 : q === 'medium' ? 460 : 340;
    this.fogDensity   = q === 'high' ? 0.0034 : q === 'medium' ? 0.0046 : 0.0062;
    if (this.camera) { this.camera.far = this.drawDistance; this.camera.updateProjectionMatrix(); }
    // 1024 over the 80 m shadow frustum is ~13 texels per metre, which is
    // more than enough for shadows this soft — and the shadow pass is the
    // single most expensive FRAME in the game, because refreshing it costs a
    // full extra render of every caster. Halving the map quarters that fill.
    this.shadowSize = q === 'high' ? 1024 : q === 'medium' ? 768 : 512;
    this.particleBudget = q === 'high' ? 9000 : q === 'medium' ? 4500 : 1500;
    if (this.bloomPass) this.bloomPass.enabled = q !== 'low';
    // On low, resolution is already the bottleneck; a full-screen AA pass costs
    // more than the aliasing it removes.
    if (this.smaaPass) this.smaaPass.enabled = q !== 'low';
    // Shadow mapping used to stay on at every tier — only the map SIZE
    // shrank — but the extra shadow-caster render pass it costs every
    // frame is a bigger line item than the resolution of the map it
    // produces, and it's exactly the kind of cost a weak integrated GPU or
    // an older phone (both funnelled into 'low' by detectCapabilities())
    // feels most. Turning the whole pass off on 'low' is what "heavily
    // optimize for low-end" actually needs, not a smaller shadow map that
    // still gets rendered every frame.
    this.renderer.shadowMap.enabled = q !== 'low';
  }

  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    this._applyQualityCaps();
    this._adaptiveScale = 1;
    this.resize();
    this.onQualityChange?.(q);
  }

  _watchDPR() {
    const attach = () => {
      const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mq.addEventListener('change', () => { this.resize(); attach(); }, { once: true });
    };
    try { attach(); } catch { /* older Safari: resize handler still covers most cases */ }
  }

  /**
   * Size the drawing buffer to exactly (cssPx * dpr), rounded.
   * Returns the buffer dimensions actually used.
   */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width || window.innerWidth);
    const cssH = Math.max(1, rect.height || window.innerHeight);

    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap) * this._adaptiveScale;

    // Round, don't floor: flooring loses a device pixel on fractional layouts
    // (a 1439.5px-wide panel on a 2x display) and leaves a seam at the edge.
    const bufW = Math.round(cssW * dpr);
    const bufH = Math.round(cssH * dpr);

    this.renderer.setPixelRatio(1);          // we do the DPR maths ourselves
    this.renderer.setSize(bufW, bufH, false); // false => never touch CSS size
    this.composer.setSize(bufW, bufH);
    // Bloom at HALF resolution. It is a blur — a big, deliberately soft one —
    // so nothing about it survives being computed at full res that is worth
    // paying four times the fill rate for. UnrealBloomPass runs five
    // downsample/upsample pairs, all of them pure fill, which makes it the
    // most expensive thing on screen at high DPR and the least visible. On a
    // retina laptop this alone is the difference between comfortable and not.
    this.bloomPass?.setSize(Math.max(1, bufW >> 1), Math.max(1, bufH >> 1));
    this.smaaPass?.setSize(bufW, bufH);

    this.camera.aspect = cssW / cssH;
    // Slightly widen FOV on tall/narrow phone screens so the world does not
    // feel like it is being viewed through a letterbox.
    this.camera.fov = this.camera.aspect < 0.8 ? 74 : 62;
    this.camera.updateProjectionMatrix();

    this.bufferSize = { w: bufW, h: bufH, cssW, cssH, dpr };
    this.onResize?.(this.bufferSize);
    return this.bufferSize;
  }

  /** Register a per-frame callback: fn(dt, elapsed). Returns an unsubscribe fn. */
  add(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); }

  start() {
    if (this._running) return;
    this._running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  stop() {
    this._running = false;
    this.renderer.setAnimationLoop(null);
  }

  _frame() {
    // Clamp: a backgrounded tab returns a multi-second delta which would
    // teleport the player through the terrain on the next physics step.
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 0.1);
    const elapsed = this.clock.elapsedTime;

    for (const fn of this.updaters) fn(dt, elapsed);

    this.lightBudget.update(this.camera, dt);

    this.composer.render(dt);
    this.stats.tick();
    this.renderer.info.reset();

    if (this.adaptive) this._governor(raw);
  }

  /**
   * Adaptive resolution. If we sit under 45 fps for a sustained stretch, shrink
   * the drawing buffer before touching visual features — a 15% resolution drop
   * is far less noticeable than shadows or bloom switching off mid-scene.
   */
  _governor(raw) {
    const fps = 1 / Math.max(raw, 1e-4);
    const s = this._fpsSamples;
    s.push(fps);
    if (s.length < 150) return;                 // ~2.5 s of evidence

    const avg = s.reduce((a, b) => a + b, 0) / s.length;
    s.length = 0;

    // HYSTERESIS AND A COOLDOWN, both load-bearing.
    //
    // resize() reallocates the composer's two half-float targets, bloom's five
    // mip pairs and SMAA's buffers — hundreds of megabytes of GPU memory at a
    // laptop's native resolution. The old governor re-checked every 1.5 s and
    // used thresholds only 13 fps apart (down under 45, up over 58), so a
    // machine sitting anywhere in that band reallocated all of it every second
    // and a half, forever. That is not an optimisation, it is a stutter
    // generator — and it fires exactly when the player starts moving, because
    // moving is what pushes the average across the line.
    //
    // So: a wide dead band nothing can oscillate inside, and a hard cooldown
    // so even a genuine change costs at most one reallocation every ten
    // seconds.
    const now = performance.now();
    if (now - (this._lastScaleChange || 0) < 10000) return;

    if (avg < 38 && this._adaptiveScale > 0.6) {
      this._adaptiveScale = Math.max(0.6, this._adaptiveScale - 0.15);
      this._lastScaleChange = now;
      this.resize();
    } else if (avg < 38 && this._adaptiveScale <= 0.6) {
      // Resolution is at the floor and it is still not enough. Drop the whole
      // tier — that removes the fixed-cost passes (bloom, AA, shadows) which
      // no amount of resolution scaling can touch.
      const order = ['high', 'medium', 'low'];
      const i = order.indexOf(this.quality);
      if (i >= 0 && i < order.length - 1) {
        this._adaptiveScale = 1;
        this._lastScaleChange = now;
        this.setQuality(order[i + 1]);
      }
    } else if (avg > 75 && this._adaptiveScale < 1) {
      // Only climb back when there is real headroom, never on a borderline
      // reading — coming back down costs another reallocation.
      this._adaptiveScale = Math.min(1, this._adaptiveScale + 0.1);
      this._lastScaleChange = now;
      this.resize();
    }
  }


  /** Force one shadow map refresh (sun moved, or geometry was added). */
  refreshShadows() { this.renderer.shadowMap.needsUpdate = true; }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    this.composer.dispose?.();
    this.renderer.dispose();
  }
}

/** Probe the GPU/context once and pick a starting quality tier. */
function detectCapabilities() {
  const gl = document.createElement('canvas').getContext('webgl2');
  const out = {
    webgl2: !!gl,
    maxTexture: gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 2048,
    renderer: 'unknown',
    mobile: /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),
    cores: navigator.hardwareConcurrency || 4,
    memory: navigator.deviceMemory || 4
  };

  if (gl) {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) out.renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  const weak =
    out.mobile ||
    out.cores <= 4 ||
    out.memory <= 4 ||
    /SwiftShader|Software|llvmpipe|Microsoft Basic/i.test(out.renderer);

  const strong =
    !out.mobile && out.cores >= 8 && out.memory >= 8 &&
    /RTX|GTX|Radeon|Apple M|Arc/i.test(out.renderer);

  out.suggestedQuality = strong ? 'high' : weak ? 'low' : 'medium';
  return out;
}


/**
 * LightBudget — a fixed-size pool of point lights that follows the camera.
 *
 * THREE's default renderer is FORWARD: every light in the scene is evaluated
 * per fragment on every lit surface, so cost is lights x pixels regardless of
 * where those lights are. Once both stations were built out this scene reached
 * 57 visible point lights — 33 field beacons and route markers scattered over a
 * kilometre of terrain, plus the stations' own — and every one of them was
 * being shaded on every pixel of snow, including the ones a kilometre behind
 * the camera. That is what made the game unplayable on good hardware.
 *
 * The obvious fix — hide the distant ones — is a trap. Changing the NUMBER of
 * visible lights changes the shader's #define, so three.js recompiles every
 * material in the scene. Doing that while walking produces exactly the
 * multi-second freeze it was supposed to prevent.
 *
 * So the pool is a CONSTANT number of real lights that are always visible and
 * never counted differently. The lights authored around the world stay in the
 * scene as data — still animated by whatever animates them, still carrying
 * their own colour and intensity — but are made invisible once, at build time.
 * Each update the pool is moved onto the nearest few of them and copies their
 * current colour and intensity. The shader never sees the light count change.
 */
class LightBudget {
  constructor(scene, size) {
    this.scene = scene;
    this.size = size;
    this.sources = [];
    this.pool = [];
    this._acc = 0;
    this._tmp = new THREE.Vector3();
    for (let i = 0; i < size; i++) {
      const pl = new THREE.PointLight(0xffffff, 0, 1, 2);
      pl.name = 'budget-light';
      pl.castShadow = false;
      scene.add(pl);
      this.pool.push(pl);
    }
  }

  /**
   * Re-collect the world's authored point lights. Call after the scene graph
   * changes (a station load, a site rebuild).
   */
  rebuild() {
    this.sources.length = 0;
    this.scene.traverse(o => {
      if (!o.isPointLight || o.name === 'budget-light') return;
      // Keep the object — things animate its intensity — but stop the renderer
      // ever shading with it directly.
      o.visible = false;
      this.sources.push(o);
    });
    this._acc = 1e9;   // force an assignment on the next update
  }

  update(camera, dt) {
    this._acc += dt;
    if (this._acc < 0.1) return;      // 10 Hz is plenty; a light 100 ms late is invisible
    this._acc = 0;
    if (!this.sources.length) {
      for (const pl of this.pool) pl.intensity = 0;
      return;
    }
    const cam = camera.getWorldPosition(this._tmp).clone();
    for (const src of this.sources) {
      src.getWorldPosition(this._tmp);
      src.__d = this._tmp.distanceToSquared(cam);
      src.__wx = this._tmp.x; src.__wy = this._tmp.y; src.__wz = this._tmp.z;
    }
    // Partial selection would be tidier; at a few dozen sources a sort is
    // cheaper than the code to avoid it.
    this.sources.sort((a, b) => a.__d - b.__d);
    for (let i = 0; i < this.pool.length; i++) {
      const pl = this.pool[i], src = this.sources[i];
      if (!src) { pl.intensity = 0; continue; }
      // Beyond its own falloff radius a light contributes nothing anyway.
      const reach = (src.distance || 30) + 4;
      if (src.__d > reach * reach) { pl.intensity = 0; continue; }
      pl.position.set(src.__wx, src.__wy, src.__wz);
      pl.color.copy(src.color);
      pl.intensity = src.intensity;
      pl.distance = src.distance;
      pl.decay = src.decay;
    }
  }
}
