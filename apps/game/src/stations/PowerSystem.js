import * as THREE from 'three';
import { MAT, signText, paintedMetal } from './kit.js';

/**
 * PowerSystem.js — the generator hall: the room that actually keeps Bharati
 * alive. Everything else in the station is downstream of this one.
 *
 * The real machine: three diesel-fired combined-heat-and-power (CHP) units
 * run continuously, a fourth sits idle as pure standby (N+1 redundancy —
 * losing one engine must never mean losing the station), and the waste heat
 * off the running engines is looped back into the building instead of being
 * vented, so the same litre of diesel pays for both electricity and warmth.
 * Fuel is shipped once a year during the summer resupply and has to last
 * through a winter when nothing can reach the station by sea or air, so the
 * tanks are kept stocked for a full year plus a safety margin. Solar helps,
 * but only for half the year — the panels do real work in the 24-hour
 * daylight of summer and are dead weight through the 24-hour dark of winter.
 *
 * Two exports assemble the physical fixture (buildGeneratorHall, the plant
 * itself; buildStatusPanel, the wall readout a winterer actually checks),
 * one builds the "read the panel" interaction payload for whoever wires this
 * into a station file, and POWER_LORE carries the explainer text.
 *
 * Self-contained by design — this module imports only kit.js and three, and
 * touches no other file, so it can be dropped in and placed without
 * conflicting with whatever else is being edited elsewhere in the stations.
 */

/* ============================================================ lore text */

/**
 * Short first-person technician explainers. Same voice as the dialogue
 * arrays in NPCs.js / site.js: grounded, factual, a little wry, written for
 * a curious 10–14 year old without talking down to them.
 */
export const POWER_LORE = [
  'Every one of our three running generators burns diesel to spin a shaft — that part is ordinary. ' +
  'The trick is what happens to the heat that comes off the engine block and exhaust: instead of venting it, ' +
  'we loop it through the building\'s heating system. Skip that step and you would need a second set of ' +
  'heaters working just as hard, burning just as much fuel, for nothing.',

  'We keep a fourth generator sitting there doing nothing, and that is not waste — it is insurance. ' +
  'If a running unit trips, the system does not wait for a human: non-essential loads get shed automatically, ' +
  'stage by stage, while heating and life support stay protected no matter what — and the standby engine is ' +
  'already spinning up behind that. Nobody here has ever seen Bharati actually go dark; that is the entire ' +
  'point of stacking two safety nets instead of one.',

  'The last ship of the season leaves before the sea ice closes in, and the next one is not coming until next ' +
  'summer — nothing sails in and nothing flies in for months. So we do not buy diesel like a household buys ' +
  'gas; we stock something like four hundred tonnes in one delivery, a full year\'s running plus a margin, and ' +
  'then we watch the tank levels like a hawk until resupply comes round again.',

  'Solar helps, but only half the year is willing to cooperate. In summer the sun barely sets and the roof ' +
  'panels genuinely take a bite out of the diesel bill. Come May the sun does not come up at all for months, ' +
  'and a solar panel sitting in the dark is just an expensive roof tile — so all winter, it is the generators ' +
  'or nothing.'
];

/* ==================================================== status panel data */

/**
 * Concrete, seasonal readings for the wall panel. Numbers are grounded in
 * the Neumayer III-class plant Bharati's is modelled on: 4 × 160 kW diesel
 * gensets, normally 3 online (480 kW) with the 4th on pure standby. Diesel
 * reserve drifts downward across the year from a post-resupply high toward
 * the next summer's delivery; solar swings from ~0% in the polar night to a
 * real double-digit share once the sun stops setting.
 */
export const POWER_PANEL_VARIANTS = [
  {
    id: 'summer',
    title: 'BHARATI POWER STATUS — SUMMER',
    lines: [
      'GEN     3/4 ONLINE  ·  480 kW',
      'DRAW    172 kW',
      'SOLAR   18%  (24HR DAYLIGHT)',
      'DIESEL RESERVE   334 DAYS'
    ],
    status: 'NOMINAL'
  },
  {
    id: 'shoulder',
    title: 'BHARATI POWER STATUS — AUTUMN',
    lines: [
      'GEN     3/4 ONLINE  ·  480 kW',
      'DRAW    150 kW',
      'SOLAR   4%  (LOW SUN ANGLE)',
      'DIESEL RESERVE   301 DAYS'
    ],
    status: 'NOMINAL'
  },
  {
    id: 'winter',
    title: 'BHARATI POWER STATUS — WINTER',
    lines: [
      'GEN     3/4 ONLINE  ·  480 kW',
      'DRAW    156 kW',
      'SOLAR   0%  (POLAR NIGHT)',
      'DIESEL RESERVE   254 DAYS'
    ],
    status: 'NOMINAL'
  }
];

/* =============================================================== canvas */

const _panelTexCache = new Map();

/** Terminal-style canvas readout, cached per variant id. */
function panelTexture(variant) {
  if (_panelTexCache.has(variant.id)) return _panelTexCache.get(variant.id);

  const w = 512, h = 358;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');

  g.fillStyle = '#071019';
  g.fillRect(0, 0, w, h);

  // Faint scanline grid — cheap CRT/industrial-console texture.
  g.strokeStyle = 'rgba(120,200,190,0.06)';
  g.lineWidth = 1;
  for (let y = 8; y < h; y += 10) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
  }

  g.textBaseline = 'top';
  g.fillStyle = '#bfe9ff';
  g.font = '700 30px "JetBrains Mono", monospace';
  g.fillText(variant.title, 22, 18);

  g.strokeStyle = 'rgba(191,233,255,0.35)';
  g.beginPath(); g.moveTo(22, 60); g.lineTo(w - 22, 60); g.stroke();

  g.font = '600 26px "JetBrains Mono", monospace';
  g.fillStyle = '#8fe3c0';
  let y = 82;
  for (const line of variant.lines) {
    g.fillText(line, 22, y);
    y += 42;
  }

  g.font = '700 24px "JetBrains Mono", monospace';
  g.fillStyle = '#5fe37a';
  g.fillText('● ' + variant.status, 22, h - 42);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  _panelTexCache.set(variant.id, t);
  return t;
}

/* ============================================================== panel */

/**
 * Wall-mounted status screen — sibling of the "screen" prop in kit.js's
 * buildInterior 'lab' theme (same rough footprint, same emissive-plane
 * trick), showing a live-style readout of generation vs draw, diesel
 * reserve and seasonal solar contribution.
 *
 * @param {'summer'|'shoulder'|'winter'} [variantId]
 * @returns {THREE.Group}
 */
export function buildStatusPanel(variantId = 'winter') {
  const variant = POWER_PANEL_VARIANTS.find(v => v.id === variantId) || POWER_PANEL_VARIANTS[POWER_PANEL_VARIANTS.length - 1];

  const g = new THREE.Group();
  g.name = 'power-status-panel';

  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 0.48, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x23282b, roughness: 0.55, metalness: 0.35 })
  );
  bezel.castShadow = bezel.receiveShadow = true;
  g.add(bezel);

  const tex = panelTexture(variant);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.42),
    new THREE.MeshStandardMaterial({
      map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.0, roughness: 0.35
    })
  );
  screen.position.z = 0.028;
  g.add(screen);

  // Bezel indicator LEDs — three green (gen 1–3 running), one amber
  // (gen 4, standby) — a readable-from-across-the-room cue that mirrors the
  // generator hall's own status lights.
  const ledColors = [0x2fdc5a, 0x2fdc5a, 0x2fdc5a, 0xffb020];
  ledColors.forEach((color, i) => {
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.03, 0.015),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2 })
    );
    led.position.set(-0.27 + i * 0.05, -0.205, 0.028);
    g.add(led);
  });

  g.userData.variant = variant.id;
  return g;
}

/* ======================================================= generator hall */

/** One diesel genset: skid, engine block, radiator face, exhaust stack, control panel. */
function dieselGenset(n, running) {
  const g = new THREE.Group();
  g.name = `genset-${n}`;
  // Collected by buildGeneratorHall and handed up to the station, which
  // hands them to site.js's update loop. A CHP set is the loudest, busiest
  // object in the building; standing in front of four of them and having
  // nothing move is the single most diorama-like moment in either station.
  const ticks = [];
  g.userData.ticks = ticks;

  const bodyColor = running ? '#c9a227' : '#8a8f78'; // the idle unit reads visibly "off duty"
  const bodyMat = new THREE.MeshStandardMaterial({ map: paintedMetal(bodyColor), roughness: 0.6, metalness: 0.35 });

  const skid = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.3), MAT.steelGrey());
  skid.position.y = 0.06;
  skid.castShadow = skid.receiveShadow = true;
  g.add(skid);

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 1.2), bodyMat);
  body.position.y = 0.62;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  if (running) {
    // A millimetre of shake at engine speed. Too small to see as movement,
    // large enough that the machine does not read as a parked block.
    const ph = n * 2.3;
    ticks.push((dt, t) => {
      body.position.y = 0.62 + Math.sin(t * 46 + ph) * 0.0022;
      body.position.x = Math.sin(t * 37 + ph * 1.7) * 0.0016;
    });
  }

  // Radiator/cooling face on one end.
  const grille = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.7, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x1c2126, roughness: 0.5, metalness: 0.5 })
  );
  grille.position.set(-0.87, 0.67, 0);
  g.add(grille);

  // Radiator fan behind the grille, turning on the running units only — the
  // standby engine being visibly still is the whole point of N+1 redundancy
  // and you can read it from across the hall.
  {
    const hub = new THREE.Group();
    hub.position.set(-0.9, 0.67, 0);
    hub.rotation.z = Math.PI / 2;
    g.add(hub);
    const fanMat = MAT.steelGrey();
    hub.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8), fanMat));
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.13), fanMat);
      b.position.set(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17);
      b.rotation.y = a;
      b.rotation.z = 0.45;
      hub.add(b);
    }
    if (running) {
      const rate = 24 + n * 1.7;
      ticks.push(dt => { hub.rotation.y += dt * rate; });
    }
  }

  // Exhaust stack + rain cap, offset toward the rear.
  const stackH = 1.5;
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, stackH, 10), MAT.galv());
  stack.position.set(0.65, 1.12 + stackH / 2, -0.4);
  stack.castShadow = true;
  g.add(stack);

  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.16, 10),
    new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.7 })
  );
  cap.position.set(0.65, 1.12 + stackH + 0.06, -0.4);
  g.add(cap);

  // Control panel on the front face: status light + a couple of gauge dials.
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.5, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x1c2126, roughness: 0.5, metalness: 0.3 })
  );
  panel.position.set(0.55, 0.72, 0.63);
  panel.castShadow = true;
  g.add(panel);

  const statusColor = running ? 0x2fdc5a : 0xffb020;
  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.07, 0.02),
    new THREE.MeshStandardMaterial({ color: statusColor, emissive: statusColor, emissiveIntensity: 2.4 })
  );
  light.position.set(0.55, 0.90, 0.665);
  g.add(light);
  // Running units breathe; the standby unit's amber lamp blinks slowly to
  // say "armed, not running".
  {
    const lm = light.material;
    const ph = n * 1.9;
    ticks.push((dt, t) => {
      lm.emissiveIntensity = running
        ? 2.1 + Math.sin(t * 7.5 + ph) * 0.45
        : (Math.sin(t * 1.4 + ph) > 0.6 ? 2.6 : 0.35);
    });
  }

  for (const dy of [0.55, 0.42]) {
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), MAT.steelGrey());
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0.55, dy, 0.665);
    g.add(dial);
  }

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.12),
    new THREE.MeshStandardMaterial({
      map: signText(running ? `GEN ${n}` : `GEN ${n} · STANDBY`, { color: '#eef2f4', bg: '#1c2733', w: 512 }),
      roughness: 0.7
    })
  );
  label.position.set(0.55, 1.04, 0.601);
  g.add(label);

  return g;
}

/** Diesel day-tank with a sight-glass fill gauge and a labelled plate. */
function fuelGaugeAssembly() {
  const g = new THREE.Group();
  g.name = 'fuel-day-tank';

  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 1.3, 16),
    new THREE.MeshStandardMaterial({ map: paintedMetal('#2a5f8c'), roughness: 0.55, metalness: 0.4 })
  );
  tank.position.y = 0.77;
  tank.castShadow = tank.receiveShadow = true;
  g.add(tank);

  for (const y of [0.52, 1.02]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.425, 0.02, 6, 16), MAT.steelGrey());
    rib.rotation.x = Math.PI / 2;
    rib.position.y = y;
    g.add(rib);
  }

  // Sight-glass gauge tube on the side, with a coloured fill indicator.
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8),
    new THREE.MeshPhysicalMaterial({ color: 0x9fd4ff, transmission: 0.6, roughness: 0.1, thickness: 0.05 })
  );
  tube.position.set(0.46, 0.72, 0);
  g.add(tube);

  const fill = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.72, 8),
    new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0x5a3a00, emissiveIntensity: 0.4 })
  );
  fill.position.set(0.46, 0.58, 0);
  g.add(fill);

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.16),
    new THREE.MeshStandardMaterial({
      map: signText('DIESEL DAY TANK', { color: '#eef2f4', bg: '#1c2733', w: 512 }),
      roughness: 0.7
    })
  );
  plate.position.set(0, 1.52, 0.44);
  g.add(plate);

  return g;
}

/** A painted warning placard using signText. */
function warningPlate(text, textColor, bgColor, w = 1.6, h = 0.34) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: signText(text, { color: textColor, bg: bgColor, w: 1024 }),
      roughness: 0.65
    })
  );
}

/**
 * The generator hall's contents — walls/floor are somebody else's job, this
 * is everything that stands in the room: four diesel gensets (three
 * running, one N+1 standby), a fuel day-tank with a gauge, conduit runs
 * along the wall, and warning signage. Local coordinates assume the group
 * is placed against a back wall at local z = 0, floor at local y = 0; the
 * gensets project forward (+z) from there.
 *
 * @returns {THREE.Group}
 */
export function buildGeneratorHall() {
  const g = new THREE.Group();
  g.name = 'generator-hall';

  const GEN_COUNT = 4;
  const RUNNING = 3; // N+1 redundancy: three online, one pure standby
  const spacing = 2.3;
  const startX = -((GEN_COUNT - 1) * spacing) / 2;

  const ticks = [];
  for (let i = 0; i < GEN_COUNT; i++) {
    const unit = dieselGenset(i + 1, i < RUNNING);
    unit.position.set(startX + i * spacing, 0, 0);
    g.add(unit);
    ticks.push(...(unit.userData.ticks || []));
  }

  const fuel = fuelGaugeAssembly();
  fuel.position.set(startX + (GEN_COUNT - 1) * spacing + 1.9, 0, 0);
  g.add(fuel);

  // Cable conduit runs along the back wall, with clamp brackets and a drop
  // down to each unit's control panel — the wiring that ties the row of
  // gensets and the switchboard together.
  const conduitStartX = startX - 1.1;
  const conduitEndX = fuel.position.x + 0.9;
  const conduitLen = conduitEndX - conduitStartX;
  const conduitCx = (conduitStartX + conduitEndX) / 2;

  for (const y of [2.0, 2.3]) {
    const run = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, conduitLen, 8), MAT.galv());
    run.rotation.z = Math.PI / 2;
    run.position.set(conduitCx, y, 0.05);
    run.castShadow = true;
    g.add(run);
  }

  for (let i = 0; i < GEN_COUNT; i++) {
    const x = startX + i * spacing + 0.55; // above each unit's control panel
    const dropH = 2.0 - 0.9;
    const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, dropH, 6), MAT.galv());
    drop.position.set(x, 0.9 + dropH / 2, 0.05);
    drop.castShadow = true;
    g.add(drop);

    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), MAT.steelGrey());
    bracket.position.set(x, 2.0, 0.06);
    g.add(bracket);
  }

  // Warning signage.
  const warn1 = warningPlate('DANGER — HIGH VOLTAGE', '#151312', '#ffcc00');
  warn1.position.set(startX + 0.4, 2.85, 0.03);
  g.add(warn1);

  const warn2 = warningPlate('DIESEL STORE — NO NAKED FLAME', '#f4ede0', '#8c1c13');
  warn2.position.set(fuel.position.x, 2.85, 0.03);
  g.add(warn2);

  // One closure for the whole hall — cheaper than one animated entry per
  // moving part, and it keeps the station file's wiring to a single line.
  g.userData.animated = { tick: (dt, t) => { for (const f of ticks) f(dt, t); } };
  return g;
}

/* ========================================================= interactable */

/**
 * Plain-object "read the power panel" interactable payload, shaped like the
 * interactable entries this codebase already returns from station builders
 * (see BharatiStation.js — id, label, position, radius) plus the display
 * data itself, since this module never touches archive.js and so has
 * nowhere else to look the text up from.
 *
 * @param {THREE.Vector3} position   world/station-local position of the panel
 * @param {object} [opts]
 * @param {string} [opts.id]
 * @param {number} [opts.radius]
 * @param {'summer'|'shoulder'|'winter'} [opts.variant]
 * @returns {object}
 */
export function buildPowerPanelInteractable(position, opts = {}) {
  const { id = 'power-status-panel', radius = 3, variant = 'winter' } = opts;
  const v = POWER_PANEL_VARIANTS.find(x => x.id === variant) || POWER_PANEL_VARIANTS[POWER_PANEL_VARIANTS.length - 1];

  return {
    id,
    label: 'Read the power panel',
    kind: 'power-panel',
    position,
    radius,
    readout: { title: v.title, lines: v.lines, status: v.status },
    lore: POWER_LORE
  };
}
