import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * CargoShip.js — the resupply vessel, beset in the fast ice off Bharati.
 *
 * This is not a generic ship. The subject is MV *Vasiliy Golovnin*, the Project
 * 10620 icebreaking cargo ship that actually resupplies Bharati and Maitri:
 * 164 m long, 22 m beam, ~6.9 m draught, built 1988. Arrangement is read off
 * the owner's aerial photograph of Bharati — stern to the left with a white
 * four-deck accommodation block and funnel, two yellow deck cranes on pedestals
 * forward of it, a long low weather deck of hatch covers, and a raked
 * icebreaking bow. See docs/REFERENCES.md §1.
 *
 * The real length is kept. At 3.3x the station's 50 m it is the single largest
 * object in the world, which is the point: a resupply ship is the only reason
 * the station exists at all, and one caught in the ice is the clearest possible
 * statement of how far away everything else is.
 *
 * Budget: the whole vessel is ~60 meshes off ~12 shared materials, and it is
 * almost always seen from 200 m+, so it never costs more than a handful of
 * draw calls after frustum culling.
 */

/* ------------------------------------------------------------- materials */
// Module-level cache: one set of materials for the ship no matter how many
// times it is built (the site is rebuilt on every station change).
const _mats = new Map();
const mat = (k, make) => { if (!_mats.has(k)) _mats.set(k, make()); return _mats.get(k); };

/**
 * Weathered steel plate. Rust streaking is the single detail that separates a
 * working ship from a grey box — a hull this age in this water is not clean.
 */
function platedTexture(base, rust, streaks) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  // Plate seams: horizontal strakes and vertical butts, faintly proud.
  g.strokeStyle = 'rgba(0,0,0,0.20)'; g.lineWidth = 1;
  for (let y = 0; y < 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  for (let x = 0; x < 256; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let y = 1; y < 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  // Rust running down from the seams, wider as it falls.
  if (streaks) {
    for (let i = 0; i < streaks; i++) {
      const x = Math.random() * 256, y = Math.floor(Math.random() * 8) * 32;
      const len = 18 + Math.random() * 70, w = 1.5 + Math.random() * 4;
      const grad = g.createLinearGradient(0, y, 0, y + len);
      grad.addColorStop(0, rust);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x, y, w, len);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const MAT = {
  hull: () => mat('ship-hull', () => new THREE.MeshStandardMaterial({
    map: (() => { const t = platedTexture('#1e2429', 'rgba(122,62,28,0.55)', 90); t.repeat.set(14, 3); return t; })(),
    roughness: 0.78, metalness: 0.35
  })),
  boot: () => mat('ship-boot', () => new THREE.MeshStandardMaterial({
    map: (() => { const t = platedTexture('#6d2317', 'rgba(90,50,26,0.5)', 40); t.repeat.set(14, 2); return t; })(),
    roughness: 0.85, metalness: 0.25
  })),
  house: () => mat('ship-house', () => new THREE.MeshStandardMaterial({
    map: (() => { const t = platedTexture('#dfe3e4', 'rgba(120,70,36,0.35)', 26); t.repeat.set(4, 3); return t; })(),
    roughness: 0.72, metalness: 0.12
  })),
  deck: () => mat('ship-deck', () => new THREE.MeshStandardMaterial({ color: 0x3b4247, roughness: 0.9, metalness: 0.2 })),
  hatch: () => mat('ship-hatch', () => new THREE.MeshStandardMaterial({ color: 0x53412a, roughness: 0.88, metalness: 0.25 })),
  crane: () => mat('ship-crane', () => new THREE.MeshStandardMaterial({ color: 0xd7a41d, roughness: 0.68, metalness: 0.3 })),
  steel: () => mat('ship-steel', () => new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.55, metalness: 0.7 })),
  dark: () => mat('ship-dark', () => new THREE.MeshStandardMaterial({ color: 0x191d21, roughness: 0.6, metalness: 0.4 })),
  glass: () => mat('ship-glass', () => new THREE.MeshStandardMaterial({
    color: 0x16303d, roughness: 0.2, metalness: 0.6, emissive: 0x0a1a24, emissiveIntensity: 0.4
  })),
  funnel: () => mat('ship-funnel', () => new THREE.MeshStandardMaterial({ color: 0x1d3f6b, roughness: 0.7, metalness: 0.3 })),
  snow: () => mat('ship-snow', () => new THREE.MeshStandardMaterial({ color: 0xeef4f8, roughness: 0.95 })),
  ice: () => mat('ship-ice', () => new THREE.MeshStandardMaterial({
    color: 0xcfe0ea, roughness: 0.62, metalness: 0.05, flatShading: true
  }))
};

/* ------------------------------------------------------------------ hull */

/**
 * Loft a ship hull from transverse sections.
 *
 * A box with a pointy end does not read as a ship — what reads is the way the
 * beam swells from a narrow stern, holds full width through the parallel
 * midbody, and then narrows and *flares* into a raked stem. So the hull is
 * built the way a hull is actually faired: a run of stations along the length,
 * each a half-section polygon from keel to deck edge, lofted together.
 *
 * Local axes: +x is forward (bow), y up from the waterline, z to starboard.
 */
function buildHull(L, B, draft, freeboard) {
  // Stations as [t along length 0..1, half-beam fraction, keel rise fraction].
  // Keel rise lifts the hull line at the ends — the stern skeg and the
  // icebreaking forefoot both sit well above the lowest point amidships.
  const stations = [
    [0.000, 0.42, 0.62],   // transom
    [0.045, 0.62, 0.34],
    [0.110, 0.80, 0.13],
    [0.200, 0.93, 0.02],
    [0.330, 1.00, 0.00],
    [0.560, 1.00, 0.00],   // parallel midbody
    [0.680, 0.98, 0.02],
    [0.790, 0.88, 0.10],
    [0.880, 0.70, 0.26],
    [0.945, 0.44, 0.50],
    [0.990, 0.14, 0.78],   // stem
    [1.000, 0.03, 0.94]
  ];
  // Half-section outline as (half-beam fraction, height fraction) from keel to
  // deck edge. The kink at 0.34 is the bilge; above it the side is near
  // vertical, which is what an ice-strengthened cargo hull actually looks like.
  const outline = [
    [0.00, 0.00], [0.46, 0.015], [0.80, 0.10], [0.955, 0.34],
    [1.00, 0.62], [1.00, 1.00]
  ];

  const depth = draft + freeboard;
  const pos = [], idx = [], uv = [];
  const ring = [];   // vertex index of each station's full ring (port..stbd)

  for (const [t, bf, kr] of stations) {
    const x = -L / 2 + t * L;
    const keelY = -draft + kr * draft;
    const hb = (B / 2) * bf;
    const start = pos.length / 3;
    // Port side, keel upward; then starboard side back down. Duplicating the
    // keel point on both halves keeps the loft's quads well-formed at the
    // centreline.
    const side = [];
    for (const [ob, oy] of outline) side.push([ob, oy]);
    for (let s = -1; s <= 1; s += 2) {
      const seq = s < 0 ? side : [...side].reverse();
      for (const [ob, oy] of seq) {
        pos.push(x, keelY + oy * (depth - kr * draft), s * ob * hb);
        uv.push(t * 12, oy * 2.4);
      }
    }
    const n = pos.length / 3 - start;
    ring.push({ start, n });
  }

  // Loft consecutive stations.
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    const n = Math.min(a.n, b.n);
    for (let j = 0; j < n - 1; j++) {
      const a0 = a.start + j, a1 = a.start + j + 1;
      const b0 = b.start + j, b1 = b.start + j + 1;
      idx.push(a0, b0, b1, a0, b1, a1);
    }
  }
  // Transom: fan the first station's ring to its own centre.
  {
    const a = ring[0];
    const cx = -L / 2, cy = -draft + stations[0][2] * draft + (depth) * 0.5;
    const c = pos.length / 3;
    pos.push(cx, cy, 0); uv.push(0.5, 0.5);
    for (let j = 0; j < a.n - 1; j++) idx.push(c, a.start + j + 1, a.start + j);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** A deck plate that follows the hull's plan outline at a given height. */
function deckPlate(L, B, y, tFrom, tTo, inset = 0.9) {
  const shape = new THREE.Shape();
  const half = t => (B / 2) * inset * Math.min(1, 1.06 * Math.sin(Math.PI * Math.pow(Math.min(t * 1.02, 1), 0.62)));
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = tFrom + (tTo - tFrom) * (i / 24);
    pts.push([-L / 2 + t * L, half(t)]);
  }
  shape.moveTo(pts[0][0], pts[0][1]);
  for (const [x, h] of pts) shape.lineTo(x, h);
  for (let i = pts.length - 1; i >= 0; i--) shape.lineTo(pts[i][0], -pts[i][1]);
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, y, 0);
  return geo;
}

/* ----------------------------------------------------------------- parts */

/** Deck crane on a pedestal: king post, luffing jib, hoist falls. */
function deckCrane(reach, lift, jibAngle) {
  const g = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 3.0, 12), MAT.crane());
  ped.position.y = 1.5;
  g.add(ped);
  const house = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.2, 3.0), MAT.crane());
  house.position.y = 4.6;
  g.add(house);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.6), MAT.glass());
  cab.position.set(1.3, 4.9, 1.9);
  g.add(cab);
  // Lattice jib: two chords with cross bracing reads as a real jib at a
  // fraction of the cost of a modelled truss.
  const jib = new THREE.Group();
  jib.position.set(0, 5.6, 0);
  jib.rotation.z = jibAngle;
  for (const s of [-1, 1]) {
    const chord = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, reach, 6), MAT.crane());
    chord.rotation.z = Math.PI / 2;
    chord.position.set(reach / 2, s * 0.42, 0);
    jib.add(chord);
  }
  for (let i = 0; i < 9; i++) {
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.15, 4), MAT.crane());
    br.position.set(1.5 + i * (reach - 3) / 8, 0, 0);
    br.rotation.x = Math.PI / 2;
    br.rotation.z = (i % 2 ? 0.6 : -0.6);
    jib.add(br);
  }
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 8), MAT.steel());
  head.rotation.x = Math.PI / 2;
  head.position.set(reach, 0, 0);
  jib.add(head);
  g.add(jib);
  // Fall and hook, hanging plumb from the jib head regardless of jib angle.
  const hx = Math.cos(jibAngle) * reach, hy = 5.6 + Math.sin(jibAngle) * reach;
  const fall = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, hy - lift, 4), MAT.dark());
  fall.position.set(hx, (hy + lift) / 2, 0);
  g.add(fall);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.4), MAT.steel());
  hook.position.set(hx, lift, 0);
  g.add(hook);
  return g;
}

/** Accommodation block: stacked decks, banded windows, bridge wings on top. */
function accommodation(w, d, decks, deckH) {
  const g = new THREE.Group();
  const H = decks * deckH;

  // ONE block, not a stack of plates. The first version stepped each deck in
  // and put a rail slab at every deck edge, which from any distance read as a
  // wedding cake of white trays rather than a deckhouse. A real cargo ship's
  // house is a single slab-sided tower; what breaks it up is the window
  // ribbons and the door/ladder furniture on it, not its silhouette.
  const block = new THREE.Mesh(new THREE.BoxGeometry(d, H, w), MAT.house());
  block.position.y = H / 2;
  block.castShadow = block.receiveShadow = true;
  g.add(block);

  // Continuous window ribbon per deck, all round — the same ribbon logic as
  // the station facade, and the thing that makes a white tower read as
  // inhabited rather than as a container.
  for (let i = 0; i < decks; i++) {
    const y = i * deckH + deckH * 0.62;
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(d * 0.9, deckH * 0.26, 0.16), MAT.glass());
      side.position.set(0, y, s * (w / 2 + 0.02));
      g.add(side);
    }
    const fwd = new THREE.Mesh(new THREE.BoxGeometry(0.16, deckH * 0.26, w * 0.86), MAT.glass());
    fwd.position.set(d / 2 + 0.02, y, 0);
    g.add(fwd);
    // A thin shadow line at each deck level reads as the deck plate edge
    // without becoming a shelf.
    const line = new THREE.Mesh(new THREE.BoxGeometry(d + 0.08, 0.14, w + 0.08), MAT.dark());
    line.position.y = (i + 1) * deckH;
    g.add(line);
  }

  // External ladder up the aft face — every house has one and it is the
  // clearest scale cue on the whole vessel.
  for (let i = 0; i < decks * 4; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), MAT.steel());
    rung.position.set(-d / 2 - 0.25, 0.6 + i * (H - 1.0) / (decks * 4), w * 0.3);
    g.add(rung);
  }
  for (const s of [-1, 1]) {
    const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.08, H - 0.6, 0.08), MAT.steel());
    stringer.position.set(-d / 2 - 0.25, H / 2, w * 0.3 + s * 0.24);
    g.add(stringer);
  }

  // Bridge deck: shorter fore-and-aft, WIDER than the house so the wings
  // overhang both sides — the officer of the watch has to see the ship's side
  // when coming alongside, and that overhang is the most recognisable shape
  // on any merchant ship.
  const bh = deckH * 1.05;
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(d * 0.66, bh, w * 1.26), MAT.house());
  bridge.position.set(d * 0.06, H + bh / 2, 0);
  bridge.castShadow = true;
  g.add(bridge);
  // Bridge front and wing glazing, raked back at the top the way a wheelhouse
  // window is.
  const bwin = new THREE.Mesh(new THREE.BoxGeometry(0.18, bh * 0.5, w * 1.2), MAT.glass());
  bwin.position.set(d * 0.06 + d * 0.33, H + bh * 0.62, 0);
  g.add(bwin);
  for (const s of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(d * 0.6, bh * 0.44, 0.18), MAT.glass());
    sw.position.set(d * 0.06, H + bh * 0.62, s * (w * 0.63 + 0.02));
    g.add(sw);
  }
  // Monkey island on top.
  const top = new THREE.Mesh(new THREE.BoxGeometry(d * 0.68, 0.26, w * 1.28), MAT.deck());
  top.position.set(d * 0.06, H + bh, 0);
  g.add(top);
  g.userData.topY = H + bh + 0.26;
  g.userData.houseH = H;
  return g;
}

/* ------------------------------------------------------------------- ice */

/**
 * The ice the ship is stuck in.
 *
 * Besetment does not look like a boat on a white plane: the sheet fails against
 * the hull and piles into a rubble collar, and the pressure ridge runs off the
 * bow and quarters where the floe is still working against the steel. That
 * collar is what sells "trapped" rather than "moored".
 */
function iceCollar(L, B, rng) {
  const g = new THREE.Group();
  const blocks = 132;
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const im = new THREE.InstancedMesh(geo, MAT.ice(), blocks);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const v = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < blocks; i++) {
    // Distribute along the hull, tight to the side, heaped at the shoulders.
    const t = rng();
    const x = (-0.52 + t * 1.04) * L;
    const shoulder = Math.abs(x) / (L / 2);
    const side = rng() < 0.5 ? -1 : 1;
    const off = (B / 2) * (0.86 + rng() * 0.55) + shoulder * 5.5;
    const sz = 1.1 + rng() * 3.4 + shoulder * 2.2;
    v.set(x + (rng() - 0.5) * 6, -0.4 + rng() * sz * 0.55, side * off);
    e.set(rng() * 3, rng() * 3, rng() * 3);
    q.setFromEuler(e);
    s.set(sz, sz * (0.4 + rng() * 0.4), sz * (0.7 + rng() * 0.6));
    m.compose(v, q, s);
    im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = im.receiveShadow = true;
  g.add(im);

  // The fast-ice sheet the vessel is frozen into.
  //
  // Two earlier attempts were both wrong. A flat white ellipse read as a decal
  // with a hard edge laid on the water. Removing it entirely left the ship
  // sitting in open sea with a little brash around it — moored, not beset.
  // What actually surrounds a beset ship is a SHEET made of floes: many
  // irregular pans, refrozen together, of wildly different sizes, with leads
  // and cracks between them. Built that way it has no boundary to give itself
  // away — it just thins out with distance — and it is still one draw call.
  {
    const pans = 150;
    const pgeo = new THREE.CylinderGeometry(1, 1, 0.34, 7);
    const floes = new THREE.InstancedMesh(pgeo, mat('ship-floe', () => new THREE.MeshStandardMaterial({
      color: 0xdfeaf2, roughness: 0.86, flatShading: true
    })), pans);
    const fm = new THREE.Matrix4(), fq = new THREE.Quaternion(), fe = new THREE.Euler();
    const fv = new THREE.Vector3(), fs = new THREE.Vector3();
    for (let i = 0; i < pans; i++) {
      // Polar scatter, densest against the hull and thinning outward, so the
      // sheet has no visible edge.
      const a = rng() * Math.PI * 2;
      const rr = Math.pow(rng(), 0.55);
      const px = Math.cos(a) * rr * L * 1.25;
      const pz = Math.sin(a) * rr * L * 0.95;
      // Don't lay a pan over the hull itself.
      if (Math.abs(px) < L * 0.5 && Math.abs(pz) < B * 0.55) continue;
      const sz = 6 + rng() * 17 + rr * 12;
      fv.set(px, 0.06 + rng() * 0.16, pz);
      fe.set((rng() - 0.5) * 0.05, rng() * 3.1, (rng() - 0.5) * 0.05);
      fq.setFromEuler(fe);
      fs.set(sz, 0.5 + rng() * 0.9, sz * (0.7 + rng() * 0.6));
      fm.compose(fv, fq, fs);
      floes.setMatrixAt(i, fm);
    }
    floes.instanceMatrix.needsUpdate = true;
    floes.receiveShadow = true;
    g.add(floes);
  }

  // NOTE: no "pan of refrozen ice" disc here. The first version laid a flat
  // white ellipse round the hull to be the frozen-in lead, and it read as
  // exactly what it was — a decal with a hard edge sitting on the water. The
  // terrain's sea surface is already drawn as near-opaque sea ice rather than
  // open water, so the sheet is there; what besetment actually needs on top of
  // it is the rubble the hull has broken and heaped, which is what the collar
  // above and the ridge below are.

  // Pressure ridge running off the bow — the floe is still pushing.
  const ridge = new THREE.InstancedMesh(geo, MAT.ice(), 46);
  for (let i = 0; i < 46; i++) {
    const t = i / 46;
    const x = L * 0.52 + t * L * 0.5;
    const wob = Math.sin(t * 7) * 9;
    const sz = 2.6 + rng() * 3.0 * (1 - t * 0.5);
    v.set(x + (rng() - 0.5) * 5, -0.2 + rng() * sz * 0.5, wob + (rng() - 0.5) * 7);
    e.set(rng() * 3, rng() * 3, rng() * 3);
    q.setFromEuler(e);
    s.set(sz, sz * 0.55, sz * 0.8);
    m.compose(v, q, s);
    ridge.setMatrixAt(i, m);
  }
  ridge.instanceMatrix.needsUpdate = true;
  ridge.castShadow = ridge.receiveShadow = true;
  g.add(ridge);
  return g;
}

/**
 * Collapse a group of static meshes into one mesh per material.
 *
 * A ship built the readable way — a mesh per plate, per crane chord, per
 * window band — is about ninety meshes, and every one of them is a draw call
 * whenever any part of the vessel is on screen. On the hardware this project
 * has to run on (the brief is a government site: it has to work on a cheap
 * phone) that is not affordable for one piece of background scenery.
 *
 * Nothing on the hull moves independently, so the whole thing can be baked
 * down to one mesh per material — twelve draw calls instead of ninety — with
 * no visual change at all. Meshes tagged `userData.keep` stay separate because
 * something animates them.
 */
function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const victims = [];
  group.traverse(o => {
    if (o.isMesh && !o.isInstancedMesh && !o.userData.keep) victims.push(o);
  });
  const byMat = new Map();
  for (const o of victims) {
    const g2 = o.geometry.clone();
    g2.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    // Merging needs one consistent attribute set across the batch.
    for (const name of Object.keys(g2.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g2.deleteAttribute(name);
    }
    if (!g2.attributes.normal) g2.computeVertexNormals();
    if (!g2.attributes.uv) {
      g2.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g2.attributes.position.count * 2), 2));
    }
    if (g2.index) g2.setIndex(Array.from(g2.index.array));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g2);
  }
  for (const o of victims) o.parent?.remove(o);
  for (const [m, geos] of byMat) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) { // mismatched attributes — keep them unmerged rather than lose them
      for (const g2 of geos) group.add(new THREE.Mesh(g2, m));
      continue;
    }
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/* ------------------------------------------------------------------ ship */

/**
 * Build the vessel.
 *
 * @param {object} [opts]
 * @param {number} [opts.length]  LOA in metres (default: the real 164)
 * @param {number} [opts.list]    list to starboard in radians — a beset ship
 *                                nipped by the ice rarely sits dead upright
 * @returns {{ group: THREE.Group, colliders: THREE.Box3[], animated: object }}
 */
export function buildCargoShip(opts = {}) {
  const L = opts.length ?? 164;         // Vasiliy Golovnin, LOA
  const B = opts.beam ?? 22;            // beam
  const draft = opts.draft ?? 6.9;      // draught
  const freeboard = 7.6;
  const list = opts.list ?? 0.035;

  // Deterministic scatter: the ice must look the same every load.
  let seed = 0x5eed1ce;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const root = new THREE.Group();
  root.name = 'cargo-ship';

  // The ship itself lists; the ice around it does not.
  const ship = new THREE.Group();
  ship.rotation.x = list;               // +x is forward, so roll is about x
  root.add(ship);

  /* hull */
  const hull = new THREE.Mesh(buildHull(L, B, draft, freeboard), MAT.hull());
  hull.castShadow = hull.receiveShadow = true;
  ship.add(hull);

  // Boot-topping: the red band at the waterline, the one piece of colour on an
  // otherwise dark hull and the thing that makes the waterline legible.
  const boot = new THREE.Mesh(buildHull(L, B * 1.004, draft, -draft + 1.5), MAT.boot());
  boot.position.y = 0.02;
  ship.add(boot);

  /* main weather deck */
  const deck = new THREE.Mesh(deckPlate(L, B, freeboard, 0.02, 0.985), MAT.deck());
  deck.receiveShadow = true;
  ship.add(deck);

  // Bulwark round the deck edge, so the deck reads as enclosed.
  for (const s of [-1, 1]) {
    const bw = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, 1.5, 0.35), MAT.hull());
    bw.position.set(-L * 0.02, freeboard + 0.75, s * (B / 2 - 0.5));
    bw.castShadow = true;
    ship.add(bw);
  }

  /* forecastle — raised deck at the bow with the anchor gear */
  const fcDeck = new THREE.Mesh(deckPlate(L, B, freeboard + 2.6, 0.80, 0.985, 0.86), MAT.deck());
  ship.add(fcDeck);
  const fcFront = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, B * 0.82), MAT.hull());
  fcFront.position.set(L * 0.30, freeboard + 1.3, 0);
  ship.add(fcFront);
  for (const s of [-1, 1]) {
    const winch = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 10), MAT.steel());
    winch.rotation.z = Math.PI / 2;
    winch.position.set(L * 0.42, freeboard + 3.4, s * 3.4);
    ship.add(winch);
  }
  // Stem mast at the bow.
  const fmast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 12, 8), MAT.steel());
  fmast.position.set(L * 0.36, freeboard + 8.6, 0);
  ship.add(fmast);

  /* cargo hatches down the weather deck */
  const holds = 4;
  for (let i = 0; i < holds; i++) {
    const t = 0.20 + i * 0.145;
    const hx = -L / 2 + t * L;
    const coam = new THREE.Mesh(new THREE.BoxGeometry(L * 0.108, 1.5, B * 0.62), MAT.hull());
    coam.position.set(hx, freeboard + 0.75, 0);
    coam.castShadow = true;
    ship.add(coam);
    const cover = new THREE.Mesh(new THREE.BoxGeometry(L * 0.112, 0.4, B * 0.65), MAT.hatch());
    cover.position.set(hx, freeboard + 1.7, 0);
    cover.castShadow = cover.receiveShadow = true;
    ship.add(cover);
    // Snow lying on the covers. Nothing on a beset ship stays clear.
    const cap = new THREE.Mesh(new THREE.BoxGeometry(L * 0.104, 0.16, B * 0.6), MAT.snow());
    cap.position.set(hx, freeboard + 1.96, 0);
    ship.add(cap);
  }

  /* two deck cranes, forward of the house — per the reference photo */
  const craneAt = [-L * 0.10, L * 0.055];
  craneAt.forEach((cx, i) => {
    const c = deckCrane(19, freeboard + 4.5, i ? 0.62 : 0.38);
    c.position.set(cx, freeboard, 0);
    c.rotation.y = i ? 0.5 : -0.85;
    c.traverse(o => { if (o.isMesh) o.castShadow = true; });
    ship.add(c);
  });

  /* accommodation block and funnel, aft */
  const houseX = -L * 0.30;
  const house = accommodation(B * 0.82, 15, 4, 3.1);
  house.position.set(houseX, freeboard, 0);
  ship.add(house);

  // Funnel: uptakes come from the engine room below, so it stands ON the aft
  // end of the house, not floating alongside it.
  const houseH = house.userData.houseH;
  const funnelBase = freeboard + houseH;
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.0, 8.6, 12), MAT.funnel());
  funnel.position.set(houseX - 4.2, funnelBase + 4.3, 0);
  funnel.castShadow = true;
  ship.add(funnel);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.62, 2.62, 1.5, 12), MAT.dark());
  band.position.set(houseX - 4.2, funnelBase + 7.5, 0);
  ship.add(band);

  // Main mast above the bridge, with a radar bar and a masthead light.
  const mastBase = freeboard + house.userData.topY;
  const mmast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 10, 8), MAT.steel());
  mmast.position.set(houseX + 1, mastBase + 5, 0);
  ship.add(mmast);
  const radar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 4.4), MAT.steel());
  radar.position.set(houseX + 1, mastBase + 8.4, 0);
  ship.add(radar);

  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 8, 6),
    mat('ship-lamp', () => new THREE.MeshBasicMaterial({ color: 0xffe6b8, toneMapped: false }))
  );
  lamp.position.set(houseX + 1, mastBase + 10.4, 0);
  lamp.userData.keep = true;
  ship.add(lamp);

  /* stern gear */
  const sternRail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, B * 0.66), MAT.steel());
  sternRail.position.set(-L * 0.478, freeboard + 0.6, 0);
  ship.add(sternRail);

  // Bake the hull down before the ice goes on: everything above is static
  // relative to the vessel, and ninety draw calls for background scenery is not
  // a price this project can pay.
  mergeStatic(ship);

  /* ice */
  root.add(iceCollar(L, B, rng));

  /* colliders — one box for the hull, kept simple. The ship is scenery: the
   * player can walk up to it across the ice and must not walk through it, but
   * nothing needs a per-plate collision hull at this range. */
  const colliders = [
    new THREE.Box3(
      new THREE.Vector3(-L / 2, -draft, -B / 2),
      new THREE.Vector3(L / 2, freeboard + 6, B / 2)
    )
  ];

  // Slow working of the hull in the ice, and the masthead light. A beset ship
  // is not static — the floe breathes against it.
  const animated = {
    tick: (dt, t) => {
      ship.rotation.x = list + Math.sin(t * 0.11) * 0.006;
      ship.rotation.z = Math.sin(t * 0.083 + 1.3) * 0.0035;
      ship.position.y = Math.sin(t * 0.14) * 0.09;
      lamp.material.color.setScalar(0.8 + (Math.sin(t * 1.6) > 0.2 ? 0.25 : 0));
    }
  };

  root.userData.length = L;
  return { group: root, colliders, animated };
}
