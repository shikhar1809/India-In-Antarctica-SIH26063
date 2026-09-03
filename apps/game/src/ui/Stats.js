/**
 * Stats.js — an on-screen performance readout, and a quality switch.
 *
 * This exists because performance was being debugged by inference. Four rounds
 * of "this ought to be the bottleneck" is three rounds too many: the only
 * numbers that matter are the ones on the machine that is actually struggling,
 * and nobody had them. So the game now reports them itself.
 *
 * Deliberately cheap: the DOM is written four times a second, not sixty —
 * updating text every frame forces a style recalc and layout every frame,
 * which is its own source of jank and would make the meter lie about the thing
 * it is measuring.
 *
 *   F3  toggle the readout
 *   F4  cycle quality (low / medium / high)
 *
 * `frameMs` is the honest number: the wall-clock gap between animation-loop
 * callbacks, which includes everything — our own update, three's render, the
 * browser's compositing, and any GC pause. p95 is shown next to the median
 * because a game that is "60fps with a 200 ms hitch every second" reads as
 * broken while its average reads as fine, and the median alone would hide it.
 */
import * as THREE from 'three';

export class Stats {
  constructor(engine) {
    this.engine = engine;
    this.visible = true;   // baked in: always on, top-left
    this.samples = [];
    this._acc = 0;
    this._last = performance.now();
    this._sizeVec = new THREE.Vector2();
    // Spike forensics. A frame over 150 ms is not "slow", it is a STALL, and
    // the only things that stall for that long are shader compilation, a
    // buffer/texture upload, or a render-target reallocation. Recording the
    // program count either side of the spike says which: if `progs` jumped,
    // the driver was compiling.
    this._progs = 0;
    this._keys = new Set();
    this._lastSpike = null;
    window.__spikes = [];

    const el = document.createElement('div');
    el.id = 'perf-stats';
    el.style.cssText = [
      'position:fixed', 'left:10px', 'top:10px', 'z-index:99999',
      'font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#c8f5d8', 'background:rgba(6,14,20,0.82)',
      'border:1px solid rgba(120,200,160,0.35)', 'border-radius:6px',
      'padding:8px 10px', 'white-space:pre', 'pointer-events:none',
      'letter-spacing:0.02em'
    ].join(';');
    document.body.appendChild(el);
    this.el = el;

    this._onKey = (e) => {
      if (e.key === 'F3') { e.preventDefault(); this.toggle(); }
      if (e.key === 'F4') { e.preventDefault(); this.cycleQuality(); }
    };
    window.addEventListener('keydown', this._onKey);
  }

  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
  }

  cycleQuality() {
    const order = ['low', 'medium', 'high'];
    const next = order[(order.indexOf(this.engine.quality) + 1) % order.length];
    this.engine.setQuality?.(next);
    if (!this.visible) this.toggle();
    this._flash = next;
  }

  /** Called every frame from the engine loop. Must never throw: a broken
   *  instrument that stops the game is worse than no instrument. */
  tick() {
    try { this._tick(); } catch { /* never let the readout kill a frame */ }
  }

  /** Record what changed across a stall. Called before the frame time is known.
   *
   *  The COUNT alone says "the driver compiled something", which is where the
   *  investigation stalled twice. What actually identifies the culprit is the
   *  program's cache key: three.js builds it from the exact parameter set that
   *  makes a program unique -- light counts, receiveShadow, instancing, fog,
   *  vertex colours, depth packing. Diffing the keys either side of a stall
   *  names the reason instead of leaving it to be guessed at. */
  _watchSpike(dt) {
    const list = this.engine.renderer.info.programs ?? [];
    const progs = list.length;
    // Frames from before play started are not stalls. During loading the gap
    // between rAF callbacks is the whole preloader -- a synchronous compile,
    // a shadow bake, a 15 s minimum -- and recording that produced readouts
    // like "LAST STALL 20828ms" that had nothing to do with gameplay and sent
    // this investigation chasing a number that was an artefact of measuring
    // the measurement. Only count frames once the player is actually in the
    // world.
    if (!this.engine.inWorld && !window.__game?.inWorld) { this._progs = progs; return; }
    if (dt > 150) {
      const keys = new Set(list.map(p => p.cacheKey));
      const added = [...keys].filter(k => !this._keys.has(k));
      const rec = { ms: Math.round(dt), progsBefore: this._progs, progsAfter: progs,
                    added, at: new Date().toLocaleTimeString() };
      this._lastSpike = rec;
      window.__spikes.push(rec);
      if (window.__spikes.length > 40) window.__spikes.shift();
      this._keys = keys;
    } else if (progs !== this._progs) {
      this._keys = new Set(list.map(p => p.cacheKey));
    }
    this._progs = progs;
  }

  _tick() {
    const now = performance.now();
    const dt = now - this._last;
    this._last = now;
    this._watchSpike(dt);
    this.samples.push(dt);
    if (this.samples.length > 120) this.samples.shift();
    if (!this.visible) return;

    this._acc += dt;
    if (this._acc < 250) return;      // 4 Hz: writing the DOM is not free
    this._acc = 0;

    const s = [...this.samples].sort((a, b) => a - b);
    const med = s[s.length >> 1] || 0;
    const p95 = s[Math.floor(s.length * 0.95)] || 0;
    const worst = s[s.length - 1] || 0;
    const r = this.engine.renderer;
    const info = r.info.render;
    // getDrawingBufferSize writes into its argument via target.set(), so it
    // needs a real Vector2. Passing a plain object threw here every single
    // frame, which took the whole render loop down with it.
    const v = r.getDrawingBufferSize(this._sizeVec);
    const px = `${Math.round(v.x)}x${Math.round(v.y)}`;

    this.el.textContent =
      `fps ${(1000 / Math.max(med, 0.01)).toFixed(0).padStart(3)}   ` +
      `frame ${med.toFixed(1)}ms  p95 ${p95.toFixed(1)}  max ${worst.toFixed(1)}\n` +
      `draws ${String(info.calls).padStart(4)}   tris ${(info.triangles / 1000).toFixed(0)}k\n` +
      `quality ${this.engine.quality}   dpr ${r.getPixelRatio().toFixed(2)}   buf ${px}\n` +
      `shadows ${r.shadowMap.enabled ? this.engine.shadowSize : 'off'}   ` +
      `bloom ${this.engine.bloomPass?.enabled ? 'on' : 'off'}   ` +
      `aa ${this.engine.smaaPass?.enabled ? 'on' : 'off'}\n` +
      `progs ${this._progs}` +
      (this._lastSpike
        ? `   LAST STALL ${this._lastSpike.ms}ms  progs ${this._lastSpike.progsBefore}→${this._lastSpike.progsAfter}`
        : '   no stalls yet') + `
` +
      `F3 hide · F4 quality`;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    this.el.remove();
  }
}
