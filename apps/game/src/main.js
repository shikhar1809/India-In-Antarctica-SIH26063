import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { Sky } from './world/Sky.js';
import { Terrain } from './world/Terrain.js';
import { Weather } from './world/Weather.js';
import { scatterBoulders, scatterDrifts, Beacon } from './world/Props.js';
import { Player } from './player/Player.js';
import { buildMaitri } from './stations/MaitriStation.js';
import { buildSite } from './stations/site.js';
import { UI } from './ui/UI.js';
import { MINIGAMES } from './game/minigames.js';
import { SIDEQUEST_MINIGAMES } from './game/sidequest-minigames.js';
import { STATIONS } from './data/stations.js';
import { Preloader, warmUp } from './ui/Preloader.js';
import { SceneCuller } from './core/Culler.js';
import { ENTRY_BY_ID } from './data/archive.js';
import { damp, clamp } from './core/noise.js';
import { fetchRealWeather } from './world/WeatherAPI.js';
import { HelicopterFlight } from './world/Helicopter.js';
import { buildSupplyCrew, buildNPC } from './stations/NPCs.js';

// Side-quest minigames are kept in their own module (see sidequest-minigames.js)
// so that content could be built without touching minigames.js while it was
// under concurrent edit — merged here so `it.minigame` resolves the same way
// regardless of which file actually defines it.
const ALL_MINIGAMES = { ...MINIGAMES, ...SIDEQUEST_MINIGAMES };

/**
 * Game — the orchestrator.
 *
 * Owns the engine, the loaded site, the player and the UI, and does exactly
 * three things every frame: step the world, test for a nearby interactable,
 * and push numbers at the HUD.
 */
class Game {
  constructor() {
    this.canvas = document.getElementById('viewport');
    this.engine = new Engine(this.canvas);
    // Debug handle. Performance on this project has been diagnosed by
    // inference more than once and been wrong for it; a live handle to the
    // renderer, the scene and the player is what makes it measurable instead.
    window.__game = this;
    this.ui = new UI(this);

    this.input = new Input(this.canvas, {
      root: document.getElementById('touch'),
      stick: document.getElementById('stick'),
      knob: document.getElementById('stick-knob'),
      action: document.getElementById('tbtn-act'),
      runBtn: document.getElementById('tbtn-run')
    });
    // Drives the HUD layout in style.css — see the touch-safe padding rule.
    document.body.classList.toggle('touch-input', this.input.touch);

    this.paused = true;
    this.inWorld = false;
    this._loadingWorld = false;
    this.stationId = null;
    this.site = null;
    this.beacons = [];
    this.nearest = null;
    this.clockMinutes = 14 * 60 + 20;   // station time, drives the HUD clock

    this._bindKeys();
    this._bindOrientationLock();
    this.engine.add((dt, t) => this.update(dt, t));
    this.engine.start();

    this._boot();
  }

  /**
   * Mobile portrait gets a "turn your phone sideways" screen instead of the
   * game — a first-person 3D view in a tall, narrow strip is close to
   * unplayable, and the touch controls (stick + action buttons) were laid
   * out assuming landscape width to begin with.
   *
   * The boot splash and the main menu are ordinary responsive UI, so they're
   * left free to run in portrait — the lock only engages once a station
   * actually starts loading (`this._loadingWorld`, set in `start()`) through
   * to actual gameplay (`this.inWorld`), and lifts again back at the menu
   * (`returnToMenu()`).
   *
   * `screen.orientation.lock()` is attempted opportunistically (it only
   * actually works in a handful of browsers, and only in fullscreen/PWA
   * contexts) — the CSS prompt is the reliable path everywhere else, so the
   * lock call's success or failure doesn't change what the user sees.
   */
  _bindOrientationLock() {
    const el = document.getElementById('rotate-lock');
    if (!el) return;

    this._checkOrientation = () => {
      const portrait = window.innerHeight > window.innerWidth;
      const wantsLandscape = this.inWorld || this._loadingWorld;
      const show = this.input.touch && portrait && wantsLandscape;
      el.classList.toggle('hidden', !show);
      // Don't leave the player standing exposed (or the pointer lock
      // fighting for focus) behind a screen they can't see past.
      if (show && this.inWorld && !this.paused) this.setPaused(true);

      if (this.input.touch) {
        try {
          if (wantsLandscape) screen.orientation?.lock?.('landscape').catch(() => {});
          else screen.orientation?.unlock?.();
        } catch { /* not supported here — the CSS prompt covers it */ }
      }
    };

    this._checkOrientation();
    window.addEventListener('resize', this._checkOrientation);
    window.addEventListener('orientationchange', this._checkOrientation);
  }

  /* =============================================================== boot */
  async _boot() {
    const steps = [
      [0.15, 'Initialising renderer…'],
      [0.35, 'Compiling shaders…'],
      [0.55, 'Charting the Southern Ocean…'],
      [0.75, 'Loading station records…'],
      [1.00, 'Ready']
    ];
    for (const [p, msg] of steps) {
      this.ui.setBoot(p, msg);
      await frame(90);
    }
    // A neutral backdrop so the menu is not sitting on a black void.
    this.engine.scene.background = new THREE.Color(0x0a1a2b);
    await frame(200);
    this.ui.hideBoot();
    this.ui.showMenu();
  }

  /* ============================================================== start */
  async start(stationId = 'maitri') {
    this._loadingWorld = true;
    this._checkOrientation?.();
    this.ui.setBoot(0.05, `Deploying to ${STATIONS[stationId].name}…`);
    this.ui.showBoot();
    // The word stage runs for a guaranteed minimum while everything below is
    // built and warmed. It is not padding: the build, the shader compile and
    // the texture upload all happen inside it, so that cost is never paid
    // mid-play.
    this._preloader = new Preloader(this.ui.el.bootWord, 15000);
    this._preloader.begin();
    await frame(60);

    this.unloadSite();
    this.stationId = stationId;
    const S = STATIONS[stationId];

    // Kicked off now, awaited later — by the time Sky/Weather actually need
    // it, terrain generation below has already spent real time, so this
    // rarely adds any perceived wait. Never blocks or fails boot: see
    // WeatherAPI.js for why every caller must survive it returning nulls.
    const livePromise = fetchRealWeather(S.lat, S.lon);

    this.ui.setBoot(0.3, 'Generating terrain…');
    await frame(40);

    this.terrain = new Terrain(this.engine, S.world.terrain, hashSeed(stationId));

    this.ui.setBoot(0.55, 'Raising the station…');
    await frame(40);

    const live = await livePromise;
    this.liveWeather = live.source === 'live' ? live : null;
    if (this.liveWeather) {
      this.ui.setBoot(0.6, `Live conditions: ${Math.round(live.tempC)}°C, ${Math.round(live.windKt)} kt…`);
      await frame(150);
    }
    // Live wind/temp refine the station's baseline; live data is trusted for
    // atmosphere, but the station's own hand-placed sun angle/skyTint (the
    // things that make each site look distinct) are never overridden by it.
    const worldCfg = this.liveWeather
      ? { ...S.world, tempC: live.tempC, windKt: live.windKt }
      : S.world;

    this.sky = new Sky(this.engine, worldCfg);
    // Baseline (calm-weather) intensity — a passing blizzard cell layers on
    // top of this in update(), rather than overwriting it, so a manual snow
    // slider or a genuinely calm live reading is still what the world
    // returns to once the storm passes.
    this._baseSnowIntensity = this.snowLevel ?? (this.liveWeather ? weatherIntensityFromLive(live) : 0.6);
    this._baseOvercast = clamp(this._baseSnowIntensity * 0.4, 0, 1);
    this._blizzard = { state: 'calm', timer: 20 + Math.random() * 30, factor: 0 };
    this.weather = new Weather(this.engine, {
      windKt: worldCfg.windKt,
      windDir: this.liveWeather ? THREE.MathUtils.degToRad(live.windDirDeg) : undefined,
      intensity: this._baseSnowIntensity
    });

    this.site = buildSite(this.engine, this.terrain, stationId);
    this.engine.scene.add(this.site.root);

    this.helicopter = new HelicopterFlight(this.engine.scene, {
      terrain: this.terrain, padX: this.site.pad.x, padZ: this.site.pad.z
    });
    this.helicopter.onArrive = (msg) => this.ui.toast('Resupply flight', msg, 'good');
    this.helicopter.onUnload = (msg) => this.ui.toast('Cargo delivered', msg, 'good');
    this.helicopter.onDepart = (msg) => this.ui.toast('Resupply flight', msg, '');

    // A ground crew that actually waits for the helicopter to put a crate
    // down, walks out and picks it up (a visible carried prop, not empty
    // hands), and carries it all the way into the station's storage bay —
    // gated on HelicopterFlight.cargoAvailable rather than running on its
    // own independent timer, so it genuinely reacts to the delivery instead
    // of coincidentally being near the pad. Only stations with a modelled
    // storage bay (Maitri, Bharati) get one.
    if (this.site.storagePoint && this.site.entranceInside && this.site.entranceOutside) {
      // Offset from the crate's own centre (landX+3.4, landZ-2.2) — standing
      // exactly on top of it, as the crew's original target did, reads as
      // "walked inside the cargo" rather than "arrived next to it".
      const dropPoint = { x: this.helicopter.landX + 3.4, z: this.helicopter.landZ - 2.2 + 2.4 };
      // The real route: out of storage, through the door, down the stairs,
      // out onto the apron, then one more dynamic leg to wherever the crate
      // actually landed — not a straight line cut under the building.
      const path = [this.site.storagePoint, this.site.entranceInside, this.site.entranceOutside];
      // Different two people, in a different colour parka, at each station
      // — buildSupplyCrew is the same shared code either way, and without
      // this both stations' ground crews were literally the same two named
      // people wearing the same gear.
      const SUPPLY_CREW_BY_STATION = {
        bharati: { names: ['Karan Bisht', 'Sanjay Oraon'], parka: 0xff9933, parkaDark: 0xb36b1f },
        maitri: { names: ['Lobsang Chophel', 'Naveen Pillai'], parka: 0x2f6b8f, parkaDark: 0x204a63 }
      };
      const crewLook = SUPPLY_CREW_BY_STATION[stationId] ?? SUPPLY_CREW_BY_STATION.bharati;
      this.supplyCrew = buildSupplyCrew(path, this.terrain, {
        cargoReady: () => this.helicopter?.cargoAvailable,
        getDropPoint: () => dropPoint,
        onPickup: () => this.helicopter?.claimCargo(),
        speed: 1.7,
        names: crewLook.names, parka: crewLook.parka, parkaDark: crewLook.parkaDark
      });
      for (const grp of this.supplyCrew.groups) this.site.root.add(grp);
      this.site.interactables.push(...this.supplyCrew.interactables);
    } else {
      this.supplyCrew = null;
    }

    this.ui.setBoot(0.8, 'Scattering the moraine…');
    await frame(40);
    this.boulders = scatterBoulders(this.engine, this.terrain, { seed: hashSeed(stationId) ^ 77 });
    this.drifts = scatterDrifts(this.engine, this.terrain, { seed: hashSeed(stationId) ^ 91 });

    // Beacons for every interactable in the site.
    this.beacons = this.site.interactables.map(it => {
      const b = new Beacon(this.engine.scene, it.worldPosition, {
        color: it.color ?? 0x5fd9ff, height: it.beaconHeight ?? 8,
        light: this.engine.quality !== 'low'
      });
      if (this.ui.collected.has(it.id)) b.markCollected();
      return b;
    });

    this.player = new Player(this.engine, this.terrain, this.input);
    // The delivered resupply crate is a purely visual prop that appears long
    // after this static collider list is built, so without this the player
    // could just walk straight through it once it landed. One reusable box,
    // parked far below the map until the helicopter actually has cargo on
    // the ground, then kept in sync with it every frame (see update()).
    this._cargoBox = new THREE.Box3(new THREE.Vector3(0, -999, 0), new THREE.Vector3(0, -998, 0));
    this.site.colliders.push(this._cargoBox);
    this.player.setColliders(this.site.colliders);
    this.player.teleport(this.site.spawn.x, this.site.spawn.z, this.site.spawn.yaw);
    this.player.onFootstep = () => { /* audio hook */ };

    // A weather observer stationed right on the approach — the first person
    // anyone arriving actually passes — reading current conditions off a
    // clipboard. Talking to them reports the SAME live weather this session
    // already fetched for the HUD (this.liveWeather, Open-Meteo reanalysis
    // for this exact station's coordinates) rather than an invented line, so
    // it changes with the real weather instead of being one fixed quote —
    // falling back to the station's synthetic defaults exactly like the HUD
    // does when the live fetch didn't succeed.
    {
      const wx = this.site.spawn.x + 2.6, wz = this.site.spawn.z - 5;
      // A different observer, by name, at each station — the same reason
      // every other shared-code NPC in this file now takes a per-station
      // look: this is main.js, called once per station load either way.
      const WEATHER_OBS_BY_STATION = {
        bharati: 'Ananya Joshi',
        maitri: 'Chetan Bahuguna'
      };
      const weatherObs = buildNPC(
        'technician', { x: wx, z: wz }, Math.atan2(this.site.spawn.x - wx, this.site.spawn.z - wz),
        WEATHER_OBS_BY_STATION[stationId] ?? WEATHER_OBS_BY_STATION.bharati, 'Meteorological Observer',
        ['Checking the readings — one moment.']
      );
      weatherObs.nextLine = () => {
        const live = this.liveWeather;
        if (live) {
          const dir = live.windDirDeg;
          const compass = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(dir / 22.5) % 16];
          return `Current reading: ${live.tempC.toFixed(1)}°C, wind ${live.windKt.toFixed(0)} kt from the ${compass}` +
            (live.snowfallCm > 0 ? `, snowfall ${live.snowfallCm.toFixed(1)} cm/hr.` : ', no snowfall right now.') +
            ' Pulled straight off the live feed, not the station log.';
        }
        return `Can't raise the live feed right now — going off the station's own baseline: around ${S.world.tempC}°C, wind near ${S.world.windKt} kt. I log it by hand when the link drops, same as always.`;
      };
      weatherObs.group.position.set(wx, this.terrain.heightAt(wx, wz), wz);
      this.site.root.add(weatherObs.group);
      this.site.interactables.push({
        id: weatherObs.id, label: weatherObs.label, isNpc: true, npc: weatherObs,
        radius: 3.2,
        worldPosition: new THREE.Vector3(wx, this.terrain.heightAt(wx, wz), wz)
      });
      // Pushed into the SAME array site.js's own update() loop already
      // iterates (`for (const npc of npcs) npc.update(...)`) — no separate
      // update wiring needed, this NPC just becomes one more entry in it.
      this.site.npcs.push(weatherObs);
    }

    this.engine.scene.background = null;
    this.engine.refreshShadows();

    // The world is fully assembled now, so tell the light budget what is in
    // it. Until this runs every authored point light is live, and on a
    // built-out station that is nearly sixty of them being shaded on every
    // pixel of the screen.
    this.engine.lightBudget.rebuild();
    this.engine.lightBudget.update(this.engine.camera, 1);

    // Sector culling. Rooms are their own groups, so hiding one drops its
    // whole furnished subtree before any per-mesh work happens; and standing
    // inside, the outdoor world is dropped entirely.
    // 15 m, not 24: the stations are 50-60 m long linear plans, so a 24 m
    // radius still drew most of the building. Room GROUPS hold furniture only
    // — walls, floors and ceilings were merged into the shell earlier and are
    // always drawn — so culling one never opens a hole in the building, it
    // just drops the contents of a room you cannot resolve through a 1.25 m
    // doorway from fifteen metres away.
    this.culler = new SceneCuller({ radius: 15, floorSpan: 5 });
    {
      let stationRoot = null;
      this.site.root.traverse(o => { if (o.userData && o.userData.rooms) stationRoot = o; });
      const field = this.site.root.getObjectByName('field-kit');
      this.culler.rebuild(stationRoot, stationRoot?.userData.rooms, [
        field, this.boulders, this.drifts,
        this.site.root.getObjectByName('cargo-ship')
      ]);   // NPCs are NOT distance-culled: see Avatar.js — they are baked
            // down to a handful of meshes instead. Hiding the person you are
            // walking up to is not an optimisation, it is a bug.
    }

    // Everything the GPU would otherwise pay for on the first frames of play:
    // shader programs, texture uploads, the shadow pass, and a look around
    // from where the player will be standing. See Preloader.warmUp.
    await warmUp(this.engine, this.engine.camera, (p, msg) => this.ui.setBoot(p, msg));

    // Hold the loading screen until the minimum has elapsed, so the word stage
    // reads as a sequence rather than a flash.
    await this._preloader.finish();
    this.ui.hideBoot();
    this.ui.hideMenu();

    this.inWorld = true;

    this.paused = false;
    this._faint = null;
    this.ui.setFade(0);
    this.ui.renderCodex();
    this._updateObjective();

    if (!this.input.touch) this.input.requestLock();
    this.ui.toast('Welcome to ' + S.name,
      'Walk to the glowing markers and press E. Everything you find is archived.', 'good');
  }

  unloadSite() {
    // Put everything back before the graph is torn down, so nothing is left
    // invisible if the same objects are reused.
    this.culler?.releaseAll();
    this.culler = null;
    this.beacons.forEach(b => b.dispose(this.engine.scene));
    this.beacons = [];
    if (this.player) { this.player = null; }
    if (this.helicopter) { this.helicopter.dispose(); this.helicopter = null; }
    if (this.site) { this.engine.scene.remove(this.site.root); this.site.dispose?.(); this.site = null; }
    if (this.boulders) { this.engine.scene.remove(this.boulders); this.boulders.geometry.dispose(); }
    if (this.drifts) { this.engine.scene.remove(this.drifts); this.drifts.geometry.dispose(); }
    if (this.weather) { this.weather.dispose(); this.weather = null; }
    if (this.terrain) { this.terrain.dispose(); this.terrain = null; }
    if (this.sky) {
      [this.sky.dome, this.sky.stars, this.sky.sun, this.sky.hemi, this.sky.fill]
        .forEach(o => o && this.engine.scene.remove(o));
      this.sky = null;
    }
  }

  returnToMenu() {
    this.inWorld = false;
    this._loadingWorld = false;
    this.paused = true;
    this.input.exitLock();
    this.unloadSite();
    this.engine.scene.background = new THREE.Color(0x0a1a2b);
    this.ui.showMenu();
    this._checkOrientation?.();
  }

  /* ============================================================== input */
  _bindKeys() {
    this.input.onAction = () => this.interact();

    this.input.onKey = (code) => {
      switch (code) {
        case 'KeyE': if (this.inWorld && !this.ui.anyOverlayOpen) this.interact(); break;
        case 'Tab':
          if (!this.inWorld) break;
          this.ui.el.codex.classList.contains('hidden') ? this.ui.openCodex() : this.ui.closeCodex();
          break;
        case 'KeyM':
          if (!this.inWorld) break;
          this.ui.el.map.classList.contains('hidden') ? this.ui.openMap() : this.ui.closeMap();
          break;
        case 'Space':
          if (this.inWorld && !this.ui.anyOverlayOpen) this.player.jump();
          break;
        case 'Escape':
          if (!this.inWorld) break;
          if (this.ui.anyOverlayOpen) { this.ui.closeAllOverlays(); this.setPaused(false); }
          else this.ui.openPause();
          break;
      }
    };

    // Tab must not move focus through the page.
    window.addEventListener('keydown', e => { if (e.code === 'Tab') e.preventDefault(); });

    this.input.onLockChange = (locked) => {
      // Losing the lock (Esc, alt-tab) should pause rather than leave the
      // player standing in the open with no way to look around. But if lock is
      // unavailable in this context at all — an embedded iframe, for instance —
      // pausing on every "unlock" would make the game unplayable, so skip it.
      if (this.input.lockBlocked) return;
      if (!locked && this.inWorld && !this.ui.anyOverlayOpen) this.ui.openPause();
    };

    // Tell the player how to look around when pointer lock is refused.
    this.input.onLockBlocked = () => {
      if (!this.inWorld) return;
      this.ui.toast('Drag to look around',
        'Pointer lock is unavailable here, so hold the left mouse button and drag to turn.', '');
    };
  }

  setPaused(v) {
    this.paused = v;
    this.input.enabled = !v;
    if (v) this.input.exitLock();
    else if (this.inWorld && !this.input.touch) this.input.requestLock();
    if (this.player) this.player.frozen = v;
  }

  setQuality(q) { this.engine.setQuality(q); }
  setSensitivity(v) { this.input.sensitivity = v; }
  setSnow(v) { this.snowLevel = v; this._baseSnowIntensity = v; }

  /* ========================================================= interaction */
  interact() {
    if (!this.nearest || this.paused) return;
    const it = this.nearest;

    if (it.opensCodex) { this.ui.openCodex(); return; }
    if (it.isNpc) { this._talkTo(it); return; }
    if (it.kind === 'power-panel') { this._readPowerPanel(it); return; }

    if (it.minigame && ALL_MINIGAMES[it.minigame]) {
      ALL_MINIGAMES[it.minigame]({
        ui: this.ui,
        // Every shared-site minigame interactable (weather/icecore/ozone/
        // krill are all built once in site.js and placed at BOTH stations)
        // used to hardcode which station it was narrating — "Maitri field
        // site" and "the wind at Maitri" showed up unchanged even when
        // triggered at Bharati. Passing the actual station through lets
        // each game address the station the player is really standing at.
        stationId: this.stationId,
        station: STATIONS[this.stationId],
        onComplete: (ok) => {
          if (ok) this._award(it);
          this.ui.closeMini();
        }
      });
      return;
    }
    this._award(it);
  }

  _award(it) {
    const isNew = this.ui.collect(it.id);
    if (isNew) {
      const b = this.beacons[this.site.interactables.indexOf(it)];
      b?.markCollected();
      this._updateObjective();
      // NPCs and the library desk aren't archive pickups themselves (an NPC
      // conversation can AWARD one via `unlocks`, but the NPC's own id never
      // enters ui.collected) — count only the ones that actually can be.
      const collectibleCount = this.site.interactables.filter(this._isCollectible).length;
      if (this.ui.collected.size === collectibleCount) {
        this.ui.toast('Site survey complete', 'Every record at this station is archived.', 'good');
      }
    } else {
      const e = ENTRY_BY_ID[it.id];
      this.ui.toast('Already archived', e?.title || '', '');
    }
    this.ui.activeEntry = it.id;
    this.ui.activeCat = ENTRY_BY_ID[it.id]?.cat || this.ui.activeCat;
    this.ui.openCodex();
  }

  /**
   * NPC dialogue. Deliberately does NOT route through _award()/openCodex() —
   * an archive record collected mid-conversation still gets its own "X
   * archived" toast from ui.collect(), but forcing the full-screen codex
   * open every time would interrupt the one moment in the game that is
   * actually about a person talking to you, not a UI panel.
   */
  _talkTo(it) {
    const npc = it.npc;
    this.ui.toast(`${npc.name} — ${npc.title}`, npc.nextLine(), '');

    if (npc.unlocks) {
      const isNew = this.ui.collect(npc.unlocks);
      if (isNew) {
        const b = this.beacons[this.site.interactables.indexOf(it)];
        b?.markCollected();
        this._updateObjective();
      }
    }
  }

  /**
   * The power panel's wall readout, first read; every read after that walks
   * through POWER_LORE the same way an NPC's nextLine() cycles their own
   * dialogue array — the panel doesn't have a person attached to it, but the
   * explanation is the same kind of content, so it gets the same rhythm.
   */
  _readPowerPanel(it) {
    if (it._read) {
      const i = it._loreIdx ?? 0;
      this.ui.toast(it.readout.title, it.lore[i % it.lore.length], '');
      it._loreIdx = i + 1;
    } else {
      this.ui.toast(it.readout.title, it.readout.lines.join('\n'), it.readout.status === 'NOMINAL' ? 'good' : '');
      it._read = true;
    }
  }

  /** True for interactables that live in ui.collected — archive pickups and
   *  minigames, but not NPCs (talked to, not "collected"), the library
   *  desk (a door into the same UI Tab already opens, not a record itself),
   *  or the power panel (read, like an NPC, not archived). */
  _isCollectible(i) { return !i.isNpc && !i.opensCodex && i.kind !== 'power-panel'; }

  _updateObjective() {
    if (!this.site) return;
    const remaining = this.site.interactables
      .filter(this._isCollectible)
      .filter(i => !this.ui.collected.has(i.id));
    this._target = remaining[0] || null;
    this.ui.updateHUD({
      objective: this._target
        ? this._target.label
        : 'Survey complete — open the archive (Tab)'
    });
  }

  /**
   * A passing blizzard cell — the thing the phase-1 plan called "whiteout,
   * with the route markers as the lifeline". Real Antarctic weather doesn't
   * hold one intensity all day; it comes through in cells. `factor` (0→1)
   * layers additively on top of whatever baseline the station/live-weather/
   * settings slider already set, in update(), so this never fights the user's
   * own snow-intensity choice — it temporarily pushes past it, then gives it
   * back.
   *
   * State machine: calm (waiting) → building (visibility drops) → peak
   * (holds) → fading (recovers) → calm. Toasts fire only on the two state
   * transitions a player actually needs to react to.
   */
  _updateBlizzard(dt) {
    const b = this._blizzard;
    if (!b) return 0;
    b.timer -= dt;
    switch (b.state) {
      case 'calm':
        b.factor = damp(b.factor, 0, 2, dt);
        if (b.timer <= 0) {
          b.state = 'building';
          b.timer = 16 + Math.random() * 12;
          this.ui.toast('Blizzard warning', 'Visibility is dropping fast — stay on the marked route.', '');
        }
        break;
      case 'building':
        b.factor = Math.min(1, b.factor + dt / b.timer);
        if (b.timer <= 0 || b.factor >= 1) {
          b.state = 'peak';
          b.timer = 14 + Math.random() * 16;
          b.factor = 1;
        }
        break;
      case 'peak':
        if (b.timer <= 0) { b.state = 'fading'; b.timer = 12 + Math.random() * 10; }
        break;
      case 'fading':
        b.factor = Math.max(0, b.factor - dt / b.timer);
        if (b.timer <= 0 || b.factor <= 0) {
          b.state = 'calm';
          b.timer = 50 + Math.random() * 70;
          b.factor = 0;
          this.ui.toast('Blizzard passing', 'Visibility is recovering.', 'good');
        }
        break;
    }
    this.weather.setIntensity(clamp(this._baseSnowIntensity + b.factor * 0.5, 0, 1));
    this.sky.setOvercast(clamp(this._baseOvercast + b.factor * 0.75, 0, 1));
    this.ui.setBlizzard?.(b.state === 'building' || b.state === 'peak');
    return b.factor;
  }

  /**
   * Wandering out of the play area is a real Antarctic hazard, not just a
   * level-boundary — someone who walks far enough from the station in this
   * cold, alone, is the actual emergency this mechanic is standing in for.
   * Rather than an invisible wall, going too far triggers a collapse: the
   * view tips and fades to black, then the player wakes back near the
   * station, the way a search party would actually resolve it, not a
   * hard stop.
   *
   * PLAY_RADIUS is set past every field-kit prop this session placed
   * (the furthest, the Dakshin Gangotri cairn, sits ~225 m out) so reaching
   * every piece of real content never brushes the boundary.
   */
  _updateBounds(dt) {
    const PLAY_RADIUS = 260;
    if (this._faint) { this._updateFaint(dt); return; }
    if (this.paused) return;

    const pad = this.site.pad;
    const d = Math.hypot(this.player.position.x - pad.x, this.player.position.z - pad.z);
    if (d > PLAY_RADIUS) {
      this._faint = { phase: 'falling', t: 0 };
      this.player.frozen = true;
      this.player.velocity.set(0, 0, 0);
    }
  }

  _updateFaint(dt) {
    const f = this._faint;
    f.t += dt;
    switch (f.phase) {
      case 'falling': {
        const dur = 1.3;
        const u = Math.min(1, f.t / dur);
        this.player.pitch = -0.05 - u * 1.1;   // head drooping forward
        this.ui.setFade(u);
        if (u >= 1) { f.phase = 'out'; f.t = 0; }
        break;
      }
      case 'out': {
        if (f.t >= 0.9) {
          const spawn = this.site.spawn;
          this.player.teleport(spawn.x, spawn.z, spawn.yaw);
          this.player.pitch = -0.05;
          f.phase = 'waking'; f.t = 0;
          this.ui.toast('Blacked out from the cold',
            'You wandered too far from the station alone. Someone found you and brought you back — stay closer next time.', '');
        }
        break;
      }
      case 'waking': {
        const dur = 1.3;
        const u = Math.min(1, f.t / dur);
        this.ui.setFade(1 - u);
        if (u >= 1) {
          this.player.frozen = false;
          this._faint = null;
        }
        break;
      }
    }
  }

  /**
   * Sun position (and therefore day/night) driven by the station clock —
   * previously `clockMinutes` only drove the HUD's clock text, the sun
   * itself never moved, so "night" never actually happened and every
   * exterior light stayed at one fixed brightness all session.
   *
   * Altitude swings between the station's own hand-placed peak (`sunAlt` —
   * "the polar summer sun that barely sets") and a partial dip below the
   * horizon at station-midnight, rather than a full sunrise/sunset arc —
   * a real Antarctic summer sun doesn't drop far, so "night" here reads as
   * a dim, aurora-lit twilight rather than true darkness, which is both
   * more accurate and more atmospheric than black.
   *
   * Throttled to a few times a second: `setSun()` forces a shadow-map
   * refresh (shadowMap.autoUpdate is off precisely so shadows don't cost
   * anything every frame — see Engine.js), and the sun moves slowly enough
   * that updating it that often is imperceptible.
   */
  _updateSun(elapsed) {
    if (elapsed - (this._lastSunUpdate ?? -999) < 0.2) return this._nightFactor ?? 0;
    this._lastSunUpdate = elapsed;

    const S = STATIONS[this.stationId];
    const dayFrac = this.clockMinutes / 1440;               // 0..1, 0 = midnight
    const t = (dayFrac - 0.5) * Math.PI * 2;                 // 0 at noon
    const peak = S.world.sunAlt;
    const trough = -peak * 0.55;
    const altDeg = (peak + trough) / 2 + (peak - trough) / 2 * Math.cos(t);
    const aziDeg = S.world.sunAzi + dayFrac * 360;
    this.sky.setSun(altDeg, aziDeg);

    this._nightFactor = clamp(-altDeg / (peak * 0.55), 0, 1);
    return this._nightFactor;
  }

  /* =============================================================== loop */
  update(dt, elapsed) {
    if (!this.inWorld || !this.player) return;

    if (!this.paused) {
      this.player.update(dt);
      // dt*2 (a 12-minute real-time day) meant night could take the better
      // part of five minutes to arrive from a fresh station load (the clock
      // starts at 14:20) — long enough that "does night even happen" is a
      // completely reasonable thing to conclude without ever having seen it.
      // dt*10 brings a full day down to ~2.4 minutes and night within about
      // a minute of starting, which is what a session actually needs for
      // the cycle (and the lights coming on with it) to be witnessed rather
      // than taken on faith.
      this.clockMinutes = (this.clockMinutes + dt * 10) % 1440;
    }

    const camPos = this.engine.camera.position;
    this.terrain.update(dt, elapsed);
    if (!this.paused) this._updateBlizzard(dt);
    this._updateBounds(dt);
    this.ui.setUnderwater?.(this.player.underwater);
    const nightFactor = this._updateSun(elapsed);
    this.sky.update(dt, elapsed);
    this.sky.follow(this.player.position);
    this.weather.update(dt, elapsed, camPos, this.engine.bufferSize.dpr);
    // Field-team and supply-crew interactables keep the SAME worldPosition
    // Vector3 updated in place every frame (see NPCs.js) rather than a
    // one-time snapshot — re-copying it here is what keeps their beacon
    // actually following them instead of glowing at wherever they happened
    // to be spawned while they walk off and leave it behind.
    this.beacons.forEach((b, i) => {
      b.group.position.copy(this.site.interactables[i].worldPosition);
      b.update(dt, elapsed);
    });
    const doorTriggers = this.supplyCrew
      ? [this.supplyCrew.groups[0].position, this.supplyCrew.groups[1].position]
      : null;
    this.culler?.update(this.player.position, dt);
    this.site.update?.(dt, elapsed, this.player.position, nightFactor, doorTriggers);
    if (!this.paused) this.helicopter?.update(dt, elapsed);
    if (!this.paused) this.supplyCrew?.update(dt, elapsed);
    if (this.helicopter && this._cargoBox) {
      const box = this.helicopter.getCargoBox(this._cargoBox);
      if (!box) { this._cargoBox.min.set(0, -999, 0); this._cargoBox.max.set(0, -998, 0); }
    }

    // --- nearest interactable ------------------------------------------
    let best = null, bestD = Infinity;
    for (const it of this.site.interactables) {
      const d = it.worldPosition.distanceTo(this.player.position);
      if (d < (it.radius ?? 4.5) && d < bestD) { best = it; bestD = d; }
    }
    if (best !== this.nearest) {
      this.nearest = best;
      this.ui.setPrompt(best
        ? (this.ui.collected.has(best.id) ? `Re-read: ${best.label}` : best.label)
        : null);
    }

    // --- HUD -------------------------------------------------------------
    const S = STATIONS[this.stationId];
    const dist = this._target
      ? this._target.worldPosition.distanceTo(this.player.position)
      : null;
    const hh = String(Math.floor(this.clockMinutes / 60)).padStart(2, '0');
    const mm = String(Math.floor(this.clockMinutes % 60)).padStart(2, '0');

    const baseTemp = this.liveWeather?.tempC ?? S.world.tempC;
    this._hudTemp = damp(this._hudTemp ?? baseTemp, baseTemp + Math.sin(elapsed * 0.11) * 1.2, 1, dt);

    this.ui.updateHUD({
      station: S.name,
      heading: this.player.heading(),
      temp: this._hudTemp,
      wind: this.weather.effectiveWindKt ?? S.world.windKt,
      clock: `${hh}:${mm}`,
      objDist: dist
    });

    // The minimap is a 2D Canvas redraw (clear + per-interactable arc/fill/
    // stroke + a rotated player arrow) — real main-thread work competing
    // with WebGL submission every frame it runs. Nothing on it needs
    // sub-frame freshness, so it's throttled to ~15Hz instead of all 60.
    this._minimapAccum = (this._minimapAccum ?? 0) + dt;
    if (this._minimapAccum >= 1 / 15) {
      this._minimapAccum = 0;
      this.ui.drawMinimap({
        x: this.player.position.x, z: this.player.position.z,
        heading: this.player.heading(),
        interactables: this.site.interactables,
        collected: this.ui.collected
      });
    }
  }
}

/* ------------------------------------------------------------- helpers */
const frame = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Map a live weather reading to a blizzard-intensity value. Real Antarctic
 * conditions are dramatic more often than not — this deliberately runs
 * higher than the old flat 0.45 default: any measurable snowfall or wind
 * above ~25 kt should read as a real event, not a light dusting, and the
 * floor is raised generally so a station never looks calmer than it
 * actually is even on a "quiet" reading.
 */
function weatherIntensityFromLive(live) {
  let v = 0.55;
  if (live.snowfallCm > 0) v = Math.max(v, 0.72 + Math.min(live.snowfallCm / 2, 0.24));
  if (live.windKt > 25) v = Math.max(v, 0.6 + Math.min((live.windKt - 25) / 40, 0.35));
  return Math.min(v, 0.97);
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---------------------------------------------------------------- boot */
window.addEventListener('DOMContentLoaded', () => {
  try {
    window.game = new Game();
  } catch (err) {
    console.error(err);
    document.getElementById('boot-status').textContent =
      'WebGL failed to start: ' + err.message;
  }
});
