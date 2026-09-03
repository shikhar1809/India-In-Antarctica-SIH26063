import { CATEGORIES, ENTRIES, ENTRY_BY_ID, TOTAL_ENTRIES } from '../data/archive.js';
import { STATIONS, STATION_ORDER, distanceKm } from '../data/stations.js';
import { FIGURES } from './figures.js';
import { PixelSnow } from './PixelSnow.js';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../firebase.js';

// Exact defaults from the supplied PixelSnow usage — spelled out rather than
// left implicit so the params here are visibly "the ones asked for" and not
// just whatever the component happens to default to.
const SNOW_OPTS = {
  color: '#ffffff', flakeSize: 0.01, minFlakeSize: 1.25, pixelResolution: 200,
  speed: 1.25, density: 0.3, direction: 125, brightness: 1, depthFade: 8,
  farPlane: 20, gamma: 0.4545, variant: 'square'
};

const $ = id => document.getElementById(id);

/**
 * UI — every DOM surface: boot, menu, HUD, archive, map, pause, minigame host.
 *
 * Kept entirely separate from the render loop. The 3D layer emits state and
 * the UI reads it; nothing in here ever touches a THREE object. That split is
 * what makes it possible to embed the whole game in the wider NCPOR portal
 * later without untangling anything.
 */
export class UI {
  constructor(game) {
    this.game = game;
    this.collected = new Set();
    this.activeCat = 'expedition';
    this.activeEntry = null;
    this._toastTimers = new Set();

    this.el = {
      boot: $('boot'), bootBar: $('boot-bar'), bootStatus: $('boot-status'), bootWord: $('boot-word'),
      menu: $('menu'), stationPick: $('station-pick'),
      hud: $('hud'), site: $('hud-site'), temp: $('hud-temp'), wind: $('hud-wind'),
      clock: $('hud-clock'), compass: $('compass-rose'),
      objective: $('objective'), objText: $('obj-text'), objDist: $('obj-dist'),
      reticle: $('reticle'), prompt: $('prompt'), promptText: $('prompt-text'),
      minimapCanvas: $('minimap-canvas'),
      collected: $('hud-collected'), total: $('hud-total'),
      toasts: $('toasts'),
      codex: $('codex'), codexNav: $('codex-nav'), codexList: $('codex-list'), codexDetail: $('codex-detail'),
      map: $('map'), mapCanvas: $('map-canvas'), mapLegend: $('map-legend'),
      mini: $('mini'), miniShell: $('mini-shell'),
      pause: $('pause'), settings: $('settings'),
      bugreport: $('bugreport'), bugDesc: $('bug-desc'), bugFiles: $('bug-files'),
      bugThumbs: $('bug-thumbs'), bugError: $('bug-error'), bugSuccess: $('bug-success'),
      bugSubmit: $('btn-bugreport-submit'),
      touch: $('touch')
    };
    this._bugFiles = [];

    this.el.total.textContent = TOTAL_ENTRIES;
    this._buildStationPicker();
    this._buildCodexNav();
    this._buildCompass();
    this._buildSettings();
    this._wire();

    // Boot is visible from the very first frame, so its snow starts right
    // away; menu's own instance is created lazily the first time showMenu()
    // runs, since #menu's snow container has zero size until #menu itself
    // is un-hidden — a canvas sized off a 0×0 element never recovers a sane
    // size later on its own.
    this._bootSnow = new PixelSnow($('boot-snow'), SNOW_OPTS);
    this._menuSnow = null;
  }

  /* =============================================================== boot */
  setBoot(pct, msg) {
    this.el.bootBar.style.width = `${Math.round(pct * 100)}%`;
    if (msg) this.el.bootStatus.textContent = msg;
  }
  // #boot is reused as the loading screen for every station load, not just
  // the very first app boot — Game.start() un-hides it again each time a
  // station starts loading. showBoot()/hideBoot() (rather than main.js
  // reaching into el.boot.classList directly, which is what it used to do)
  // is what lets the snow layer actually track that: created fresh here
  // whenever boot is shown, in case it was already disposed from the
  // PREVIOUS time boot was hidden.
  showBoot() {
    this.el.boot.classList.remove('hidden');
    if (!this._bootSnow) {
      this._bootSnow = new PixelSnow($('boot-snow'), SNOW_OPTS);
    }
  }
  hideBoot() {
    this.el.boot.classList.add('hidden');
    this._bootSnow?.dispose();
    this._bootSnow = null;
  }

  /* =============================================================== menu */
  _buildStationPicker() {
    this.el.stationPick.innerHTML = '';
    STATION_ORDER.forEach((id, i) => {
      const s = STATIONS[id];
      const card = document.createElement('button');
      card.className = 'pick-card' + (i === 0 ? ' active' : '');
      card.dataset.station = id;
      const tagClass = s.status === 'active' ? 'live' : 'hist';
      card.innerHTML = `
        <span class="tag ${tagClass}">${s.statusLabel}</span>
        <h3>${s.name}</h3>
        <div class="meta">${s.latDMS} &nbsp;·&nbsp; ${s.lonDMS} &nbsp;·&nbsp; ${s.elevation} m ASL</div>
        <p>${s.subtitle} — established ${s.established}.</p>`;
      card.addEventListener('click', () => {
        [...this.el.stationPick.children].forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.selectedStation = id;
      });
      this.el.stationPick.appendChild(card);
    });
    this.selectedStation = 'maitri';
  }

  showMenu() {
    this.el.menu.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    if (!this._menuSnow) {
      this._menuSnow = new PixelSnow($('menu-snow'), SNOW_OPTS);
    }
  }
  hideMenu() {
    this.el.menu.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    if (this._menuSnow) { this._menuSnow.dispose(); this._menuSnow = null; }
  }

  /* ================================================================ HUD */
  _buildCompass() {
    // A 720° strip so it can scroll continuously without a seam.
    const marks = [];
    for (let d = -180; d <= 540; d += 15) {
      const n = ((d % 360) + 360) % 360;
      const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[n];
      marks.push(`<i class="${card ? 'card' : ''}">${card || (n % 45 === 0 ? n : '·')}</i>`);
    }
    this.el.compass.innerHTML = marks.join('');
    this._compassSpan = 15;      // degrees per mark
    this._markWidth = 34;        // px per mark, matches CSS
    this._compassBase = -180;    // degrees of the first mark
    // Measured once here and on resize; never from the per-frame path.
    this._measureCompass();
    if (!this._compassResizeBound) {
      this._compassResizeBound = true;
      window.addEventListener('resize', () => this._measureCompass());
      window.addEventListener('orientationchange', () => this._measureCompass());
    }
  }

  /**
   * Per-frame HUD refresh.
   *
   * THIS RUNS SIXTY TIMES A SECOND AND IT MUST NOT TOUCH LAYOUT.
   *
   * The original wrote the compass transform and then, on the very next line,
   * read `parentElement.clientWidth`. A style write dirties layout; a geometry
   * read forces the browser to flush it synchronously. Doing both every frame
   * is a forced reflow every frame, on the main thread, in direct competition
   * with WebGL submission.
   *
   * Standing still it cost nothing, because the transform string came out
   * identical and the engine skipped the invalidation. The moment the player
   * moved or turned, the heading changed every frame, the transform changed
   * every frame, and every frame paid for a full synchronous layout. That is
   * the whole "perfectly smooth until I walk, then the game sticks" bug — and
   * it is why it happened just as badly on an RTX 4060 as anywhere else. It
   * was never the GPU.
   *
   * Two rules now: the container width is measured on resize and cached, never
   * read here; and every text node is compared before it is written, so an
   * unchanged value costs nothing at all.
   */
  updateHUD({ station, heading, temp, wind, clock, objective, objDist }) {
    const prev = this._hudPrev || (this._hudPrev = {});
    const put = (key, node, value) => {
      if (prev[key] === value) return;
      prev[key] = value;
      node.textContent = value;
    };

    if (station) put('station', this.el.site, station);
    if (temp !== undefined) put('temp', this.el.temp, `${Math.round(temp)} °C`);
    if (wind !== undefined) put('wind', this.el.wind, `${Math.round(wind)} kt`);
    if (clock) put('clock', this.el.clock, clock);

    if (heading !== undefined) {
      // Centre the mark for `heading` under the fixed needle. Mark i sits at
      // i*markWidth, so its centre is i*markWidth + markWidth/2; the strip is
      // translated so that centre lands on the container's midpoint.
      //
      // The midpoint is cached (see _measureCompass) precisely so this does
      // not read layout. Quantised to whole pixels as well: sub-pixel changes
      // are invisible and only serve to invalidate the compositor every frame.
      const w = this._markWidth;
      const i = (heading - this._compassBase) / this._compassSpan;
      const x = Math.round(this._compassMid - (i * w + w / 2));
      if (prev.compassX !== x) {
        prev.compassX = x;
        this.el.compass.style.transform = `translateX(${x}px)`;
      }
    }

    if (objective !== undefined) put('objective', this.el.objText, objective);
    if (objDist !== undefined) {
      put('objDist', this.el.objDist, objDist == null ? '' : `${Math.round(objDist)} m`);
    }
  }

  /**
   * Measure the compass container once, and again whenever the window changes.
   * Everything the per-frame path needs is read here instead of there.
   */
  _measureCompass() {
    const parent = this.el.compass && this.el.compass.parentElement;
    this._compassMid = ((parent && parent.clientWidth) || 230) / 2;
  }


  setPrompt(text) {
    if (text) {
      this.el.promptText.textContent = text;
      this.el.prompt.classList.remove('hidden');
      this.el.reticle.classList.add('hot');
    } else {
      this.el.prompt.classList.add('hidden');
      this.el.reticle.classList.remove('hot');
    }
  }

  /**
   * The always-on minimap — distinct from the full-screen strategic map
   * (M). North-up, not player-relative-rotating: rotating the whole world
   * every frame is a well-known source of minor motion sickness in young
   * players, and north-up is also just easier for a first-time player to
   * correlate against the compass bar, which is already north-referenced.
   * Only the player's own arrow rotates.
   *
   * Cheap by construction: a 176×176 canvas, a handful of arcs and one
   * triangle, redrawn every frame. On a scene already pushing shadowed
   * WebGL geometry, a few 2D canvas primitives are immeasurably small by
   * comparison — no throttling needed to keep this "always smooth".
   */
  drawMinimap({ x, z, heading, interactables, collected, radius = 55 }) {
    const cv = this.el.minimapCanvas;
    if (!cv) return;
    const W = cv.width, H = cv.height;
    const g = cv.getContext('2d');
    const scale = (W / 2 - 10) / radius;   // px per world metre
    const project = (wx, wz) => [W / 2 + (wx - x) * scale, H / 2 + (wz - z) * scale];

    g.clearRect(0, 0, W, H);
    // Ground tint + faint range rings so distance reads at a glance.
    g.fillStyle = 'rgba(18,32,48,0.55)';
    g.beginPath(); g.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(150,200,240,0.14)'; g.lineWidth = 1;
    for (const r of [radius / 3, radius * 2 / 3]) {
      g.beginPath(); g.arc(W / 2, H / 2, r * scale, 0, Math.PI * 2); g.stroke();
    }

    // Interactables within range.
    for (const it of interactables || []) {
      const dx = it.worldPosition.x - x, dz = it.worldPosition.z - z;
      const d = Math.hypot(dx, dz);
      if (d > radius * 1.15) continue;
      const [px, py] = project(it.worldPosition.x, it.worldPosition.z);
      const done = collected?.has(it.id);
      g.beginPath();
      g.arc(px, py, it.isNpc ? 3.2 : 2.6, 0, Math.PI * 2);
      g.fillStyle = done ? 'rgba(150,180,200,0.55)' : (it.isNpc ? '#7ef0a0' : (it.opensCodex ? '#ffcf5c' : '#5fd9ff'));
      g.fill();
      if (!done) {
        g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1; g.stroke();
      }
    }

    // Player arrow, fixed at centre, rotated to heading. heading is
    // 0=north(-Z)/clockwise, matching the compass bar's convention.
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate((heading || 0) * Math.PI / 180);
    g.beginPath();
    g.moveTo(0, -8); g.lineTo(5.5, 7); g.lineTo(0, 4); g.lineTo(-5.5, 7);
    g.closePath();
    g.fillStyle = '#ff9933';
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1; g.stroke();
    g.restore();
  }

  toast(title, body, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.innerHTML = `<div class="t-title">${title}</div>${body ? `<div class="t-body">${body}</div>` : ''}`;
    this.el.toasts.appendChild(t);
    const id = setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 320);
      this._toastTimers.delete(id);
    }, 4200);
    this._toastTimers.add(id);
    // Never let the stack grow past four.
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }

  /**
   * Blizzard HUD banner. Built lazily on first use rather than living in
   * index.html — this is the one HUD element that's absent almost the whole
   * game and only needs to exist for the minutes a storm cell is passing
   * through.
   */
  /**
   * Full-screen fade, driven frame-by-frame by main.js's faint sequence
   * (0 = clear, 1 = fully black). Built lazily, same reasoning as the
   * blizzard banner — this exists for a couple of seconds at a time, not
   * for the whole session, so it doesn't belong in index.html's static markup.
   */
  setFade(opacity) {
    if (!this._fadeEl) {
      const f = document.createElement('div');
      f.style.cssText = 'position:absolute;inset:0;background:#000;pointer-events:none;z-index:20;opacity:0';
      this.el.hud.appendChild(f);
      this._fadeEl = f;
    }
    this._fadeEl.style.opacity = String(opacity);
  }

  /**
   * Blue underwater tint, toggled by Player.underwater. Previously going
   * underwater had no visual treatment of its own at all — combined with
   * the sea plane being invisible from below (a separate, now-fixed bug),
   * "underwater" didn't read as underwater, it read as the water having
   * disappeared and the world going wrong.
   */
  setUnderwater(active) {
    if (this._underwaterActive === active) return;
    this._underwaterActive = active;
    if (!this._underwaterEl) {
      const u = document.createElement('div');
      u.style.cssText = 'position:absolute;inset:0;background:radial-gradient(120% 100% at 50% 30%,rgba(20,70,110,.25),rgba(8,35,55,.55));pointer-events:none;z-index:15;opacity:0;transition:opacity .6s ease';
      this.el.hud.appendChild(u);
      this._underwaterEl = u;
    }
    this._underwaterEl.style.opacity = active ? '1' : '0';
  }

  setBlizzard(active) {
    if (this._blizzardActive === active) return;
    this._blizzardActive = active;
    if (!this._blizzardEl) {
      const b = document.createElement('div');
      b.className = 'blizzard-banner hidden';
      b.textContent = '⚠ BLIZZARD — visibility low, follow the route markers';
      this.el.hud.appendChild(b);
      this._blizzardEl = b;
    }
    this._blizzardEl.classList.toggle('hidden', !active);
  }

  /* ============================================================== codex */
  _buildCodexNav() {
    this.el.codexNav.innerHTML = '';
    CATEGORIES.forEach(c => {
      const b = document.createElement('button');
      b.dataset.cat = c.id;
      b.innerHTML = `${c.label}<span class="count" data-count="${c.id}"></span>`;
      b.addEventListener('click', () => { this.activeCat = c.id; this.renderCodex(); });
      this.el.codexNav.appendChild(b);
    });
  }

  collect(entryId) {
    if (this.collected.has(entryId)) return false;
    if (!ENTRY_BY_ID[entryId]) return false;
    this.collected.add(entryId);
    this.el.collected.textContent = this.collected.size;
    const e = ENTRY_BY_ID[entryId];
    this.toast(`${e.kind} archived`, e.title, 'good');
    return true;
  }

  renderCodex() {
    // Nav counts + active state.
    CATEGORIES.forEach(c => {
      const inCat = ENTRIES.filter(e => e.cat === c.id);
      const got = inCat.filter(e => this.collected.has(e.id)).length;
      const span = this.el.codexNav.querySelector(`[data-count="${c.id}"]`);
      if (span) span.textContent = `${got}/${inCat.length}`;
      const btn = this.el.codexNav.querySelector(`[data-cat="${c.id}"]`);
      if (btn) btn.classList.toggle('active', c.id === this.activeCat);
    });

    // List.
    const list = ENTRIES.filter(e => e.cat === this.activeCat);
    this.el.codexList.innerHTML = '';
    list.forEach(e => {
      const has = this.collected.has(e.id);
      const div = document.createElement('div');
      div.className = `entry cat-${e.cat}` + (has ? '' : ' locked') + (this.activeEntry === e.id ? ' active' : '');
      div.innerHTML = `
        <span class="e-spine" aria-hidden="true"></span>
        <span class="e-text">
          <span class="e-kind">${has ? e.kind : 'Not yet recovered'}</span>
          <span class="e-title">${has ? e.title : '— — — — —'}</span>
        </span>`;
      if (has) div.addEventListener('click', () => { this.activeEntry = e.id; this.renderCodex(); });
      this.el.codexList.appendChild(div);
    });

    // Detail.
    const e = this.activeEntry ? ENTRY_BY_ID[this.activeEntry] : null;
    if (!e || !this.collected.has(e.id)) {
      const got = this.collected.size;
      this.el.codexDetail.innerHTML = `<div class="empty">
        ${got === 0
          ? 'The archive is empty.<br>Go outside and find something.'
          : 'Select a record from the list.'}
      </div>`;
      return;
    }

    const st = STATIONS[e.station];
    this.el.codexDetail.innerHTML = `
      <div class="book-header">
        <div class="book-cover-3d cat-${e.cat}">
          <div class="book-cover-face">
            <span class="bc-kind">${e.kind}</span>
            <span class="bc-title">${e.title}</span>
            <span class="bc-org">NPDA</span>
          </div>
          <div class="book-cover-spine" aria-hidden="true"></div>
          <div class="book-cover-pages" aria-hidden="true"></div>
        </div>
        <div class="book-header-text">
          <h3>${e.title}</h3>
          <div class="d-meta">
            <span class="pill">${e.kind}</span>
            ${(e.pills || []).map(p => `<span class="pill">${p}</span>`).join('')}
            ${st ? `<span class="pill">${st.name}</span>` : ''}
          </div>
        </div>
      </div>
      ${e.body.map(p => `<p>${md(p)}</p>`).join('')}
      ${e.figure ? `<figure class="figure"><canvas id="fig-canvas"></canvas><figcaption id="fig-cap"></figcaption></figure>` : ''}
      ${e.table ? `<table><tbody>${e.table.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</tbody></table>` : ''}
      <div class="src">Compiled for the National Polar Data Archive · Ministry of Earth Sciences / NCPOR.
      Figures are illustrative of the published shape of each record.</div>`;

    if (e.figure && FIGURES[e.figure]) {
      const cv = $('fig-canvas');
      const cap = FIGURES[e.figure](cv);
      $('fig-cap').textContent = cap;
    }
  }

  openCodex() {
    this.el.codex.classList.remove('hidden');
    if (!this.activeEntry) {
      const first = ENTRIES.find(x => this.collected.has(x.id));
      if (first) { this.activeEntry = first.id; this.activeCat = first.cat; }
    }
    this.renderCodex();
    this.game?.setPaused(true);
  }
  closeCodex() { this.el.codex.classList.add('hidden'); this.game?.setPaused(false); }

  /* ================================================================ map */
  openMap() {
    this.el.map.classList.remove('hidden');
    this.drawMap();
    this.game?.setPaused(true);
  }
  closeMap() { this.el.map.classList.add('hidden'); this.game?.setPaused(false); }

  drawMap() {
    const cv = this.el.mapCanvas;
    const rect = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(300, rect.width), H = Math.max(240, rect.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    // Polar stereographic-ish projection about the South Pole.
    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) * 0.42;
    const project = (lat, lon) => {
      // 0 at the pole, 1 at 60°S.
      const k = (90 + lat) / 30;
      const a = (lon - 90) * Math.PI / 180;
      return [cx + Math.cos(a) * R * k, cy + Math.sin(a) * R * k];
    };

    // Continent disc.
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    grd.addColorStop(0, 'rgba(224,240,252,0.95)');
    grd.addColorStop(0.75, 'rgba(186,214,236,0.85)');
    grd.addColorStop(1, 'rgba(120,160,196,0.25)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();

    // Latitude rings.
    g.strokeStyle = 'rgba(20,50,80,0.22)'; g.lineWidth = 1;
    [70, 80].forEach(latAbs => {
      const k = (90 - latAbs) / 30;
      g.beginPath(); g.arc(cx, cy, R * k, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(20,50,80,0.5)';
      g.font = '10px "JetBrains Mono", monospace'; g.textAlign = 'center';
      g.fillText(`${latAbs}°S`, cx, cy - R * k - 4);
    });
    // Meridians.
    for (let lon = 0; lon < 360; lon += 30) {
      const [x, y] = project(-60, lon);
      g.strokeStyle = 'rgba(20,50,80,0.13)';
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke();
    }

    // Stations. Maitri and Dakshin Gangotri sit only 15 km apart in reality —
    // at this map's ~1,500 km projection radius their dots land almost on
    // the same pixel, so a naive "label to the side of the dot" placement
    // stacks both names on top of each other into an unreadable smear.
    // Any dot within a small pixel radius of an earlier one gets its label
    // pushed to a free vertical slot instead of overlapping it.
    const cur = this.game?.stationId;
    const placed = [];   // {x, y} of label anchors already used, for collision checks
    const CLUSTER_PX = 18;

    STATION_ORDER.forEach(id => {
      const s = STATIONS[id];
      const [x, y] = project(s.lat, s.lon);
      const active = id === cur;
      const col = s.status === 'active' ? (active ? '#ff9933' : '#1f7a4d') : '#b08020';

      g.beginPath(); g.arc(x, y, active ? 9 : 6, 0, Math.PI * 2);
      g.fillStyle = col; g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.stroke();

      if (active) {
        g.beginPath(); g.arc(x, y, 15, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(255,153,51,0.6)'; g.lineWidth = 1.5; g.stroke();
      }

      const side = x > cx ? 1 : -1;
      let labelY = y;
      // Try the dot's own row first, then step up/down until clear of every
      // label already placed nearby (on either side — two dots this close
      // can still fall on opposite sides of centre).
      const clearOf = (ly) => placed.every(p => Math.abs(p.x - x) > 70 || Math.abs(p.y - ly) > 13);
      if (!clearOf(labelY)) {
        let offset = 16;
        while (!clearOf(y + offset) && !clearOf(y - offset)) offset += 16;
        labelY = clearOf(y + offset) ? y + offset : y - offset;
      }
      placed.push({ x, y: labelY });

      // A short leader line whenever the label had to move off the dot's own
      // row, so it's still obvious which name belongs to which point.
      if (labelY !== y) {
        g.strokeStyle = 'rgba(12,36,56,0.4)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + side * 10, labelY); g.stroke();
      }

      g.fillStyle = '#0c2438';
      g.font = '700 12px Inter, sans-serif';
      g.textAlign = side > 0 ? 'left' : 'right';
      g.textBaseline = 'middle';
      g.fillText(s.name, x + side * 14, labelY);
    });

    // Maitri ↔ Bharati separation, the fact that surprises everyone.
    const [ax, ay] = project(STATIONS.maitri.lat, STATIONS.maitri.lon);
    const [bx, by] = project(STATIONS.bharati.lat, STATIONS.bharati.lon);
    g.strokeStyle = 'rgba(12,36,56,0.35)'; g.setLineDash([5, 5]); g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#0c2438'; g.font = '600 11px Inter, sans-serif';
    g.textAlign = 'center';
    g.fillText(`${Math.round(distanceKm('maitri', 'bharati')).toLocaleString('en-IN')} km straight-line`,
      (ax + bx) / 2, (ay + by) / 2 - 8);

    // Legend.
    this.el.mapLegend.innerHTML = `
      <h4>India in Antarctica</h4>
      ${STATION_ORDER.map(id => {
        const s = STATIONS[id];
        const col = s.status === 'active' ? '#1f7a4d' : '#b08020';
        return `<div class="row"><span class="dot" style="background:${col}"></span>
          <span><b style="color:#dcefff">${s.name}</b> — ${s.statusLabel}</span></div>
          <div style="margin:0 0 10px 17px;font-size:11px;color:#6c8399">
            ${s.latDMS} ${s.lonDMS}<br>${s.subtitle}</div>`;
      }).join('')}
      <div style="margin-top:14px;border-top:1px solid rgba(150,200,240,.18);padding-top:12px">
        Maitri and Dakshin Gangotri sit about <b style="color:#dcefff">15 km</b> apart.
        Bharati is <b style="color:#dcefff">${Math.round(distanceKm('maitri','bharati')).toLocaleString('en-IN')} km</b>
        away as the crow flies — but roughly <b style="color:#dcefff">3,000 km</b> by the
        actual sea and coastal route, since nothing goes straight through
        Antarctica's interior. Either way, it's further from Maitri than Delhi is from Chennai.
      </div>`;
  }

  /* ============================================================== pause */
  _buildSettings() {
    this.el.settings.innerHTML = `
      <div class="setting"><span>Graphics</span>
        <div class="seg" id="seg-quality">
          <button data-q="low">Low</button>
          <button data-q="medium">Medium</button>
          <button data-q="high">High</button>
        </div>
      </div>
      <div class="setting"><span>Look sensitivity</span>
        <input type="range" id="set-sens" min="0.3" max="2.5" step="0.1" value="1">
      </div>
      <div class="setting"><span>Blowing snow</span>
        <input type="range" id="set-snow" min="0" max="1" step="0.05" value="0.45">
      </div>`;

    this.el.settings.querySelectorAll('#seg-quality button').forEach(b => {
      b.addEventListener('click', () => {
        this.game?.setQuality(b.dataset.q);
        this._syncSettings();
      });
    });
    $('set-sens').addEventListener('input', e => this.game?.setSensitivity(+e.target.value));
    $('set-snow').addEventListener('input', e => this.game?.setSnow(+e.target.value));
  }

  _syncSettings() {
    const q = this.game?.engine?.quality;
    this.el.settings.querySelectorAll('#seg-quality button')
      .forEach(b => b.classList.toggle('on', b.dataset.q === q));
  }

  openPause() { this.el.pause.classList.remove('hidden'); this._syncSettings(); this.game?.setPaused(true); }
  closePause() { this.el.pause.classList.add('hidden'); this.game?.setPaused(false); }

  /* ========================================================== bug report */
  openBugReport() {
    this.el.pause.classList.add('hidden');
    this.el.bugreport.classList.remove('hidden');
  }
  closeBugReport() {
    this.el.bugreport.classList.add('hidden');
    this.el.pause.classList.remove('hidden');
  }

  _addBugFiles(fileList) {
    for (const file of fileList) {
      if (!file.type.startsWith('image/')) continue;
      if (this._bugFiles.length >= 5) break;
      this._bugFiles.push(file);
      const thumb = document.createElement('div');
      thumb.className = 'bug-thumb';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        const i = this._bugFiles.indexOf(file);
        if (i !== -1) this._bugFiles.splice(i, 1);
        thumb.remove();
      });
      thumb.append(img, remove);
      this.el.bugThumbs.appendChild(thumb);
    }
  }

  _resetBugForm() {
    this.el.bugDesc.value = '';
    this.el.bugFiles.value = '';
    this.el.bugThumbs.innerHTML = '';
    this._bugFiles = [];
    this.el.bugError.classList.add('hidden');
    this.el.bugSuccess.classList.add('hidden');
  }

  async _submitBugReport() {
    const description = this.el.bugDesc.value.trim();
    this.el.bugError.classList.add('hidden');
    this.el.bugSuccess.classList.add('hidden');
    if (!description) {
      this.el.bugError.textContent = 'Describe what happened before sending.';
      this.el.bugError.classList.remove('hidden');
      return;
    }

    this.el.bugSubmit.disabled = true;
    this.el.bugSubmit.textContent = 'Sending…';
    try {
      // A client-generated ID lets screenshots upload to their final path
      // BEFORE the Firestore doc is created, so the doc can be written once,
      // complete, satisfying the create-only security rule (no update rule
      // exists — nobody can edit a report after it's sent).
      const reportRef = doc(collection(db, 'bugReports'));
      const paths = [];
      for (let i = 0; i < this._bugFiles.length; i++) {
        try {
          const file = this._bugFiles[i];
          const path = `bug-reports/${reportRef.id}/${i}-${file.name}`;
          await uploadBytes(ref(storage, path), file);
          paths.push(path);
        } catch { /* best-effort: a failed/blocked image shouldn't lose the report */ }
      }

      await setDoc(reportRef, {
        description,
        screenshots: paths,
        station: this.game?.stationId ?? null,
        url: location.href,
        userAgent: navigator.userAgent,
        createdAt: Date.now(),
        createdAtServer: serverTimestamp()
      });

      this._resetBugForm();
      this.el.bugSuccess.classList.remove('hidden');
      setTimeout(() => this.closeBugReport(), 1400);
    } catch (err) {
      this.el.bugError.textContent = err instanceof Error ? err.message : 'Could not send — try again.';
      this.el.bugError.classList.remove('hidden');
    } finally {
      this.el.bugSubmit.disabled = false;
      this.el.bugSubmit.textContent = 'Send report';
    }
  }

  /* ========================================================== minigame */
  openMini(html, { onMount } = {}) {
    this.el.miniShell.innerHTML = html;
    this.el.mini.classList.remove('hidden');
    this.game?.setPaused(true);
    onMount?.(this.el.miniShell);
  }
  closeMini() {
    this.el.mini.classList.add('hidden');
    this.el.miniShell.innerHTML = '';
    this.game?.setPaused(false);
  }

  get anyOverlayOpen() {
    return ['codex', 'map', 'mini', 'pause', 'bugreport'].some(k => !this.el[k].classList.contains('hidden'));
  }

  closeAllOverlays() {
    this.el.codex.classList.add('hidden');
    this.el.map.classList.add('hidden');
    this.el.mini.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.bugreport.classList.add('hidden');
    this.el.miniShell.innerHTML = '';
  }

  /* ============================================================== wiring */
  _wire() {
    $('codex-close').addEventListener('click', () => this.closeCodex());
    $('map-close').addEventListener('click', () => this.closeMap());
    $('btn-resume').addEventListener('click', () => this.closePause());
    $('btn-quit').addEventListener('click', () => { this.closeAllOverlays(); this.game?.returnToMenu(); });
    $('btn-travel').addEventListener('click', () => { this.closeAllOverlays(); this.game?.returnToMenu(); });
    $('btn-main-site').addEventListener('click', () => { window.location.href = 'https://iia-public.web.app'; });
    $('btn-bugreport').addEventListener('click', () => this.openBugReport());
    $('btn-bugreport-cancel').addEventListener('click', () => this.closeBugReport());
    $('btn-bugreport-submit').addEventListener('click', () => this._submitBugReport());
    this.el.bugFiles.addEventListener('change', () => {
      this._addBugFiles(this.el.bugFiles.files);
      this.el.bugFiles.value = '';
    });
    $('btn-start').addEventListener('click', () => {
      // Requested here, synchronously inside the click handler, rather than
      // only at the tail of Game.start()'s long async load chain (many
      // `await frame(...)` steps deep). A pointer-lock request loses its
      // claim to "this came from a real click" the further it drifts from
      // the click itself — and on top of that, if the pause menu that led
      // here was opened with Escape (as it normally is), the browser
      // imposes a short cooldown on re-locking right after an Escape-driven
      // exit. Either one landing on the request at the end of start() was
      // enough to have it silently refused, which used to leave the player
      // with no mouselook for the rest of the session after switching
      // stations. Firing it right here, on the click, sidesteps both.
      if (!this.game?.input.touch) this.game?.input.requestLock();
      this.game?.start(this.selectedStation);
    });

    // Click the backdrop (not the panel) to dismiss.
    [['codex', () => this.closeCodex()], ['map', () => this.closeMap()], ['pause', () => this.closePause()],
     ['bugreport', () => this.closeBugReport()]]
      .forEach(([k, fn]) => {
        this.el[k].addEventListener('mousedown', e => { if (e.target === this.el[k]) fn(); });
      });

    window.addEventListener('resize', () => {
      if (!this.el.map.classList.contains('hidden')) this.drawMap();
    });
  }
}

/** Minimal inline markdown: **bold** and *emphasis*. */
function md(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>');
}
