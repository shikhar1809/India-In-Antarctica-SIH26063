import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { signText, MAT } from './kit.js';

/**
 * interior.js — multi-room floor plans.
 *
 * kit.js's buildInterior() builds ONE rectangular room with one of two
 * furniture themes. That is why both stations' insides read as the same
 * place: they are literally the same function with different numbers. This
 * module replaces it with a real floor-plan engine — a set of rooms laid out
 * on a shared floor, walls derived from the room rectangles (deduplicated so
 * a shared partition is one wall, not two overlapping ones), doorways punched
 * where rooms actually connect, and a furniture theme per room type.
 *
 * The two stations then differ the way the real buildings differ, not by
 * palette alone:
 *
 *   Bharati — 134 interlocked containers, three levels. Labs, storage,
 *   technical plant and the garage/workshop are on the LOWER level; the 24
 *   single/double cabins, kitchen/dining, library, gym, medical (the "OP
 *   room") and lounge are on the SECOND; the third is air-handling plant and
 *   the experiment terrace. Modern: aluminium, glazing, wood-accented
 *   common rooms, lots of daylight.
 *
 *   Maitri — ONE main building on stilts, plus separate containerised
 *   modules. Living/dining/lounge/command sit in the main hull; the
 *   laboratories are in bolted-on container modules, which is exactly how
 *   the real station is described. Older and more utilitarian: heavier
 *   insulation panels, worn finishes, visible module seams.
 *
 * Everything is axis-aligned boxes, because the player controller resolves
 * against axis-aligned boxes (see Player._integrate). Geometry that can't be
 * expressed as an AABB can't be collided with correctly here, so it isn't
 * built as something you can walk into.
 */

/* ============================================================== materials */

const _mc = new Map();
const mat = (key, make) => {
  if (!_mc.has(key)) _mc.set(key, make());
  return _mc.get(key);
};

/**
 * Per-station palettes. These are the "reads as a different building"
 * lever that costs nothing: same geometry engine, different surface
 * language. Bharati is the newer container build — cool aluminium greys,
 * warm birch accents, bright ceilings. Maitri is thirty-odd years older —
 * yellowed insulation panel, scuffed green-grey floor, darker ceilings.
 */
export const PALETTE = {
  bharati: {
    floor:  0x4a555f,
    wall:   0xdfe5ea,
    accent: 0xb98b52,   // birch ply — the wood the real interior is finished in
    ceil:   0xeef2f5,
    trim:   0x8a949c,
    door:   0x6f7d88
  },
  maitri: {
    floor:  0x46504a,
    wall:   0xcfc9b4,   // yellowed insulated panel
    accent: 0x8c5a34,
    ceil:   0xd8d6cc,
    trim:   0x7d6a52,
    door:   0x6a5f4e
  },
  // Maitri's bolted-on laboratory containers. Read as a shipping container
  // fitted out inside: painted steel exterior, hard white lab lining.
  module: {
    floor:  0x3e4a52,
    wall:   0xe6ebee,
    accent: 0x2f6b7a,
    ceil:   0xf1f5f7,
    trim:   0x3f4a52,
    door:   0x38505c
  }
};

/* ---- surface textures ----------------------------------------------------
 * Flat untextured colour is what makes a blocked-out room look blocked out.
 * These are small procedural canvases (the same trick kit.js already uses for
 * the exterior cladding) — a sheet-vinyl floor with weld seams and speckle,
 * and a panelised wall with joint lines. One canvas each, shared by every
 * room; only the repeat differs, which is what keeps the scale honest in a
 * 3 m store and a 12 m garage alike. */

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const hex = n => '#' + n.toString(16).padStart(6, '0');

/** Sheet-vinyl floor: speckle plus a welded seam every panel. */
const floorTex = c => mat(`ftex-${c}`, () => canvasTex(256, 256, g => {
  g.fillStyle = hex(c); g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    g.globalAlpha = 0.05 + Math.random() * 0.09;
    g.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.globalAlpha = 0.35; g.strokeStyle = '#000000'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 0.5); g.lineTo(256, 0.5);
  g.moveTo(0.5, 0); g.lineTo(0.5, 256); g.stroke();
  g.globalAlpha = 1;
}));

/** Insulated wall panel: a joint line down each edge, faint vertical shading. */
const wallTex = c => mat(`wtex-${c}`, () => canvasTex(256, 256, g => {
  g.fillStyle = hex(c); g.fillRect(0, 0, 256, 256);
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.10)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(0,0,0,0.10)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  g.globalAlpha = 0.30; g.strokeStyle = '#000000'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(1.5, 0); g.lineTo(1.5, 256); g.stroke();
  g.globalAlpha = 0.10; g.lineWidth = 1;
  for (let i = 0; i < 90; i++) {
    g.beginPath(); const y = Math.random() * 256;
    g.moveTo(0, y); g.lineTo(256, y); g.stroke();
  }
  g.globalAlpha = 1;
}));

const floorMat = p => mat(`fl-${p.floor}`, () => new THREE.MeshStandardMaterial({
  map: floorTex(p.floor), color: 0xffffff, roughness: 0.7, metalness: 0.05
}));
const wallMat  = p => mat(`wl-${p.wall}`,  () => new THREE.MeshStandardMaterial({
  map: wallTex(p.wall), color: 0xffffff, roughness: 0.9
}));
const ceilMat  = p => mat(`cl-${p.ceil}`,  () => new THREE.MeshStandardMaterial({
  map: floorTex(p.ceil), color: 0xffffff, roughness: 0.92
}));

/**
 * Scale a box's UVs so a shared texture repeats at a consistent WORLD size
 * instead of once per face. Done on the geometry rather than by cloning the
 * material per room, so a station gains texture detail without gaining
 * hundreds of materials — the exact cost this project already had to dig
 * itself out of once.
 */
function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}
const trimMat  = p => mat(`tr-${p.trim}`,  () => new THREE.MeshStandardMaterial({ color: p.trim, roughness: 0.6, metalness: 0.25 }));
const doorMat  = p => mat(`dr-${p.door}`,  () => new THREE.MeshStandardMaterial({ color: p.door, roughness: 0.55, metalness: 0.25 }));
const accentMat = p => mat(`ac-${p.accent}`, () => new THREE.MeshStandardMaterial({ color: p.accent, roughness: 0.7 }));

const MAT_GLASSY = () => mat('i-glassy', () => new THREE.MeshStandardMaterial({
  color: 0xcfe0e8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.35
}));

const M = {
  steel:  () => mat('i-steel',  () => new THREE.MeshStandardMaterial({ color: 0x8d969c, roughness: 0.5, metalness: 0.7 })),
  dark:   () => mat('i-dark',   () => new THREE.MeshStandardMaterial({ color: 0x2b3238, roughness: 0.6, metalness: 0.35 })),
  fabric: () => mat('i-fabric', () => new THREE.MeshStandardMaterial({ color: 0x3f5d6b, roughness: 0.95 })),
  wood:   () => mat('i-wood',   () => new THREE.MeshStandardMaterial({ color: 0xb08a5c, roughness: 0.65 })),
  white:  () => mat('i-white',  () => new THREE.MeshStandardMaterial({ color: 0xeef2f4, roughness: 0.7 })),
  screen: () => mat('i-screen', () => new THREE.MeshStandardMaterial({ color: 0x0d1a24, emissive: 0x2a6a8a, emissiveIntensity: 0.9, roughness: 0.3 })),
  glow:   () => mat('i-glow',   () => new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff2c8, emissiveIntensity: 0.9, roughness: 0.4 })),
  cold:   () => mat('i-cold',   () => new THREE.MeshStandardMaterial({ color: 0xcfe4ee, emissive: 0x4a8fb0, emissiveIntensity: 0.35, roughness: 0.5 })),
  rubber: () => mat('i-rubber', () => new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.95 })),
  orange: () => mat('i-orange', () => new THREE.MeshStandardMaterial({ color: 0xd6721f, roughness: 0.7 })),
  green:  () => mat('i-green',  () => new THREE.MeshStandardMaterial({ color: 0x2f6b46, roughness: 0.75 }))
};

/* =============================================================== geometry */

const DOOR_W = 1.25;      // clear doorway width
const DOOR_H = 2.1;       // clear doorway height — lintel above is solid
const WALL_T = 0.16;

/** Canonical key for an edge so a partition shared by two rooms is built once. */
const edgeKey = (axis, fixed, s0, s1) =>
  `${axis}|${fixed.toFixed(3)}|${Math.min(s0, s1).toFixed(3)}|${Math.max(s0, s1).toFixed(3)}`;

/**
 * Build one straight wall run with rectangular openings punched out of it.
 *
 * `axis` 'x' means the wall runs along X at a fixed Z (a north/south wall);
 * 'z' means it runs along Z at a fixed X. Openings are cut full-depth and
 * from the floor up to DOOR_H, with the remaining strip above them kept as a
 * lintel — a doorway, not a slot cut to the ceiling.
 *
 * Colliders match the emitted boxes exactly rather than being derived
 * separately, which is the only way to guarantee you can never walk through
 * something you can see (or bump into something you can't).
 */
function wallRun(g, colliders, { axis, fixed, s0, s1, floorY, wallH, wt, material, openings = [] }) {
  const a = Math.min(s0, s1), b = Math.max(s0, s1);

  // Sort openings and clamp them inside the run.
  const cuts = openings
    .map(o => ({ lo: Math.max(a, o.c - o.w / 2), hi: Math.min(b, o.c + o.w / 2) }))
    .filter(o => o.hi > o.lo)
    .sort((p, q) => p.lo - q.lo);

  const push = (lo, hi, y0, h) => {
    if (hi - lo <= 1e-4 || h <= 1e-4) return;
    const len = hi - lo, mid = (lo + hi) / 2;
    const w = axis === 'x' ? len : wt;
    const d = axis === 'x' ? wt : len;
    const x = axis === 'x' ? mid : fixed;
    const z = axis === 'x' ? fixed : mid;
    const m = new THREE.Mesh(scaleUV(new THREE.BoxGeometry(w, h, d), Math.max(1, len / 1.2), Math.max(1, h / 2.6)), material);
    m.position.set(x, y0 + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, y0, z - d / 2),
      new THREE.Vector3(x + w / 2, y0 + h, z + d / 2)
    ));
  };

  // Full-height segments between the openings.
  let cursor = a;
  for (const c of cuts) {
    push(cursor, c.lo, floorY, wallH);
    cursor = Math.max(cursor, c.hi);
  }
  push(cursor, b, floorY, wallH);

  // Lintels over each opening. No collider: the underside sits at DOOR_H,
  // well above the player's 1.72 m eye height, so nothing can reach it and a
  // collider there would only risk catching a head on a doorway.
  const lintelH = wallH - DOOR_H;
  if (lintelH > 0.01) {
    for (const c of cuts) {
      const len = c.hi - c.lo, mid = (c.lo + c.hi) / 2;
      const w = axis === 'x' ? len : wt;
      const d = axis === 'x' ? wt : len;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, lintelH, d), material);
      m.position.set(
        axis === 'x' ? mid : fixed,
        floorY + DOOR_H + lintelH / 2,
        axis === 'x' ? fixed : mid
      );
      m.castShadow = true;
      g.add(m);
    }
  }
}

/** Overlap interval of two 1-D spans, or null when they only touch/miss. */
function overlap(a0, a1, b0, b1) {
  const lo = Math.max(Math.min(a0, a1), Math.min(b0, b1));
  const hi = Math.min(Math.max(a0, a1), Math.max(b0, b1));
  return hi - lo > 0.05 ? [lo, hi] : null;
}

/**
 * Find the wall two rooms share, if any. Rooms touch when one's edge sits on
 * the other's edge (within a small tolerance) and their spans overlap along
 * the other axis.
 */
function sharedEdge(A, B) {
  const T = 0.02;
  // Vertical partition: A.x1 == B.x0 (or vice versa), overlapping in Z.
  for (const [p, q] of [[A, B], [B, A]]) {
    if (Math.abs(p.x1 - q.x0) < T) {
      const ov = overlap(p.z0, p.z1, q.z0, q.z1);
      if (ov) return { axis: 'z', fixed: p.x1, s0: ov[0], s1: ov[1] };
    }
    if (Math.abs(p.z1 - q.z0) < T) {
      const ov = overlap(p.x0, p.x1, q.x0, q.x1);
      if (ov) return { axis: 'x', fixed: p.z1, s0: ov[0], s1: ov[1] };
    }
  }
  return null;
}

/**
 * Build a complete floor: floor slabs, deduplicated walls with doorways,
 * ceiling, lighting, and each room's furniture.
 *
 * @param {object} spec
 * @param {{id,x0,x1,z0,z1,theme,label?,ceilH?,noCeil?,noFloor?}[]} spec.rooms
 * @param {{a:string,b:string,w?:number,at?:number}[]} spec.doors   `b` may be
 *        'outside' for a door in the perimeter wall of room `a`, with `side`
 *        ('n'|'s'|'e'|'w') naming which wall it goes in.
 * @param {{x0,x1,z0,z1}[]} [spec.floorHoles]  stairwell openings in the slab
 * @param {{x0,x1,z0,z1}[]} [spec.ceilHoles]   stairwell openings in the ceiling
 */
export function buildFloorPlan(spec) {
  const {
    rooms, doors = [], floorY, ceilH = 2.6, wt = WALL_T,
    palette, floorHoles = [], ceilHoles = [], lights = true,
    // three.js's forward renderer evaluates EVERY light in the scene for
    // every fragment of every standard material — there is no clustering or
    // distance culling in that path — so total scene light count, not
    // proximity, is what costs. A plan this size can easily add fifty
    // PointLights on its own, which is exactly the cost that made this
    // project unplayable on phones once before. On weak hardware each room
    // gets one light instead of two and the decorative accent lights are
    // dropped; the emissive ceiling strips still read as lit.
    lowLights = false
  } = spec;

  const g = new THREE.Group();
  const colliders = [];
  const byId = new Map(rooms.map(r => [r.id, r]));
  const out = { mesh: g, colliders, rooms: {}, lights: [], animated: [], lightSpots: [], scopeKinds: new Set() };

  const P = palette;
  const fMat = floorMat(P), wMat = wallMat(P), cMat = ceilMat(P), tMat = trimMat(P);

  /* ---- floor slabs -------------------------------------------------- */
  // One slab per room rather than a single plan-wide slab, so a room can opt
  // out (noFloor) where a stairwell drops through, without needing to
  // decompose a big slab around the hole.
  for (const r of rooms) {
    if (r.noFloor) continue;
    const holes = floorHoles.filter(h => rectsOverlap(h, r));
    for (const piece of subtractRects(r, holes)) {
      const w = piece.x1 - piece.x0, d = piece.z1 - piece.z0;
      if (w <= 0.02 || d <= 0.02) continue;
      const slab = new THREE.Mesh(scaleUV(new THREE.BoxGeometry(w, 0.2, d), w / 2, d / 2), fMat);
      slab.position.set((piece.x0 + piece.x1) / 2, floorY - 0.1, (piece.z0 + piece.z1) / 2);
      slab.receiveShadow = true;
      g.add(slab);
      colliders.push(new THREE.Box3(
        new THREE.Vector3(piece.x0, floorY - 0.2, piece.z0),
        new THREE.Vector3(piece.x1, floorY, piece.z1)
      ));
    }
  }

  /* ---- ceilings ------------------------------------------------------ */
  for (const r of rooms) {
    if (r.noCeil) continue;
    const h = r.ceilH ?? ceilH;
    const holes = ceilHoles.filter(x => rectsOverlap(x, r));
    for (const piece of subtractRects(r, holes)) {
      const w = piece.x1 - piece.x0, d = piece.z1 - piece.z0;
      if (w <= 0.02 || d <= 0.02) continue;
      const slab = new THREE.Mesh(scaleUV(new THREE.BoxGeometry(w, 0.2, d), w / 3, d / 3), cMat);
      slab.position.set((piece.x0 + piece.x1) / 2, floorY + h + 0.1, (piece.z0 + piece.z1) / 2);
      g.add(slab);
    }
  }

  /* ---- walls --------------------------------------------------------- */
  // Every room contributes its four edges; identical edges collapse to one
  // wall so a shared partition isn't built twice (two coincident walls
  // z-fight, and doubling their colliders makes doorways feel "sticky").
  const edges = new Map();
  const addEdge = (axis, fixed, s0, s1, room) => {
    const k = edgeKey(axis, fixed, s0, s1);
    if (!edges.has(k)) edges.set(k, { axis, fixed, s0: Math.min(s0, s1), s1: Math.max(s0, s1), rooms: [], openings: [] });
    edges.get(k).rooms.push(room.id);
  };
  for (const r of rooms) {
    addEdge('x', r.z0, r.x0, r.x1, r);   // north
    addEdge('x', r.z1, r.x0, r.x1, r);   // south
    addEdge('z', r.x0, r.z0, r.z1, r);   // west
    addEdge('z', r.x1, r.z0, r.z1, r);   // east
  }

  // Punch doorways. Interior doors find the shared edge between the two
  // rooms; perimeter doors ('outside') are placed on the named side.
  const doorFrames = [];
  for (const d of doors) {
    const w = d.w ?? DOOR_W;
    const A = byId.get(d.a);
    if (!A) continue;

    let axis, fixed, span;
    if (d.b === 'outside') {
      const side = d.side ?? 's';
      axis = (side === 'n' || side === 's') ? 'x' : 'z';
      fixed = side === 'n' ? A.z0 : side === 's' ? A.z1 : side === 'w' ? A.x0 : A.x1;
      span = axis === 'x' ? [A.x0, A.x1] : [A.z0, A.z1];
    } else {
      const B = byId.get(d.b);
      if (!B) continue;
      const e = sharedEdge(A, B);
      if (!e) continue;
      axis = e.axis; fixed = e.fixed; span = [e.s0, e.s1];
    }

    const c = d.at ?? (span[0] + span[1]) / 2;

    // Apply the opening to every edge lying on this line — that is both
    // sides of a shared partition when the two rooms' edges weren't exactly
    // coincident.
    //
    // A requested opening WIDER than the wall it goes in used to be skipped
    // here, which silently produced a solid wall where a door was asked for
    // — a room sealed off with no error anywhere. Clamp to what the wall can
    // actually give instead (leaving a jamb each side): a narrower door than
    // requested is a compromise, a missing door is a bug.
    let placed = false;
    const reqLo = c - w / 2, reqHi = c + w / 2;
    for (const e of edges.values()) {
      if (e.axis !== axis) continue;
      if (Math.abs(e.fixed - fixed) > 0.02) continue;
      // The edge has to be WHERE THE DOOR IS. Dropping this test (an earlier
      // attempt at the clamp below did) makes one door punch a hole in every
      // wall that happens to lie on the same line — including walls in other
      // rooms entirely — and leaves the recorded door frame pointing at the
      // wrong one, which in turn sends the furniture keep-out to the wrong
      // place and lets a shelf rack close the real doorway.
      const lo = Math.max(e.s0, reqLo), hi = Math.min(e.s1, reqHi);
      if (hi - lo < 0.5) continue;
      // Clamp to what this particular wall can give, keeping a jamb each
      // side: a narrower door than asked for is a compromise, a silently
      // missing door is a bug.
      const avail = Math.max(0, (e.s1 - e.s0) - 0.3);
      const ww = Math.min(w, avail);
      if (ww < 0.7) continue;
      const cc = Math.min(Math.max(c, e.s0 + 0.15 + ww / 2), e.s1 - 0.15 - ww / 2);
      e.openings.push({ c: cc, w: ww });
      if (!placed) { doorFrames.push({ axis, fixed, c: cc, w: ww }); placed = true; }
    }
  }

  const wallH = ceilH;
  for (const e of edges.values()) {
    wallRun(g, colliders, {
      axis: e.axis, fixed: e.fixed, s0: e.s0, s1: e.s1,
      floorY, wallH, wt, material: wMat, openings: e.openings
    });
  }

  // Door frame trim — a thin lining round each opening. Purely visual, and
  // deliberately thinner than the wall so it can never narrow the clear
  // width the collider gap actually gives you.
  for (const f of doorFrames) {
    const jamb = 0.06;
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(
          f.axis === 'x' ? jamb : wt * 1.05,
          DOOR_H,
          f.axis === 'x' ? wt * 1.05 : jamb
        ), tMat);
      m.position.set(
        f.axis === 'x' ? f.c + s * (f.w / 2 + jamb / 2) : f.fixed,
        floorY + DOOR_H / 2,
        f.axis === 'x' ? f.fixed : f.c + s * (f.w / 2 + jamb / 2)
      );
      g.add(m);
    }
  }

  // Everything above is the building's SHELL — floor slabs, wall segments,
  // ceiling slabs, door frames — and on a 54-room plan that is several hundred
  // meshes off about four materials. Batch them now, before any furniture
  // exists: it collapses to a handful of draws. They are large and always in
  // view anyway, so nothing is lost to frustum culling.
  mergeRoomStatic(g);

  /* ---- per-room furniture + light ------------------------------------ */
  for (const r of rooms) {
    // Doorway keep-out zones. Themes place furniture against walls by
    // definition — a bench runs along a wall, a rack stands against one —
    // and they have no idea which of those walls has a door in it. Left
    // unchecked that puts a 1.9 m shelf rack squarely across a doorway: the
    // room still looks right and is completely unreachable. Rather than
    // hand-tuning every theme against every plan, each room gets the
    // rectangles its own doorways need kept clear, and the placement
    // helpers refuse to build anything that intersects one.
    const keepOut = [];
    const CLEAR = 1.15;                       // how far into the room to protect
    for (const f of doorFrames) {
      const pad = f.w / 2 + 0.45;
      if (f.axis === 'x' && Math.abs(f.fixed - r.z0) < 0.02) {
        keepOut.push({ x0: f.c - pad, x1: f.c + pad, z0: r.z0, z1: r.z0 + CLEAR });
      } else if (f.axis === 'x' && Math.abs(f.fixed - r.z1) < 0.02) {
        keepOut.push({ x0: f.c - pad, x1: f.c + pad, z0: r.z1 - CLEAR, z1: r.z1 });
      } else if (f.axis === 'z' && Math.abs(f.fixed - r.x0) < 0.02) {
        keepOut.push({ x0: r.x0, x1: r.x0 + CLEAR, z0: f.c - pad, z1: f.c + pad });
      } else if (f.axis === 'z' && Math.abs(f.fixed - r.x1) < 0.02) {
        keepOut.push({ x0: r.x1 - CLEAR, x1: r.x1, z0: f.c - pad, z1: f.c + pad });
      }
    }

    // Each room gets its own group so its furniture can be batched on its own
    // and still frustum-cull as a unit.
    const rg = new THREE.Group();
    rg.name = 'room-' + r.id;
    g.add(rg);
    const ctx = {
      g: rg, colliders, room: r, palette: P, floorY,
      ceilH: r.ceilH ?? ceilH,
      cx: (r.x0 + r.x1) / 2, cz: (r.z0 + r.z1) / 2,
      w: r.x1 - r.x0, d: r.z1 - r.z0,
      keepOut, lowLights,
      addBox, lightsOut: out.lights, lightSpots: out.lightSpots,
      // Per-room motion, and a per-room deterministic RNG. The RNG is what
      // stops four cabins built from one 'dorm' theme being four identical
      // copies of each other: same code, different blanket colours, lockers,
      // clutter and blink phases — and it is stable across reloads because it
      // is seeded off the room id rather than Math.random.
      anim: out.animated,
      scopeKinds: out.scopeKinds,
      rng: mulberry32(hashId(r.id))
    };
    out.rooms[r.id] = {
      id: r.id, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1,
      cx: ctx.cx, cz: ctx.cz, floorY, theme: r.theme, label: r.label
    };

    if (lights && !r.noCeil) roomLight(ctx);
    // Skirting round every room. A hard wall/floor junction is one of the
    // strongest "untextured box" tells there is; a 0.1 m trim line reads as
    // a built junction and costs four thin boxes with no colliders.
    skirting(ctx, tMat);
    const fn = THEMES[r.theme];
    if (fn) fn(ctx);
    // Second pass: the things that make this particular room that room —
    // the instrument that belongs to this discipline, the machine that is
    // running, the clutter nobody would put anywhere else. Kept separate
    // from the theme itself so "what the room is made of" and "what the room
    // is doing" stay legible as two different questions.
    const dfn = DETAIL[r.variant && DETAIL[r.theme + ':' + r.variant] ? r.theme + ':' + r.variant : r.theme];
    if (dfn) dfn(ctx);

    if (r.label) roomSign(ctx, r.label);
    mergeRoomStatic(rg);
    // Publish anything a theme worked out about the room, so it can be checked
    // from outside (the mess's real seat count, for one — a room labelled for
    // 25 that only fitted 8 is exactly the kind of thing that must be testable
    // rather than eyeballed).
    if (r.seats !== undefined) out.rooms[r.id].seats = r.seats;
    if (r.seatsBuilt !== undefined) out.rooms[r.id].seatsBuilt = r.seatsBuilt;
  }

  buildLightPool(out, g, lowLights);
  return out;
}

/**
 * Build the shared pool of real lights for a floor plan and wire up the
 * per-frame reassignment.
 *
 * POOL is deliberately small. Two lights cover the room you are standing in;
 * the rest cover the doorways you can see through. Beyond that you are paying
 * for lights nobody can tell are there.
 */
function buildLightPool(out, g, lowLights) {
  const spots = out.lightSpots;
  if (!spots.length) return;
  const POOL = Math.min(spots.length, lowLights ? 4 : 8);
  const lights = [];
  for (let i = 0; i < POOL; i++) {
    const pl = new THREE.PointLight(0xfff1cf, 1.5, 10, 2);
    pl.visible = false;
    g.add(pl);
    lights.push(pl);
    out.lights.push(pl);
  }
  // Reassignment is O(spots) per frame, done a few times a second rather than
  // every frame — a light popping on a fifth of a second late is invisible,
  // and sorting 100 spots at 60 Hz is not free.
  let acc = 0;
  const scratch = new THREE.Vector3();
  out.animated.push({
    tick: (dt, t, nightFactor, playerPos) => {
      acc += dt;
      if (acc < 0.2 || !playerPos) return;
      acc = 0;
      // Distance from the player to each candidate, in the plan's own space.
      g.getWorldPosition(scratch);
      for (const sp of spots) {
        const dx = sp.x + scratch.x - playerPos.x;
        const dy = sp.y + scratch.y - playerPos.y;
        const dz = sp.z + scratch.z - playerPos.z;
        sp.d = dx * dx + dy * dy + dz * dz;
      }
      spots.sort((a, b) => a.d - b.d);
      for (let i = 0; i < lights.length; i++) {
        const sp = spots[i];
        const pl = lights[i];
        // Nothing within 45 m is worth lighting from here.
        if (!sp || sp.d > 45 * 45) { pl.visible = false; continue; }
        pl.visible = true;
        pl.position.set(sp.x, sp.y, sp.z);
        pl.distance = sp.r;
      }
    }
  });
}

/**
 * Collapse one room's static furniture into a mesh per material.
 *
 * A furnished room is 40-80 little meshes and every one is a draw call. Across
 * a 54-room station that came to 810 draw calls in a single view, which is not
 * a budget a government site running on a cheap phone has.
 *
 * Merging PER ROOM rather than per floor matters: a per-floor merge produces
 * one huge mesh per material whose bounding box covers the whole floor, so it
 * can never be frustum-culled and you pay for every room at once. Per room, a
 * room you cannot see still costs nothing, and a room you can see costs about
 * eight draws instead of sixty.
 *
 * Anything that moves independently is tagged `userData.keep` and left alone.
 */
function mergeRoomStatic(room) {
  // Same QA escape hatch as bake.js: merging a room into one mesh per
  // material erases every prop's own bounding box, which makes it
  // impossible to ask "is anything actually underneath this crate".
  if (globalThis.__QA_NOBAKE) return;
  const victims = [];
  room.updateMatrixWorld(true);
  room.traverse(o => {
    if (o.isMesh && !o.isInstancedMesh && !o.userData.keep) victims.push(o);
  });
  if (victims.length < 6) return;                 // not worth the churn
  const byMat = new Map();
  for (const o of victims) {
    const g2 = o.geometry.clone();
    g2.applyMatrix4(o.matrixWorld);
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
    if (!merged) { for (const g2 of geos) room.add(new THREE.Mesh(g2, m)); continue; }
    const mesh = new THREE.Mesh(merged, m);
    // NO SHADOW PARTICIPATION. The only shadow caster in the world is the
    // sun, and the sun does not reach inside a sealed building — but every
    // interior mesh was still being re-rendered into the shadow map on every
    // refresh, which is hundreds of extra draws for shadows nobody can ever
    // see. Interiors are lit by the point-light pool, and point lights here
    // cast nothing.
    mesh.castShadow = mesh.receiveShadow = false;
    room.add(mesh);
  }
}

/* Small helpers used by the plan builder ---------------------------------- */

/** FNV-1a over a room id — a stable seed, so a room looks the same every run. */
function hashId(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** mulberry32 — small, fast, and good enough for picking blanket colours. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rectsOverlap(a, b) {
  return a.x0 < b.x1 - 0.01 && a.x1 > b.x0 + 0.01 && a.z0 < b.z1 - 0.01 && a.z1 > b.z0 + 0.01;
}

/**
 * Subtract axis-aligned holes from a rect, returning the remaining pieces.
 * Guillotine split, one hole at a time — enough for stairwell openings, and
 * it never produces overlapping pieces (which would double up colliders).
 */
function subtractRects(rect, holes) {
  let pieces = [{ x0: rect.x0, x1: rect.x1, z0: rect.z0, z1: rect.z1 }];
  for (const h of holes) {
    const next = [];
    for (const p of pieces) {
      if (!rectsOverlap(h, p)) { next.push(p); continue; }
      const lo = { x0: Math.max(h.x0, p.x0), x1: Math.min(h.x1, p.x1), z0: Math.max(h.z0, p.z0), z1: Math.min(h.z1, p.z1) };
      if (p.z0 < lo.z0) next.push({ x0: p.x0, x1: p.x1, z0: p.z0, z1: lo.z0 });
      if (lo.z1 < p.z1) next.push({ x0: p.x0, x1: p.x1, z0: lo.z1, z1: p.z1 });
      if (p.x0 < lo.x0) next.push({ x0: p.x0, x1: lo.x0, z0: lo.z0, z1: lo.z1 });
      if (lo.x1 < p.x1) next.push({ x0: lo.x1, x1: p.x1, z0: lo.z0, z1: lo.z1 });
    }
    pieces = next;
  }
  return pieces;
}

/**
 * Place a mesh and (optionally) its collider. Collider height comes from the
 * geometry, so a knee-high bench blocks at knee height and a full-height rack
 * blocks all the way up — nothing is a waist-high invisible wall.
 */
/** True when a footprint centred at (x,z) would foul one of the room's doorways. */
function foulsDoor(ctx, x, z, w, d) {
  if (!ctx.keepOut || !ctx.keepOut.length) return false;
  const a = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
  return ctx.keepOut.some(k => a.x0 < k.x1 && a.x1 > k.x0 && a.z0 < k.z1 && a.z1 > k.z0);
}

/**
 * Split a run that hugs a wall (a coat rail, a bench, a pipe run) into the
 * stretches of it that clear every doorway in the room.
 *
 * addBox() can only take the all-or-nothing decision "does this single object
 * foul a door" — right for a locker, wrong for anything that runs the length
 * of a wall, because one doorway anywhere along that wall throws the whole
 * run away (or, worse, the run is pushed straight to ctx.colliders and never
 * asks). A 2.3 m coat rail across a 1.25 m store-room door is what sealed
 * Maitri's dry store; the rail should have been built in two pieces with the
 * doorway between them, which is what a real airlock looks like anyway.
 *
 * @returns {[number,number][]} clear [from,to] spans along `axis`
 */
function clearSpans(ctx, { axis = 'z', across, a0, a1, thick = 0.5, min = 0.6 }) {
  const spans = [];
  const step = 0.1;
  let cur = null;
  for (let a = a0; a <= a1 + 1e-6; a += step) {
    const x = axis === 'x' ? a : across, z = axis === 'x' ? across : a;
    const w = axis === 'x' ? step : thick, d = axis === 'x' ? thick : step;
    if (!foulsDoor(ctx, x, z, w, d)) { if (cur) cur[1] = a; else cur = [a, a]; }
    else if (cur) { spans.push(cur); cur = null; }
  }
  if (cur) spans.push(cur);
  return spans.filter(sp => sp[1] - sp[0] >= min);
}

function addBox(ctx, mesh, x, y, z, { ry = 0, collide = true, cw, cd, ch } = {}) {
  // Anything that would stand in a doorway is simply not built. Skipping is
  // the right call over nudging: a nudged object lands somewhere the theme
  // never reasoned about and can foul something else, whereas a missing
  // stool in a corner is invisible.
  if (collide) {
    const pp = mesh.geometry.parameters ?? {};
    const rot0 = Math.abs(Math.sin(ry)) > 0.5;
    const fw = cw ?? (rot0 ? (pp.depth ?? 0.5) : (pp.width ?? 0.5));
    const fd = cd ?? (rot0 ? (pp.width ?? 0.5) : (pp.depth ?? 0.5));
    if (foulsDoor(ctx, x, z, fw, fd)) return null;
  }
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.castShadow = mesh.receiveShadow = true;
  ctx.g.add(mesh);
  if (collide) {
    const p = mesh.geometry.parameters ?? {};
    // Rotated furniture swaps its footprint axes; without this a bench turned
    // 90° collides along the wrong axis and you walk through it end-on.
    const rot = Math.abs(Math.sin(ry)) > 0.5;
    const gw = cw ?? (rot ? (p.depth ?? 0.5) : (p.width ?? 0.5));
    const gd = cd ?? (rot ? (p.width ?? 0.5) : (p.depth ?? 0.5));
    const gh = ch ?? (p.height ?? 0.8);
    ctx.colliders.push(new THREE.Box3(
      new THREE.Vector3(x - gw / 2, ctx.floorY, z - gd / 2),
      new THREE.Vector3(x + gw / 2, ctx.floorY + gh, z + gd / 2)
    ));
  }
  return mesh;
}

/**
 * Set a small object down on whatever surface is actually under it.
 *
 * Glassware, a coffee urn, a bench vice, a stack of plates: all of these are
 * written as "at this spot, at bench height", which is fine right up until the
 * bench they assume isn't there — because the room came out a different size,
 * or because the bench got skipped for fouling a doorway. Then the item hangs
 * in mid-air at exactly bench height, which is the single most obvious
 * unfinished-looking bug a 3D scene can have.
 *
 * This asks the collider set what is really beneath the point and rests the
 * object on it. If there is nothing to rest on, the object is not built:
 * a missing mug is invisible, a floating one is not.
 *
 * @param {number} h      the object's own height, so it sits ON the surface
 * @param {number} nearY  roughly where it was meant to be, used to pick which
 *                        surface (a bench top, not the floor two feet below)
 */
/**
 * The height of the real surface under (x, z), or null if there is nothing
 * within `reach` below `nearY` to rest on.
 *
 * Split out of placeOn because the animated instruments need the ANSWER
 * without wanting placeOn to build the mesh for them: a chart drum has to
 * know the bench top so it can sit its 0.11 m radius on it, and a bell jar
 * has to cover a seismometer standing on that same surface. Guessing that
 * height instead is what left both of them hanging in the air.
 */
function topUnder(ctx, x, z, nearY, reach = 0.6) {
  let best = null;
  for (const b of ctx.colliders) {
    if (x < b.min.x - 0.02 || x > b.max.x + 0.02) continue;
    if (z < b.min.z - 0.02 || z > b.max.z + 0.02) continue;
    if (b.max.y > nearY + 0.06) continue;                 // above where it goes
    if (best === null || b.max.y > best) best = b.max.y;
  }
  if (best === null || nearY - best > reach) return null;  // nothing to stand on
  return best;
}

function placeOn(ctx, mesh, x, z, h, nearY, opts = {}) {
  const best = topUnder(ctx, x, z, nearY, opts.reach ?? 0.5);
  if (best === null) return null;
  return addBox(ctx, mesh, x, best + h / 2, z, { collide: false, ...opts });
}

/**
 * Ceiling strip light.
 *
 * The strip itself is an emissive mesh and costs nothing. The POINT LIGHT is
 * the expensive half: this is a forward renderer, so every light is evaluated
 * per fragment on every lit surface in range, and the cost is lights x
 * fragments. One light per room was affordable at 12 rooms a station. At 54 it
 * came to 109 lights in Bharati alone and the renderer stalled outright.
 *
 * So rooms no longer own lights — they register where a light SHOULD be, and a
 * small pool of real lights is moved to whichever of those spots are nearest
 * the player each frame. You are only ever in one or two rooms at a time; the
 * rest keep their emissive strips, which still read as lit from a doorway.
 */
function roomLight(ctx) {
  const { g, cx, cz, w, d, floorY, ceilH } = ctx;
  const long = Math.max(w, d), across = Math.min(w, d);
  const n = (across < 4 || ctx.lowLights) ? 1 : 2;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : (i + 0.5) / n;
    const px = w > d ? cx : ctx.room.x0 + w * t;
    const pz = w > d ? ctx.room.z0 + d * t : cz;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w > d ? long * 0.45 : 0.14, 0.06, w > d ? 0.14 : long * 0.45), M.glow());
    strip.position.set(px, floorY + ceilH - 0.05, pz);
    g.add(strip);
    ctx.lightSpots.push({ x: px, y: floorY + ceilH - 0.35, z: pz, r: Math.max(long, 6) * 0.9 });
  }
}

/** Skirting trim on all four walls of a room. Visual only. */
function skirting(ctx, m) {
  const { g, room, floorY } = ctx;
  const t = 0.04, h = 0.11;
  const add = (w, d, x, z) => {
    const s = box(w, h, d, m);
    s.position.set(x, floorY + h / 2, z);
    g.add(s);
  };
  add(ctx.w, t, ctx.cx, room.z0 + t / 2);
  add(ctx.w, t, ctx.cx, room.z1 - t / 2);
  add(t, ctx.d, room.x0 + t / 2, ctx.cz);
  add(t, ctx.d, room.x1 - t / 2, ctx.cz);
}

/** Room nameplate over the doorway wall, so the plan is legible in play. */
function roomSign(ctx, label) {
  const { g, room, floorY, cx } = ctx;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.min(1.9, ctx.w * 0.6), 0.26),
    mat(`sign-${label}`, () => new THREE.MeshStandardMaterial({
      map: signText(label, { color: '#e8f2f8', bg: '#16222c', w: 512 }),
      roughness: 0.7
    }))
  );
  plate.position.set(cx, floorY + 2.32, room.z0 + 0.09);
  g.add(plate);
}

/* ================================================================ themes */
/* Each theme furnishes one room. They share the primitive helpers below so
 * a "bench" is the same object everywhere and only its arrangement changes,
 * which is what keeps twelve room types from becoming twelve art styles. */

const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r, h, m, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);

/** A run of counter/bench along a wall. */
function benchRun(ctx, { x, z, len, axis = 'x', h = 0.9, dpt = 0.62, m }) {
  const mesh = box(axis === 'x' ? len : dpt, h, axis === 'x' ? dpt : len, m ?? M.steel());
  return addBox(ctx, mesh, x, ctx.floorY + h / 2, z, { ch: h });   // null if it fouls a door
}

/** Wall-mounted shelving: uprights + boards, one collider for the whole rack. */
function shelfRack(ctx, { x, z, len, axis = 'x', h = 1.95, dpt = 0.45, crates = 0 }) {
  const { g, floorY, room } = ctx;
  const m = M.steel();
  // An ISLAND rack — one standing away from both side walls, with floor
  // meant to be walkable on either side of it — has to leave room to get
  // PAST its ends, or it is not furniture, it is a partition. A 4 m rack in
  // a 4.84 m room left 0.42 m at each end: exactly the player's radius, so
  // the store room was cut in half and everything beyond it (here, the whole
  // cold store) became unreachable. Clamp island racks to leave a real
  // walkway at both ends; racks pushed up against a wall are untouched,
  // because nobody needs to walk behind those.
  if (room) {
    const acr = axis === 'x' ? z : x;               // position across the rack
    const lo = axis === 'x' ? room.z0 : room.x0, hi = axis === 'x' ? room.z1 : room.x1;
    const isIsland = acr - lo > 1.0 && hi - acr > 1.0;
    if (isIsland) {
      const alo = axis === 'x' ? room.x0 : room.z0, ahi = axis === 'x' ? room.x1 : room.z1;
      const along = axis === 'x' ? x : z;
      const room4 = 2 * Math.min(along - alo, ahi - along) - 2.4;   // 1.2 m walkway each end
      if (room4 < 1.2) return;                       // no honest way to fit one
      len = Math.min(len, room4);
    }
  }
  const w = axis === 'x' ? len : dpt, d = axis === 'x' ? dpt : len;
  // A full-height rack across a doorway is the worst version of this bug —
  // it seals the room completely — so it gets the same check as everything
  // else placed by hand.
  if (foulsDoor(ctx, x, z, w, d)) return;
  for (const t of [0.35, 0.85, 1.35, 1.85]) {
    const board = box(w, 0.05, d, m);
    board.position.set(x, floorY + t, z);
    board.castShadow = board.receiveShadow = true;
    g.add(board);
  }
  for (const s of [-1, 1]) {
    const post = box(0.06, h, 0.06, m);
    post.position.set(
      axis === 'x' ? x + s * (len / 2 - 0.05) : x,
      floorY + h / 2,
      axis === 'x' ? z : z + s * (len / 2 - 0.05)
    );
    g.add(post);
  }
  ctx.colliders.push(new THREE.Box3(
    new THREE.Vector3(x - w / 2, floorY, z - d / 2),
    new THREE.Vector3(x + w / 2, floorY + h, z + d / 2)
  ));
  // Crates on the shelves, instanced — a store room's whole visual identity
  // is "a lot of boxes", and that must not cost a lot of draw calls.
  if (crates > 0) {
    const geo = new THREE.BoxGeometry(0.38, 0.3, 0.34);
    const im = new THREE.InstancedMesh(geo, M.orange(), crates);
    const mtx = new THREE.Matrix4();
    const col = new THREE.Color();
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(crates * 3), 3);
    for (let i = 0; i < crates; i++) {
      const tier = [0.53, 1.03, 1.53][i % 3];
      const along = -len / 2 + 0.35 + ((Math.floor(i / 3) + 0.5) * 0.5) % Math.max(0.5, len - 0.7);
      mtx.makeTranslation(
        axis === 'x' ? x + along : x,
        floorY + tier,
        axis === 'x' ? z : z + along
      );
      im.setMatrixAt(i, mtx);
      col.setHSL(0.07 + (i % 4) * 0.05, 0.45, 0.42);
      im.setColorAt(i, col);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = true;
    g.add(im);
  }
}

/* ---- detail primitives ---------------------------------------------------
 * The difference between "a box painted grey" and "a plant room" is almost
 * entirely small repeated hardware: flanges on the pipes, a valve wheel, a
 * gauge face, hazard striping on the floor, a cable tray overhead. None of it
 * is expensive — most of it is instanced or collider-free — but it is what
 * makes a room look built rather than blocked out. */

const HAZARD = () => mat('hazard', () => new THREE.MeshStandardMaterial({ color: 0xd8a12a, roughness: 0.8 }));
const GRATE  = () => mat('grate',  () => new THREE.MeshStandardMaterial({ color: 0x353c42, roughness: 0.85, metalness: 0.5 }));
const GAUGE  = () => mat('gauge',  () => new THREE.MeshStandardMaterial({ color: 0xe8f4f8, emissive: 0x6fd0e8, emissiveIntensity: 0.55, roughness: 0.35 }));
const COPPER = () => mat('copper', () => new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.45, metalness: 0.7 }));

/** A pipe with flanges at each end, optionally with a valve wheel on it. */
function pipeRun(ctx, { x, y, z, len, axis = 'x', r = 0.075, m, valve = false }) {
  const { g } = ctx;
  const mm = m ?? M.steel();
  const p = cyl(r, len, mm, 10);
  if (axis === 'x') p.rotation.z = Math.PI / 2;
  if (axis === 'z') p.rotation.x = Math.PI / 2;
  p.position.set(x, y, z);
  p.castShadow = true;
  g.add(p);
  // Flanges: two slightly fatter, shorter cylinders at the ends. Cheap, and
  // they stop a pipe reading as a floating stick.
  for (const s of [-1, 1]) {
    const f = cyl(r * 1.55, 0.06, mm, 10);
    if (axis === 'x') f.rotation.z = Math.PI / 2;
    if (axis === 'z') f.rotation.x = Math.PI / 2;
    f.position.set(
      x + (axis === 'x' ? s * len / 2 : 0),
      y + (axis === 'y' ? s * len / 2 : 0),
      z + (axis === 'z' ? s * len / 2 : 0)
    );
    g.add(f);
  }
  if (valve) {
    const stem = cyl(0.022, 0.2, mm, 6);
    stem.position.set(x, y + r + 0.1, z);
    g.add(stem);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 6, 12), M.orange());
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, y + r + 0.21, z);
    wheel.castShadow = true;
    g.add(wheel);
  }
  return p;
}

/** Round gauge face on the front of a machine. */
function gauge(ctx, x, y, z, r = 0.08) {
  const face = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 12), GAUGE());
  face.rotation.x = Math.PI / 2;
  face.position.set(x, y, z);
  ctx.g.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.014, 6, 14), M.dark());
  rim.position.set(x, y, z + 0.005);
  ctx.g.add(rim);
}

/** Painted hazard band on the floor — the classic "keep clear" stripe. */
function hazardStrip(ctx, { x, z, w, d }) {
  const strip = box(w, 0.02, d, HAZARD());
  strip.position.set(x, ctx.floorY + 0.011, z);
  strip.receiveShadow = true;
  ctx.g.add(strip);
}

/** Overhead cable tray — a shallow open channel with rungs. */
function cableTray(ctx, { x, z, len, axis = 'x', y }) {
  const { g } = ctx;
  const m = GRATE();
  const w = axis === 'x' ? len : 0.28, d = axis === 'x' ? 0.28 : len;
  const base = box(w, 0.04, d, m);
  base.position.set(x, y, z);
  g.add(base);
  for (const s of [-1, 1]) {
    const lip = box(axis === 'x' ? len : 0.03, 0.1, axis === 'x' ? 0.03 : len, m);
    lip.position.set(x + (axis === 'x' ? 0 : s * 0.14), y + 0.06, z + (axis === 'x' ? s * 0.14 : 0));
    g.add(lip);
  }
  // A couple of cables lying in it.
  for (let i = -1; i <= 1; i++) {
    const c = cyl(0.022, len, i === 0 ? M.orange() : M.dark(), 6);
    if (axis === 'x') c.rotation.z = Math.PI / 2; else c.rotation.x = Math.PI / 2;
    c.position.set(x + (axis === 'x' ? 0 : i * 0.07), y + 0.06, z + (axis === 'x' ? i * 0.07 : 0));
    g.add(c);
  }
}

/* ---- motion --------------------------------------------------------------
 * A room where nothing moves reads as a diorama of a room. None of this is
 * expensive: a fan is one mesh with its rotation stepped, an LED bank is one
 * instanced draw call with its instance colours rewritten, a scope trace is a
 * texture offset. What they buy is the difference between "the plant room"
 * and "the plant room, running". */

/** Register a per-frame closure. site.js's update loop calls every `tick`. */
function anim(ctx, tick) { ctx.anim.push({ tick }); }

/**
 * A caged fan. `axis` is the axis it faces along: 'z' for one you look into
 * across the room, 'y' for one in a ceiling or the top of a duct.
 */
function fan(ctx, { x, y, z, r = 0.26, blades = 5, axis = 'z', rps = 1.6, cage = true, mount = true, m }) {
  const mm = m ?? M.steel();
  const hub = new THREE.Group();
  hub.position.set(x, y, z);
  if (axis === 'z') hub.rotation.x = Math.PI / 2;
  ctx.g.add(hub);
  hub.add(cyl(r * 0.2, 0.07, mm, 8));
  const bladeGeo = new THREE.BoxGeometry(r * 0.85, 0.012, r * 0.4);
  for (let i = 0; i < blades; i++) {
    const a = i / blades * Math.PI * 2;
    const b = new THREE.Mesh(bladeGeo, mm);
    b.position.set(Math.cos(a) * r * 0.5, 0, Math.sin(a) * r * 0.5);
    b.rotation.y = a;
    b.rotation.z = 0.42;
    hub.add(b);
  }
  if (cage) {
    for (const rr of [r * 0.55, r * 0.96]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.012, 4, 14), GRATE());
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.05;
      hub.add(ring);
    }
  }
  // A ceiling extract fan is hung BELOW the ceiling -- typically 0.4 m below
  // it -- and nothing was ever drawn in that gap, so the fan read as a set of
  // blades hovering in mid-air under a blank ceiling. It needs the two parts
  // that actually hold it up: a drop rod and the plate it bolts to.
  if (axis === 'y' && mount && ctx.ceilH != null) {
    const ceil = ctx.floorY + ctx.ceilH;
    const gap = ceil - y;
    if (gap > 0.06 && gap < 1.4) {
      const rod = cyl(0.022, gap, mm, 6);
      rod.position.set(x, y + gap / 2, z);
      ctx.g.add(rod);
      const plate = box(r * 0.9, 0.035, r * 0.9, mm);
      plate.position.set(x, ceil - 0.018, z);
      ctx.g.add(plate);
    }
  }

  const spin = rps * Math.PI * 2 * (0.85 + ctx.rng() * 0.3);
  hub.traverse(o2 => { o2.userData.keep = true; });   // it turns; do not bake it
  anim(ctx, dt => { hub.rotation.y += dt * spin; });
  return hub;
}

/**
 * A row of indicator LEDs on a panel face. One instanced draw call; the
 * blink is a rewrite of instance colours, so twelve lights on twelve
 * different rhythms cost the same as one. Unlit (MeshBasic) on purpose — an
 * LED is a light source, not a lit surface, and it has to stay bright in an
 * unlit corner of a plant room.
 */
function ledBank(ctx, { x, y, z, n = 6, axis = 'x', pitch = 0.11, ry = 0, size = 0.045, hue = 0.33 }) {
  const geo = new THREE.BoxGeometry(size, size, 0.02);
  const im = new THREE.InstancedMesh(
    geo, mat('i-led', () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })), n);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
  q.setFromEuler(new THREE.Euler(0, ry, 0));
  const phase = [], rate = [], hues = [];
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * pitch;
    mtx.compose(new THREE.Vector3(
      x + (axis === 'y' ? 0 : off * Math.cos(ry)),
      y + (axis === 'y' ? off : 0),
      z - (axis === 'y' ? 0 : off * Math.sin(ry))
    ), q, sc);
    im.setMatrixAt(i, mtx);
    phase.push(ctx.rng() * 10);
    rate.push(0.4 + ctx.rng() * 2.6);
    // Mostly the panel's own colour with the odd amber or red among them — a
    // rack where every lamp is the same green reads as decoration.
    hues.push(ctx.rng() < 0.18 ? (ctx.rng() < 0.5 ? 0.09 : 0.0) : hue);
  }
  im.instanceMatrix.needsUpdate = true;
  ctx.g.add(im);
  const col = new THREE.Color();
  anim(ctx, (dt, t) => {
    for (let i = 0; i < n; i++) {
      col.setHSL(hues[i], 0.85, Math.sin(t * rate[i] + phase[i]) > -0.15 ? 0.6 : 0.1);
      im.setColorAt(i, col);
    }
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });
  return im;
}

/**
 * An instrument screen with a live trace. The waveform is one repeating
 * texture scrolled by its own offset — no per-frame canvas work, no shader,
 * and it reads as a running instrument from across the room.
 */
function scopeScreen(ctx, { x, y, z, w = 0.44, h = 0.3, ry = 0, kind = 'wave', speed = 0.09 }) {
  // Same rule as notice(): no wall, no screen.
  if (foulsDoor(ctx, x, z, Math.max(w, 0.35), Math.max(w, 0.35))) return null;
  // ONE texture and ONE material per trace type, shared by every screen of
  // that type in the station. The first version built a fresh 256x128 canvas
  // and a fresh material for every screen — about 150 of each — which meant no
  // screen could ever batch with anything and every one cost its own draw
  // call. Sharing costs the ability to scroll each screen at its own rate,
  // which nobody can see, and buys back 150 draw calls, which everybody can.
  const m = mat('scope-' + kind, () => {
    const tex = canvasTex(256, 128, g => {
      g.fillStyle = '#06120e'; g.fillRect(0, 0, 256, 128);
      g.strokeStyle = 'rgba(90,200,150,0.16)'; g.lineWidth = 1;
      for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 128); g.stroke(); }
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke(); }
      g.strokeStyle = '#57e39b'; g.lineWidth = 2.5;
      g.beginPath();
      for (let i = 0; i <= 256; i++) {
        let v;
        if (kind === 'seismic') v = Math.sin(i * 0.16) * 5 + Math.sin(i * 0.041) * 8 + (i % 61 < 6 ? Math.sin(i * 1.7) * 26 : 0);
        else if (kind === 'tide') v = Math.sin(i * 0.0245) * 34 + Math.sin(i * 0.11) * 3;
        else if (kind === 'ecg') v = (i % 43 < 4 ? 30 : 0) - (i % 43 === 5 ? 12 : 0) + Math.sin(i * 0.5) * 1.5;
        else v = Math.sin(i * 0.075) * 20 + Math.sin(i * 0.21) * 7;
        const yy = 64 - v;
        if (i === 0) g.moveTo(i, yy); else g.lineTo(i, yy);
      }
      g.stroke();
    });
    tex.wrapS = THREE.RepeatWrapping;
    return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  face.position.set(x, y, z);
  face.rotation.y = ry;
  ctx.g.add(face);
  const bez = box(w + 0.06, h + 0.06, 0.03, M.dark());
  bez.position.set(x - Math.sin(ry) * 0.025, y, z - Math.cos(ry) * 0.025);
  bez.rotation.y = ry;
  ctx.g.add(bez);
  // One scroll tick per trace type per floor plan, not one per screen.
  if (!ctx.scopeKinds.has(kind)) {
    ctx.scopeKinds.add(kind);
    const sp = speed * (0.8 + ctx.rng() * 0.5);
    anim(ctx, dt => { m.map.offset.x -= dt * sp; });
  }
  return face;
}

/** A paper chart drum turning under a pen — the classic recording instrument. */
function chartDrum(ctx, { x, y, z }) {
  const drum = cyl(0.11, 0.3, M.white(), 12);
  drum.rotation.z = Math.PI / 2;
  drum.position.set(x, y, z);
  ctx.g.add(drum);
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.004, 4, 16), M.orange());
    band.rotation.y = Math.PI / 2;
    band.position.set(x - 0.09 + i * 0.09, y, z);
    ctx.g.add(band);
  }
  const arm = box(0.18, 0.014, 0.014, M.steel());
  arm.position.set(x + 0.06, y + 0.13, z);
  ctx.g.add(arm);
  const rate = 0.5 + ctx.rng() * 0.3, sway = 0.35 + ctx.rng() * 0.3;
  drum.userData.keep = true; arm.userData.keep = true;
  anim(ctx, (dt, t) => {
    drum.rotation.x += dt * rate;
    arm.position.z = z + Math.sin(t * sway) * 0.035;
  });
  return drum;
}

/** Wall louvre / vent grille. */
function louvre(ctx, { x, y, z, w = 0.7, h = 0.5, ry = 0 }) {
  const frame = box(w, h, 0.05, M.steel());
  frame.position.set(x, y, z);
  frame.rotation.y = ry;
  ctx.g.add(frame);
  const n = Math.max(3, Math.floor(h / 0.09));
  for (let i = 0; i < n; i++) {
    const s = box(w * 0.88, 0.035, 0.02, GRATE());
    s.position.set(x, y - h / 2 + (i + 0.6) * (h / n), z + (ry ? 0 : 0.032));
    if (ry) { s.position.x = x + 0.032 * Math.sign(Math.sin(ry)); }
    s.rotation.y = ry;
    ctx.g.add(s);
  }
}

/** Wall screen / panel — flat, emissive, no collider (it's on a wall). */
function wallPanel(ctx, { x, z, ry = 0, w = 0.8, h = 0.5, m }) {
  // notice() and scopeScreen() both learned this rule and wallPanel never
  // did: a wall fixture needs a wall behind it. The workshop's tool board is
  // a 3 m wide panel hung at the centre of the bay's south wall -- which is
  // exactly where the corridor door into the vehicle bay is -- so it was a
  // big dark board hanging in the opening with daylight around it. Same bug
  // as the STATION FEED screen in the mess, in the one helper that was
  // missed when that was fixed.
  if (foulsDoor(ctx, x, z, Math.max(w, 0.3), Math.max(w, 0.3))) return null;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m ?? M.screen());
  p.position.set(x, ctx.floorY + 1.5, z);
  p.rotation.y = ry;
  ctx.g.add(p);
  return p;
}

/* ==================================================== contextual detail ====
 * A room built only from its theme is a room built from a category: four
 * cabins that are the same cabin, a lab that is a lab-shaped box whichever
 * science it is for. This pass adds what is specific — the barograph drum in
 * the met lab and the seismic trace in the geophysics one, the grinder in the
 * workshop, the ECG in the OP room — and it uses each room's own seeded RNG
 * so two rooms of the same theme are never the same room.
 *
 * Everything here is either collider-free wall dressing or goes through
 * addBox, so none of it can seal a doorway (see foulsDoor).
 */

/** Fire extinguisher on a bracket. Every room in a polar station has one. */
function extinguisher(ctx, x, y, z) {
  addBox(ctx, cyl(0.075, 0.5, mat('i-red', () => new THREE.MeshStandardMaterial({ color: 0xa8281c, roughness: 0.6 })), 10),
    x, y + 0.25, z, { collide: false });
  addBox(ctx, cyl(0.03, 0.12, M.dark(), 6), x, y + 0.56, z, { collide: false });
}

/**
 * Find a spot on a wall that is not a doorway.
 *
 * @param {'x'|'z'} axis  the axis the wall RUNS along
 * @param {number} across the wall's fixed coordinate
 * @param {number} want   preferred position along the wall
 * @param {number} w      the object's width
 * @returns {number|null} a clear position, or null if the wall has no room
 */
function wallSlot(ctx, { axis, across, a0, a1, want, w = 0.9 }) {
  const spans = clearSpans(ctx, { axis, across, a0, a1, thick: 0.8, min: w + 0.25 });
  if (!spans.length) return null;
  let best = null, bd = Infinity;
  for (const [s0, s1] of spans) {
    const c = Math.min(Math.max(want, s0 + w / 2), s1 - w / 2);
    const dd = Math.abs(c - want);
    if (dd < bd) { bd = dd; best = c; }
  }
  return best;
}

/** Small framed notice / poster on a wall. */
function notice(ctx, { x, y, z, ry = 0, w = 0.4, h = 0.3, text, bg = '#12202c', fg = '#dcefff' }) {
  // A wall fixture needs a wall behind it. Hung in a doorway it is a picture
  // floating in mid-air in an opening — which is exactly what the STATION FEED
  // screen did in Maitri's mess, because the mess's only corridor door sits at
  // the centre of the wall the screen was pinned to.
  if (foulsDoor(ctx, x, z, Math.max(w, 0.3), Math.max(w, 0.3))) return null;
  const m = text
    ? mat(`note-${text}`, () => new THREE.MeshStandardMaterial({ map: signText(text, { color: fg, bg, w: 512 }), roughness: 0.85 }))
    : mat('note-plain', () => new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.9 }));
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  pl.position.set(x, y, z);
  pl.rotation.y = ry;
  ctx.g.add(pl);
}

/** Which wall a room's detail should hang on, given the doors it has. */
function backWall(ctx) {
  const { room } = ctx;
  return { x: ctx.cx, z: room.z0 + 0.09, ry: 0 };
}

const DETAIL = {
  airlock(ctx) {
    const { room, floorY, cx, cz } = ctx;
    // Extract fan over the inner door and a pressure/occupancy indicator —
    // an airlock is a machine, not a hallway.
    fan(ctx, { x: cx, y: floorY + ctx.ceilH - 0.42, z: room.z0 + 0.55, r: 0.2, axis: 'y', rps: 0.9 });
    ledBank(ctx, { x: room.x1 - 0.12, y: floorY + 1.75, z: cz - 1.1, n: 3, ry: -Math.PI / 2, pitch: 0.09, hue: 0.33 });
    notice(ctx, {
      x: room.x1 - 0.11, y: floorY + 1.98, z: cz - 1.1, ry: -Math.PI / 2,
      w: 0.5, h: 0.16, text: 'OUTER DOOR', bg: '#1c1408', fg: '#ffcf5c'
    });
    extinguisher(ctx, room.x1 - 0.2, floorY, room.z0 + 0.5);
    // A shovel and a broom by the door, because somebody has to clear the
    // drift off the threshold every single day.
    for (let i = 0; i < 2; i++) {
      const pole = cyl(0.022, 1.35, M.wood(), 6);
      addBox(ctx, pole, room.x1 - 0.28 - i * 0.16, floorY + 0.68, room.z1 - 0.5, { ry: 0.12, collide: false });
      addBox(ctx, box(0.24, 0.02, 0.2, i ? M.dark() : M.steel()), room.x1 - 0.28 - i * 0.16, floorY + 0.06, room.z1 - 0.55, { collide: false });
    }
  },

  dorm(ctx) {
    const { room, floorY, cz } = ctx;
    // Every cabin gets the same furniture and a different life in it: a
    // reading lamp left on in one, a kit bag on the floor of another, a
    // different set of photos taped up. Driven entirely by the room's seed.
    const warm = mat('i-lamp', () => new THREE.MeshStandardMaterial({
      color: 0xffe9c0, emissive: 0xffcf8a, emissiveIntensity: 1.4, roughness: 0.5
    }));
    const lit = ctx.rng() < 0.55;
    if (lit) {
      addBox(ctx, cyl(0.05, 0.07, warm, 8), room.x0 + 0.36, floorY + 1.05, cz - 0.6, { collide: false });
    }
    // Photos and postcards over one bunk.
    const px = ctx.rng() < 0.5 ? room.x0 + 0.12 : room.x1 - 0.12;
    const pry = px < ctx.cx ? Math.PI / 2 : -Math.PI / 2;
    for (let i = 0; i < 3 + Math.floor(ctx.rng() * 3); i++) {
      notice(ctx, {
        x: px, y: floorY + 1.5 + (ctx.rng() - 0.5) * 0.4,
        z: room.z0 + 1.0 + ctx.rng() * Math.max(0.6, ctx.d - 2.0), ry: pry,
        w: 0.14 + ctx.rng() * 0.08, h: 0.1 + ctx.rng() * 0.06
      });
    }
    // A kit bag someone has not unpacked.
    if (ctx.rng() < 0.7) {
      addBox(ctx, box(0.7, 0.32, 0.36, ctx.rng() < 0.5 ? M.orange() : M.green()),
        ctx.cx, floorY + 0.16, room.z0 + 0.9 + ctx.rng() * Math.max(0.4, ctx.d - 2.4), { ry: ctx.rng() * 0.8, ch: 0.32 });
    }
    // The charger everyone leaves plugged in behind the bunk.
    ledBank(ctx, { x: room.x0 + 0.14, y: floorY + 0.34, z: cz + 0.9, n: 2, ry: Math.PI / 2, pitch: 0.07, size: 0.03, hue: 0.33 });
  },

  kitchen(ctx) {
    const { room, floorY, cx } = ctx;
    // The extract fan in the hood, running. A galley that is not extracting
    // is a galley nobody is cooking in.
    fan(ctx, { x: cx - Math.min(ctx.w - 0.8, 5.4) * 0.25, y: floorY + 1.68, z: room.z0 + 0.5, r: 0.16, axis: 'y', rps: 2.4, cage: false });
    // Coffee urn with a heater lamp — the single most used object in any
    // station kitchen.
    const urnX = cx + Math.min(ctx.w - 0.8, 5.4) * 0.4;
    if (placeOn(ctx, cyl(0.15, 0.42, M.steel(), 12), urnX, room.z0 + 0.5, 0.42, floorY + 0.92)) {
      ledBank(ctx, { x: urnX, y: floorY + 1.02, z: room.z0 + 0.18, n: 2, pitch: 0.07, size: 0.028, hue: 0.02 });
    }
    notice(ctx, {
      ...backWall(ctx), y: floorY + 1.95, w: Math.min(ctx.w * 0.34, 1.3), h: 0.3,
      text: 'MENU  \u2014  WEEK 14', bg: '#20303c', fg: '#ffe6b0'
    });
  },

  mess(ctx) {
    const { room, floorY, cx, cz } = ctx;
    // A screen on the wall — the mess is where the station watches things.
    // Slotted into a stretch of that wall which is not a doorway, rather than
    // pinned to its midpoint, because on a room whose door is centred in that
    // same wall the midpoint IS the doorway.
    const feedZ = wallSlot(ctx, { axis: 'z', across: room.x1 - 0.3, a0: room.z0 + 0.7, a1: room.z1 - 0.7, want: cz, w: 1.0 });
    if (feedZ !== null) {
      scopeScreen(ctx, { x: room.x1 - 0.1, y: floorY + 1.7, z: feedZ, w: 0.9, h: 0.52, ry: -Math.PI / 2, kind: 'wave', speed: 0.03 });
      notice(ctx, { x: room.x1 - 0.11, y: floorY + 2.1, z: feedZ, ry: -Math.PI / 2, w: 0.8, h: 0.14, text: 'STATION FEED', bg: '#101c26', fg: '#8fd0ff' });
    }
    // The urn and the mug tree at the servery end.
    addBox(ctx, cyl(0.16, 0.44, M.steel(), 12), cx + Math.min(ctx.w, 6) * 0.32, floorY + 0.97, room.z0 + 0.45, { ch: 1.2, cw: 0.34, cd: 0.34 });
    for (let i = 0; i < 5; i++) {
      addBox(ctx, cyl(0.037, 0.09, i % 2 ? M.white() : M.cold(), 8),
        cx + Math.min(ctx.w, 6) * 0.32 + 0.28, floorY + 0.79 + (i % 3) * 0.11, room.z0 + 0.34 + Math.floor(i / 3) * 0.12, { collide: false });
    }
    extinguisher(ctx, room.x0 + 0.2, floorY, room.z0 + 0.5);
  },

  lounge(ctx) {
    const { room, floorY, cx, cz } = ctx;
    const library = ctx.room.variant === 'library';
    if (!library) {
      // A television, on. Its glow is the whole reason a rec room reads as
      // somewhere people choose to be.
      scopeScreen(ctx, { x: cx, y: floorY + 1.45, z: room.z0 + 0.12, w: 1.1, h: 0.62, kind: 'wave', speed: 0.02 });
    }
    // A guitar in the corner and a board game left out mid-play.
    if (ctx.rng() < 0.8) {
      const body = box(0.32, 0.42, 0.1, M.wood());
      addBox(ctx, body, room.x1 - 0.42, floorY + 0.34, room.z0 + 0.5, { ry: 0.3, collide: false });
      addBox(ctx, box(0.08, 0.72, 0.05, M.dark()), room.x1 - 0.46, floorY + 0.9, room.z0 + 0.56, { ry: 0.3, collide: false });
    }
    for (let i = 0; i < 4; i++) {
      addBox(ctx, box(0.06, 0.02, 0.06, i % 2 ? M.orange() : M.cold()),
        cx - 0.2 + (i % 2) * 0.16, floorY + 0.39, cz - 0.6 + Math.floor(i / 2) * 0.14, { collide: false });
    }
    // A pot plant. Real stations fight hard for these.
    addBox(ctx, cyl(0.14, 0.2, M.orange(), 10), room.x0 + 0.5, floorY + 0.1, room.z0 + 0.55, { collide: false });
    for (let i = 0; i < 5; i++) {
      addBox(ctx, box(0.05, 0.3, 0.02, M.green()), room.x0 + 0.5, floorY + 0.34, room.z0 + 0.55,
        { ry: i * 1.25, collide: false });
    }
  },

  command(ctx) {
    const { room, floorY, cx, cz, w } = ctx;
    // Two live screens on the console and the radio rack's own lamps: this
    // is the room the station listens to the outside world from.
    const cl = Math.min(w - 1.4, 4.2);
    scopeScreen(ctx, { x: cx - cl * 0.22, y: floorY + 1.22, z: room.z0 + 0.62, w: 0.5, h: 0.32, kind: 'wave', speed: 0.14 });
    scopeScreen(ctx, { x: cx + cl * 0.18, y: floorY + 1.22, z: room.z0 + 0.62, w: 0.5, h: 0.32, kind: 'tide', speed: 0.05 });
    ledBank(ctx, { x: room.x1 - 0.12, y: floorY + 1.5, z: cz, n: 8, ry: -Math.PI / 2, pitch: 0.13, hue: 0.33 });
    ledBank(ctx, { x: room.x1 - 0.12, y: floorY + 1.2, z: cz, n: 8, ry: -Math.PI / 2, pitch: 0.13, hue: 0.55 });
    // The wall clock set to UTC, which is the only time a polar station can
    // agree on, and a headset on its hook.
    notice(ctx, { x: cx + 1.3, y: floorY + 2.0, z: room.z0 + 0.09, w: 0.34, h: 0.22, text: 'UTC', bg: '#0e1720', fg: '#e8f4ff' });
    addBox(ctx, new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 5, 12), M.dark()),
      cx - cl * 0.42, floorY + 1.5, room.z0 + 0.2, { collide: false });
  },

  lab(ctx) {
    const { room, floorY, cx, cz, w } = ctx;
    const variant = ctx.room.variant ?? 'general';

    // These instruments used to be placed at (cx, room.z0 + 0.66) -- the
    // middle of the room, two thirds of a metre off the north wall -- on the
    // assumption that a bench was there. There never was one: the furniture
    // pass builds its bench run along the WEST wall (see theme lab() below,
    // benchRun at room.x0 + 0.42). So every chart drum, seismometer and bell
    // jar in the game hung in mid-air at chest height, and in the
    // containerised lab modules that spot is the DOORWAY -- which is exactly
    // the "the sheds outside Maitri have floating objects" report.
    //
    // The bench line is the bench, and its height is MEASURED rather than
    // assumed: topUnder returns the real supporting surface, so if a room's
    // bench was suppressed (benchRun returns null when it would foul a door)
    // the instruments that need it are simply not built, instead of being
    // built floating. Wall-mounted things keep their own reference, `wx`,
    // because bx is now hard against the west wall and offsetting from it
    // would push a sign straight through the outside of the building.
    const bx = room.x0 + 0.42;
    const wx = cx;
    const top = topUnder(ctx, bx, cz, floorY + 1.25);

    if (variant === 'meteorology') {
      // Barograph and thermograph drums, turning. Met is the one discipline
      // whose instruments a visitor can actually watch working. The drum lies
      // on its side, so its centre sits one radius above the bench.
      if (top != null) {
        chartDrum(ctx, { x: bx, y: top + 0.115, z: cz - 0.35 });
        chartDrum(ctx, { x: bx, y: top + 0.115, z: cz + 0.35 });
      }
      scopeScreen(ctx, { x: room.x0 + 0.1, y: floorY + 1.62, z: cz, w: 0.5, h: 0.32, ry: Math.PI / 2, kind: 'wave', speed: 0.07 });
      notice(ctx, { x: wx, y: floorY + 1.75, z: room.z0 + 0.09, w: 0.8, h: 0.5, text: 'SYNOPTIC', bg: '#0d1b26', fg: '#a9d8ff' });
    } else if (variant === 'geophysics') {
      // A seismometer under a bell jar, its trace live on the wall above it.
      if (top != null) {
        addBox(ctx, cyl(0.18, 0.34, M.steel(), 12), bx, top + 0.17, cz - 0.55, { collide: false });
        addBox(ctx, cyl(0.2, 0.36, mat('i-jar', () => new THREE.MeshStandardMaterial({
          color: 0xbfd8e4, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.32
        })), 14), bx, top + 0.18, cz - 0.55, { collide: false });
      }
      scopeScreen(ctx, { x: room.x0 + 0.1, y: floorY + 1.66, z: cz - 0.55, w: 0.9, h: 0.4, ry: Math.PI / 2, kind: 'seismic', speed: 0.05 });
      ledBank(ctx, { x: room.x0 + 0.1, y: floorY + 1.36, z: cz - 0.55, n: 5, ry: Math.PI / 2, pitch: 0.1, hue: 0.09 });
    } else if (variant === 'oceanography') {
      // A CTD rosette -- the bottle frame that goes over the side -- and the
      // tide trace it is checked against.
      // Stood wherever it does not block a door. A 1 m frame parked in front
      // of the only way into a 5.8 x 2.6 m lab seals the lab, which is the
      // same mistake as the coat rail and the bunk -- anything that pushes
      // its own collider has to ask foulsDoor first.
      const spots = [
        { x: room.x1 - 0.95, z: cz }, { x: room.x0 + 0.95, z: cz },
        { x: cx, z: room.z0 + 0.95 }, { x: cx, z: room.z1 - 0.95 }
      ];
      const spot = spots.find(sp => !foulsDoor(ctx, sp.x, sp.z, 1.0, 1.0));
      if (spot) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 5, 16), M.steel());
        ring.rotation.x = Math.PI / 2;
        addBox(ctx, ring, spot.x, floorY + 1.15, spot.z, { collide: false });
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * Math.PI * 2;
          addBox(ctx, cyl(0.055, 0.72, M.cold(), 8),
            spot.x + Math.cos(a) * 0.32, floorY + 0.75, spot.z + Math.sin(a) * 0.32, { collide: false });
        }
        ctx.colliders.push(new THREE.Box3(
          new THREE.Vector3(spot.x - 0.5, floorY, spot.z - 0.5),
          new THREE.Vector3(spot.x + 0.5, floorY + 1.2, spot.z + 0.5)
        ));
      }
      scopeScreen(ctx, { x: wx, y: floorY + 1.5, z: room.z0 + 0.12, w: 0.85, h: 0.38, kind: 'tide', speed: 0.03 });
    } else if (variant === 'glaciology') {
      // Ice cores in their sleeves on the bench, and the freezer they live in
      // humming next to it. `ry` on a Y-axis cylinder does not lay it down --
      // it spins it about its own length and changes nothing, which is how
      // these ended up as four vertical rods hovering over the bench rather
      // than four cores lying in a row. Rotating about X is what actually
      // tips the axis into +z, along the bench's own length.
      if (top != null) {
        for (let i = 0; i < 4; i++) {
          const sleeve = cyl(0.05, 0.85, M.cold(), 8);
          sleeve.rotation.x = Math.PI / 2;
          addBox(ctx, sleeve, bx - 0.24 + i * 0.16, top + 0.05, cz + 0.5, { collide: false });
        }
      }
      addBox(ctx, box(0.9, 0.9, 0.7, M.white()), room.x1 - 0.7, floorY + 0.45, cz, { ch: 0.9 });
      fan(ctx, { x: room.x1 - 0.7, y: floorY + 0.95, z: cz - 0.38, r: 0.13, rps: 2.0, cage: false });
      ledBank(ctx, { x: room.x1 - 0.7, y: floorY + 0.78, z: cz - 0.36, n: 3, pitch: 0.08, size: 0.03, hue: 0.55 });
      notice(ctx, { x: wx, y: floorY + 1.72, z: room.z0 + 0.09, w: 0.7, h: 0.24, text: '\u221221 \u00b0C', bg: '#0b1c26', fg: '#bfe8ff' });
    } else {
      scopeScreen(ctx, { x: wx, y: floorY + 1.42, z: room.z0 + 0.12, w: 0.6, h: 0.34, kind: 'wave', speed: 0.08 });
    }
    // Every lab: a fume/vent hood fan and a sample fridge indicator.
    fan(ctx, { x: room.x0 + 0.55, y: floorY + ctx.ceilH - 0.4, z: cz, r: 0.17, axis: 'y', rps: 1.3 });
    extinguisher(ctx, room.x0 + 0.2, floorY, room.z1 - 0.6);
  },

  storage(ctx) {
    const { room, floorY, cz } = ctx;
    // The tube that has been about to fail for two seasons. One flickering
    // light does more for "this is a real back-of-house room" than any
    // amount of extra shelving.
    const tube = box(0.9, 0.05, 0.1, M.glow());
    addBox(ctx, tube, ctx.cx, floorY + ctx.ceilH - 0.12, cz + Math.min(ctx.d * 0.3, 1.4), { collide: false });
    const seed = ctx.rng() * 10;
    anim(ctx, (dt, t) => {
      const n = Math.sin(t * 17 + seed) * Math.sin(t * 6.1 + seed * 2);
      tube.material.emissiveIntensity = n > 0.55 ? 0.15 : 0.95;
    });
    notice(ctx, { x: room.x0 + 0.11, y: floorY + 1.55, z: cz, ry: Math.PI / 2, w: 0.4, h: 0.5, text: 'INVENTORY', bg: '#20262b', fg: '#e3ecf2' });
    extinguisher(ctx, room.x1 - 0.2, floorY, room.z1 - 0.55);
  },

  coldstore(ctx) {
    const { room, floorY, cx, cz } = ctx;
    // Evaporator unit over the door, blowing. A cold store you can hear is a
    // cold store that is actually keeping something cold.
    const y = floorY + ctx.ceilH - 0.45;
    addBox(ctx, box(1.0, 0.4, 0.4, M.steel()), cx, y, room.z1 - 0.45, { collide: false });
    for (let i = -1; i <= 1; i++) {
      fan(ctx, { x: cx + i * 0.32, y, z: room.z1 - 0.66, r: 0.13, rps: 2.6, cage: false });
    }
    ledBank(ctx, { x: cx + 0.7, y, z: room.z1 - 0.66, n: 2, pitch: 0.08, size: 0.03, hue: 0.55 });
    notice(ctx, { x: cx, y: floorY + 1.9, z: room.z0 + 0.09, w: 0.6, h: 0.22, text: '\u221218 \u00b0C  KEEP SHUT', bg: '#0a1a24', fg: '#bfe8ff' });
  },

  workshop(ctx) {
    const { room, floorY, cx, cz } = ctx;
    // A bench grinder, spinning, and a tool board with painted silhouettes —
    // the two things that say "things get repaired here" fastest.
    // The grinder bolts to the workbench, so its height is the BENCH's, not a
    // number picked in advance. In the vehicle bay that bench is suppressed
    // (benchRun refuses to build across the corridor door), and the grinder
    // was hovering at 1.03 over bare floor as a result. No bench, no grinder.
    const gx = room.x0 + 1.1, gz = room.z0 + 0.62;
    const gTop = topUnder(ctx, gx, gz, floorY + 1.25);
    if (gTop != null) {
      addBox(ctx, box(0.34, 0.22, 0.26, M.dark()), gx, gTop + 0.11, gz, { collide: false });
      const wheel = cyl(0.13, 0.04, M.steel(), 14);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(gx + 0.22, gTop + 0.20, gz);
      wheel.userData.keep = true;
      ctx.g.add(wheel);
      anim(ctx, dt => { wheel.rotation.y += dt * 34; });
    }
    // Tool board.
    const board = notice(ctx, { x: cx + 1.0, y: floorY + 1.72, z: room.z0 + 0.09, w: Math.min(ctx.w * 0.32, 1.6), h: 0.72, text: 'TOOLS', bg: '#23303a', fg: '#cfd9e0' });
    // Hung on the board above -- and only if that board exists, since notice()
    // returns null where the doorway is.
    for (let i = 0; i < 6 && board; i++) {
      addBox(ctx, box(0.035, 0.26 + (i % 3) * 0.08, 0.02, M.steel()),
        cx + 0.4 + i * 0.18, floorY + 1.72, room.z0 + 0.12, { collide: false });
    }
    // Extractor over the welding bay.
    fan(ctx, { x: room.x1 - 0.9, y: floorY + ctx.ceilH - 0.4, z: cz, r: 0.22, axis: 'y', rps: 1.1 });
    extinguisher(ctx, room.x0 + 0.2, floorY, room.z1 - 0.6);
  },

  medical(ctx) {
    const { room, floorY, cx, cz } = ctx;
    // A patient monitor with a live ECG trace, an IV stand and an oxygen
    // cylinder: an OP room reads as one within about half a second, or it
    // reads as an office with a bed in it.
    scopeScreen(ctx, { x: room.x0 + 0.11, y: floorY + 1.62, z: cz - 0.3, w: 0.46, h: 0.3, ry: Math.PI / 2, kind: 'ecg', speed: 0.22 });
    ledBank(ctx, { x: room.x0 + 0.11, y: floorY + 1.36, z: cz - 0.3, n: 4, ry: Math.PI / 2, pitch: 0.08, size: 0.03, hue: 0.33 });
    addBox(ctx, cyl(0.02, 1.5, M.steel(), 6), cx - 0.75, floorY + 0.75, cz - 0.55, { collide: false });
    addBox(ctx, box(0.16, 0.24, 0.1, M.cold()), cx - 0.75, floorY + 1.38, cz - 0.55, { collide: false });
    addBox(ctx, cyl(0.09, 0.72, M.green(), 10), room.x1 - 0.4, floorY + 0.36, room.z0 + 0.5, { collide: false });
    notice(ctx, { x: cx, y: floorY + 1.95, z: room.z0 + 0.09, w: 0.5, h: 0.32, text: '+', bg: '#f2f6f8', fg: '#a8281c' });
  },

  utility(ctx) {
    const { room, floorY, cx, cz, w } = ctx;
    // The switchboard's own lamps, and radiator fans on the engine ends.
    const cabs = Math.min(3, Math.max(2, Math.floor(w / 3)));
    for (let i = 0; i < cabs; i++) {
      const x = cx + 0.2 + i * 0.78;
      if (x > room.x1 - 0.6) break;
      ledBank(ctx, { x, y: floorY + 1.45, z: room.z1 - 0.11, n: 5, pitch: 0.1, size: 0.035, hue: 0.33 });
    }
    const engW = Math.min(w * 0.34, 2.0), engD = Math.min(ctx.d * 0.30, 1.4);
    const engX = room.x0 + 0.35 + engW / 2;
    const sets = ctx.d > 6 ? 2 : 1;
    for (let sIdx = 0; sIdx < sets; sIdx++) {
      const ez = sets === 1 ? cz : cz + (sIdx ? engD * 1.25 : -engD * 1.25);
      fan(ctx, { x: engX + engW / 2 + 0.12, y: floorY + 0.75, z: ez, r: 0.28, rps: 3.2, cage: true, m: GRATE() });
    }
    // A running-hours counter that actually counts.
    const hrs = scopeScreen(ctx, { x: cx - 1.4, y: floorY + 1.62, z: room.z1 - 0.1, w: 0.34, h: 0.16, kind: 'wave', speed: 0.4 });
    if (hrs) hrs.rotation.y = Math.PI;
  },

  stairwell(ctx) {
    const { room, floorY, cz } = ctx;
    // A running-man exit sign at each end, and the floor number painted big
    // enough to read from the flight — a stairwell's whole job is telling
    // you where you are.
    const sign = mat('exit-sign', () => new THREE.MeshBasicMaterial({
      map: signText('EXIT', { color: '#e9fff2', bg: '#125c33', w: 256 }), toneMapped: false
    }));
    for (const z of [room.z0 + 0.1, room.z1 - 0.1]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.17), sign);
      pl.position.set(ctx.cx, floorY + 2.15, z);
      pl.rotation.y = z > cz ? Math.PI : 0;
      ctx.g.add(pl);
    }
    extinguisher(ctx, room.x1 - 0.2, floorY, room.z1 - 0.7);
  },

  gym(ctx) {
    const { room, floorY, cx, cz } = ctx;
    // A treadmill whose belt actually moves, a fan pointed at it, and a
    // dumbbell rack. Nobody winters without one of these.
    const beltTex = canvasTex(64, 128, g => {
      g.fillStyle = '#1b1f22'; g.fillRect(0, 0, 64, 128);
      g.fillStyle = '#2b3238';
      for (let i = 0; i < 16; i++) g.fillRect(0, i * 8, 64, 4);
    });
    beltTex.wrapT = THREE.RepeatWrapping;
    const belt = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.5),
      new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.9 }));
    belt.rotation.x = -Math.PI / 2;
    belt.position.set(room.x0 + 1.0, floorY + 0.28, cz);
    ctx.g.add(belt);
    anim(ctx, dt => { beltTex.offset.y -= dt * 0.7; });
    addBox(ctx, box(0.7, 0.26, 1.6, M.dark()), room.x0 + 1.0, floorY + 0.13, cz, { ch: 0.26 });
    addBox(ctx, cyl(0.025, 1.1, M.steel(), 6), room.x0 + 1.0, floorY + 0.8, cz - 0.75, { ry: 0.3, collide: false });
    fan(ctx, { x: room.x0 + 1.0, y: floorY + 1.9, z: cz + 1.0, r: 0.22, rps: 2.0 });
    // Dumbbell rack.
    addBox(ctx, box(1.2, 0.5, 0.4, M.steel()), cx + 1.0, floorY + 0.25, room.z0 + 0.5, { ch: 0.5 });
    // Dumbbells lie ACROSS the rack. `ry` cannot put them that way: it spins a
    // Y-axis cylinder about its own length, which changes nothing at all, so
    // these were four vertical rods standing in the rack -- and centred at
    // 0.58 their bases sat at 0.41, below the rack's own 0.5 top, so they were
    // sunk into it as well. Rotating about X lays the bar along +z, and the
    // centre is then one radius above the rack.
    for (let i = 0; i < 4; i++) {
      const db = cyl(0.07, 0.34, M.dark(), 8);
      db.rotation.x = Math.PI / 2;
      addBox(ctx, db, cx + 0.6 + i * 0.26, floorY + 0.57, room.z0 + 0.5, { collide: false });
    }
    notice(ctx, { x: cx, y: floorY + 1.7, z: room.z0 + 0.09, w: 0.9, h: 0.5, text: 'KEEP MOVING', bg: '#1b2830', fg: '#9fe8c0' });
  },

  office(ctx) {
    const { room, floorY, cx, cz } = ctx;
    // Two monitors on the desk and the UPS cabinet's lamps under it. An
    // office in a station is a data room with a chair.
    scopeScreen(ctx, { x: cx - 0.34, y: floorY + 1.18, z: room.z0 + 0.66, w: 0.44, h: 0.28, kind: 'wave', speed: 0.05 });
    scopeScreen(ctx, { x: cx + 0.24, y: floorY + 1.18, z: room.z0 + 0.66, w: 0.44, h: 0.28, kind: 'tide', speed: 0.02 });
    ledBank(ctx, { x: room.x1 - 0.12, y: floorY + 1.1, z: cz, n: 6, ry: -Math.PI / 2, pitch: 0.12, hue: 0.33 });
    // The pinboard everyone in a small station lives off.
    notice(ctx, { x: room.x0 + 0.11, y: floorY + 1.6, z: cz, ry: Math.PI / 2, w: 1.0, h: 0.66, text: 'ROSTER', bg: '#2a2118', fg: '#f0e0c0' });
    for (let i = 0; i < 5; i++) {
      notice(ctx, {
        x: room.x0 + 0.1, y: floorY + 1.45 + (ctx.rng() - 0.5) * 0.4,
        z: cz - 0.35 + ctx.rng() * 0.7, ry: Math.PI / 2, w: 0.12, h: 0.16
      });
    }
  },

  corridor(ctx) {
    const { room, floorY, cz } = ctx;
    // Corridors are where a building's services are visible: a cable tray
    // overhead, an extinguisher, and a sign telling you which way is out.
    cableTray(ctx, {
      x: ctx.cx, z: ctx.cx === 0 ? room.x1 - 0.4 : ctx.cz, axis: ctx.d > ctx.w ? 'z' : 'x',
      len: Math.max(1.5, Math.max(ctx.w, ctx.d) - 1.0), y: floorY + ctx.ceilH - 0.28
    });
    extinguisher(ctx, room.x0 + 0.2, floorY, cz);
    const sign = mat('exit-sign', () => new THREE.MeshBasicMaterial({
      map: signText('EXIT', { color: '#e9fff2', bg: '#125c33', w: 256 }), toneMapped: false
    }));
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.15), sign);
    pl.position.set(ctx.cx, floorY + ctx.ceilH - 0.5, room.z1 - 0.12);
    pl.rotation.y = Math.PI;
    ctx.g.add(pl);
  }
};

const THEMES = {

  /* -- entry airlock / mudroom ------------------------------------------
   * The first room off the outside door in both stations. Gear racks are the
   * point: a polar station's entry is a wall of hanging parkas and a floor of
   * boots, and it is the one room that instantly reads as "Antarctic". */
  airlock(ctx) {
    const { room, floorY, cx, cz, w, d } = ctx;
    const inset = 0.5;
    // Coat rack along the west wall — hooks with parkas on them, built only
    // on the stretches of that wall that are not a doorway.
    const railX = room.x0 + 0.36;
    const spans = clearSpans(ctx, {
      axis: 'z', across: railX, a0: room.z0 + inset, a1: room.z1 - inset,
      thick: 0.9, min: 0.9
    });
    const mtx = new THREE.Matrix4();
    const col = new THREE.Color();
    const parkaGeo = new THREE.BoxGeometry(0.16, 0.85, 0.44);
    let hookNo = 0;
    for (const [s0, s1] of spans) {
      const hooks = Math.max(1, Math.floor((s1 - s0) / 0.7));
      const used = (hooks - 1) * 0.7;
      const z0 = (s0 + s1) / 2 - used / 2;
      const rail = box(0.08, 0.08, Math.max(0.3, s1 - s0 - 0.1), M.steel());
      addBox(ctx, rail, railX - 0.02, floorY + 1.85, (s0 + s1) / 2, { collide: false });
      const parkas = new THREE.InstancedMesh(parkaGeo, M.orange(), hooks);
      parkas.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(hooks * 3), 3);
      for (let i = 0; i < hooks; i++) {
        mtx.makeTranslation(railX, floorY + 1.32, z0 + i * 0.7);
        parkas.setMatrixAt(i, mtx);
        col.setHSL((hookNo + i) % 2 ? 0.07 : 0.55, 0.55, 0.45);
        parkas.setColorAt(i, col);
      }
      hookNo += hooks;
      parkas.instanceMatrix.needsUpdate = true;
      if (parkas.instanceColor) parkas.instanceColor.needsUpdate = true;
      parkas.castShadow = true;
      ctx.g.add(parkas);
      ctx.colliders.push(new THREE.Box3(
        new THREE.Vector3(room.x0 + 0.16, floorY, s0 - 0.1),
        new THREE.Vector3(room.x0 + 0.58, floorY + 2.0, s1 + 0.1)
      ));
    }

    // Boot bench + boot tray opposite.
    benchRun(ctx, { x: room.x1 - 0.45, z: cz, len: Math.min(d - 1.2, 3.0), axis: 'z', h: 0.45, dpt: 0.5, m: M.wood() });
    const tray = box(0.9, 0.06, Math.min(d - 1.4, 2.6), M.rubber());
    addBox(ctx, tray, room.x1 - 1.15, floorY + 0.03, cz, { collide: false });

    // Boots, instanced, in pairs on the tray.
    const n = 6;
    const bootGeo = new THREE.BoxGeometry(0.14, 0.3, 0.28);
    const boots = new THREE.InstancedMesh(bootGeo, M.dark(), n * 2);
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < 2; s++) {
        mtx.makeTranslation(room.x1 - 1.15 + (s ? 0.1 : -0.1), floorY + 0.15, cz - (n - 1) * 0.2 + i * 0.4);
        boots.setMatrixAt(i * 2 + s, mtx);
      }
    }
    boots.instanceMatrix.needsUpdate = true;
    boots.castShadow = true;
    ctx.g.add(boots);
    // Grit mat inside the threshold. Every polar entry has one, and it
    // visually anchors the doorway you have just come through.
    addBox(ctx, box(Math.min(ctx.w - 0.6, 2.2), 0.02, 0.9, M.rubber()), cx, floorY + 0.011, room.z1 - 0.8, { collide: false });
  },

  /* -- dormitory --------------------------------------------------------- */
  dorm(ctx) {
    const { room, floorY, cz, w, d } = ctx;
    // Bunks down both long walls, heads to the wall. Two tiers: the real
    // stations sleep two to a cabin in exactly this arrangement.
    const cols = Math.max(1, Math.floor((d - 0.8) / 2.1));
    const frameM = M.steel(), bedM = M.fabric();
    for (const side of [-1, 1]) {
      const x = side < 0 ? room.x0 + 1.05 : room.x1 - 1.05;
      for (let i = 0; i < cols; i++) {
        const z = room.z0 + 1.0 + i * 2.1;
        if (z > room.z1 - 0.7) continue;
        // Same door keep-out every other prop in here respects. This one used
        // to skip it because the bunk pushes its collider by hand instead of
        // going through addBox — and a 1.9 m bunk stack landing across a
        // 1.25 m cabin door sealed the cabin completely.
        if (foulsDoor(ctx, x, z, 1.9, 1.0)) continue;
        for (const [y, h] of [[0.55, 0.18], [1.45, 0.18]]) {
          const mattress = box(1.75, h, 0.85, bedM);
          addBox(ctx, mattress, x, floorY + y, z, { collide: false });
        }
        // One collider for the whole bunk stack — you can't walk through a
        // bed, and a single box is cheaper than four.
        ctx.colliders.push(new THREE.Box3(
          new THREE.Vector3(x - 0.95, floorY, z - 0.5),
          new THREE.Vector3(x + 0.95, floorY + 1.7, z + 0.5)
        ));
        const post = box(0.07, 1.8, 0.07, frameM);
        addBox(ctx, post, x + side * -0.85, floorY + 0.9, z - 0.42, { collide: false });
        addBox(ctx, post.clone(), x + side * -0.85, floorY + 0.9, z + 0.42, { collide: false });
        // Pillow and folded blanket on each berth, plus a ladder to the top
        // one: a bare mattress slab reads as a shelf, not as a bed.
        for (const by of [0.68, 1.58]) {
          addBox(ctx, box(0.42, 0.1, 0.3, M.white()), x + side * -0.6, floorY + by, z, { collide: false });
          addBox(ctx, box(0.7, 0.09, 0.8, M.orange()), x + side * 0.45, floorY + by, z, { collide: false });
        }
        // The bunk ladder. Same `ry`-on-a-cylinder mistake: these were meant to
        // be rungs and were built as four vertical sticks, stacked one above
        // the next and buried inside the z + 0.42 post. A rung runs BETWEEN
        // the two posts (z - 0.42 and z + 0.42, so 0.84 long, along +z) and
        // has to be rotated about X to get there.
        for (let rr = 0; rr < 4; rr++) {
          const rung = cyl(0.018, 0.84, frameM, 6);
          rung.rotation.x = Math.PI / 2;
          addBox(ctx, rung, x + side * -0.85, floorY + 0.75 + rr * 0.26, z, { collide: false });
        }
        addBox(ctx, box(0.1, 0.05, 0.1, M.glow()), x + side * -0.8, floorY + 1.28, z - 0.3, { collide: false });
        // Personal locker between bunks.
        if (i < cols - 1) {
          const lk = box(0.5, 1.5, 0.55, M.dark());
          addBox(ctx, lk, x + side * 0.25, floorY + 0.75, z + 1.05, { ch: 1.5 });
        }
      }
    }
  },

  /* -- kitchen ----------------------------------------------------------- */
  kitchen(ctx) {
    const { room, floorY, cx, cz, w, d } = ctx;
    // Galley run along the north wall: counter, range with hood, sink.
    const runLen = Math.min(w - 0.8, 5.4);
    benchRun(ctx, { x: cx, z: room.z0 + 0.5, len: runLen, h: 0.92, dpt: 0.68, m: M.steel() });
    const range = box(1.1, 0.16, 0.6, M.dark());
    addBox(ctx, range, cx - runLen * 0.25, floorY + 1.0, room.z0 + 0.5, { collide: false });
    const hood = box(1.3, 0.45, 0.7, M.steel());
    addBox(ctx, hood, cx - runLen * 0.25, floorY + 1.85, room.z0 + 0.5, { collide: false });
    const sink = box(0.7, 0.1, 0.5, M.white());
    addBox(ctx, sink, cx + runLen * 0.28, floorY + 0.94, room.z0 + 0.5, { collide: false });
    // Pots on the rings, a mixer tap, a wipe-down splashback and a utensil
    // rail — the things that separate "a counter" from "a working galley".
    addBox(ctx, cyl(0.17, 0.2, M.steel(), 12), cx - runLen * 0.32, floorY + 1.1, room.z0 + 0.5, { collide: false });
    addBox(ctx, cyl(0.13, 0.15, M.steel(), 12), cx - runLen * 0.16, floorY + 1.07, room.z0 + 0.46, { collide: false });
    addBox(ctx, cyl(0.02, 0.28, M.steel(), 6), cx + runLen * 0.28, floorY + 1.12, room.z0 + 0.34, { collide: false });
    addBox(ctx, box(runLen, 0.55, 0.03, M.white()), cx, floorY + 1.28, room.z0 + 0.19, { collide: false });
    const rail = cyl(0.014, runLen * 0.5, M.steel(), 6);
    rail.rotation.z = Math.PI / 2;
    addBox(ctx, rail, cx, floorY + 1.55, room.z0 + 0.24, { collide: false });
    // Overhead cupboards and a dry-goods rack opposite.
    const cup = box(runLen * 0.8, 0.6, 0.35, ctx.palette === PALETTE.bharati ? accentMat(ctx.palette) : M.white());
    addBox(ctx, cup, cx, floorY + 1.95, room.z0 + 0.28, { collide: false });
    shelfRack(ctx, { x: cx, z: room.z1 - 0.35, len: Math.min(w - 1.2, 3.4), h: 1.9, dpt: 0.45, crates: 6 });
    // Prep island, clear of both runs.
    if (w > 4.5 && d > 4) benchRun(ctx, { x: cx, z: cz + 0.2, len: Math.min(w * 0.45, 2.4), h: 0.9, dpt: 0.8, m: M.wood() });
  },

  /* -- mess / dining ----------------------------------------------------- */
  mess(ctx) {
    const { room, floorY, cx, cz, w, d } = ctx;
    // SIZED TO THE CREW, AND WALKABLE ROUND.
    //
    // Two rules, both learned the hard way. First: a mess seats the winter
    // complement in one sitting — 25 at Maitri, 25 at Bharati — so table count
    // and length come from that number, not from "one table looks about
    // right". Second, and the one that actually broke the room: furniture must
    // leave a real aisle on every side. A full-length table plus the servery
    // left a 0.77 m gap at one end, narrower than the player's 0.84 m body, so
    // Bharati's dining room was cut in half with the door to the next room
    // stranded on the far side of it.
    //
    // So the servery is reserved FIRST, the seating zone is what remains after
    // a walkway is taken off all four sides, and the tables are fitted inside
    // that zone.
    const seats = ctx.room.seats ?? 16;
    // Real mess dimensions, not generous ones: bench pitch per diner is about
    // 0.6 m, a serving aisle is ~0.95 m, and the block only needs a walkway on
    // three sides because the fourth is the wall it backs onto. The first pass
    // at this reserved 1.15 m all round and 0.72 m per place, which is a
    // restaurant, and it cost the room a third of its seats.
    const PITCH = 0.62;                // per diner along the bench
    const WALK = 0.95;                 // walkway on the three open sides
    const BACK = 0.45;                 // gap to the wall the block backs onto
    const AISLE = 0.95;                // between table rows
    const ROW_D = 0.9 + 2 * 0.38;      // table depth + a bench each side

    // WHICH WALL HAS THE DOOR MATTERS.
    //
    // The seating block used to inset a small "back" gap from z0 and reserve
    // the servery against z1 — fine until the room's only door is in z0, which
    // in a linear plan (one corridor down the middle, rooms either side) it
    // always is. The single row of tables then landed inside that doorway's
    // own keep-out, was rejected, and the mess hall came out with no tables in
    // it at all. Every wall now gets the inset it actually needs: standing
    // room in front of a door, a walkway where people pass, and a token gap
    // where the block simply backs onto blank wall.
    const doorOn = (which) => (ctx.keepOut || []).some(k =>
      which === 'z0' ? Math.abs(k.z0 - room.z0) < 0.06 :
      which === 'z1' ? Math.abs(k.z1 - room.z1) < 0.06 :
      which === 'x0' ? Math.abs(k.x0 - room.x0) < 0.06 :
                       Math.abs(k.x1 - room.x1) < 0.06);
    const DOORWAY = 1.3;               // clear floor in front of a door

    // The servery goes on a blank wall — you do not queue across a doorway —
    // preferring the longest one available.
    const blank = [
      { id: 'z1', len: w }, { id: 'z0', len: w },
      { id: 'x1', len: d }, { id: 'x0', len: d }
    ].filter(v => !doorOn(v.id)).sort((m, n) => n.len - m.len);
    const svWall = (d > 3.2 && w > 3.2 && blank.length) ? blank[0].id : null;
    const wantServery = !!svWall;
    const svD = wantServery ? 1.3 : 0;

    const inset = (which) => doorOn(which) ? DOORWAY : (svWall === which ? svD : BACK);
    const zx0 = room.x0 + inset('x0'), zx1 = room.x1 - inset('x1');
    const zz0 = room.z0 + inset('z0'), zz1 = room.z1 - inset('z1');
    const zw = zx1 - zx0, zd = zz1 - zz0;

    // Try both orientations, keep the one that seats more. Tables run along
    // `alongX`; rows stack across the other axis.
    const plan = (alongX) => {
      const L = alongX ? zw : zd, A = alongX ? zd : zw;
      if (L < 1.6 || A < ROW_D) return { n: 0 };
      const rows = Math.max(1, Math.min(4, Math.floor((A + AISLE) / (ROW_D + AISLE))));
      // 5.6 was an arbitrary cap that quietly limited a 9 m long mess to a
      // table for 18. Real mess tables run the length of the room.
      const tLen = Math.max(1.6, Math.min(L, 9.0));
      const perSide = Math.max(2, Math.floor(tLen / PITCH));
      const want = Math.ceil(seats / (perSide * 2));
      const tables = Math.max(1, Math.min(rows, want));
      return { n: tables * perSide * 2, alongX, rows: tables, tLen, A };
    };
    const a = plan(true), b = plan(false);
    const P = (a.n >= b.n ? a : b);
    if (!P.n) { ctx.room.seatsBuilt = 0; return; }
    const alongX = P.alongX;
    const cAlong = alongX ? cx : cz, aLo = alongX ? zz0 : zx0;

    const put = (along, across, lenAlong, depthAcross, h, y, m) => {
      const px = alongX ? along : across, pz = alongX ? across : along;
      const bw = alongX ? lenAlong : depthAcross, bd = alongX ? depthAcross : lenAlong;
      return addBox(ctx, box(bw, h, bd, m), px, y, pz, { ch: h });
    };
    const fouls = (along, across, lenAlong, depthAcross) => {
      const px = alongX ? along : across, pz = alongX ? across : along;
      const bw = alongX ? lenAlong : depthAcross, bd = alongX ? depthAcross : lenAlong;
      return foulsDoor(ctx, px, pz, bw, bd);
    };

    let laid = 0;
    for (let r = 0; r < P.rows; r++) {
      const across = P.rows === 1 ? aLo + P.A / 2 : aLo + (r + 0.5) * (P.A / P.rows);
      // Shorten and shift to clear doorways, but never past the zone edges —
      // the zone already guarantees the walkway.
      let tw = 0, along = cAlong;
      for (const f of [1, 0.92, 0.84, 0.74, 0.62]) {
        const cand = P.tLen * f;
        for (const dA of [0, -0.35, 0.35, -0.75, 0.75]) {
          const pa = cAlong + dA;
          const lo = alongX ? zx0 : zz0, hi = alongX ? zx1 : zz1;
          if (pa - cand / 2 < lo - 0.01 || pa + cand / 2 > hi + 0.01) continue;
          if (fouls(pa, across, cand, ROW_D)) continue;
          tw = cand; along = pa; break;
        }
        if (tw) break;
      }
      if (!tw) continue;

      put(along, across, tw, 0.9, 0.75, floorY + 0.375, M.wood());
      // Benches either side. 0.45 m tall, i.e. under the player's 0.62 m step
      // height, so you step onto one rather than being stopped dead.
      for (const sd of [-1, 1]) {
        put(along, across + sd * 0.8, tw * 0.92, 0.34, 0.45, floorY + 0.225, M.wood());
      }
      const places = Math.max(2, Math.floor(tw / 0.72));
      laid += places * 2;
      for (let i = 0; i < places; i++) {
        const pa = along - tw / 2 + (i + 0.5) * (tw / places);
        for (const sd of [-1, 1]) {
          const tx = alongX ? pa : across + sd * 0.24;
          const tz = alongX ? across + sd * 0.24 : pa;
          placeOn(ctx, box(alongX ? 0.3 : 0.22, 0.025, alongX ? 0.22 : 0.3, i % 2 ? M.white() : M.cold()),
            tx, tz, 0.025, floorY + 0.75);
          placeOn(ctx, cyl(0.037, 0.09, M.white(), 8),
            alongX ? pa + 0.11 : across + sd * 0.1, alongX ? across + sd * 0.1 : pa + 0.11, 0.09, floorY + 0.75);
        }
      }
    }

    if (wantServery) {
      const horiz = svWall === 'z0' || svWall === 'z1';
      const svLen = Math.min((horiz ? w : d) - 1.8, 4.6);
      const svX = svWall === 'x0' ? room.x0 + 0.55 : svWall === 'x1' ? room.x1 - 0.55 : cx;
      const svZ = svWall === 'z0' ? room.z0 + 0.55 : svWall === 'z1' ? room.z1 - 0.55 : cz;
      if (benchRun(ctx, { x: svX, z: svZ, len: svLen, axis: horiz ? 'x' : 'z', h: 0.95, dpt: 0.7, m: M.steel() })) {
        const cxS = svX, cyS = svZ;
        const hp = horiz ? box(svLen * 0.55, 0.06, 0.5, M.dark()) : box(0.5, 0.06, svLen * 0.55, M.dark());
        addBox(ctx, hp, cxS + (horiz ? -svLen * 0.16 : 0), floorY + 1.0, cyS + (horiz ? 0 : -svLen * 0.16), { collide: false });
        const rail = cyl(0.022, svLen * 0.9, M.steel(), 6);
        rail.rotation.z = Math.PI / 2;
        addBox(ctx, rail, cxS, floorY + 0.9, cyS, { ry: horiz ? 0 : Math.PI / 2, collide: false });
        for (let i = 0; i < 6; i++) {
          placeOn(ctx, box(0.34, 0.02, 0.26, M.orange()),
            cxS + (horiz ? svLen * 0.34 : 0), cyS + (horiz ? 0 : svLen * 0.34), 0.02, floorY + 0.97 + i * 0.02);
        }
        const sn = horiz ? box(svLen * 0.55, 0.4, 0.03, MAT_GLASSY()) : box(0.03, 0.4, svLen * 0.55, MAT_GLASSY());
        addBox(ctx, sn, cxS + (horiz ? -svLen * 0.16 : 0.22), floorY + 1.28, cyS + (horiz ? 0.22 : -svLen * 0.16), { collide: false });
      }
    }

    wallPanel(ctx, {
      x: cx, z: room.z0 + 0.1, w: Math.min(w * 0.5, 2.2), h: 0.9,
      m: mat('mess-board', () => new THREE.MeshStandardMaterial({
        map: signText('WINTER ROSTER', { color: '#dcefff', bg: '#0c1b2b', w: 1024 }), roughness: 0.8
      }))
    });
    ctx.room.seatsBuilt = laid;
  },



  /* -- station control room ---------------------------------------------- */
  /* The room the whole station is actually run from, and the one place a
   * visitor should be able to stand and see the station thinking: a long
   * control desk with a bank of screens on it, a wall of monitors above it
   * carrying power, weather and comms, and the operator's chair pushed back
   * from it. Everything here is driven off the room's real size, so it fills
   * a 10 x 5 m room rather than sitting in the middle of it. */
  _control(ctx) {
    const { room, floorY, cx, cz, w, d } = ctx;
    const deskLen = Math.min(w - 2.4, 6.4);
    const deskZ = room.z0 + 1.15;

    // The desk: worktop, modesty panel, and a cable gutter underneath.
    addBox(ctx, box(deskLen, 0.08, 0.82, M.wood()), cx, floorY + 0.74, deskZ, { ch: 0.78 });
    addBox(ctx, box(deskLen - 0.2, 0.62, 0.06, M.dark()), cx, floorY + 0.39, deskZ + 0.36, { collide: false });
    for (const sd of [-1, 1]) {
      addBox(ctx, box(0.08, 0.7, 0.72, M.steel()), cx + sd * (deskLen / 2 - 0.2), floorY + 0.35, deskZ, { collide: false });
    }
    // Desk screens on a raised rail, angled toward the operator.
    const nScreens = Math.max(3, Math.min(6, Math.floor(deskLen / 1.05)));
    for (let i = 0; i < nScreens; i++) {
      const sx = cx - deskLen / 2 + (i + 0.5) * (deskLen / nScreens);
      const kinds = ['wave', 'tide', 'seismic', 'wave', 'tide', 'seismic'];
      scopeScreen(ctx, { x: sx, y: floorY + 1.22, z: deskZ - 0.28, w: 0.5, h: 0.32, kind: kinds[i % 6], speed: 0.03 + i * 0.012 });
      addBox(ctx, cyl(0.03, 0.22, M.steel(), 6), sx, floorY + 0.9, deskZ - 0.26, { collide: false });
    }
    // Keyboards and a mug, on the desk rather than hovering over it.
    for (let i = 0; i < Math.max(2, nScreens - 2); i++) {
      const sx = cx - deskLen / 2 + (i + 0.8) * (deskLen / nScreens);
      placeOn(ctx, box(0.42, 0.02, 0.16, M.dark()), sx, deskZ - 0.02, 0.02, floorY + 0.79);
    }
    placeOn(ctx, cyl(0.04, 0.1, M.white(), 8), cx + deskLen * 0.34, deskZ + 0.14, 0.1, floorY + 0.79);

    // The video wall: a grid of monitors above the desk, plus the header strip
    // that tells you what you are looking at.
    const wallW = Math.min(w - 2.0, 5.2);
    addBox(ctx, box(wallW + 0.2, 1.5, 0.1, M.dark()), cx, floorY + 2.05, room.z0 + 0.1, { collide: false });
    const cols = Math.max(2, Math.min(4, Math.floor(wallW / 1.25)));
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < cols; c++) {
        const sx = cx - wallW / 2 + (c + 0.5) * (wallW / cols);
        scopeScreen(ctx, {
          x: sx, y: floorY + 2.42 - r * 0.66, z: room.z0 + 0.16,
          w: (wallW / cols) - 0.14, h: 0.54,
          kind: ['wave', 'seismic', 'tide', 'ecg'][(r * cols + c) % 4],
          speed: 0.02 + ((r * cols + c) % 5) * 0.015
        });
      }
    }
    notice(ctx, {
      x: cx, y: floorY + 2.86, z: room.z0 + 0.09, w: wallW * 0.7, h: 0.16,
      text: 'STATION STATUS  \u2014  POWER  \u00b7  MET  \u00b7  COMMS', bg: '#0d1720', fg: '#8fd0ff'
    });

    // Operator's chair, pushed back from the desk the way a real one is.
    addBox(ctx, box(0.52, 0.09, 0.5, M.fabric()), cx - deskLen * 0.14, floorY + 0.47, deskZ + 1.0, { ch: 0.52 });
    addBox(ctx, box(0.5, 0.6, 0.09, M.fabric()), cx - deskLen * 0.14, floorY + 0.8, deskZ + 1.24, { collide: false });
    addBox(ctx, cyl(0.05, 0.42, M.steel(), 8), cx - deskLen * 0.14, floorY + 0.21, deskZ + 1.0, { collide: false });
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      addBox(ctx, box(0.24, 0.04, 0.05, M.dark()),
        cx - deskLen * 0.14 + Math.cos(a) * 0.16, floorY + 0.04, deskZ + 1.0 + Math.sin(a) * 0.16,
        { ry: a, collide: false });
    }

    // Back wall of the room: the boards a station is run off — roster, radio
    // schedule, and the sledging/field party log with people actually out.
    notice(ctx, { x: cx - w * 0.22, y: floorY + 1.72, z: room.z1 - 0.09, ry: Math.PI, w: Math.min(w * 0.3, 1.9), h: 1.0, text: 'ROSTER', bg: '#2a2118', fg: '#f0e0c0' });
    notice(ctx, { x: cx + w * 0.22, y: floorY + 1.72, z: room.z1 - 0.09, ry: Math.PI, w: Math.min(w * 0.3, 1.9), h: 1.0, text: 'FIELD PARTIES', bg: '#1b2a20', fg: '#bfe8c8' });
    for (let i = 0; i < 8; i++) {
      notice(ctx, {
        x: cx + w * 0.22 - 0.7 + ctx.rng() * 1.4, y: floorY + 1.45 + (ctx.rng() - 0.5) * 0.7,
        z: room.z1 - 0.1, ry: Math.PI, w: 0.13, h: 0.17
      });
    }

    // Comms rack and its lamps in the corner, and a printer nobody has moved
    // since it was landed.
    addBox(ctx, box(0.66, 1.95, 0.72, M.dark()), room.x1 - 0.55, floorY + 0.975, room.z0 + 0.6, { ch: 1.95 });
    ledBank(ctx, { x: room.x1 - 0.55, y: floorY + 1.5, z: room.z0 + 0.98, n: 7, pitch: 0.09, hue: 0.33 });
    ledBank(ctx, { x: room.x1 - 0.55, y: floorY + 1.2, z: room.z0 + 0.98, n: 7, pitch: 0.09, hue: 0.55 });
    addBox(ctx, box(0.56, 0.4, 0.46, M.white()), room.x0 + 0.6, floorY + 0.2, room.z1 - 0.6, { ch: 0.4 });

    // Clock set to UTC — the only time a polar station can agree on.
    notice(ctx, { x: room.x0 + 0.11, y: floorY + 2.1, z: cz, ry: Math.PI / 2, w: 0.42, h: 0.28, text: 'UTC', bg: '#0e1720', fg: '#e8f4ff' });
    extinguisher(ctx, room.x0 + 0.25, floorY, room.z0 + 0.7);
  },

  /* -- air handling ------------------------------------------------------ */
  _ahu(ctx) {
    const { room, floorY, cx, cz, w, d } = ctx;
    const GAL = () => mat('ahu-gal', () => new THREE.MeshStandardMaterial({
      color: 0xb6bec4, roughness: 0.42, metalness: 0.72
    }));
    // The unit: a run of sections along the long wall, each a different
    // machine, with access doors and a filter gauge on the face of each.
    const along = w >= d;
    const runLen = Math.min((along ? w : d) - 1.4, 11.0);
    // A big plant room gets a second unit on the opposite wall. One 8 m unit
    // stranded against one wall of a 12 x 15 m hall is what made this room
    // read as empty — real air handling for a building this size is more than
    // one machine, and it is on both sides of the maintenance aisle.
    const cross = along ? d : w;
    const sides = cross > 7.5 ? [1, -1] : [1];
    for (const sideSign of sides) {
    const acr = sideSign > 0
      ? (along ? room.z0 + 0.95 : room.x0 + 0.95)
      : (along ? room.z1 - 0.95 : room.x1 - 0.95);
    const sections = [
      { n: 'INTAKE', f: 0.16, c: GAL() },
      { n: 'FILTER', f: 0.22, c: M.white() },
      { n: 'HEATER', f: 0.20, c: M.steel() },
      { n: 'FAN',    f: 0.24, c: GAL() },
      { n: 'SUPPLY', f: 0.18, c: GAL() }
    ];
    let cursor = -runLen / 2;
    for (const sec of sections) {
      const segLen = runLen * sec.f;
      const mid = cursor + segLen / 2;
      const px = along ? cx + mid : acr, pz = along ? acr : cz + mid;
      const bw = along ? segLen - 0.04 : 1.5, bd = along ? 1.5 : segLen - 0.04;
      addBox(ctx, box(bw, 1.95, bd, sec.c), px, floorY + 0.975, pz, { ch: 1.95 });
      // Access door with a handle, and a label, on the room-facing side.
      const face = along ? pz + 0.78 : px + 0.78;
      const dw = Math.min(segLen * 0.7, 0.9);
      addBox(ctx, box(along ? dw : 0.04, 1.4, along ? 0.04 : dw, M.dark()),
        along ? px : face, floorY + 1.0, along ? face : pz, { collide: false });
      addBox(ctx, cyl(0.03, 0.22, M.steel(), 6),
        along ? px + dw * 0.38 : face + 0.03, floorY + 1.0, along ? face + 0.03 : pz + dw * 0.38,
        { ry: Math.PI / 2, collide: false });
      notice(ctx, {
        x: along ? px : face + 0.02, y: floorY + 1.78, z: along ? face + 0.02 : pz,
        ry: along ? 0 : -Math.PI / 2, w: Math.min(segLen * 0.8, 0.8), h: 0.16,
        text: sec.n, bg: '#1b2830', fg: '#cfe0ea'
      });
      if (sec.n === 'FAN') {
        // The fan you can see turning through the inspection window.
        fan(ctx, { x: along ? px : face - 0.06, y: floorY + 1.0, z: along ? face - 0.06 : pz,
          r: 0.32, rps: 3.4, cage: true, m: GAL() });
      }
      if (sec.n === 'FILTER') {
        // Differential-pressure gauge: the one instrument anybody reads on an
        // AHU, because it tells you when the filters are choked.
        gauge(ctx, along ? px : face + 0.03, floorY + 1.55, along ? face + 0.03 : pz, 0.1);
      }
      cursor += segLen;
    }
    }

    // Fat insulated supply and return duct, running the length of the room at
    // high level and turning up into the ceiling — the thing that makes it
    // read as air handling from the doorway.
    const acr0 = along ? room.z0 + 0.95 : room.x0 + 0.95;
    for (const [dz, sz] of [[0.55, 0.62], [1.35, 0.5]]) {
      const dy = floorY + ctx.ceilH - 0.55;
      const dx0 = along ? cx : acr0 + dz, dz0 = along ? acr0 + dz : cz;
      addBox(ctx, box(along ? runLen + 1.0 : sz, sz, along ? sz : runLen + 1.0, GAL()),
        dx0, dy, dz0, { collide: false });
      // Banding straps along the lagging.
      const n = Math.max(3, Math.floor(runLen / 1.2));
      for (let i = 0; i < n; i++) {
        const t = -runLen / 2 + (i + 0.5) * (runLen / n);
        addBox(ctx, box(along ? 0.05 : sz + 0.03, sz + 0.03, along ? sz + 0.03 : 0.05),
          along ? cx + t : dx0, dy, along ? dz0 : cz + t, { collide: false });
      }
    }
    // A branch dropping to a ceiling diffuser over the middle of the room.
    addBox(ctx, box(0.42, 0.7, 0.42, GAL()), cx, floorY + ctx.ceilH - 0.95, cz, { collide: false });
    louvre(ctx, { x: cx, y: floorY + ctx.ceilH - 1.32, z: cz, w: 0.6, h: 0.18 });

    // Control panel with the plant's own status lamps and a trend screen.
    const px2 = along ? cx + runLen * 0.42 : room.x1 - 0.12;
    const pz2 = along ? room.z1 - 0.12 : cz + runLen * 0.42;
    const pry = along ? Math.PI : -Math.PI / 2;
    addBox(ctx, box(along ? 0.9 : 0.16, 1.2, along ? 0.16 : 0.9, M.dark()),
      px2, floorY + 1.35, pz2, { collide: false });
    scopeScreen(ctx, { x: px2 + (along ? 0 : -0.1), y: floorY + 1.6, z: pz2 + (along ? -0.1 : 0), w: 0.42, h: 0.26, ry: pry, kind: 'wave', speed: 0.03 });
    ledBank(ctx, { x: px2 + (along ? 0 : -0.1), y: floorY + 1.15, z: pz2 + (along ? -0.1 : 0), n: 6, ry: pry, pitch: 0.1, hue: 0.33 });
    hazardStrip(ctx, { x: along ? cx : acr0 + 1.4, z: along ? acr0 + 1.4 : cz, w: along ? runLen : 0.4, d: along ? 0.4 : runLen });
    extinguisher(ctx, room.x1 - 0.25, floorY, room.z0 + 0.6);
  },

  /* -- high-bay store ---------------------------------------------------- */
  /* A logistics hall, not a spare room: everything a station lands in one
   * summer has to live somewhere until it is used, and that is racking. Tall
   * pallet racking in numbered bays, shrink-wrapped loads on the pallets,
   * painted floor lanes, and a picking station at the end. */
  highbay(ctx) {
    const { room, floorY, cx, cz, w, d } = ctx;
    const along = d >= w;                       // racking runs the long way
    const L = (along ? d : w), W = (along ? w : d);
    const bays = Math.max(2, Math.floor(L / 2.6));
    const runs = W > 9 ? 3 : W > 6.5 ? 2 : 1;   // racking runs across the hall
    const tiers = [0.9, 1.85, 2.8];
    const usableTiers = tiers.filter(t => t + 0.5 < ctx.ceilH);

    const lane = 2.4;                            // forklift lane between runs
    for (let r = 0; r < runs; r++) {
      const frac = runs === 1 ? 0.5 : (r + 0.5) / runs;
      const acr = (along ? room.x0 : room.z0) + 0.9 + frac * (W - 1.8);
      const cAlong = along ? cz : cx;
      const runLenM = Math.min(L - 1.8, bays * 2.6);
      if (foulsDoor(ctx,
        along ? acr : cAlong, along ? cAlong : acr,
        along ? 1.2 : runLenM, along ? runLenM : 1.2)) continue;

      // Uprights and beams — the frame reads as racking even before anything
      // is on it.
      for (let bnum = 0; bnum <= bays; bnum++) {
        const t = -runLenM / 2 + bnum * (runLenM / bays);
        const ux = along ? acr : cAlong + t, uz = along ? cAlong + t : acr;
        for (const sd of [-0.5, 0.5]) {
          addBox(ctx, box(along ? 0.12 : 0.12, usableTiers[usableTiers.length - 1] + 0.7, 0.12, M.orange()),
            ux + (along ? sd : 0), floorY + (usableTiers[usableTiers.length - 1] + 0.7) / 2, uz + (along ? 0 : sd),
            { collide: false });
        }
      }
      for (const ty of usableTiers) {
        for (const sd of [-0.5, 0.5]) {
          addBox(ctx, box(along ? 0.1 : runLenM, 0.1, along ? runLenM : 0.1, M.orange()),
            along ? acr + sd : cAlong, floorY + ty, along ? cAlong : acr + sd, { collide: false });
        }
      }
      ctx.colliders.push(new THREE.Box3(
        new THREE.Vector3(along ? acr - 0.62 : cAlong - runLenM / 2, floorY, along ? cAlong - runLenM / 2 : acr - 0.62),
        new THREE.Vector3(along ? acr + 0.62 : cAlong + runLenM / 2, floorY + usableTiers[usableTiers.length - 1] + 0.7, along ? cAlong + runLenM / 2 : acr + 0.62)
      ));

      // Palletised loads. Instanced: a store's whole identity is "a lot of
      // identical pallets", and that must not cost a lot of draw calls.
      const loads = [];
      for (const ty of usableTiers) {
        for (let bnum = 0; bnum < bays; bnum++) {
          if (ctx.rng() < 0.22) continue;         // gaps: stock gets used
          const t = -runLenM / 2 + (bnum + 0.5) * (runLenM / bays);
          loads.push([along ? acr : cAlong + t, floorY + ty + 0.42, along ? cAlong + t : acr, ctx.rng()]);
        }
      }
      if (loads.length) {
        const g2 = new THREE.BoxGeometry(along ? 1.0 : 1.9, 0.72, along ? 1.9 : 1.0);
        const im = new THREE.InstancedMesh(g2, mat('bay-load', () => new THREE.MeshStandardMaterial({
          color: 0xd8dde0, roughness: 0.78, transparent: true, opacity: 0.93
        })), loads.length);
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < loads.length; i++) { m4.makeTranslation(loads[i][0], loads[i][1], loads[i][2]); im.setMatrixAt(i, m4); }
        im.instanceMatrix.needsUpdate = true; im.castShadow = true;
        ctx.g.add(im);
        // Wooden pallet under each load.
        const pg = new THREE.BoxGeometry(along ? 1.05 : 1.95, 0.12, along ? 1.95 : 1.05);
        const pi = new THREE.InstancedMesh(pg, M.wood(), loads.length);
        for (let i = 0; i < loads.length; i++) { m4.makeTranslation(loads[i][0], loads[i][1] - 0.42, loads[i][2]); pi.setMatrixAt(i, m4); }
        pi.instanceMatrix.needsUpdate = true;
        ctx.g.add(pi);
      }

      // Bay numbers on the end upright — this is what makes it read as a
      // *managed* store rather than a pile.
      notice(ctx, {
        x: along ? acr : cAlong - runLenM / 2 + 0.4, y: floorY + 2.5,
        z: along ? cAlong - runLenM / 2 + 0.4 : acr,
        ry: along ? 0 : -Math.PI / 2, w: 0.7, h: 0.22,
        text: 'BAY ' + String.fromCharCode(65 + r) + '1\u2013' + String.fromCharCode(65 + r) + bays,
        bg: '#1d2a12', fg: '#d6f0a8'
      });
      // Painted lane down the aisle beside each run.
      hazardStrip(ctx, {
        x: along ? acr + 0.62 + lane / 2 : cx, z: along ? cz : acr + 0.62 + lane / 2,
        w: along ? 0.16 : L - 2.0, d: along ? L - 2.0 : 0.16
      });
    }

    // Picking station at one end: a bench, a terminal, and the manifest.
    const pz = room.z1 - 0.75;
    if (benchRun(ctx, { x: cx, z: pz, len: Math.min(w - 2.0, 2.4), h: 0.92, dpt: 0.6, m: M.steel() })) {
      scopeScreen(ctx, { x: cx, y: floorY + 1.42, z: room.z1 - 0.12, w: 0.5, h: 0.3, ry: Math.PI, kind: 'wave', speed: 0.02 });
      placeOn(ctx, box(0.24, 0.02, 0.32, M.white()), cx + 0.6, pz, 0.02, floorY + 0.9);
    }
    notice(ctx, {
      x: cx, y: floorY + 2.0, z: room.z0 + 0.09, w: 1.2, h: 0.3,
      text: 'SUMMER STORE  \u2014  MANIFEST AT THE DESK', bg: '#20262b', fg: '#e3ecf2'
    });
    extinguisher(ctx, room.x0 + 0.25, floorY, room.z1 - 0.7);
  },

  /* -- sample storage ----------------------------------------------------
   * Explicitly NOT one room reused twice. The two stations do different
   * science, so they keep different things in different equipment:
   *
   *   'ice'  (Maitri, inland oasis) — glaciology and geology. Ice cores in
   *          labelled tubes on horizontal racking, plus rock/core trays and a
   *          logging bench. Working archives run near -36 C, with sub-sampling
   *          done in a colder clean room; cores are labelled by provenance and
   *          depth so stratigraphic context survives.
   *
   *   'bio'  (Bharati, coastal) — oceanography and marine biology. Chilled
   *          sample fridges and upright freezers, preservation cabinets of
   *          bottled specimens, a wet bench with a sink, and bottle racking.
   *
   * See docs/REFERENCES.md section 4.
   */
  samplestore(ctx) {
    const { room, floorY, cx, cz, w, d } = ctx;
    const kind = ctx.room.variant ?? 'ice';
    hazardStrip(ctx, { x: cx, z: room.z1 - 0.7, w: Math.min(w - 0.8, 3.0), d: 0.5 });

    if (kind === 'ice') {
      // A CORE ARCHIVE, not a shelf of bottles.
      //
      // The first pass stood the core tubes UPRIGHT, because it rotated a
      // cylinder about Y — which is a cylinder's own axis, so it did nothing.
      // Cores are stored lying down, packed along the shelf, and that
      // horizontal grain is most of what makes the room read as an archive.
      // Racking runs both side walls, four tiers, three tubes deep, with the
      // depth-range card at the end of every run.
      const tubeGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.86, 8);
      tubeGeo.rotateX(Math.PI / 2);          // lay it down, axis along +z
      const cells = [];
      const tiers = [0.44, 0.92, 1.40, 1.88];

      let runs = 0;
      for (const side of [-1, 1]) {
        const rx = side < 0 ? room.x0 + 0.5 : room.x1 - 0.5;
        const len = Math.min(d - 1.4, 5.4);
        // A side wall that is a doorway cannot take a 2.15 m rack. Skipping is
        // right, but skipping and leaving the room half empty is not — the
        // shortfall is picked up on the end wall below.
        if (foulsDoor(ctx, rx, cz, 1.0, len)) continue;
        runs++;
        // Uprights and shelf plates.
        for (const ty of tiers) {
          addBox(ctx, box(0.92, 0.05, len, M.steel()), rx, floorY + ty, cz, { collide: false });
        }
        for (const ez of [-1, 1]) {
          addBox(ctx, box(0.08, 2.15, 0.08, M.steel()), rx - 0.4, floorY + 1.07, cz + ez * (len / 2 - 0.06), { collide: false });
          addBox(ctx, box(0.08, 2.15, 0.08, M.steel()), rx + 0.4, floorY + 1.07, cz + ez * (len / 2 - 0.06), { collide: false });
        }
        // Tubes: 3 across the shelf depth, packed along its length.
        const along = Math.max(2, Math.floor(len / 0.95));
        for (let t = 0; t < tiers.length; t++) {
          for (let a2 = 0; a2 < along; a2++) {
            const tz = cz - len / 2 + 0.48 + a2 * (len - 0.96) / Math.max(1, along - 1);
            for (let k = -1; k <= 1; k++) {
              if (ctx.rng() < 0.13) continue;         // gaps: it is a working archive
              cells.push([rx + k * 0.29, floorY + tiers[t] + 0.08, tz, ctx.rng()]);
            }
          }
        }
        ctx.colliders.push(new THREE.Box3(
          new THREE.Vector3(rx - 0.5, floorY, cz - len / 2),
          new THREE.Vector3(rx + 0.5, floorY + 2.15, cz + len / 2)
        ));
        // Depth-range card at the end of each run: provenance and depth are
        // the whole point of keeping a core, so they are what is labelled.
        notice(ctx, {
          x: rx, y: floorY + 2.28, z: cz - Math.min(d - 1.4, 5.4) / 2 + 0.3,
          w: 0.8, h: 0.2,
          text: side < 0 ? 'A1\u2013A48   0\u2013120 m' : 'B1\u2013B48   120\u2013240 m',
          bg: '#0c1c26', fg: '#bfe8ff'
        });
      }

      // All the tubes in one instanced draw call, with slight colour variation
      // between opaque sleeve and frosted core.

      // If a side wall was a doorway, run a bank across the end wall instead
      // so the archive is still an archive rather than one rack and a lot of
      // empty floor.
      if (runs < 2 && w > 2.4) {
        const ez = room.z0 + 0.5, elen = Math.min(w - 1.2, 4.0);
        if (!foulsDoor(ctx, cx, ez, elen, 1.0)) {
          for (const ty of tiers) addBox(ctx, box(elen, 0.05, 0.92, M.steel()), cx, floorY + ty, ez, { collide: false });
          const acr = Math.max(2, Math.floor(elen / 0.95));
          for (let t = 0; t < tiers.length; t++) {
            for (let a2 = 0; a2 < acr; a2++) {
              const ex = cx - elen / 2 + 0.48 + a2 * (elen - 0.96) / Math.max(1, acr - 1);
              for (let k = -1; k <= 1; k++) {
                if (ctx.rng() < 0.13) continue;
                cells.push([ex, floorY + tiers[t] + 0.08, ez + k * 0.29, ctx.rng()]);
              }
            }
          }
          ctx.colliders.push(new THREE.Box3(
            new THREE.Vector3(cx - elen / 2, floorY, ez - 0.5),
            new THREE.Vector3(cx + elen / 2, floorY + 2.15, ez + 0.5)
          ));
        }
      }

      if (cells.length) {
        // Plain pale sleeve material rather than per-instance vertex colours:
        // instanceColor on a LIT material multiplies through the lighting and
        // came out near-black on shelves that are mostly in their own shadow.
        // A core sleeve is white anyway.
        const im = new THREE.InstancedMesh(tubeGeo, mat('core-tube', () => new THREE.MeshStandardMaterial({
          color: 0xdfeaf2, roughness: 0.5, metalness: 0.04
        })), cells.length);
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < cells.length; i++) {
          const [tx, ty, tz] = cells[i];
          m4.makeTranslation(tx, ty, tz);
          im.setMatrixAt(i, m4);
        }
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = true;
        ctx.g.add(im);
        // End caps, so a tube reads as a sealed sleeve rather than a rod.
        const capGeo = new THREE.CylinderGeometry(0.058, 0.058, 0.05, 8);
        capGeo.rotateX(Math.PI / 2);
        const caps = new THREE.InstancedMesh(capGeo, M.orange(), cells.length);
        for (let i = 0; i < cells.length; i++) {
          const [tx, ty, tz] = cells[i];
          m4.makeTranslation(tx, ty, tz + 0.44);
          caps.setMatrixAt(i, m4);
        }
        caps.instanceMatrix.needsUpdate = true;
        ctx.g.add(caps);
      }

      // Logging bench: a core out of its sleeve in a V-cradle under a light
      // box, with callipers and the log sheet — the one place in the room
      // where work actually happens.
      const bz = runs < 2 ? room.z1 - 0.8 : room.z0 + 0.62;
      if (benchRun(ctx, { x: cx, z: bz, len: Math.min(w - 1.6, 2.6), h: 0.9, dpt: 0.62, m: M.steel() })) {
        for (const dx of [-0.45, 0.45]) {
          addBox(ctx, box(0.1, 0.14, 0.26, M.dark()), cx + dx, floorY + 0.97, bz, { collide: false });
        }
        const core = cyl(0.05, 1.15, M.cold(), 10);
        core.rotation.z = Math.PI / 2;
        addBox(ctx, core, cx, floorY + 1.06, bz, { collide: false });
        addBox(ctx, box(1.3, 0.04, 0.1, M.glow()), cx, floorY + 1.42, bz - 0.16, { collide: false });
        placeOn(ctx, box(0.22, 0.02, 0.3, M.white()), cx + 0.75, bz + 0.1, 0.02, floorY + 0.88);
      }
      // Core boxes stacked in the corner, waiting to go out on the ship.
      for (let i = 0; i < 3; i++) {
        addBox(ctx, box(1.1, 0.24, 0.42, M.orange()), cx, floorY + 0.12 + i * 0.25, room.z1 - 0.55,
          { ch: 0.24 });
      }
      notice(ctx, {
        x: cx, y: floorY + 1.9, z: room.z0 + 0.09, w: 1.0, h: 0.3,
        text: '\u221236 \u00b0C   CORE ARCHIVE', bg: '#08161f', fg: '#bfe8ff'
      });
      // Evaporator over the door, running — this room is refrigerated.
      const ey = floorY + ctx.ceilH - 0.45;
      addBox(ctx, box(1.0, 0.4, 0.4, M.steel()), cx, ey, room.z1 - 0.45, { collide: false });
      for (let i = -1; i <= 1; i++) fan(ctx, { x: cx + i * 0.32, y: ey, z: room.z1 - 0.66, r: 0.13, rps: 2.4, cage: false });
      ledBank(ctx, { x: cx + 0.75, y: ey, z: room.z1 - 0.66, n: 3, pitch: 0.08, size: 0.03, hue: 0.55 });
    } else {
      // Coastal biology: a lineup of sample fridges and upright freezers, each
      // with its own controller display, then a wet bench and bottle racking.
      const units = Math.max(2, Math.min(4, Math.floor((w - 1.2) / 0.95)));
      for (let i = 0; i < units; i++) {
        const ux = room.x0 + 0.75 + i * 0.95;
        if (ux > room.x1 - 0.6) break;
        const uz = room.z0 + 0.48;
        if (foulsDoor(ctx, ux, uz, 0.9, 0.85)) continue;
        addBox(ctx, box(0.86, 1.95, 0.75, M.white()), ux, floorY + 0.975, uz, { ch: 1.95 });
        addBox(ctx, box(0.06, 1.7, 0.06, M.steel()), ux + 0.36, floorY + 1.0, uz + 0.39, { collide: false });
        // Controller: setpoint readout plus its own status lamps.
        scopeScreen(ctx, { x: ux, y: floorY + 1.72, z: uz + 0.4, w: 0.3, h: 0.14, kind: 'tide', speed: 0.015 });
        ledBank(ctx, { x: ux, y: floorY + 1.55, z: uz + 0.39, n: 3, pitch: 0.07, size: 0.028, hue: 0.55 });
      }
      // Wet bench with a sink — marine samples arrive wet and get split here.
      const bz = room.z1 - 0.6;
      if (benchRun(ctx, { x: cx, z: bz, len: Math.min(w - 1.8, 3.2), h: 0.92, dpt: 0.7, m: M.steel() })) {
        addBox(ctx, box(0.62, 0.1, 0.46, M.dark()), cx - 0.5, floorY + 0.9, bz, { collide: false });
        const tap = cyl(0.02, 0.3, M.steel(), 6);
        addBox(ctx, tap, cx - 0.5, floorY + 1.06, bz - 0.24, { collide: false });
        // Specimen jars, actually standing on the bench.
        for (let i = 0; i < 6; i++) {
          placeOn(ctx, cyl(0.06, 0.19, i % 2 ? M.cold() : M.white(), 8),
            cx + 0.25 + (i % 3) * 0.19, bz + (i < 3 ? -0.12 : 0.12), 0.19, floorY + 0.9);
        }
      }
      // Preservation cabinet of bottled specimens against the far wall.
      const cxx = room.x1 - 0.4;
      if (!foulsDoor(ctx, cxx, cz, 0.7, 1.8)) {
        addBox(ctx, box(0.6, 2.0, Math.min(d - 1.4, 1.8), M.dark()), cxx, floorY + 1.0, cz, { ch: 2.0 });
        for (let t = 0; t < 4; t++) {
          for (let i = 0; i < 5; i++) {
            addBox(ctx, cyl(0.05, 0.16, M.cold(), 6), cxx - 0.22,
              floorY + 0.45 + t * 0.42, cz - 0.6 + i * 0.3, { collide: false });
          }
        }
      }
      notice(ctx, {
        x: cx, y: floorY + 1.9, z: room.z0 + 0.09, w: 1.1, h: 0.3,
        text: 'BIOLOGICAL SAMPLES  \u2014  LOG BEFORE REMOVAL', bg: '#0d1f18', fg: '#a9e8c4'
      });
    }
    skirting(ctx, trimMat(ctx.palette));
    extinguisher(ctx, room.x0 + 0.22, floorY, room.z1 - 0.6);
  },

  /* -- lounge / rec ------------------------------------------------------ */
  lounge(ctx) {
    const { room, floorY, cx, cz, w, d } = ctx;
    // 'library' doubles this room as the archive reading room. The real
    // shelving run and reading desk are placed by the station itself (they
    // carry the codex interaction, so they can't be generic furniture) —
    // this variant just keeps the north wall and the room's middle clear for
    // them, and pushes the soft seating back against the south wall.
    const library = ctx.room.variant === 'library';
    const seatZ = library ? room.z1 - 0.75 : cz + 0.4;
    for (const s of [-1, 1]) {
      const sofa = box(Math.min(w * 0.42, 2.3), 0.42, 0.85, M.fabric());
      addBox(ctx, sofa, cx + s * Math.min(w * 0.22, 1.5), floorY + 0.21, seatZ, { ry: s > 0 ? -0.25 : 0.25, ch: 0.42 });
      const backr = box(Math.min(w * 0.42, 2.3), 0.45, 0.22, M.fabric());
      addBox(ctx, backr, cx + s * Math.min(w * 0.22, 1.5), floorY + 0.62, seatZ + 0.32, { ry: s > 0 ? -0.25 : 0.25, collide: false });
    }
    // A rug and a standard lamp: the two cheapest things that make a room
    // feel domestic rather than institutional.
    addBox(ctx, box(Math.min(w * 0.5, 2.6), 0.02, Math.min(d * 0.42, 1.9), M.fabric()), cx, floorY + 0.011, seatZ - 0.9, { collide: false });
    addBox(ctx, cyl(0.03, 1.5, M.steel(), 6), room.x0 + 0.6, floorY + 0.75, seatZ, { collide: false });
    addBox(ctx, cyl(0.17, 0.24, M.glow(), 10), room.x0 + 0.6, floorY + 1.6, seatZ, { collide: false });
    if (!library) {
      addBox(ctx, box(1.2, 0.38, 0.65, M.wood()), cx, floorY + 0.19, cz - 0.6, { ch: 0.38 });
      wallPanel(ctx, { x: cx, z: room.z0 + 0.1, w: Math.min(w * 0.4, 1.7), h: 0.95 });
      // Bookshelf — the library the real stations both list in their fitout.
      shelfRack(ctx, { x: room.x1 - 0.32, z: cz, len: Math.min(d - 1.4, 3.0), axis: 'z', h: 1.9, dpt: 0.4, crates: 0 });
    }
  },

  /* -- command / comms --------------------------------------------------- */
  command(ctx) {
    const { room, floorY, cx, cz, w, d } = ctx;
    // Console run facing the front wall, radio racks behind.
    const consoleLen = Math.min(w - 1.4, 4.2);
    benchRun(ctx, { x: cx, z: room.z0 + 0.62, len: consoleLen, h: 0.78, dpt: 0.75, m: M.dark() });
    const screens = Math.max(2, Math.floor(consoleLen / 1.5));
    for (let i = 0; i < screens; i++) {
      const x = cx - consoleLen / 2 + (i + 0.5) * (consoleLen / screens);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.4), M.screen());
      s.position.set(x, floorY + 1.28, room.z0 + 0.34);
      ctx.g.add(s);
      addBox(ctx, box(0.68, 0.06, 0.1, M.steel()), x, floorY + 1.02, room.z0 + 0.36, { collide: false });
    }
    // Equipment racks against the back wall.
    for (const s of [-1, 1]) {
      const rk = box(0.7, 1.9, 0.55, M.dark());
      addBox(ctx, rk, cx + s * Math.min(w * 0.3, 2.0), floorY + 0.95, room.z1 - 0.4, { ch: 1.9 });
      for (let i = 0; i < 4; i++) {
        const led = box(0.5, 0.03, 0.02, M.cold());
        addBox(ctx, led, cx + s * Math.min(w * 0.3, 2.0), floorY + 0.5 + i * 0.35, room.z1 - 0.12, { collide: false });
      }
    }
    addBox(ctx, box(0.42, 0.48, 0.42, M.dark()), cx, floorY + 0.24, room.z0 + 1.5, { collide: false });
    // Chart table and a wall map. Every ops room this size is really built
    // around a paper chart, whatever else is on the desks.
    if (d > 3.4) {
      addBox(ctx, box(Math.min(w * 0.4, 1.8), 0.76, 1.0, M.wood()), cx, floorY + 0.38, cz + 0.6, { ch: 0.76 });
      addBox(ctx, box(Math.min(w * 0.36, 1.6), 0.02, 0.85, M.white()), cx, floorY + 0.78, cz + 0.6, { collide: false });
    }
    wallPanel(ctx, {
      x: cx + Math.min(w * 0.3, 2.0), z: room.z1 - 0.09, w: 1.1, h: 0.75,
      m: mat('ops-map', () => new THREE.MeshStandardMaterial({
        map: signText('LARSEMANN HILLS', { color: '#cfe6f5', bg: '#123043', w: 512 }), roughness: 0.85
      }))
    });
  },

  /* -- laboratory -------------------------------------------------------- */
  /* One theme, parameterised by discipline via room.variant: the bench and
   * fume-hood language is shared (that IS what labs look like), the
   * instruments on top of it are what differ. */
  lab(ctx) {
    const { room, floorY, cx, cz, w, d } = ctx;
    const variant = ctx.room.variant ?? 'general';
    const benchLen = Math.min(d - 1.2, 4.6);
    benchRun(ctx, { x: room.x0 + 0.42, z: cz, len: benchLen, axis: 'z', h: 0.9, dpt: 0.7, m: M.white() });
    shelfRack(ctx, { x: room.x1 - 0.28, z: cz, len: Math.min(d - 1.4, 3.4), axis: 'z', h: 1.9, dpt: 0.4, crates: 3 });

    // Instrument cluster on the bench — different silhouette per discipline
    // so two labs are never the same room with a different sign on the door.
    const put = (mesh, dz, y = 1.0) => addBox(ctx, mesh, room.x0 + 0.42, floorY + y, cz + dz, { collide: false });
    if (variant === 'glaciology') {
      // Ice-core trays and a chest freezer: cores live cold, on racks.
      // A 0.9 m tube centred at floorY + 1.02 has its BASE at floorY + 0.57 --
      // a third of a metre below the 0.9 m bench top it is meant to stand on,
      // so these read as sunk through the bench rather than racked on it.
      // Centre = bench top + half the tube. Moved to the north end of the run
      // as well, leaving the south end clear for the core sleeves the detail
      // pass lays out there.
      for (let i = -1; i <= 1; i++) put(cyl(0.06, 0.9, M.cold(), 8), -0.7 + i * 0.2, 1.35);
      addBox(ctx, box(1.5, 0.85, 0.7, M.white()), cx + 0.4, floorY + 0.42, room.z1 - 0.6, { ch: 0.85 });
      wallPanel(ctx, { x: cx, z: room.z0 + 0.1, w: 1.2, h: 0.7, m: M.cold() });
    } else if (variant === 'meteorology') {
      for (let i = 0; i < 3; i++) put(box(0.4, 0.32, 0.3, M.dark()), (i - 1) * 0.75, 1.06);
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.34), M.screen());
        s.position.set(room.x0 + 0.1, floorY + 1.6, cz + (i - 1) * 0.75);
        s.rotation.y = Math.PI / 2;
        ctx.g.add(s);
      }
    } else if (variant === 'geophysics') {
      // Seismometer piers — heavy, isolated blocks on the floor.
      for (let i = -1; i <= 1; i += 2) {
        addBox(ctx, box(0.6, 0.55, 0.6, M.steel()), cx + i * 0.9, floorY + 0.275, cz + 0.9, { ch: 0.55 });
        addBox(ctx, cyl(0.12, 0.5, M.dark()), cx + i * 0.9, floorY + 0.8, cz + 0.9, { collide: false });
      }
      put(box(0.5, 0.4, 0.36, M.dark()), 0, 1.1);
    } else if (variant === 'oceanography') {
      // Water-sample carousel + tanks.
      addBox(ctx, cyl(0.42, 1.15, M.steel(), 12), cx + 0.6, floorY + 0.575, cz + 0.6, { ch: 1.15, cw: 0.84, cd: 0.84 });
      for (let i = -1; i <= 1; i++) put(cyl(0.08, 0.42, M.cold(), 8), i * 0.4, 1.11);
    } else {
      for (let i = -1; i <= 1; i++) put(box(0.36, 0.3, 0.3, M.dark()), i * 0.7, 1.05);
    }
    // Fume hood at the far end of the bench — universal lab furniture.
    addBox(ctx, box(0.75, 1.9, 1.0, M.white()), room.x0 + 0.45, floorY + 0.95, room.z0 + 0.75, { ch: 1.9 });
    // Glassware, set down on the bench that is actually there rather than at a
    // fixed height that assumes one.
    for (let i = -1; i <= 1; i++) {
      placeOn(ctx, cyl(0.045, 0.22, M.cold(), 8), room.x0 + 0.6, cz + i * 0.35 + 1.3, 0.22, floorY + 0.92);
    }
    addBox(ctx, box(0.36, 0.45, 0.36, M.dark()), room.x0 + 1.25, floorY + 0.225, cz - 0.6, { ch: 0.45 });
    wallPanel(ctx, {
      x: room.x0 + 0.08, z: cz - 1.3, ry: Math.PI / 2, w: 0.9, h: 0.62,
      m: mat('lab-chart', () => new THREE.MeshStandardMaterial({
        map: signText('SAMPLE LOG', { color: '#20303a', bg: '#eef3f6', w: 512 }), roughness: 0.85
      }))
    });
  },

  /* -- dry storage ------------------------------------------------------- */
  storage(ctx) {
    const { room, cz, w, d } = ctx;
    // Racks down both walls plus an aisle — the aisle is deliberately wider
    // than the player's 0.42 m radius by a clear margin so a store room can
    // never become a place you get wedged.
    const len = Math.min(d - 1.0, 6.0);
    shelfRack(ctx, { x: room.x0 + 0.3, z: cz, len, axis: 'z', h: 2.0, dpt: 0.5, crates: 9 });
    shelfRack(ctx, { x: room.x1 - 0.3, z: cz, len, axis: 'z', h: 2.0, dpt: 0.5, crates: 9 });
    if (w > 4.6) shelfRack(ctx, { x: (room.x0 + room.x1) / 2, z: cz, len, axis: 'z', h: 2.0, dpt: 0.5, crates: 9 });
    wallPanel(ctx, {
      x: (room.x0 + room.x1) / 2, z: room.z0 + 0.1, w: 1.0, h: 0.66,
      m: mat('store-manifest', () => new THREE.MeshStandardMaterial({
        map: signText('MANIFEST', { color: '#e9eef2', bg: '#243038', w: 512 }), roughness: 0.85
      }))
    });
  },

  /* -- cold store -------------------------------------------------------- */
  coldstore(ctx) {
    const { room, floorY, cx, cz, w, d } = ctx;
    // Wire shelving, frost-blue light, and a heavy insulated door slab on
    // the inside face — a cold room reads as cold mostly through its light.
    shelfRack(ctx, { x: room.x0 + 0.3, z: cz, len: Math.min(d - 1.0, 4.0), axis: 'z', h: 1.9, dpt: 0.45, crates: 6 });
    shelfRack(ctx, { x: room.x1 - 0.3, z: cz, len: Math.min(d - 1.0, 4.0), axis: 'z', h: 1.9, dpt: 0.45, crates: 6 });
    if (!ctx.lowLights) {
      const chill = new THREE.PointLight(0x9fd8ee, 1.6, Math.max(w, d) * 1.1, 2);
      chill.position.set(cx, floorY + ctx.ceilH - 0.4, cz);
      ctx.g.add(chill);
      ctx.lightsOut.push(chill);
    }
    addBox(ctx, box(Math.min(w * 0.5, 1.6), 0.1, 0.08, M.cold()), cx, floorY + 2.18, room.z0 + 0.14, { collide: false });
  },

  /* -- workshop / vehicle bay -------------------------------------------- */
  workshop(ctx) {
    const { room, floorY, cx, cz, w, d } = ctx;
    benchRun(ctx, { x: cx, z: room.z0 + 0.45, len: Math.min(w - 1.0, 5.0), h: 0.92, dpt: 0.72, m: M.steel() });
    // Tool board above the bench.
    const toolboard = wallPanel(ctx, {
      x: cx, z: room.z0 + 0.1, w: Math.min(w * 0.55, 3.0), h: 1.0,
      m: mat('toolboard', () => new THREE.MeshStandardMaterial({ color: 0x2f3a44, roughness: 0.85 }))
    });
    // Drums and a parts rack in one corner; the middle stays clear because
    // this is the bay a vehicle is supposed to be able to sit in.
    for (let i = 0; i < 3; i++) {
      addBox(ctx, cyl(0.28, 0.86, i % 2 ? M.orange() : M.green(), 12),
        room.x1 - 0.6, floorY + 0.43, room.z1 - 0.7 - i * 0.7, { ch: 0.86, cw: 0.56, cd: 0.56 });
    }
    shelfRack(ctx, { x: room.x0 + 0.3, z: room.z1 - 1.4, len: Math.min(d * 0.4, 2.6), axis: 'z', h: 1.95, dpt: 0.5, crates: 5 });
    // Bench vice, hand tools hung on the board, and a trolley jack parked
    // out of the way — the details that say someone works in here.
    placeOn(ctx, box(0.22, 0.2, 0.16, M.dark()), cx - 1.5, room.z0 + 0.45, 0.2, floorY + 0.92);
    for (let i = 0; i < 6 && toolboard; i++) {
      addBox(ctx, box(0.05, i % 2 ? 0.3 : 0.22, 0.03, M.steel()), cx - 1.1 + i * 0.36, floorY + 1.72, room.z0 + 0.13, { collide: false });
    }
    addBox(ctx, box(0.34, 0.2, 0.8, M.orange()), room.x1 - 1.5, floorY + 0.1, room.z0 + 1.2, { ch: 0.2 });
    // Tyre stack — instanced, reads as a maintenance bay instantly. Stood in
    // the first corner of the room that is not a doorway: at 0.9 m across it
    // is wide enough to take most of a 1.25 m door's clear width, and the
    // half of the opening it leaves is narrower than the player is.
    const tyres = 4;
    const tyreSpots = [
      { x: room.x0 + 0.85, z: room.z1 - 0.9 }, { x: room.x0 + 0.85, z: room.z0 + 0.9 },
      { x: room.x1 - 0.85, z: room.z1 - 0.9 }, { x: room.x1 - 0.85, z: room.z0 + 0.9 }
    ];
    const ts = tyreSpots.find(sp => !foulsDoor(ctx, sp.x, sp.z, 0.9, 0.9));
    if (ts) {
      const tg = new THREE.CylinderGeometry(0.44, 0.44, 0.26, 14);
      const im = new THREE.InstancedMesh(tg, M.rubber(), tyres);
      const mtx = new THREE.Matrix4();
      for (let i = 0; i < tyres; i++) {
        mtx.makeTranslation(ts.x, floorY + 0.14 + i * 0.26, ts.z);
        im.setMatrixAt(i, mtx);
      }
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true;
      ctx.g.add(im);
      ctx.colliders.push(new THREE.Box3(
        new THREE.Vector3(ts.x - 0.45, floorY, ts.z - 0.45),
        new THREE.Vector3(ts.x + 0.45, floorY + tyres * 0.26, ts.z + 0.45)
      ));
    }
  },

  /* -- medical ----------------------------------------------------------- */
  medical(ctx) {
    const { room, floorY, cx, cz, w, d } = ctx;
    // Exam bed centred, supply cabinets on the wall, a light over the bed.
    addBox(ctx, box(0.85, 0.62, 1.95, M.white()), cx - 0.3, floorY + 0.31, cz, { ch: 0.62 });
    addBox(ctx, box(0.85, 0.12, 0.5, M.fabric()), cx - 0.3, floorY + 0.68, cz - 0.65, { collide: false });
    addBox(ctx, box(0.55, 1.85, 0.45, M.white()), room.x1 - 0.35, cz - 0.9 > room.z0 ? floorY + 0.925 : floorY + 0.925, cz - 0.9, { ch: 1.85 });
    addBox(ctx, box(0.5, 0.85, 0.45, M.steel()), room.x1 - 0.35, floorY + 0.42, cz + 0.9, { ch: 0.85 });
    wallPanel(ctx, {
      x: cx, z: room.z0 + 0.1, w: 0.9, h: 0.6,
      m: mat('med-cross', () => new THREE.MeshStandardMaterial({
        map: signText('+ MEDICAL', { color: '#ff6a6a', bg: '#f2f5f7', w: 512 }), roughness: 0.8
      }))
    });
    if (!ctx.lowLights) {
      // Drip stand, vitals monitor and a curtain rail — the three things that
    // make a room read as clinical rather than domestic.
    addBox(ctx, cyl(0.02, 1.5, M.steel(), 6), cx + 0.7, floorY + 0.75, cz - 0.7, { collide: false });
    addBox(ctx, cyl(0.16, 0.03, M.steel(), 8), cx + 0.7, floorY + 0.03, cz - 0.7, { collide: false });
    addBox(ctx, box(0.16, 0.24, 0.12, M.cold()), cx + 0.7, floorY + 1.42, cz - 0.7, { collide: false });
    wallPanel(ctx, { x: cx - 0.3, z: room.z0 + 0.1, w: 0.44, h: 0.32, m: M.screen() });
    const crail = cyl(0.018, Math.min(ctx.w - 1.0, 2.4), M.steel(), 6);
    crail.rotation.z = Math.PI / 2;
    addBox(ctx, crail, cx, floorY + 2.1, cz + 0.9, { collide: false });
    const lamp = new THREE.PointLight(0xffffff, 1.4, 5, 2);
      lamp.position.set(cx - 0.3, floorY + ctx.ceilH - 0.5, cz);
      ctx.g.add(lamp);
      ctx.lightsOut.push(lamp);
    }
  },

  /* -- utility / mechanical plant ---------------------------------------- */
  /* -- utility / mechanical plant ----------------------------------------
   * The CHP set is the reason a polar station can exist at all — it makes
   * the power AND, off its waste heat, the heating and the meltwater. So
   * this room gets the most hardware of any: engine blocks on housekeeping
   * pads with exhaust stacks and gauges, header pipework with real flanges
   * and valve wheels running wall to wall, glycol tanks, a switchboard
   * lineup, cable tray overhead and hazard striping on the floor round the
   * machines. */
  utility(ctx) {
    const { room, floorY, cx, cz, w, d } = ctx;
    // An AIR HANDLING room is not a generator hall. It is big rectangular
    // plant — filter section, heater battery, fan section — strung together in
    // a line with fat insulated duct running out of it into the ceiling, and
    // it looks nothing like a row of diesels. Sharing the CHP furniture was
    // why Bharati's AIR HANDLING room read as "some boxes".
    if (ctx.room.variant === 'ahu') { THEMES._ahu(ctx); return; }
    const engW = Math.min(w * 0.34, 2.0), engD = Math.min(d * 0.30, 1.4);
    const engX = room.x0 + 0.35 + engW / 2;

    // Two engine sets, side by side, each on a raised housekeeping pad.
    const sets = d > 6 ? 2 : 1;
    for (let s = 0; s < sets; s++) {
      const ez = sets === 1 ? cz : cz + (s ? engD * 1.25 : -engD * 1.25);
      hazardStrip(ctx, { x: engX, z: ez, w: engW + 0.7, d: engD + 0.7 });
      const pad = box(engW + 0.4, 0.12, engD + 0.4, GRATE());
      addBox(ctx, pad, engX, floorY + 0.06, ez, { collide: false });
      addBox(ctx, box(engW, 1.25, engD, M.green()), engX, floorY + 0.72, ez, { ch: 1.35 });
      // Radiator end + exhaust stack up into the ceiling.
      addBox(ctx, box(0.22, 0.95, engD * 0.8, GRATE()), engX + engW / 2 + 0.1, floorY + 0.75, ez, { collide: false });
      const stack = cyl(0.12, ctx.ceilH - 1.35, M.steel(), 10);
      addBox(ctx, stack, engX - engW * 0.25, floorY + 1.35 + (ctx.ceilH - 1.35) / 2, ez, { collide: false });
      const lag = cyl(0.155, 0.5, M.white(), 10);
      addBox(ctx, lag, engX - engW * 0.25, floorY + 1.75, ez, { collide: false });
      // Instrument face on the engine end, where an operator would read it.
      gauge(ctx, engX, floorY + 1.05, ez + engD / 2 + 0.02, 0.09);
      gauge(ctx, engX + 0.26, floorY + 1.05, ez + engD / 2 + 0.02, 0.06);
      addBox(ctx, box(0.5, 0.16, 0.03, M.dark()), engX - 0.3, floorY + 1.05, ez + engD / 2 + 0.02, { collide: false });
    }

    // Header pipework along the back wall, wall to wall, with valves.
    const runLen = Math.max(1.5, w - 1.2);
    pipeRun(ctx, { x: cx, y: floorY + 1.62, z: room.z0 + 0.42, len: runLen, axis: 'x', r: 0.085, valve: true });
    pipeRun(ctx, { x: cx, y: floorY + 1.34, z: room.z0 + 0.42, len: runLen, axis: 'x', r: 0.06, m: COPPER(), valve: false });
    cableTray(ctx, { x: cx, z: room.z0 + 0.9, len: runLen, axis: 'x', y: floorY + ctx.ceilH - 0.3 });

    // Glycol / meltwater tanks against the far wall.
    for (let i = 0; i < 2; i++) {
      const tz = cz + (i ? 1.2 : -1.2);
      addBox(ctx, cyl(0.42, 1.7, M.white(), 14), room.x1 - 0.7, floorY + 0.85, tz, { ch: 1.7, cw: 0.84, cd: 0.84 });
      addBox(ctx, new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 16), M.steel()),
        room.x1 - 0.7, floorY + 1.35, tz, { collide: false });
      gauge(ctx, room.x1 - 0.7, floorY + 1.15, tz - 0.44, 0.055);
    }
    pipeRun(ctx, { x: room.x1 - 0.7, y: floorY + 1.85, z: cz, len: 2.4, axis: 'z', r: 0.055, m: COPPER() });

    // Switchboard lineup — cabinets with live status LEDs and a warning label.
    const cabs = Math.min(3, Math.max(2, Math.floor(w / 3)));
    for (let i = 0; i < cabs; i++) {
      const x = cx + 0.2 + i * 0.78;
      if (x > room.x1 - 0.6) break;
      addBox(ctx, box(0.72, 1.85, 0.42, M.dark()), x, floorY + 0.925, room.z1 - 0.34, { ch: 1.85 });
      for (let k = 0; k < 4; k++) {
        addBox(ctx, box(0.46, 0.028, 0.02, k === 1 ? M.orange() : M.cold()),
          x, floorY + 1.05 + k * 0.26, room.z1 - 0.12, { collide: false });
      }
      gauge(ctx, x + 0.2, floorY + 1.72, room.z1 - 0.12, 0.05);
    }
    wallPanel(ctx, {
      x: cx - 1.4, z: room.z1 - 0.1, w: 0.85, h: 0.4,
      m: mat('plant-warn', () => new THREE.MeshStandardMaterial({
        map: signText('HIGH VOLTAGE', { color: '#1a1408', bg: '#d8a12a', w: 512 }), roughness: 0.85
      }))
    });
    louvre(ctx, { x: cx + 1.6, y: floorY + 2.0, z: room.z1 - 0.06, w: 0.8, h: 0.55 });
  },

  /* -- stairwell ----------------------------------------------------------
   * Its own theme purely so a stairwell reads as one from the corridor:
   * bright (a dim stair is a stair nobody finds), hazard-striped nosing at
   * the threshold, and a floor-level marker on the wall. */
  stairwell(ctx) {
    const { room, floorY, cx, cz, w, d } = ctx;
    const lamp = new THREE.PointLight(0xf2f7ff, 2.6, Math.max(w, d) * 1.3, 2);
    lamp.position.set(cx, floorY + ctx.ceilH - 0.4, cz);
    ctx.g.add(lamp);
    ctx.lightsOut.push(lamp);
    // Yellow nosing across the threshold — the universal "there is a level
    // change here" cue, and it catches the eye from down the corridor.
    hazardStrip(ctx, { x: cx, z: room.z1 - 0.35, w: Math.min(w - 0.4, 5.5), d: 0.22 });
  },

  /* -- gym / fitness (Bharati lists one) ---------------------------------- */
  gym(ctx) {
    const { room, floorY, cx, cz, w, d } = ctx;
    addBox(ctx, box(0.7, 1.4, 1.3, M.dark()), room.x0 + 0.7, floorY + 0.7, cz - 0.8, { ch: 1.4 });
    addBox(ctx, box(0.75, 1.15, 1.5, M.dark()), room.x0 + 0.7, floorY + 0.575, cz + 1.1, { ch: 1.15 });
    // Weight rack.
    shelfRack(ctx, { x: room.x1 - 0.3, z: cz, len: Math.min(d - 1.6, 2.4), axis: 'z', h: 1.2, dpt: 0.42 });
    const matM = mat('gym-mat', () => new THREE.MeshStandardMaterial({ color: 0x2b4c5e, roughness: 0.95 }));
    addBox(ctx, box(Math.min(w * 0.4, 1.8), 0.05, Math.min(d * 0.4, 1.6), matM), cx + 0.6, floorY + 0.025, cz, { collide: false });
  },

  /* -- office (Bharati's second floor has these) -------------------------- */
  office(ctx) {
    const { room, floorY, cx, cz, w, d } = ctx;
    if (ctx.room.variant === 'control') { THEMES._control(ctx); return; }
    const desks = d > 4.5 ? 2 : 1;
    for (let i = 0; i < desks; i++) {
      const z = desks === 1 ? cz : cz + (i ? 1.3 : -1.3);
      addBox(ctx, box(1.5, 0.74, 0.72, M.wood()), cx, floorY + 0.37, z, { ch: 0.74 });
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.34), M.screen());
      s.position.set(cx, floorY + 1.05, z - 0.28);
      ctx.g.add(s);
      addBox(ctx, box(0.44, 0.5, 0.44, M.dark()), cx, floorY + 0.25, z + 0.62, { collide: false });
    }
    shelfRack(ctx, { x: room.x1 - 0.28, z: cz, len: Math.min(d - 1.4, 2.6), axis: 'z', h: 1.85, dpt: 0.38, crates: 0 });
  },

  /** Deliberately empty — corridors and stairwell landings stay clear. */
  corridor() {},
  plant(ctx) { THEMES.utility(ctx); }
};

export { THEMES, M as INTERIOR_M, addBox as placeBox, box as boxMesh, cyl as cylMesh };
