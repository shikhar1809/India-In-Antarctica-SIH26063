/**
 * Input — keyboard, pointer-lock mouse look, and a touch stick, unified into
 * one state object the player controller can read without caring which is in use.
 *
 * Look deltas accumulate and are drained once per frame by `consumeLook()`, so a
 * 1000 Hz gaming mouse cannot produce a different turn rate to a 125 Hz one.
 */
export class Input {
  constructor(canvas, dom = {}) {
    this.canvas = canvas;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };     // -1..1, y forward
    this.look = { x: 0, y: 0 };     // radians, drained each frame
    this.run = false;
    this.locked = false;
    this.sensitivity = 1.0;
    this.invertY = false;
    this.touch = false;

    this.onAction = null;           // E / tap action button
    this.onKey = null;              // (code) => void, for UI hotkeys

    this._bindKeyboard();
    this._bindMouse();
    this._bindTouch(dom);
    this._bindEscapeFailsafe();
  }

  /**
   * Escape must ALWAYS get the player's mouse back, unconditionally, no
   * matter what state the rest of the input system thinks it's in. Every
   * other Escape-adjacent path (pointerlockchange → releaseAll(), the game's
   * own pause-menu wiring) is state-dependent and can theoretically miss a
   * case — a drag that never got a matching mouseup, a lock/unlock race, a
   * browser that suppresses the native lock-exit shortcut in some embedding
   * context. Rather than keep chasing individual causes, this listener
   * doesn't check any of that: on Escape, exit pointer lock if active, drop
   * the drag-look flag if set, and force the cursor visible. All of these
   * are harmless no-ops when nothing was actually stuck, so there is no cost
   * to having this fire on every ordinary "open the pause menu" press too.
   */
  _bindEscapeFailsafe() {
    window.addEventListener('keydown', e => {
      if (e.code !== 'Escape') return;
      if (document.pointerLockElement) {
        try { document.exitPointerLock(); } catch { /* already releasing */ }
      }
      this._dragging = false;
      this.canvas.style.cursor = '';
    });
  }

  /* ------------------------------------------------------------ keyboard */
  _bindKeyboard() {
    const KEY_MOVE = new Set([
      'KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'
    ]);

    window.addEventListener('keydown', e => {
      // Never swallow keys while the player is typing into a form control.
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      if (!e.repeat) this.onKey?.(e.code, e);
      this.keys.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.run = true;
      if (KEY_MOVE.has(e.code)) e.preventDefault();  // stop the page scrolling
      this._recomputeMove();
    });

    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.run = false;
      this._recomputeMove();
    });

    // Losing focus mid-stride leaves a key stuck down forever otherwise.
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
  }

  releaseAll() {
    this.keys.clear();
    this.run = false;
    this.move.x = this.move.y = 0;
    this._stickActive = false;
    if (this._knob) this._knob.style.transform = 'translate(0px,0px)';

    // Drag-to-look tracks mouse-up on `window`, but a drag can also end
    // without any mouseup ever firing — the window loses focus mid-drag
    // (alt-tab, a notification, devtools, any focus change), or the tab is
    // backgrounded. Without this, `_dragging` stays true with a stale
    // `_dragX/_dragY` anchor, and the very next mousemove ANYWHERE on the
    // page — even hovering an unrelated button — reads as a continuation of
    // that old drag and produces one large, uncontrolled camera snap. This
    // is what releaseAll() is already called for on blur/visibilitychange;
    // it just needs to also cover the drag-look state.
    this._dragging = false;
    if (this.canvas) this.canvas.style.cursor = '';
  }

  _recomputeMove() {
    if (this._stickActive) return;   // touch stick owns movement while held
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    // Normalise so diagonal movement is not 41% faster than straight ahead.
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.move.x = x; this.move.y = y;
  }

  /* --------------------------------------------------------------- mouse */
  _bindMouse() {
    const el = this.canvas;

    el.addEventListener('mousedown', e => {
      if (!this.enabled) return;
      if (e.button !== 0) return;
      if (!this.locked) {
        if (this.lockBlocked) {
          // Pointer lock is unavailable (sandboxed iframe, permissions policy).
          // Fall back to hold-and-drag look, which works everywhere.
          this._dragging = true;
          this._dragX = e.clientX; this._dragY = e.clientY;
          el.style.cursor = 'grabbing';
        } else {
          this.requestLock();
        }
      }
    });

    window.addEventListener('mouseup', () => {
      this._dragging = false;
      el.style.cursor = '';
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      // The first movementX/Y sample delivered after pointer lock engages is
      // documented across browsers to sometimes carry a large, spurious
      // delta — effectively the OS cursor "snapping" from wherever it was
      // into the locked/centered state, reported as if the player had
      // physically swept the mouse that whole distance in one frame. Left
      // unguarded, that single sample can spin the camera by tens of
      // degrees the instant a player clicks to enable mouselook. Skipping
      // exactly one sample after each lock transition is the standard fix.
      if (this.locked) this._skipNextMove = true;
      this.onLockChange?.(this.locked);
      if (!this.locked) this.releaseAll();
    });

    // The only signal that works across browsers when the request is refused.
    // Chrome rejects the returned promise AND fires this; Safari only fires
    // this. Either way we stop asking and switch to drag-to-look.
    document.addEventListener('pointerlockerror', () => this._blockLock());

    document.addEventListener('mousemove', e => {
      if (this.locked) {
        if (this._skipNextMove) { this._skipNextMove = false; return; }
        // 0.0022 rad per raw unit ≈ a comfortable default matching most FPS games.
        const k = 0.0022 * this.sensitivity;
        this.look.x -= e.movementX * k;
        this.look.y -= e.movementY * k * (this.invertY ? -1 : 1);
      } else if (this._dragging) {
        const k = 0.004 * this.sensitivity;
        this.look.x -= (e.clientX - this._dragX) * k;
        this.look.y -= (e.clientY - this._dragY) * k * (this.invertY ? -1 : 1);
        this._dragX = e.clientX; this._dragY = e.clientY;
      }
    });

    // Right-click should not open the context menu over the viewport.
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  /**
   * Ask for pointer lock, and remember if the environment refuses.
   *
   * This matters for real deployment: an <iframe> without
   * allow="pointer-lock" — which is how this would be embedded in the wider
   * NCPOR portal — rejects the request outright. Rather than leaving the
   * player unable to look around, we record the refusal once and switch to
   * drag-to-look for the rest of the session.
   */
  async requestLock() {
    if (this.locked || this.lockBlocked) return;
    // async/await catches BOTH a synchronous throw (older browsers reject
    // requestPointerLock immediately with a DOMException when the document
    // cannot hold the lock — a sandboxed iframe, most notably) and an async
    // promise rejection (the modern spec behaviour) in the same try/catch.
    // The earlier version tried to chain manual .catch() calls and left a
    // gap where the rejection came back unhandled in some browsers.
    try {
      // unadjustedMovement bypasses OS mouse acceleration where supported,
      // which is the difference between "precise" and "floaty" aiming.
      await this.canvas.requestPointerLock({ unadjustedMovement: true });
      return;
    } catch { /* fall through to the plain retry below */ }
    try {
      await this.canvas.requestPointerLock();
    } catch {
      // NOT a permanent _blockLock() here. A rejection at this point is
      // usually transient — most commonly Chrome's short post-Escape
      // cooldown (exiting pointer lock via Escape, which is how the pause
      // menu is normally opened, makes the browser refuse a re-lock for
      // about a second) or the request simply landing too many ticks after
      // the click that triggered it (this call is reached at the end of a
      // long async station-load chain, well outside the original click's
      // handler). Neither means "this environment can never do pointer
      // lock" — but _blockLock() used to fire here regardless, which
      // latched the game into permanent drag-to-look for the rest of the
      // session the first time a station switch happened to lose this
      // race. Leaving `locked` false and simply not blocking means the
      // player's very next click on the canvas (mousedown already retries
      // requestLock() whenever `!locked && !lockBlocked`) tries again
      // cleanly, by which point any cooldown has passed. Genuine
      // environment-level refusal (a sandboxed iframe, a permissions
      // policy) is still caught below via the `pointerlockerror` event,
      // which is the actual cross-browser signal for that case.
    }
  }

  _blockLock() {
    if (this.lockBlocked) return;
    this.lockBlocked = true;
    this.onLockBlocked?.();
  }

  exitLock() { if (this.locked) document.exitPointerLock(); }

  /* --------------------------------------------------------------- touch */
  _bindTouch(dom) {
    const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches ||
                    navigator.maxTouchPoints > 1;
    this.touch = isTouch;
    if (!isTouch || !dom.stick) return;

    dom.root?.classList.remove('hidden');

    const stick = dom.stick, knob = dom.knob;
    this._knob = knob;
    const R = 46;                    // max knob travel in CSS px
    let id = null, cx = 0, cy = 0;

    stick.addEventListener('pointerdown', e => {
      id = e.pointerId;
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      this._stickActive = true;
      stick.setPointerCapture(id);
      e.preventDefault();
    });

    stick.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.move.x = dx / R;
      this.move.y = -dy / R;
      this.run = d > R * 0.85;
      e.preventDefault();
    });

    const end = e => {
      if (e.pointerId !== id) return;
      id = null;
      this._stickActive = false;
      this.move.x = this.move.y = 0;
      this.run = false;
      knob.style.transform = 'translate(0px,0px)';
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);

    // Drag anywhere on the right half of the screen to look around.
    let lookId = null, lx = 0, ly = 0;
    this.canvas.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch' || lookId !== null) return;
      if (e.clientX < window.innerWidth * 0.42) return;   // left side is the stick
      lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
    });
    this.canvas.addEventListener('pointermove', e => {
      if (e.pointerId !== lookId) return;
      const k = 0.006 * this.sensitivity;
      this.look.x -= (e.clientX - lx) * k;
      this.look.y -= (e.clientY - ly) * k * (this.invertY ? -1 : 1);
      lx = e.clientX; ly = e.clientY;
    });
    const lookEnd = e => { if (e.pointerId === lookId) lookId = null; };
    this.canvas.addEventListener('pointerup', lookEnd);
    this.canvas.addEventListener('pointercancel', lookEnd);

    dom.action?.addEventListener('click', () => this.onAction?.());
    dom.runBtn?.addEventListener('click', () => { this.run = !this.run; dom.runBtn.classList.toggle('on', this.run); });
  }

  /** Drain accumulated look delta. Call exactly once per frame. */
  consumeLook() {
    const l = { x: this.look.x, y: this.look.y };
    this.look.x = this.look.y = 0;
    return l;
  }

  get enabled() { return this._enabled !== false; }
  set enabled(v) { this._enabled = v; if (!v) this.releaseAll(); }
}
