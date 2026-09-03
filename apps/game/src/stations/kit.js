import * as THREE from 'three';

/**
 * kit.js — shared materials, canvas-generated textures and small structural
 * parts used to assemble the stations.
 *
 * Everything is procedural. No image downloads means the whole experience is
 * a ~200 KB JS payload instead of a 60 MB asset bundle, which is the
 * difference between "loads on a school connection" and "does not".
 */

/* ============================================================== textures */

const _texCache = new Map();
function cached(key, make) {
  if (!_texCache.has(key)) _texCache.set(key, make());
  return _texCache.get(key);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * Corrugated / ribbed metal cladding — the sheeting Maitri is clad in.
 * Rendered as a colour map plus a matching normal map so the ribs actually
 * catch the low polar sun instead of being a flat printed stripe.
 */
export function corrugated(color = '#8ea3a8', ribs = 32) {
  return cached(`corr-${color}-${ribs}`, () => {
    const [c, g] = canvas(512, 512);
    g.fillStyle = color; g.fillRect(0, 0, 512, 512);
    const w = 512 / ribs;
    for (let i = 0; i < ribs; i++) {
      const x = i * w;
      const grd = g.createLinearGradient(x, 0, x + w, 0);
      grd.addColorStop(0.00, 'rgba(0,0,0,0.22)');
      grd.addColorStop(0.30, 'rgba(255,255,255,0.14)');
      grd.addColorStop(0.55, 'rgba(255,255,255,0.05)');
      grd.addColorStop(1.00, 'rgba(0,0,0,0.20)');
      g.fillStyle = grd; g.fillRect(x, 0, w, 512);
    }
    // Horizontal panel joints every 128 px, plus weathering streaks.
    g.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = 0; y < 512; y += 128) g.fillRect(0, y, 512, 2);
    g.globalAlpha = 0.05;
    for (let i = 0; i < 200; i++) {
      g.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
      g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 8 + Math.random() * 60);
    }
    g.globalAlpha = 1;
    return finish(c, { repeat: [1, 1] });
  });
}

export function corrugatedNormal(ribs = 32) {
  return cached(`corrN-${ribs}`, () => {
    const [c, g] = canvas(512, 512);
    const img = g.createImageData(512, 512);
    for (let x = 0; x < 512; x++) {
      // A sine rib profile; the derivative gives the surface tangent.
      const phase = (x / (512 / ribs)) * Math.PI * 2;
      const dz = Math.cos(phase) * 0.85;
      const nx = -dz, ny = 0, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const r = ((nx / len) * 0.5 + 0.5) * 255;
      const gg = ((ny / len) * 0.5 + 0.5) * 255;
      const b = ((nz / len) * 0.5 + 0.5) * 255;
      for (let y = 0; y < 512; y++) {
        const i = (y * 512 + x) * 4;
        img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return finish(c, { srgb: false });
  });
}

/** The Indian tricolour, drawn to spec: 3:2 ratio, 24-spoke Ashoka Chakra. */
export function tricolour(w = 900) {
  return cached('tricolour', () => {
    const h = Math.round(w * 2 / 3);
    const [c, g] = canvas(w, h);
    const band = h / 3;
    g.fillStyle = '#FF9933'; g.fillRect(0, 0, w, band);
    g.fillStyle = '#FFFFFF'; g.fillRect(0, band, w, band);
    g.fillStyle = '#138808'; g.fillRect(0, band * 2, w, band);

    // Chakra: diameter = 3/4 of the white band.
    const cx = w / 2, cy = h / 2, R = band * 0.375;
    g.strokeStyle = '#000080'; g.fillStyle = '#000080';
    g.lineWidth = Math.max(1.5, R * 0.055);
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, R * 0.13, 0, Math.PI * 2); g.fill();
    g.lineWidth = Math.max(1, R * 0.035);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * R * 0.14, cy + Math.sin(a) * R * 0.14);
      g.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95);
      g.stroke();
    }
    return finish(c);
  });
}

/** Simple two/three-band flags for the other stations that share the oasis. */
export function bandFlag(key) {
  return cached(`flag-${key}`, () => {
    const [c, g] = canvas(600, 400);
    const H = (bands) => {
      const bh = 400 / bands.length;
      bands.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * bh, 600, bh); });
    };
    switch (key) {
      case 'russia': H(['#ffffff', '#0039A6', '#D52B1E']); break;
      case 'germany': H(['#000000', '#DD0000', '#FFCE00']); break;
      case 'southafrica':
        g.fillStyle = '#002395'; g.fillRect(0, 0, 600, 400);
        g.fillStyle = '#DE3831'; g.fillRect(0, 0, 600, 180);
        g.fillStyle = '#FFFFFF'; g.fillRect(0, 170, 600, 60);
        g.fillStyle = '#007A4D';
        g.beginPath(); g.moveTo(0, 60); g.lineTo(260, 200); g.lineTo(0, 340); g.closePath(); g.fill();
        g.fillStyle = '#FFB612';
        g.beginPath(); g.moveTo(0, 120); g.lineTo(170, 200); g.lineTo(0, 280); g.closePath(); g.fill();
        break;
      case 'china':
        g.fillStyle = '#DE2910'; g.fillRect(0, 0, 600, 400);
        g.fillStyle = '#FFDE00';
        const star = (x, y, r) => {
          g.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + i * Math.PI * 4 / 5;
            i ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
              : g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          }
          g.closePath(); g.fill();
        };
        star(110, 105, 60);
        [[210, 45], [255, 90], [255, 150], [210, 195]].forEach(([x, y]) => star(x, y, 22));
        break;
      default: H(['#cccccc', '#999999']);
    }
    // Fabric shading so a flat plane does not read as a printed sticker.
    const grd = g.createLinearGradient(0, 0, 600, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0.30)');
    grd.addColorStop(0.18, 'rgba(0,0,0,0.05)');
    grd.addColorStop(1, 'rgba(0,0,0,0.10)');
    g.fillStyle = grd; g.fillRect(0, 0, 600, 400);
    return finish(c);
  });
}

/** Painted signage text, e.g. the MAITRI roof lettering. */
export function signText(text, {
  color = '#ffffff', bg = 'transparent', font = 'Barlow Condensed',
  weight = 700, pad = 0.18, w = 1024
} = {}) {
  return cached(`sign-${text}-${color}-${bg}-${w}`, () => {
    const h = Math.round(w * 0.28);
    const [c, g] = canvas(w, h);
    if (bg !== 'transparent') { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    let size = h * (1 - pad * 2);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    do {
      g.font = `${weight} ${size}px "${font}", sans-serif`;
      if (g.measureText(text).width <= w * (1 - pad)) break;
      size -= 4;
    } while (size > 8);
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + size * 0.04);
    const t = finish(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/**
 * Ripstop parka fabric — a fine diagonal weave plus soft tonal noise, so a
 * character's coat reads as cloth under close light instead of a flat
 * plastic-looking colour fill. Cheap: one small cached canvas per colour,
 * reused across every character wearing that colour.
 */
export function fabric(color = '#e0611f') {
  return cached(`fabric-${color}`, () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = color; g.fillRect(0, 0, 128, 128);
    // Diagonal ripstop lines, faint.
    g.strokeStyle = 'rgba(0,0,0,0.07)';
    g.lineWidth = 1;
    for (let i = -128; i < 128; i += 6) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let i = -128; i < 128; i += 6) {
      g.beginPath(); g.moveTo(i + 3, 0); g.lineTo(i + 131, 128); g.stroke();
    }
    // Soft tonal noise so it isn't a perfectly regular grid.
    for (let i = 0; i < 90; i++) {
      g.globalAlpha = 0.035 + Math.random() * 0.05;
      g.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
      g.beginPath();
      g.arc(Math.random() * 128, Math.random() * 128, 3 + Math.random() * 7, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    return finish(c, { repeat: [3, 3] });
  });
}

/** Weathered painted steel — for containers, drums, machinery. */
export function paintedMetal(color = '#c0562a') {
  return cached(`paint-${color}`, () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = color; g.fillRect(0, 0, 256, 256);
    // Rust blooms and scuffs.
    for (let i = 0; i < 260; i++) {
      const r = 2 + Math.random() * 16;
      g.globalAlpha = 0.03 + Math.random() * 0.10;
      g.fillStyle = Math.random() > 0.4 ? '#3a2214' : '#e8e2d8';
      g.beginPath();
      g.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    return finish(c, { repeat: [1, 1] });
  });
}

/** Corrugated ISO container side — the 134 that hold Bharati up. */
export function containerSkin(color = '#2f6f4e') {
  return cached(`cont-${color}`, () => {
    const [c, g] = canvas(512, 256);
    g.fillStyle = color; g.fillRect(0, 0, 512, 256);
    for (let x = 0; x < 512; x += 16) {
      g.fillStyle = 'rgba(0,0,0,0.20)'; g.fillRect(x, 12, 5, 232);
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 5, 12, 5, 232);
    }
    // Top and bottom rails.
    g.fillStyle = 'rgba(0,0,0,0.30)';
    g.fillRect(0, 0, 512, 12); g.fillRect(0, 244, 512, 12);
    for (let i = 0; i < 160; i++) {
      g.globalAlpha = 0.05 + Math.random() * 0.10;
      g.fillStyle = '#2a180e';
      g.fillRect(Math.random() * 512, Math.random() * 256, 2 + Math.random() * 10, 3 + Math.random() * 24);
    }
    g.globalAlpha = 1;
    return finish(c);
  });
}

/* ============================================================= materials */

// Every MAT.xxx() factory below used to construct a brand-new
// MeshStandardMaterial on every single call — and these are called from
// inside per-stilt, per-brace, per-rung loops (stilt(), crossBrace(),
// latticeMast(), ...) all over the station builders. A single multi-storey
// station's stilts alone call MAT.steelGrey()/MAT.steel() dozens of times
// with byte-for-byte identical properties, so the runtime material count was
// an order of magnitude higher than the ~100 call sites suggest — each one a
// separate WebGL program/uniform binding for a material indistinguishable
// from ones already in the scene. Routing every factory through the same
// `cached()` map the textures above already use turns that into one shared
// material instance per named material, everywhere, at zero visual cost
// (nothing here ever varies its properties by argument).
export const MAT = {
  /** Maitri's sage/blue-grey ribbed cladding, matched from the front elevation. */
  cladding: () => cached('mat-cladding', () => new THREE.MeshStandardMaterial({
    map: corrugated('#93a9ad', 30),
    normalMap: corrugatedNormal(30),
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.66, metalness: 0.18
  })),
  claddingDark: () => cached('mat-claddingDark', () => new THREE.MeshStandardMaterial({
    map: corrugated('#5f7276', 30),
    normalMap: corrugatedNormal(30),
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.68, metalness: 0.20
  })),
  /** Bharati's smooth insulated skin — deliberately NOT ribbed.
   *  DoubleSide: Bharati is elevated on stilts specifically so a vehicle (or
   *  a player) can pass underneath, which means the underside of the hull's
   *  own prismatoid shell is real, reachable, lookedat-from-below geometry —
   *  not a face any normal building would need visible. A single-sided
   *  material only draws it from outside, so standing under the building
   *  and looking up showed pure black (the un-lit back of the shell) rather
   *  than the actual cladding. */
  skin: () => cached('mat-skin', () => new THREE.MeshStandardMaterial({
    color: 0x9aa6ad, roughness: 0.40, metalness: 0.55, envMapIntensity: 0.8, side: THREE.DoubleSide
  })),
  skinDark: () => cached('mat-skinDark', () => new THREE.MeshStandardMaterial({
    color: 0x2b3238, roughness: 0.45, metalness: 0.45, side: THREE.DoubleSide
  })),
  /** Red-oxide structural steel — the colour Indian station stilts are painted. */
  steel: () => cached('mat-steel', () => new THREE.MeshStandardMaterial({
    color: 0x8c3b28, roughness: 0.72, metalness: 0.62
  })),
  steelGrey: () => cached('mat-steelGrey', () => new THREE.MeshStandardMaterial({
    color: 0x6a7076, roughness: 0.55, metalness: 0.75
  })),
  galv: () => cached('mat-galv', () => new THREE.MeshStandardMaterial({
    color: 0xb9c2c8, roughness: 0.42, metalness: 0.85
  })),
  frame: () => cached('mat-frame', () => new THREE.MeshStandardMaterial({
    color: 0xf2f4f5, roughness: 0.5, metalness: 0.05
  })),
  /**
   * Window glass. Antarctic station windows are small, triple-glazed and
   * usually dark from outside — the interior is dim relative to the snow
   * glare, so they read almost black with a strong sky reflection.
   */
  glass: () => cached('mat-glass', () => new THREE.MeshPhysicalMaterial({
    color: 0x0d1a24, roughness: 0.08, metalness: 0.0,
    transmission: 0.0, reflectivity: 0.85, clearcoat: 1.0, clearcoatRoughness: 0.06
  })),
  glassLit: () => cached('mat-glassLit', () => new THREE.MeshStandardMaterial({
    color: 0xffc978, emissive: 0xffb14d, emissiveIntensity: 1.4, roughness: 0.3
  })),
  white: () => cached('mat-white', () => new THREE.MeshStandardMaterial({ color: 0xeef2f4, roughness: 0.7 })),
  concrete: () => cached('mat-concrete', () => new THREE.MeshStandardMaterial({ color: 0x8a8880, roughness: 0.95 })),
  rubber: () => cached('mat-rubber', () => new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.9 })),
  snowMat: () => cached('mat-snowMat', () => new THREE.MeshStandardMaterial({ color: 0xf4f9fc, roughness: 0.85 }))
};

/* ================================================================= parts */

/** A steel stilt: column plus base plate. */
export function stilt(h, r = 0.16, mat) {
  const g = new THREE.Group();
  const col = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, h, 10), mat);
  col.position.y = h / 2;
  col.castShadow = col.receiveShadow = true;
  g.add(col);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(r * 5, 0.22, r * 5), mat);
  plate.position.y = 0.11;
  plate.castShadow = plate.receiveShadow = true;
  g.add(plate);
  return g;
}

/** Diagonal cross-brace between two stilt tops. Purely structural honesty. */
export function crossBrace(x1, x2, h, mat, r = 0.07) {
  const g = new THREE.Group();
  const span = Math.abs(x2 - x1);
  const len = Math.hypot(span, h);
  const ang = Math.atan2(h, span);
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
    m.position.set((x1 + x2) / 2, h / 2, 0);
    m.rotation.z = s * (Math.PI / 2 - ang);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

/** Lattice antenna mast — three legs with zig-zag bracing. */
export function latticeMast(height, width = 0.5, mat) {
  const g = new THREE.Group();
  const legs = 3, r = width / 2;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, height, 6), mat);
    leg.position.set(Math.cos(a) * r, height / 2, Math.sin(a) * r);
    leg.castShadow = true;
    g.add(leg);
  }
  const rungs = Math.floor(height / 1.4);
  for (let k = 0; k < rungs; k++) {
    const y = (k + 0.5) * (height / rungs);
    for (let i = 0; i < legs; i++) {
      const a1 = (i / legs) * Math.PI * 2, a2 = ((i + 1) / legs) * Math.PI * 2;
      const p1 = new THREE.Vector3(Math.cos(a1) * r, y, Math.sin(a1) * r);
      const p2 = new THREE.Vector3(Math.cos(a2) * r, y + height / rungs * 0.5, Math.sin(a2) * r);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, p1.distanceTo(p2), 4), mat);
      bar.position.copy(p1).add(p2).multiplyScalar(0.5);
      bar.quaternion.setFromUnitVectors(UP, p2.clone().sub(p1).normalize());
      g.add(bar);
    }
  }
  return g;
}

/** Radome — the white sphere-on-a-drum that sits on every polar station roof. */
export function radome(radius = 1.5) {
  const g = new THREE.Group();
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, radius * 0.5, 20),
    new THREE.MeshStandardMaterial({ color: 0xd8dde0, roughness: 0.8 })
  );
  drum.position.y = radius * 0.25;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xf0f3f5, roughness: 0.55 })
  );
  dome.position.y = radius * 0.5;
  drum.castShadow = dome.castShadow = true;
  g.add(drum, dome);
  return g;
}

/** Satellite dish on a mount. */
export function dish(radius = 1.2) {
  const g = new THREE.Group();
  const m = MAT.white();
  const d = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.34), m);
  d.rotation.x = Math.PI * 0.72;
  d.position.y = radius * 1.1;
  d.castShadow = true;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, radius * 1.1, 6), MAT.steelGrey());
  arm.position.y = radius * 0.55;
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, radius * 0.7, 6), MAT.steelGrey());
  feed.position.set(0, radius * 1.25, radius * 0.42);
  feed.rotation.x = Math.PI * 0.28;
  g.add(d, arm, feed);
  return g;
}

/** 20 ft ISO shipping container. Real dimensions: 6.06 × 2.44 × 2.59 m. */
export function container(color = '#2f6f4e') {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(6.06, 2.59, 2.44),
    new THREE.MeshStandardMaterial({ map: containerSkin(color), roughness: 0.75, metalness: 0.3 })
  );
  body.position.y = 1.295;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  // Corner castings — the detail that makes a box read as a container.
  const cc = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.7, metalness: 0.6 });
  for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.28), cc);
    c.position.set(sx * 2.86, sy * 2.35 + 0.12, sz * 1.08);
    g.add(c);
  }
  return g;
}

/** Fuel drum. There are thousands of these at every Antarctic station. */
export function drum(color = '#1f4f8f') {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14),
    new THREE.MeshStandardMaterial({ map: paintedMetal(color), roughness: 0.65, metalness: 0.5 })
  );
  body.position.y = 0.44;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  for (const y of [0.30, 0.58]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.022, 6, 16), MAT.steelGrey());
    rib.rotation.x = Math.PI / 2; rib.position.y = y;
    g.add(rib);
  }
  return g;
}

/**
 * A supply crate small enough to live on an indoor shelf or get carried —
 * container() itself is a 6 m shipping container, much too large for
 * anything but the apron outside.
 */
export function crate(color = '#8a6a3a') {
  const g = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.3, 0.36),
    new THREE.MeshStandardMaterial({ map: containerSkin(color), roughness: 0.8, metalness: 0.1 })
  );
  g.castShadow = g.receiveShadow = true;
  return g;
}

/**
 * A furnished indoor storage bay: two shelving racks stacked with crates
 * along the back wall, a few drums, and a sign — somewhere the resupply
 * the helicopter drops off can actually end up, rather than sitting on the
 * apron forever once the ground crew "collects" it.
 *
 * Built centred on its own local origin, footprint roughly `width` × `depth`,
 * facing local +Z (the same convention buildInterior's furniture uses) —
 * the caller positions and optionally rotates the whole group.
 */
// One shared unit geometry + one InstancedMesh per colour for every can in
// every storageBay — previously each can row built its own fresh
// CylinderGeometry (identical dimensions every time) and up to 45 cans
// across a single storage room were 45 separate draw calls.
const _canGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.09, 10);
const _canMatCache = new Map();
function canMat(color) {
  if (!_canMatCache.has(color)) {
    _canMatCache.set(color, new THREE.MeshStandardMaterial({ map: paintedMetal(color), roughness: 0.5, metalness: 0.6 }));
  }
  return _canMatCache.get(color);
}

export function storageBay(width = 4.4, depth = 3.0) {
  const g = new THREE.Group();
  const shelfMat = MAT.steelGrey();
  const crateColors = ['#8a6a3a', '#3f6b46', '#5a5f66', '#7a4a2c'];
  // Tinned/canned rations, not more crates — what an actual polar dry-store
  // shelf is mostly full of, since almost nothing fresh survives between
  // the once- or twice-a-year resupply runs. Small painted cylinders in
  // tidy rows read as "tinned food" the instant there's more than one.
  // canRow places lightweight marker Object3Ds (no geometry/material, so no
  // draw cost) at each can's position, kept in the same Group hierarchy as
  // before so all the surrounding position.set() layout code is unchanged.
  // Once the whole shelf is assembled, a single pass below resolves each
  // marker's world position and replaces the lot with one InstancedMesh per
  // colour — collapsing what used to be up to 45 individual can meshes (each
  // with its own freshly-built CylinderGeometry) into ~5 draw calls.
  const canColors = ['#c0562a', '#3f6b46', '#8a1f1f', '#1f4f8f', '#c9a63a'];
  const canMarkers = []; // { marker, color }
  function canRow(n, color) {
    const row = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const marker = new THREE.Object3D();
      marker.position.set((i - (n - 1) / 2) * 0.07, 0.045, 0);
      row.add(marker);
      canMarkers.push({ marker, color });
    }
    return row;
  }

  // Centre shelf unit, dedicated to the tinned stores — flanked by the two
  // general-supply racks either side.
  {
    const canShelf = new THREE.Group();
    for (const dz of [-0.28, 0.28]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.7, 0.045), shelfMat);
      post.position.set(0, 0.85, dz);
      canShelf.add(post);
    }
    for (const y of [0.4, 0.85, 1.3]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.62), shelfMat);
      shelf.position.set(0, y, 0);
      shelf.castShadow = shelf.receiveShadow = true;
      canShelf.add(shelf);
      let ci = Math.floor(y * 3) % canColors.length;
      for (const dz of [-0.18, 0, 0.18]) {
        const row = canRow(5, canColors[ci++ % canColors.length]);
        row.position.set(0, y + 0.015, dz);
        canShelf.add(row);
      }
    }
    canShelf.position.set(0, 0, -depth / 2 + 0.4);
    g.add(canShelf);
  }

  for (const sx of [-width / 2 + 0.55, width / 2 - 0.55]) {
    const rack = new THREE.Group();
    for (const dz of [-0.35, 0.35]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.1, 0.05), shelfMat);
      post.position.set(0, 1.05, dz);
      post.castShadow = true;
      rack.add(post);
    }
    let ci = 0;
    for (const y of [0.55, 1.1, 1.65]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.04, 0.8), shelfMat);
      shelf.position.set(0, y, 0);
      shelf.castShadow = shelf.receiveShadow = true;
      rack.add(shelf);
      for (const dz of [-0.22, 0.05, 0.28]) {
        const c = crate(crateColors[ci++ % crateColors.length]);
        c.position.set((Math.random() - 0.5) * 0.25, y + 0.17, dz);
        c.rotation.y = (Math.random() - 0.5) * 0.3;
        rack.add(c);
      }
    }
    rack.position.set(sx, 0, -depth / 2 + 0.45);
    g.add(rack);
  }

  // A few drums stood in the free corner, the same way a real store room
  // never quite fits everything on the shelving it has.
  for (let i = 0; i < 3; i++) {
    const d = drum(['#1f4f8f', '#8a1f1f', '#1f4f8f'][i]);
    d.position.set(width / 2 - 0.9 + (i % 2) * 0.62, 0, depth / 2 - 0.65 - Math.floor(i / 2) * 0.62);
    g.add(d);
  }

  const light = new THREE.PointLight(0xfff2d0, 5, 10, 2);
  light.position.set(0, 1.9, 0);
  g.add(light);

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.4),
    new THREE.MeshStandardMaterial({
      map: signText('STORAGE', { color: '#ffffff', bg: '#12324f', w: 1024 }),
      roughness: 0.7
    })
  );
  sign.position.set(0, 2.05, -depth / 2 + 0.42);
  g.add(sign);

  // Resolve every can marker's world position, group by colour, and build
  // one InstancedMesh per colour — replacing the markers entirely.
  g.updateMatrixWorld(true);
  const byColor = new Map();
  const wp = new THREE.Vector3();
  for (const { marker, color } of canMarkers) {
    marker.getWorldPosition(wp);
    g.worldToLocal(wp);
    if (!byColor.has(color)) byColor.set(color, []);
    byColor.get(color).push(wp.clone());
    marker.parent?.remove(marker);
  }
  const m4 = new THREE.Matrix4();
  for (const [color, positions] of byColor) {
    const mesh = new THREE.InstancedMesh(_canGeo, canMat(color), positions.length);
    mesh.castShadow = true;
    positions.forEach((p, i) => {
      m4.makeTranslation(p.x, p.y, p.z);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    g.add(mesh);
  }

  return g;
}

/**
 * Route marker — a painted cane/drum marker. These line every path at every
 * Antarctic station, because in a whiteout they are the only way to find your
 * way back, and people have died getting this wrong.
 */
export function routeMarker(h = 1.3, capColor = 0xd83a2a) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.042, h, 7),
    new THREE.MeshStandardMaterial({ color: 0xeef2f5, roughness: 0.85 })
  );
  post.position.y = h / 2;
  post.castShadow = true;
  // Emissive, not just painted — by day this reads as the same coloured cap
  // it always was (emissiveIntensity starts at 0), but a caller that wires
  // it into the day/night `winMat` mechanism (see site.js's update loop)
  // gets a marker that actually lights up at night instead of vanishing
  // into the dark between the pole and the ground, which is what made a
  // whole line of these read as "lights floating, not attached to
  // anything" — in the dark, the cap was the only part still visible.
  const capMat = new THREE.MeshStandardMaterial({
    color: capColor, emissive: capColor, emissiveIntensity: 0, roughness: 0.5
  });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.20, 7), capMat);
  cap.position.y = h - 0.10;
  // A small painted stone at the foot, not a traffic cone.
  const base = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.13, 0),
    new THREE.MeshStandardMaterial({ color: 0xe4eaee, roughness: 0.95, flatShading: true })
  );
  base.position.y = 0.07;
  base.scale.set(1, 0.6, 1);
  g.add(post, cap, base);
  g.userData.capMat = capMat;
  return g;
}

/**
 * Flag on a pole. The cloth is a subdivided plane deformed in the vertex
 * shader by two travelling waves whose amplitude ramps from the hoist, which
 * is a very cheap approximation of real cloth and reads correctly in motion.
 */
export function flag(texture, { poleH = 9, w = 2.4, h = 1.6 } = {}) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, poleH, 8),
    new THREE.MeshStandardMaterial({ color: 0xd9dfe3, roughness: 0.4, metalness: 0.6 })
  );
  pole.position.y = poleH / 2;
  pole.castShadow = true;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), MAT.galv());
  finial.position.y = poleH + 0.05;

  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h, 24, 12),
    new THREE.MeshStandardMaterial({
      map: texture, side: THREE.DoubleSide, roughness: 0.85, metalness: 0.0
    })
  );
  cloth.position.set(w / 2 + 0.06, poleH - h / 2 - 0.25, 0);
  cloth.castShadow = true;

  cloth.material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 };
    cloth.userData.uniforms = sh.uniforms;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;`)
      .replace('#include <begin_vertex>', /* glsl */`
        #include <begin_vertex>
        // uv.x = 0 at the hoist (attached edge), 1 at the fly (free edge).
        float grip = pow(uv.x, 1.35);
        float wave = sin(uv.x * 9.0 - uTime * 5.2) * 0.5
                   + sin(uv.x * 4.0 + uv.y * 3.0 - uTime * 3.1) * 0.5;
        transformed.z += wave * grip * 0.42;
        transformed.y += sin(uv.x * 6.0 - uTime * 4.4) * grip * 0.10;
        // Slight shortening as the cloth ripples, so it does not appear to stretch.
        transformed.x -= grip * 0.06;
      `);
  };

  g.add(pole, finial, cloth);
  g.userData.cloth = cloth;
  return g;
}

/** Snow-tractor / Pisten-Bully style vehicle, blocked out. */
/**
 * Piste-basher-style snow groomer/dozer — the real vehicle this stands in
 * for (a PistenBully or similar tracked groomer is standard kit at every
 * Antarctic station). Previously just five plain boxes; this pass adds the
 * details that actually read as "vehicle" from a few metres away: a raked
 * windshield instead of a flat glass panel, track-roller bumps instead of a
 * featureless rubber slab, a blade braced to the body on real arms instead
 * of floating beside it, plus mirrors, a beacon and an exhaust — the small
 * asymmetric details that make something read as a real machine rather
 * than a rounded placeholder.
 */
export function snowVehicle(color = '#c94a1e') {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ map: paintedMetal(color), roughness: 0.6, metalness: 0.4 });
  const dark = MAT.steelGrey();

  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.3, 2.3), paint);
  body.position.y = 1.4;
  body.castShadow = true;
  g.add(body);

  // Cab: narrower at the top, with a raked (not vertical) windshield —
  // the single biggest reason the old version read as "a box on a box".
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.15, 2.0), paint);
  cab.position.set(0.3, 2.6, 0);
  cab.castShadow = true;
  g.add(cab);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.85), dark);
  roof.position.set(0.3, 3.21, 0);
  g.add(roof);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 1.86), MAT.glass());
  windshield.position.set(1.18, 2.55, 0);
  windshield.rotation.z = -0.32;
  g.add(windshield);
  const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.7, 0.06), MAT.glass());
  for (const sz of [-1.0, 1.0]) {
    const sg = sideGlass.clone();
    sg.position.set(0.35, 2.6, sz);
    g.add(sg);
  }

  // Mirrors — a small, cheap asymmetric detail.
  for (const sz of [-1.05, 1.05]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 6), dark);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(1.1, 2.75, sz);
    g.add(arm);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.22), dark);
    mirror.position.set(1.1, 2.75, sz * 1.12);
    g.add(mirror);
  }

  // Beacon light — every piece of Antarctic field kit that moves carries
  // one, for exactly the whiteout-visibility reason the blizzard system
  // models elsewhere in this game.
  const beaconBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 8), dark);
  beaconBase.position.set(0.3, 3.31, 0);
  g.add(beaconBase);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xff9933, emissive: 0xff6a00, emissiveIntensity: 1.6 })
  );
  beacon.position.set(0.3, 3.42, 0);
  g.add(beacon);

  // Exhaust stack behind the cab.
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 8), dark);
  exhaust.position.set(-1.0, 2.35, 0.8);
  g.add(exhaust);

  // Headlights on the nose.
  for (const sz of [-0.75, 0.75]) {
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.08, 10),
      new THREE.MeshStandardMaterial({ color: 0xfff6df, emissive: 0xffe9a8, emissiveIntensity: 0.8 })
    );
    lamp.rotation.z = Math.PI / 2;
    lamp.position.set(2.22, 1.55, sz);
    g.add(lamp);
  }

  // Tracks, with roller bumps along their length instead of a featureless
  // slab — the detail that reads as "tracked vehicle" versus "a plinth".
  for (const z of [-1.25, 1.25]) {
    const tr = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.9, 0.7), MAT.rubber());
    tr.position.set(0, 0.62, z);
    tr.castShadow = tr.receiveShadow = true;
    g.add(tr);
    for (let i = 0; i < 7; i++) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.68, 12), dark);
      roller.rotation.x = Math.PI / 2;
      roller.position.set(-2.05 + i * 0.75, 0.4, z);
      roller.castShadow = true;
      g.add(roller);
    }
  }

  // Dozer blade, braced to the body on angled arms instead of floating
  // beside it unattached.
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.15, 3.4), MAT.galv());
  blade.position.set(2.6, 0.85, 0);
  blade.castShadow = true;
  g.add(blade);
  const bladeRib = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 3.35), dark);
  bladeRib.position.set(2.55, 1.25, 0);
  g.add(bladeRib);
  for (const sz of [-0.9, 0.9]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.7, 8), dark);
    arm.position.set(1.75, 0.85, sz);
    arm.rotation.z = Math.PI / 2;
    arm.castShadow = true;
    g.add(arm);
  }

  return g;
}


/**
 * Tracked hydraulic excavator, cold-weather prepared.
 *
 * Reference machine: **Cat 330 GC**, the excavator Terra Cat Christchurch
 * cold-weather prepared for Antarctica New Zealand — full synthetic low
 * viscosity oils, a doubled cold-weather battery set and diesel block heaters,
 * rated to work at -40 C. A 30-tonne class machine. See docs/REFERENCES.md §5.
 *
 * Proportions are held to the real thing rather than eyeballed, because that
 * is what separates a machine from a toy: track frame 4.2 m long on a 2.6 m
 * gauge, house 2.9 m across, boom 6.2 m, stick 3.2 m, cab offset to the LEFT
 * of the house with the engine bay to its right, counterweight overhanging the
 * tail. The undercarriage is the part people read scale from — a real track is
 * a belt wrapped round a drive sprocket, an idler and a run of bottom rollers,
 * with carrier rollers on the top run, and getting that silhouette right
 * matters far more than polygon count.
 *
 * Local origin sits on the ground between the tracks. +x is forward (the
 * boom end); the house yaw is applied separately so the machine can be parked
 * slewed, the way one always is.
 *
 * @param {string} [color] paint colour — Cat yellow by default
 * @param {object} [opts]
 * @param {number} [opts.slew]  house rotation relative to the tracks
 * @param {number} [opts.boom]  boom lift angle (radians above horizontal)
 * @param {number} [opts.stick] stick fold angle
 */
export function trackedExcavator(color = '#e3a712', opts = {}) {
  const { slew = 0.55, boom = 0.42, stick = -1.15 } = opts;
  const g = new THREE.Group();

  const paint = new THREE.MeshStandardMaterial({ map: paintedMetal(color), roughness: 0.62, metalness: 0.38 });
  const dark = MAT.steelGrey();
  const rubber = MAT.rubber();
  const glass = MAT.glass();

  /* ---------------------------------------------------- undercarriage */
  const TRACK_L = 4.2, GAUGE = 2.6, SHOE_W = 0.62;
  const trackY = 0.44;
  for (const z of [-GAUGE / 2, GAUGE / 2]) {
    // The belt: bottom run, top run, and a round wrap at each end. Four pieces
    // read as a wrapped track; one box reads as a plinth.
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(TRACK_L, 0.16, SHOE_W), rubber);
    bottom.position.set(0, 0.09, z);
    bottom.receiveShadow = true;
    g.add(bottom);
    const top = new THREE.Mesh(new THREE.BoxGeometry(TRACK_L * 0.86, 0.14, SHOE_W), rubber);
    top.position.set(0, trackY + 0.42, z);
    top.castShadow = true;
    g.add(top);
    for (const s of [-1, 1]) {
      // Drive sprocket aft, idler forward — different sizes, as on the real
      // machine, which is the cue for which way a tracked vehicle faces.
      const r = s > 0 ? 0.44 : 0.5;
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(r, r, SHOE_W, 12), rubber);
      wrap.rotation.x = Math.PI / 2;
      wrap.position.set(s * TRACK_L / 2, trackY - 0.02, z);
      wrap.castShadow = true;
      g.add(wrap);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, SHOE_W + 0.06, 10), dark);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(s * TRACK_L / 2, trackY - 0.02, z);
      g.add(hub);
    }
    // Bottom rollers.
    for (let i = 0; i < 5; i++) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, SHOE_W - 0.06, 10), dark);
      roller.rotation.x = Math.PI / 2;
      roller.position.set(-1.55 + i * 0.78, 0.26, z);
      roller.castShadow = true;
      g.add(roller);
    }
    // Track frame (the box girder the rollers hang off).
    const frame = new THREE.Mesh(new THREE.BoxGeometry(TRACK_L * 0.82, 0.44, SHOE_W * 0.7), dark);
    frame.position.set(0, trackY + 0.06, z);
    frame.castShadow = true;
    g.add(frame);
  }
  // Car body tying the two track frames together.
  const carBody = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, GAUGE - 0.3), dark);
  carBody.position.set(0, trackY + 0.2, 0);
  carBody.castShadow = true;
  g.add(carBody);

  /* ------------------------------------------------------------- house */
  // Everything above the slew ring turns together.
  const house = new THREE.Group();
  house.position.y = trackY + 0.5;
  house.rotation.y = slew;
  g.add(house);

  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.22, 16), dark);
  ring.position.y = 0.05;
  house.add(ring);

  const HOUSE_W = 2.9;
  // Deck plate the whole superstructure sits on.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.18, HOUSE_W), dark);
  deck.position.set(-0.35, 0.22, 0);
  deck.castShadow = deck.receiveShadow = true;
  house.add(deck);

  // Counterweight: the heavy slab that overhangs the tail. On a real machine
  // it is the single most distinctive shape from behind.
  const cw = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.15, HOUSE_W * 0.95), paint);
  cw.position.set(-2.05, 0.85, 0);
  cw.castShadow = true;
  house.add(cw);
  const cwLip = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.16, HOUSE_W * 0.98), dark);
  cwLip.position.set(-2.05, 1.46, 0);
  house.add(cwLip);

  // Engine bay to the right of the cab, with a hinged hood and a grille.
  const bay = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.95, HOUSE_W * 0.52), paint);
  bay.position.set(-0.85, 0.78, HOUSE_W * 0.23);
  bay.castShadow = true;
  house.add(bay);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, HOUSE_W * 0.4), dark);
  grille.position.set(0.32, 0.78, HOUSE_W * 0.23);
  house.add(grille);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.1, HOUSE_W * 0.54), dark);
  hood.position.set(-0.85, 1.28, HOUSE_W * 0.23);
  house.add(hood);
  // Exhaust stack and the cold-weather pre-cleaner beside it.
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.75, 8), dark);
  stack.position.set(-0.2, 1.65, HOUSE_W * 0.3);
  stack.castShadow = true;
  house.add(stack);
  const cleaner = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 10), dark);
  cleaner.position.set(-0.62, 1.5, HOUSE_W * 0.34);
  house.add(cleaner);

  // Cab, offset LEFT — the defining asymmetry of an excavator.
  const cabZ = -HOUSE_W * 0.26;
  const cabShell = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.72, 1.12), paint);
  cabShell.position.set(0.05, 1.17, cabZ);
  cabShell.castShadow = true;
  house.add(cabShell);
  // Raked front screen — an excavator operator looks UP the boom, so the
  // screen leans back and the roof glazing continues over the head.
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.35, 1.0), glass);
  screen.position.set(0.73, 1.28, cabZ);
  screen.rotation.z = 0.12;
  house.add(screen);
  const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.0, 0.06), glass);
  sideGlass.position.set(0.02, 1.36, cabZ - 0.57);
  house.add(sideGlass);
  const roofGlass = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.95), glass);
  roofGlass.position.set(0.42, 2.02, cabZ);
  house.add(roofGlass);
  const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.1, 1.2), dark);
  cabRoof.position.set(0.05, 2.05, cabZ);
  house.add(cabRoof);
  // Working lights on the cab roof and a rotating beacon — both mandatory in
  // a place where it is dark for months and white the rest of the time.
  for (const dz of [-0.4, 0.4]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xfff6df, emissive: 0xffe9a8, emissiveIntensity: 0.9 }));
    lamp.position.set(0.6, 2.14, cabZ + dz);
    house.add(lamp);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xff9933, emissive: 0xff6a00, emissiveIntensity: 1.6 }));
  beacon.position.set(-0.3, 2.18, cabZ);
  house.add(beacon);
  // Grab rail up the cab side and a step — the scale cues that make it read
  // as something a person climbs into.
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), dark);
  rail.position.set(0.78, 1.3, cabZ - 0.62);
  house.add(rail);
  const step = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.3), dark);
  step.position.set(0.5, 0.42, cabZ - 0.66);
  house.add(step);

  /* -------------------------------------------------------- front end */
  // Boom pivots off the house nose; stick pivots off the boom tip; bucket off
  // the stick. Built as nested groups so the whole arm folds as one linkage
  // and every pin actually lines up.
  const boomPivot = new THREE.Group();
  boomPivot.position.set(0.85, 0.75, 0);
  boomPivot.rotation.z = boom;
  house.add(boomPivot);

  const BOOM_L = 6.2;
  // Two segments with a knuckle: an excavator boom is bent, not straight.
  const boomA = new THREE.Mesh(new THREE.BoxGeometry(BOOM_L * 0.55, 0.6, 0.52), paint);
  boomA.position.set(BOOM_L * 0.275, 0.05, 0);
  boomA.castShadow = true;
  boomPivot.add(boomA);
  const knuckle = new THREE.Group();
  knuckle.position.set(BOOM_L * 0.55, 0.05, 0);
  knuckle.rotation.z = -0.5;
  boomPivot.add(knuckle);
  const boomB = new THREE.Mesh(new THREE.BoxGeometry(BOOM_L * 0.47, 0.52, 0.48), paint);
  boomB.position.set(BOOM_L * 0.235, 0, 0);
  boomB.castShadow = true;
  knuckle.add(boomB);
  // Boom lift cylinders, one each side, anchored to the house deck.
  for (const dz of [-0.42, 0.42]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.9, 10), dark);
    barrel.rotation.z = Math.PI / 2 - 0.55;
    barrel.position.set(1.35, 0.42, dz);
    house.add(barrel);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 8), MAT.galv());
    rod.rotation.z = Math.PI / 2 - 0.55;
    rod.position.set(2.35, 1.05, dz);
    house.add(rod);
  }

  const stickPivot = new THREE.Group();
  stickPivot.position.set(BOOM_L * 0.47, 0, 0);
  stickPivot.rotation.z = stick;
  knuckle.add(stickPivot);
  const STICK_L = 3.2;
  const stickArm = new THREE.Mesh(new THREE.BoxGeometry(STICK_L, 0.44, 0.4), paint);
  stickArm.position.set(STICK_L / 2, 0, 0);
  stickArm.castShadow = true;
  stickPivot.add(stickArm);
  // Stick cylinder along the top of the boom.
  const stickBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.7, 10), dark);
  stickBarrel.rotation.z = Math.PI / 2 + 0.28;
  stickBarrel.position.set(BOOM_L * 0.2, 0.46, 0);
  knuckle.add(stickBarrel);

  // Bucket, curled under, with teeth.
  const bucketPivot = new THREE.Group();
  bucketPivot.position.set(STICK_L, 0, 0);
  bucketPivot.rotation.z = 1.15;
  stickPivot.add(bucketPivot);
  const bucket = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.78, 1.15), dark);
  bucket.position.set(0.35, -0.2, 0);
  bucket.castShadow = true;
  bucketPivot.add(bucket);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 1.15), dark);
  back.position.set(-0.02, 0.1, 0);
  bucketPivot.add(back);
  for (let i = 0; i < 5; i++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 4), MAT.galv());
    tooth.rotation.z = -Math.PI / 2;
    tooth.position.set(0.86, -0.42, -0.44 + i * 0.22);
    bucketPivot.add(tooth);
  }
  // Bucket linkage.
  const link = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), dark);
  link.rotation.z = Math.PI / 2 - 0.8;
  link.position.set(STICK_L - 0.5, 0.4, 0);
  stickPivot.add(link);

  g.userData.collider = { w: 5.4, h: 3.4, d: 3.4 };
  g.userData.beacon = beacon;
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Merge-friendly window unit: recessed frame + dark glass. */
export function windowUnit(w = 0.9, h = 1.1, frameMat, glassMat) {
  const g = new THREE.Group();
  const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), frameMat);
  const gl = new THREE.Mesh(new THREE.BoxGeometry(w - 0.16, h - 0.16, 0.06), glassMat);
  gl.position.z = 0.05;
  g.add(f, gl);
  g.userData.glass = gl;
  return g;
}

/* ===================================================================
 * Stairs and interiors.
 *
 * The original stair meshes were pure decoration — nothing in the collider
 * list matched them, so the player's feet stayed glued to the flat graded
 * terrain while the stair geometry rose past them. Climbing failed outright.
 * And neither station had a single square metre of walkable interior: the
 * "inside" of each building was either one giant blocking Box3 (Maitri) or a
 * Box3 sealing the doorway shut (Bharati) — so even reaching the door bought
 * you nothing.
 *
 * Fix, in two parts:
 *   1. buildAccessStair() returns BOTH the visual mesh and a matching set of
 *      shallow, stepped Box3 colliders. Each step is well under the player's
 *      stepHeight (0.62 m), so the existing "step onto a box top if it's
 *      close enough" logic in Player._integrate carries you up automatically
 *      — the same mechanic that already lets you walk up a kerb.
 *   2. buildInterior() carves an actual furnished room: floor, perimeter
 *      walls with a doorway gap, ceiling, strip lighting and furniture,
 *      returned as visual meshes plus their own Box3 colliders. Station code
 *      then replaces its old monolithic "solid block" collider with (a) this
 *      interior's colliders and (b) a collider that only covers the parts of
 *      the building that are NOT modelled inside (the long unmodelled wings),
 *      so the modelled room is the one place you can actually walk in.
 * =================================================================== */

/**
 * A straight external stair with real collision.
 *
 * @param {number} width   tread width
 * @param {number} top     total rise (should match the floor height above ground)
 * @param {number} run     total horizontal run
 * @param {number} z0      z of the BOTTOM of the stair (top landing sits at z0 - run)
 * @param {number} baseY   ground-level Y this stair starts from (default 0)
 * @param {number} [stepRise] rise per step — defaults to a realistic 0.18 m.
 *   Raising it (up to just under the player's stepHeight, 0.62 m) trades
 *   away some realism for a shorter run: fewer, taller steps means fewer
 *   MIN_TREAD-widths of horizontal space needed, which matters when a stair
 *   has to fit inside a room rather than run across open ground.
 * @returns {{ mesh: THREE.Group, colliders: THREE.Box3[], landingZ: number, topY: number }}
 */
export function buildAccessStair({ width = 4.2, top, run, z0, baseY = 0, frameMat, steelMat, stepRise = 0.18, dir = -1 }) {
  const g = new THREE.Group();
  // Which way the flight climbs along Z. -1 (the original, and still the
  // default) climbs toward -z; +1 climbs toward +z. A multi-storey stairwell
  // needs both: two flights that climb the same way either stack on top of
  // each other in Z (so the slab has to be landing and hole at once) or sit
  // side by side in X and eat the whole shaft width, leaving no aisle to
  // walk between them — which is exactly how Bharati's stairs ended up
  // walled in by their own guard rails with no way to reach a tread. A
  // switchback — up one side, turn, back up the other — is what a real
  // station stairwell does, and it needs a flight that climbs +z.
  const D = dir < 0 ? -1 : 1;
  const steps = Math.max(6, Math.round(top / stepRise));

  // Each step is its own collider, and the player's ground-snap test checks
  // proximity within `radius` (0.42 m) of a collider's edge, not just
  // "standing inside it" — that's what lets you catch the top of a step
  // fractionally before your feet are geometrically over it, which is what
  // makes climbing feel smooth rather than snagging on every riser. But if
  // a tread is NARROWER than that radius, the expanded zones of 3+
  // consecutive steps overlap at once, and the ground-snap loop (which just
  // takes the highest step within stepHeight of the CURRENT position) locks
  // onto a step further up the run than the player has physically reached.
  // Height then runs ahead of position, step after step, until the gap
  // exceeds stepHeight and the player falls through mid-climb — which reads
  // exactly like "the stairs are broken" and is a genuinely easy trap to
  // fall into when sizing a stair to fit a tight space (a compact interior
  // stair is far more likely to hit this than a long exterior one). Rather
  // than requiring every caller to remember a minimum tread depth, enforce
  // one here: if the requested run would produce treads narrower than a
  // safe margin, widen the run instead of silently building a stair that
  // looks right and doesn't work.
  const MIN_TREAD = 0.5;   // comfortably above the player's 0.42 m radius
  const minRun = steps * MIN_TREAD;
  if (run < minRun) {
    console.warn(`[buildAccessStair] run ${run.toFixed(2)} gives ${(run / steps).toFixed(2)}m treads — ` +
      `too narrow for the player radius and would drop the player mid-climb. Widened to ${minRun.toFixed(2)}.`);
    run = minRun;
  }

  const rise = top / steps;
  const tread = run / steps;
  const colliders = [];

  const treadGeo = new THREE.BoxGeometry(width, 0.08, tread * 0.92);

  for (let i = 0; i < steps; i++) {
    const stepTop = baseY + rise * (i + 1);
    const z = z0 + D * tread * (i + 0.5);
    const t = new THREE.Mesh(treadGeo, frameMat);
    t.position.set(0, stepTop, z);
    t.castShadow = t.receiveShadow = true;
    g.add(t);

    const r = new THREE.Mesh(new THREE.BoxGeometry(width, rise, 0.05), frameMat);
    r.position.set(0, baseY + rise * (i + 0.5), z0 + D * (tread * i + tread * 0.96));
    g.add(r);

    // A solid slab from the ground up to each tread's top, one per step, so
    // the player always has a ledge within stepHeight of their current feet
    // regardless of which direction they approach from.
    colliders.push(new THREE.Box3(
      new THREE.Vector3(-width / 2, baseY, z - tread / 2),
      new THREE.Vector3(width / 2, stepTop, z + tread / 2)
    ));

    // Side guards, one per step, matching the visual handrail on both
    // edges. The handrail mesh itself was always purely decorative — no
    // player-facing consequence to a player standing where it visually is —
    // which meant NOTHING stopped horizontal drift off the side of the
    // stair while climbing on any diagonal (mouse-look + WASD is diagonal
    // almost by default). Once a foot crossed the tread's outer edge there
    // was no collider left to catch it, and the player fell through open
    // air off the side of their own staircase.
    //
    // guardTop is NOT "this step's height plus a rail" — that was the first
    // version, and it was wrong: Player._integrate's step-up check (the
    // same one that makes a tread climbable at all) only cares whether a
    // collider's own top is within stepHeight of the player's CURRENT feet
    // height, regardless of which step the collider visually belongs to. A
    // guard a few steps back, whose own "tread height + rail" happened to
    // land within stepHeight of where the player has since climbed to, got
    // read as a climbable step onto a ledge 12 cm wide — the player would
    // snap up onto it, immediately have nowhere stable to stand, and fall.
    // Making every guard reach a fixed height well above the stair's own
    // total rise means `guard.max.y - p.y` can never be small enough to
    // trigger that branch anywhere on the climb, so a guard can only ever
    // resolve as what it is: a wall.
    // ...but "well above" was +5.0 m, and that was its own bug. The guard is
    // built per step and spans the flight's WHOLE footprint in Z, so a
    // 5 m-tall collider does not stop at the top of the stair -- it carries on
    // straight up THROUGH THE FLOOR ABOVE and stands 5 m into the room up
    // there as a pair of invisible 12 cm posts with no rail drawn anywhere
    // near them. On Bharati that put two of them across the floor-3 landing
    // exit, narrowing the only way off the stairs to a 0.45 m slot -- less
    // than the player's own 0.84 m width -- which is the "no clearance
    // stepping down from the third floor, player gets stuck" report, and a
    // prime suspect for "I keep hitting invisible things".
    //
    // +1.15 m is all the height the anti-step-up trick actually needs: the
    // highest a player's feet can ever be on this flight is baseY + top (the
    // landing, or the floor it meets), so the smallest `guard.max.y - p.y`
    // can be is 1.15 -- comfortably outside the 0.62 m stepHeight window that
    // caused the snap-and-fall. And 1.15 m above the upper floor level is
    // exactly where a real guard rail round a stairwell opening sits, so what
    // does poke through the slab now reads as the handrail it should be
    // instead of an invisible wall.
    const guardTop = baseY + top + 1.15;
    for (const sx of [-1, 1]) {
      const inner = sx * (width / 2);
      const outer = sx * (width / 2 + 0.12);
      colliders.push(new THREE.Box3(
        new THREE.Vector3(Math.min(inner, outer), baseY, z - tread / 2),
        new THREE.Vector3(Math.max(inner, outer), guardTop, z + tread / 2)
      ));
    }
  }

  const len = Math.hypot(run, top);
  const ang = Math.atan2(top, run);
  // 0.34 m tall read fine as a stringer on a normal ~30° stair, but a
  // steeper flight (a compact interior stair built via a larger stepRise
  // can run closer to 45°) presents far more of that height edge-on to the
  // camera, and it stops reading as a structural rail and starts reading
  // as a solid diagonal panel sliced through the stairwell. Thinner at
  // every angle, and still a real stringer at a normal stair's angle.
  for (const sx of [-1, 1]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, len), steelMat);
    st.position.set(sx * (width / 2 + 0.07), baseY + top / 2 - 0.1, z0 + D * run / 2);
    st.rotation.x = D * ang;
    st.castShadow = true;
    g.add(st);

    for (const hy of [0.98, 0.55]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 8), steelMat);
      rail.position.set(sx * (width / 2 + 0.07), baseY + top / 2 + hy, z0 + D * run / 2);
      rail.rotation.x = Math.PI / 2 - D * ang;
      rail.castShadow = true;
      g.add(rail);
    }
    for (let i = 0; i <= 5; i++) {
      const f = i / 5;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 6), steelMat);
      post.position.set(sx * (width / 2 + 0.07), baseY + top * f + 0.5, z0 + D * run * f);
      g.add(post);
    }
  }

  // Landing at the top — its own collider too, flush with the last tread so
  // there is no seam between "last step" and "floor".
  const landingZ = z0 + D * run;
  const landing = new THREE.Mesh(new THREE.BoxGeometry(width + 1.4, 0.14, 1.6), frameMat);
  landing.position.set(0, baseY + top, landingZ + D * 0.4);
  landing.castShadow = landing.receiveShadow = true;
  g.add(landing);
  const lz0 = landingZ + D * 1.2, lz1 = landingZ - D * 0.2;
  colliders.push(new THREE.Box3(
    new THREE.Vector3(-(width + 1.4) / 2, baseY + top - 0.3, Math.min(lz0, lz1)),
    new THREE.Vector3((width + 1.4) / 2, baseY + top, Math.max(lz0, lz1))
  ));

  // The far end of the landing collider, which is where a caller has to stop
  // any floor slab so the two meet without overlapping (an overlap here is
  // what used to teleport the player at the top of a flight).
  const landingFarZ = landingZ + D * 1.2;
  return { mesh: g, colliders, landingZ, landingFarZ, dir: D, topY: baseY + top };
}

export const INTERIOR_FLOOR = () => new THREE.MeshStandardMaterial({ color: 0x3c4750, roughness: 0.65, metalness: 0.05 });
export const INTERIOR_WALL = () => new THREE.MeshStandardMaterial({ color: 0xd7dde1, roughness: 0.88 });
export const INTERIOR_CEIL = () => new THREE.MeshStandardMaterial({ color: 0xe9edf0, roughness: 0.9 });
export const INTERIOR_TRIM = () => new THREE.MeshStandardMaterial({ color: 0x8c3b28, roughness: 0.6, metalness: 0.3 });

/**
 * A furnished, walkable interior room: floor, four walls (one with a doorway
 * gap so the player can pass through), a ceiling with strip lighting, and a
 * scatter of furniture. Everything returned lines up 1:1 with its own
 * collider — the visible wall IS the collider, so there is nothing here that
 * can look walkable and not be, or vice versa.
 *
 * Coordinates are local to whatever group this gets added to.
 *
 * @param {object} opts
 * @param {number} opts.x0,x1  interior floor extent along X
 * @param {number} opts.z0,z1  interior floor extent along Z (z1 is the wall
 *                             with the doorway — the side nearer the entrance)
 * @param {number} opts.floorY world-relative Y of the floor surface
 * @param {number} opts.ceilH  clear height from floor to ceiling
 * @param {number} opts.doorW  width of the gap left in the z1 wall
 * @param {'mess'|'lab'} [opts.theme] which furniture set to scatter
 */
export function buildInterior({ x0, x1, z0, z1, floorY, ceilH = 2.85, doorW = 3.2, theme = 'mess', ceilHole = null }) {
  const g = new THREE.Group();
  const colliders = [];
  const wt = 0.3;   // wall thickness
  const w = x1 - x0, d = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

  const floorMat = INTERIOR_FLOOR(), wallMat = INTERIOR_WALL(), ceilMat = INTERIOR_CEIL();

  // --- floor -------------------------------------------------------------
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), floorMat);
  floor.position.set(cx, floorY - 0.1, cz);
  floor.receiveShadow = true;
  g.add(floor);
  colliders.push(new THREE.Box3(
    new THREE.Vector3(x0, floorY - 0.2, z0), new THREE.Vector3(x1, floorY, z1)
  ));

  // --- ceiling + strip lights ---------------------------------------------
  // A stairwell climbing from this floor to the next needs an actual gap in
  // the ceiling above it — a solid slab there (which is all this ever built,
  // unconditionally) means the stairs visually run straight into a solid
  // surface with no opening, even though the collider list elsewhere lets a
  // player keep climbing "through" it. ceilHole cuts a rectangular hole by
  // building the ceiling as four slabs framing it instead of one solid box,
  // the same decomposition the wall/doorway gap below already uses.
  if (ceilHole) {
    const { x0: hx0, x1: hx1, z0: hz0, z1: hz1 } = ceilHole;
    const cy = floorY + ceilH + 0.1;
    const addCeil = (ax0, ax1, az0, az1) => {
      if (ax1 - ax0 <= 0.01 || az1 - az0 <= 0.01) return;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(ax1 - ax0, 0.2, az1 - az0), ceilMat);
      seg.position.set((ax0 + ax1) / 2, cy, (az0 + az1) / 2);
      seg.receiveShadow = true;
      g.add(seg);
    };
    addCeil(x0, x1, z0, hz0);       // north of the hole (full width)
    addCeil(x0, x1, hz1, z1);       // south of the hole (full width)
    addCeil(x0, hx0, hz0, hz1);     // west, between the north/south slabs
    addCeil(hx1, x1, hz0, hz1);     // east, between the north/south slabs
  } else {
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), ceilMat);
    ceil.position.set(cx, floorY + ceilH + 0.1, cz);
    g.add(ceil);
  }

  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xfff6e0, emissive: 0xfff2c8, emissiveIntensity: 0.9, roughness: 0.4
  });
  const stripLen = Math.min(w, d) * 0.4;
  for (let i = 0; i < 3; i++) {
    const t = (i + 0.5) / 3;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(stripLen, 0.05, 0.16), lightMat);
    strip.rotation.y = w > d ? Math.PI / 2 : 0;
    strip.position.set(
      w > d ? cx : x0 + w * t,
      floorY + ceilH - 0.02,
      w > d ? z0 + d * t : cz
    );
    g.add(strip);
    const pl = new THREE.PointLight(0xfff1cf, 1.8, Math.max(w, d) * 0.75, 2);
    pl.position.copy(strip.position).setY(floorY + ceilH - 0.3);
    g.add(pl);
  }

  // --- walls, with a doorway gap centred on x in the z1 wall --------------
  const wallH = ceilH + 0.3;
  const wallY = floorY + wallH / 2;
  const addWall = (wx0, wx1, wz0, wz1) => {
    const ww = wx1 - wx0, wd = wz1 - wz0;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, wallH, wd), wallMat);
    wall.position.set((wx0 + wx1) / 2, wallY, (wz0 + wz1) / 2);
    wall.castShadow = wall.receiveShadow = true;
    g.add(wall);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(wx0, floorY, wz0), new THREE.Vector3(wx1, floorY + wallH, wz1)
    ));
  };

  addWall(x0 - wt, x0, z0, z1);                       // west
  addWall(x1, x1 + wt, z0, z1);                       // east
  addWall(x0 - wt, x1 + wt, z0 - wt, z0);              // north (far wall, solid)
  const doorHalf = doorW / 2;
  addWall(x0 - wt, cx - doorHalf, z1, z1 + wt);        // south-west of the door
  addWall(cx + doorHalf, x1 + wt, z1, z1 + wt);        // south-east of the door

  // --- furniture ------------------------------------------------------------
  const trim = INTERIOR_TRIM();
  const tableMat = new THREE.MeshStandardMaterial({ color: 0xb08a5c, roughness: 0.6 });
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x5a4a38, roughness: 0.75 });
  const metalMat = MAT.steelGrey();
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x0d1a24, emissive: 0x2a6a8a, emissiveIntensity: 0.9, roughness: 0.3
  });

  const addBox = (mesh, x, y, z, ry = 0, collide = true, cw, cd) => {
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (collide) {
      const halfW = (cw ?? mesh.geometry.parameters.width) / 2;
      const halfD = (cd ?? mesh.geometry.parameters.depth) / 2;
      colliders.push(new THREE.Box3(
        new THREE.Vector3(x - halfW, floorY, z - halfD),
        new THREE.Vector3(x + halfW, floorY + (mesh.geometry.parameters.height ?? 0.8), z + halfD)
      ));
    }
  };

  const table = (w2, d2) => new THREE.Mesh(new THREE.BoxGeometry(w2, 0.74, d2), tableMat);
  const stool = () => new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.46, 0.4), benchMat);
  const shelf = (w2, h2) => new THREE.Mesh(new THREE.BoxGeometry(w2, h2, 0.4), metalMat);

  if (theme === 'mess') {
    // Two long mess tables with stools — the real winter crew eats together,
    // because with thirteen people and one cook there is no other way to run it.
    const tW = Math.min(w, d) * 0.6;
    for (const side of [-1, 1]) {
      addBox(table(tW, 0.9), cx + side * (w * 0.001), floorY + 0.37, cz - d * 0.18 + side * d * 0.001, 0, true, tW, 0.9);
    }
    addBox(table(Math.min(w, d) * 0.5, 0.85), cx, floorY + 0.37, cz + d * 0.24, 0, true);
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      addBox(stool(), cx + i * (tW / 5.2), floorY + 0.23, cz - d * 0.18 - 0.65, 0, false);
      addBox(stool(), cx + i * (tW / 5.2), floorY + 0.23, cz - d * 0.18 + 0.65, 0, false);
    }
    // Noticeboard on the far wall.
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(w * 0.4, 2.4), 1.1),
      new THREE.MeshStandardMaterial({
        map: signText('MESS HALL — WINTER ROSTER', { color: '#dcefff', bg: '#0c1b2b', w: 1024 }),
        roughness: 0.7
      })
    );
    board.position.set(x0 + 0.05, floorY + 1.7, z0 + wt + 0.02);
    board.rotation.y = Math.PI / 2;
    g.add(board);
  } else {
    // Lab / ops bench along one wall, shelving and a terminal.
    //
    // Everything here is anchored to z0 (the far wall) deliberately, never to
    // z1 — z1 is ALWAYS the wall with the doorway gap cut into it (see the
    // addWall() calls above), so furniture placed "near z1" sits in the
    // doorway itself and blocks entry. That exact bug shipped once already:
    // it was invisible on Maitri (which uses the 'mess' theme) and only
    // showed up walking into Bharati's 'lab' room, where the desk sat right
    // across the threshold.
    const benchW = d * 0.55;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.85, benchW), tableMat);
    addBox(bench, x0 + 0.75 / 2 + wt + 0.05, floorY + 0.42, cz, 0, true, 0.75, benchW);

    const sh = shelf(0.4, 1.8);
    addBox(sh, x1 - wt - 0.25, floorY + 0.9, z0 + wt + 0.35, 0, true, 0.4, 0.4);

    // Desk sits against the far wall; the person using it faces the screen
    // with their back to z0, looking toward the door — which is also why the
    // screen is angled to face +z (toward whoever just walked in).
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.74, 0.7), tableMat);
    addBox(desk, cx, floorY + 0.37, z0 + wt + 0.55, 0, true);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.42), screenMat);
    screen.position.set(cx, floorY + 0.95, z0 + wt + 0.21);
    g.add(screen);
    addBox(stool(), cx, floorY + 0.23, z0 + wt + 1.15, 0, false);
  }

  // Skirting trim where wall meets floor, purely cosmetic but sells the join.
  const skirt = (w2, d2, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.1, d2), trim);
    m.position.set(x, floorY + 0.05, z);
    g.add(m);
  };
  skirt(w, 0.05, cx, z0 + 0.02);
  skirt(w, 0.05, cx, z1 - 0.02);
  skirt(0.05, d, x0 + 0.02, cz);
  skirt(0.05, d, x1 - 0.02, cz);

  return { mesh: g, colliders };
}

/**
 * A run of library shelving, one section per archive category, standing
 * flush against a wall. Each "book" is just a coloured box — there is no
 * pretence of real spines — but the SECTION COUNT and LABELS are drawn from
 * the actual archive category list, not invented, so the physical shelf
 * really does correspond to what the codex UI holds. Returns a mesh plus a
 * single collider for the whole run (books themselves are not obstacles;
 * nobody trips over a bookshelf's contents, only its frame).
 *
 * @param {{id:string,label:string}[]} categories
 * @param {number} width  total shelf run width along local X
 * @param {number} depth  shelf depth (how far it projects from the wall)
 */
export function libraryShelf(categories, width = 4.2, depth = 0.32) {
  const g = new THREE.Group();
  const frameMat = cached('mat-libraryFrame', () => new THREE.MeshStandardMaterial({ color: 0x3c2c1e, roughness: 0.75 }));
  const rows = 4;
  const rowH = 0.42;
  const shelfTopY = 0.3 + rowH * rows;
  const secW = width / categories.length;

  // Back panel (unique size, stays its own mesh).
  const back = new THREE.Mesh(new THREE.BoxGeometry(width, shelfTopY + 0.3, 0.04), frameMat);
  back.position.set(0, (shelfTopY + 0.3) / 2, -depth / 2 + 0.02);
  g.add(back);

  // Uprights and shelf boards are each identical geometry repeated many
  // times (one upright per category boundary, one board per row per
  // category) — InstancedMesh turns what used to be dozens of draw calls
  // into two. Books go further: hundreds of individually-materialed spine
  // boxes (previously ~400 separate meshes + ~400 separate materials for a
  // single shelf) collapse into ONE InstancedMesh using a shared unit-cube
  // geometry scaled per-instance and instanceColor for spine-colour
  // variation — same visual randomness, a fraction of a percent of the
  // draw calls.
  const uprightGeo = new THREE.BoxGeometry(0.05, shelfTopY + 0.3, depth);
  const uprightMesh = new THREE.InstancedMesh(uprightGeo, frameMat, categories.length + 1);
  uprightMesh.castShadow = uprightMesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i <= categories.length; i++) {
    const x = -width / 2 + i * secW;
    m.makeTranslation(x, (shelfTopY + 0.3) / 2, 0);
    uprightMesh.setMatrixAt(i, m);
  }
  uprightMesh.instanceMatrix.needsUpdate = true;
  g.add(uprightMesh);

  const shelfGeo = new THREE.BoxGeometry(secW - 0.06, 0.03, depth - 0.02);
  const shelfMesh = new THREE.InstancedMesh(shelfGeo, frameMat, categories.length * rows);
  shelfMesh.castShadow = shelfMesh.receiveShadow = true;

  const spineColors = [0x8a3a2a, 0x2a5f4a, 0x2a4a6f, 0x6f5a2a, 0x5a2a5a, 0x3a3a3a, 0x7a6a4a];
  const rng = (seed => () => (seed = (seed * 9301 + 49297) % 233280) / 233280)(77);
  const bookUnitGeo = new THREE.BoxGeometry(1, 1, 1);
  const bookMat = cached('mat-bookSpine', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
  const bookXforms = []; // { x, y, bw, bh, color }
  const col = new THREE.Color();
  let shelfIdx = 0;

  categories.forEach((cat, ci) => {
    const cx = -width / 2 + secW * (ci + 0.5);

    for (let r = 0; r < rows; r++) {
      const y = 0.3 + r * rowH;
      m.makeTranslation(cx, y, 0);
      shelfMesh.setMatrixAt(shelfIdx++, m);

      // Fill the row with book-spine boxes of varying width/height/colour.
      let x = cx - secW / 2 + 0.08;
      const rowRight = cx + secW / 2 - 0.08;
      while (x < rowRight - 0.03) {
        const bw = 0.025 + rng() * 0.035;
        if (x + bw > rowRight) break;
        const bh = rowH * (0.55 + rng() * 0.35);
        bookXforms.push({
          x: x + bw / 2, y: y + 0.015 + bh / 2, bw, bh,
          color: spineColors[Math.floor(rng() * spineColors.length)]
        });
        x += bw + 0.006;
      }
    }

    // Category label on the top shelf edge.
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(secW - 0.2, 0.14),
      new THREE.MeshStandardMaterial({
        map: signText(cat.label, { color: '#eef2f4', bg: '#1c2733', w: 512 }),
        roughness: 0.7
      })
    );
    plate.position.set(cx, shelfTopY + 0.16, -depth / 2 + 0.06);
    g.add(plate);
  });

  shelfMesh.instanceMatrix.needsUpdate = true;
  g.add(shelfMesh);

  const bookMesh = new THREE.InstancedMesh(bookUnitGeo, bookMat, bookXforms.length);
  bookMesh.castShadow = true;
  bookMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(bookXforms.length * 3), 3);
  bookXforms.forEach((b, i) => {
    m.makeScale(b.bw, b.bh, depth - 0.08);
    m.setPosition(b.x, b.y, 0.02);
    bookMesh.setMatrixAt(i, m);
    col.setHex(b.color);
    bookMesh.setColorAt(i, col);
  });
  bookMesh.instanceMatrix.needsUpdate = true;
  if (bookMesh.instanceColor) bookMesh.instanceColor.needsUpdate = true;
  g.add(bookMesh);

  g.userData.collider = { w: width, h: shelfTopY + 0.3, d: depth };
  return g;
}

/** A small reading desk with a lamp — the interaction point for a library shelf. */
export function readingDesk() {
  const g = new THREE.Group();
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x5a4530, roughness: 0.65 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.65), tableMat);
  top.position.y = 0.74;
  top.castShadow = top.receiveShadow = true;
  g.add(top);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.74, 0.06), tableMat);
    leg.position.set(sx * 0.5, 0.37, sz * 0.28);
    g.add(leg);
  }
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.03, 12), MAT.steelGrey());
  lampBase.position.set(0.35, 0.775, 0.2);
  g.add(lampBase);
  const lampArm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.32, 6), MAT.steelGrey());
  lampArm.position.set(0.35, 0.94, 0.2);
  lampArm.rotation.z = 0.3;
  g.add(lampArm);
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.12, 12, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xfff3d6, emissive: 0xffcf80, emissiveIntensity: 1.1, side: THREE.DoubleSide
    })
  );
  shade.position.set(0.46, 1.08, 0.2);
  shade.rotation.x = Math.PI;
  g.add(shade);
  const bulbLight = new THREE.PointLight(0xffd9a0, 1.6, 4, 2);
  bulbLight.position.copy(shade.position);
  g.add(bulbLight);

  // An open logbook on the desk — decorative, reinforces "records" without
  // needing real page content.
  const book = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.03, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xf2ede0, roughness: 0.9 })
  );
  book.position.set(-0.15, 0.775, 0);
  book.rotation.y = -0.1;
  g.add(book);

  return g;
}

/**
 * A real working galley counter: stainless prep top, an inset gas range
 * (four burners, one lit) with a wall-mounted extraction hood over it, and
 * a sink at one end — everything a winter-over cook actually uses, not just
 * a placeholder box. Built centred on its own local origin, facing local
 * +X (the direction someone standing in front of the counter looks back
 * toward it), footprint `width` (along Z) × `depth` (along X) — the caller
 * positions and rotates the whole group, matching storageBay's convention.
 *
 * Modelled after what every Indian Antarctic station galley actually runs:
 * bottled/piped LPG rather than an open flame from an outdoor tank (nothing
 * survives outdoors at −40°C), stainless surfaces because nothing else
 * wipes clean fast enough for a shared kitchen, and a hood/extraction run
 * because with the building sealed against the cold, cooking exhaust has
 * nowhere else to go.
 */
export function kitchenUnit(width = 3.0, depth = 0.7) {
  const g = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xc7ced2, roughness: 0.35, metalness: 0.85 });
  const steelDark = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.4, metalness: 0.8 });
  const cabMat = new THREE.MeshStandardMaterial({ color: 0x3d4750, roughness: 0.6, metalness: 0.15 });

  // Base cabinet run + stainless worktop.
  const base = new THREE.Mesh(new THREE.BoxGeometry(depth, 0.86, width), cabMat);
  base.position.y = 0.43;
  base.castShadow = base.receiveShadow = true;
  g.add(base);
  // Cabinet door seams — cheap detail, reads as doors instead of one slab.
  const doorCount = Math.max(2, Math.round(width / 0.7));
  for (let i = 0; i < doorCount; i++) {
    const dz = -width / 2 + (i + 0.5) * (width / doorCount);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.6, width / doorCount - 0.04), steelDark);
    seam.position.set(depth / 2 + 0.01, 0.43, dz);
    g.add(seam);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.06, 0.05, width + 0.06), steelMat);
  top.position.y = 0.885;
  top.castShadow = top.receiveShadow = true;
  g.add(top);

  // Backsplash against the wall.
  const backsplash = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, width), steelMat);
  backsplash.position.set(-depth / 2 + 0.02, 0.91 + 0.275, 0);
  g.add(backsplash);

  // --- the range: four burners set into the worktop, roughly a third of
  // the run, with one ring lit — a kitchen that's actually in use.
  const rangeZ = -width / 2 + width * 0.22;
  const burnerMat = new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.6, metalness: 0.7 });
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0x7fd0ff, emissive: 0x4fb0ff, emissiveIntensity: 2.2
  });
  for (let bx = 0; bx < 2; bx++) {
    for (let bz = 0; bz < 2; bz++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 8, 16), burnerMat);
      ring.rotation.x = Math.PI / 2;
      const rx = (bx - 0.5) * 0.24, rz = rangeZ + (bz - 0.5) * 0.24;
      ring.position.set(rx, 0.915, rz);
      g.add(ring);
      if (bx === 1 && bz === 0) {
        const flame = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.045, 0.06, 10), flameMat);
        flame.position.set(rx, 0.93, rz);
        g.add(flame);
        const flameLight = new THREE.PointLight(0x6fc6ff, 0.9, 1.6, 2);
        flameLight.position.set(rx, 0.97, rz);
        g.add(flameLight);
      }
    }
  }
  // A single pot on the lit burner, off the boil.
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 16), steelDark);
  pot.position.set(0.12, 1.0, rangeZ - 0.12);
  pot.castShadow = true;
  g.add(pot);
  const potHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6), steelDark);
  potHandle.rotation.z = Math.PI / 2;
  potHandle.position.set(0.12, 1.02, rangeZ - 0.12 - 0.16);
  g.add(potHandle);

  // Extraction hood, mounted on the wall above the range, with its own
  // downlight — the one part of the galley guaranteed to be lit even when
  // the room lights are dim, since it's the thing the cook actually works under.
  const hood = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.22, 0.32, 4, 1, false, Math.PI / 4),
    steelMat
  );
  hood.rotation.z = Math.PI / 2;
  hood.rotation.y = Math.PI / 4;
  hood.scale.set(1, 1, 0.62);
  hood.position.set(-depth / 2 + 0.3, 1.62, rangeZ);
  hood.castShadow = true;
  g.add(hood);
  const flue = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 0.24), steelDark);
  flue.position.set(-depth / 2 + 0.16, 2.0, rangeZ);
  g.add(flue);
  const hoodLight = new THREE.PointLight(0xfff4de, 3.2, 4.5, 2);
  hoodLight.position.set(0, 1.5, rangeZ);
  g.add(hoodLight);

  // --- the sink, at the far end of the run.
  const sinkZ = width / 2 - width * 0.2;
  const basin = new THREE.Mesh(new THREE.BoxGeometry(depth * 0.55, 0.16, 0.42), steelDark);
  basin.position.set(0.02, 0.83, sinkZ);
  g.add(basin);
  const tap = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.014, 6, 10, Math.PI), steelMat);
  tap.rotation.set(0, 0, Math.PI / 2);
  tap.position.set(-depth / 2 + 0.35, 1.04, sinkZ);
  g.add(tap);

  g.userData.collider = { w: depth, h: 0.92, d: width };
  return g;
}

/**
 * Chest freezer — the single most important appliance in a polar galley:
 * resupply comes once or twice a year, so everything that isn't tinned or
 * dry-stored lives frozen between ships. Lid closed, a dial reading the
 * only thing anyone actually checks on it, and a hazard-yellow stripe —
 * exactly the kind of ex-industrial kit that actually ships south.
 */
export function chestFreezer(width = 1.3, depth = 0.75) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe7ebee, roughness: 0.5, metalness: 0.2 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xffb020, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, 0.85, depth), bodyMat);
  body.position.y = 0.425;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(width - 0.04, 0.08, depth - 0.04), bodyMat);
  lid.position.y = 0.85 + 0.02;
  lid.castShadow = true;
  g.add(lid);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(width + 0.01, 0.05, depth + 0.01), trimMat);
  stripe.position.y = 0.18;
  g.add(stripe);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 12), MAT.steelGrey());
  dial.rotation.x = Math.PI / 2;
  dial.position.set(width / 2 - 0.12, 0.6, depth / 2 + 0.01);
  g.add(dial);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.04), MAT.steelGrey());
  handle.position.set(0, 0.86, depth / 2 - 0.02);
  g.add(handle);

  g.userData.collider = { w: width, h: 0.9, d: depth };
  return g;
}

/**
 * A short wall-mounted rail with a few pots and a ladle hanging off it —
 * the small cheap detail that keeps a galley from reading as "a counter
 * with a stove" and starts reading as a kitchen someone actually uses.
 * Purely decorative (mounted above head height), no collider.
 */
export function potRack(length = 1.4) {
  const g = new THREE.Group();
  // Cylinder's default axis is Y; rotating about X swings it to lie along
  // Z — the rail needs to run parallel to whatever wall it's mounted on,
  // and every hung pot below is offset along local Z to match.
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, length, 8), MAT.steelGrey());
  rail.rotation.x = Math.PI / 2;
  g.add(rail);
  const potColors = [0x8a9096, 0xc7ced2, 0x6a7076];
  const n = 4;
  for (let i = 0; i < n; i++) {
    const z = -length / 2 + (i + 0.5) * (length / n);
    const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 6), MAT.steelGrey());
    hook.position.set(0, -0.05, z);
    g.add(hook);
    const isLadle = i === n - 1;
    if (isLadle) {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 6), MAT.steelGrey());
      handle.position.set(0, -0.24, z);
      g.add(handle);
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), MAT.steelGrey());
      bowl.position.set(0, -0.4, z);
      g.add(bowl);
    } else {
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.08, 0.09, 12),
        new THREE.MeshStandardMaterial({ color: potColors[i % potColors.length], roughness: 0.4, metalness: 0.7 })
      );
      pot.position.set(0, -0.16, z);
      g.add(pot);
    }
  }
  return g;
}

/**
 * Bharati's own archive feature — deliberately NOT the warm wooden
 * library/reading-desk pair Maitri uses (libraryShelf + readingDesk above).
 * Bharati is the newer, container-built, satellite-ground-station of the
 * two — its own National Polar Data Archive room reads as a bank of steel
 * server/records cabinets with glowing category labels and status LEDs,
 * not a shelf of paper spines. Same information architecture (one section
 * per archive category), completely different physical object.
 */
export function archiveServerRack(categories, width = 7.5, depth = 0.6) {
  const g = new THREE.Group();
  const cabMat = cached('mat-cabBody', () => new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.5, metalness: 0.55 }));
  const cabDarkMat = cached('mat-cabDrawer', () => new THREE.MeshStandardMaterial({ color: 0x181c20, roughness: 0.6, metalness: 0.5 }));
  const handleMat = MAT.steelGrey();
  const secW = width / categories.length;
  const h = 2.2;
  const rows = 6;
  const rowH = (h - 0.5) / rows;
  const ledColors = [0x2eff6a, 0x5fd9ff, 0xffcf5c];

  // Cabinet bodies, drawers and handles are identical geometry repeated
  // once per category/row — three InstancedMesh calls replace what used to
  // be 1 + 18*categories.length individual meshes (~100 for a 5-category
  // rack). LEDs cycle through only 3 colours, so one small InstancedMesh
  // per colour (with its own emissive material, since instanceColor doesn't
  // drive emissive) still collapses ~30 separate LED meshes+materials to 3.
  const bodyMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(secW - 0.08, h, depth), cabMat, categories.length);
  bodyMesh.castShadow = bodyMesh.receiveShadow = true;
  const drawerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(secW - 0.2, rowH - 0.04, 0.03), cabDarkMat, categories.length * rows);
  const handleMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(secW * 0.42, 0.018, 0.02), handleMat, categories.length * rows);
  const ledGeo = new THREE.SphereGeometry(0.012, 6, 6);
  const ledMats = ledColors.map(c => cached(`mat-led-${c}`, () => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2 })));
  const ledCountPerColor = Math.ceil((categories.length * rows) / ledColors.length) + categories.length;
  const ledMeshes = ledMats.map(mat => new THREE.InstancedMesh(ledGeo, mat, ledCountPerColor));
  const ledIdx = ledColors.map(() => 0);

  const m = new THREE.Matrix4();
  let drawerIdx = 0;

  categories.forEach((cat, ci) => {
    const cx = -width / 2 + secW * (ci + 0.5);

    m.makeTranslation(cx, h / 2, 0);
    bodyMesh.setMatrixAt(ci, m);

    for (let r = 0; r < rows; r++) {
      const y = 0.3 + r * rowH;
      m.makeTranslation(cx, y, depth / 2 + 0.015);
      drawerMesh.setMatrixAt(drawerIdx, m);
      m.makeTranslation(cx, y, depth / 2 + 0.032);
      handleMesh.setMatrixAt(drawerIdx, m);
      drawerIdx++;

      const ci2 = r % ledColors.length;
      m.makeTranslation(cx - secW / 2 + 0.16, y, depth / 2 + 0.02);
      ledMeshes[ci2].setMatrixAt(ledIdx[ci2]++, m);
    }

    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(secW - 0.3, 0.3),
      new THREE.MeshStandardMaterial({
        map: signText(cat.label.toUpperCase(), { color: '#5fd9ff', bg: '#0a1420', w: 512 }),
        emissiveMap: signText(cat.label.toUpperCase(), { color: '#5fd9ff', bg: '#000000', w: 512 }),
        emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.6
      })
    );
    label.position.set(cx, h + 0.24, depth / 2 - 0.02);
    g.add(label);
  });

  bodyMesh.instanceMatrix.needsUpdate = true;
  drawerMesh.instanceMatrix.needsUpdate = true;
  handleMesh.instanceMatrix.needsUpdate = true;
  g.add(bodyMesh, drawerMesh, handleMesh);
  ledMeshes.forEach((lm, i) => {
    lm.count = ledIdx[i];
    lm.instanceMatrix.needsUpdate = true;
    g.add(lm);
  });

  return g;
}

/** The console a researcher actually sits at to query archiveServerRack —
 *  a terminal desk with two glowing screens, standing in for readingDesk's
 *  logbook-and-lamp pair. */
export function dataTerminal() {
  const g = new THREE.Group();
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.5, metalness: 0.3 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.7), deskMat);
  top.position.y = 0.74;
  top.castShadow = top.receiveShadow = true;
  g.add(top);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.74, 0.5), MAT.steelGrey());
    leg.position.set(sx * 0.6, 0.37, 0);
    g.add(leg);
  }
  for (const sx of [-0.3, 0.3]) {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.18, 8), MAT.steelGrey());
    stand.position.set(sx, 0.86, -0.15);
    g.add(stand);
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.26, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x0a141c, emissive: 0x2a6ed8, emissiveIntensity: 1.1, roughness: 0.3 })
    );
    screen.position.set(sx, 1.06, -0.16);
    g.add(screen);
    const glow = new THREE.PointLight(0x5fd9ff, 0.9, 2.2, 2);
    glow.position.set(sx, 1.06, 0.05);
    g.add(glow);
  }
  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.02, 0.14), MAT.steelGrey());
  kb.position.set(0, 0.775, 0.15);
  g.add(kb);

  const chairMat = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.8 });
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12), chairMat);
  seat.position.set(0, 0.46, 0.6);
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.05), chairMat);
  back.position.set(0, 0.72, 0.78);
  g.add(back);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8), MAT.steelGrey());
  post.position.set(0, 0.24, 0.6);
  g.add(post);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 5), MAT.steelGrey());
  base.position.set(0, 0.03, 0.6);
  g.add(base);

  return g;
}

/**
 * snowmobile — a utility sled of the Ski-Doo Skandic / Lynx 69 Ranger class,
 * which is what actually gets craned off the ship at Bharati and Maitri for
 * short-range traverse, sea-ice work and hauling a Nansen sledge.
 *
 * Real dimensions: 3.28 m long, 1.20 m over the skis, 1.40 m to the top of the
 * windshield, 1.00 m ski stance, a 0.50 m track with ~1.8 m on the ground,
 * seat at 0.78 m. Nose points +x, matching snowVehicle().
 *
 * Built from EXTRUDED SIDE PROFILES rather than boxes, because a snowmobile is
 * nothing but curves — upswept ski tips, a tapering hood, a scooped seat — and
 * a box-per-part version reads as a pile of blocks however many boxes you add.
 * A THREE.Shape swept across the machine's width costs about the same and
 * actually has a silhouette.
 *
 * Three things learned building it, all of which showed up immediately on
 * screen and none of which were obvious in the code:
 *
 *  - ExtrudeGeometry already sweeps an XY shape along +Z. Rotating it "into
 *    place" on top of that put every profile's LENGTH across the machine and
 *    the sweep along it, so the hood came out as a 1.2 m wide slab and the
 *    skis were flung out sideways ahead of the sled. No rotation is correct.
 *  - paintedMetal() is a rust-and-scuff map sized for drums and excavators.
 *    On a 1.2 m moulded plastic hood its blooms are 4-8 cm across and it reads
 *    as camouflage. Vehicle bodywork wants flat colour and a low roughness.
 *  - An extrusion cannot taper along its sweep, so a single hood profile is
 *    always slab-sided. A second, narrower cowl sitting on top of the first is
 *    what turns two square shoulders into a tapered one.
 */
export function snowmobile(color = '#1c5fa8') {
  const g = new THREE.Group();
  // Bodywork is painted plastic: flat colour, a little gloss, no weathering
  // map. The accent is the same hue lifted, the way a real sled's graphics are.
  const paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.34, metalness: 0.08 });
  const accent = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55), roughness: 0.4, metalness: 0.05
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.9 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.78 });
  const steel = MAT.steelGrey();
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 1.0 });

  const EX = { curveSegments: 12, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.010, bevelSegments: 2 };
  const sweep = (shape, depth, mat) => {
    const geo = new THREE.ExtrudeGeometry(shape, { ...EX, depth });
    geo.translate(0, 0, -depth / 2);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  const put = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };

  /* ---------------------------------------------------------------- skis */
  const skiShape = new THREE.Shape();
  skiShape.moveTo(-0.52, 0.00);
  skiShape.lineTo(0.26, 0.00);
  skiShape.quadraticCurveTo(0.50, 0.00, 0.56, 0.16);
  skiShape.lineTo(0.47, 0.18);
  skiShape.quadraticCurveTo(0.42, 0.06, 0.24, 0.035);
  skiShape.lineTo(-0.52, 0.035);
  skiShape.closePath();
  for (const sz of [-0.47, 0.47]) {
    const ski = sweep(skiShape, 0.15, paint);
    put(ski, 0.92, 0.02, sz);
    // Keel, spindle and A-arm. Without these the ski reads as a loose plank
    // lying on the snow near the machine rather than part of it.
    put(new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.035, 0.03), steel), 0.88, -0.005, sz);
    put(new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.42, 8), steel), 0.92, 0.25, sz);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.045, 0.40), steel);
    put(arm, 0.88, 0.19, sz * 0.55);
    const shock = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.40, 8), dark);
    shock.rotation.z = 0.20;
    shock.rotation.x = sz > 0 ? -0.34 : 0.34;
    put(shock, 0.83, 0.44, sz * 0.66);
  }

  /* --------------------------------------------------------------- track */
  const beltR = 0.155;
  put(new THREE.Mesh(new THREE.BoxGeometry(1.58, beltR * 2, 0.50), rubber), -0.62, beltR, 0);
  for (const bx of [-1.41, 0.17]) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(beltR, beltR, 0.50, 16), rubber);
    roller.rotation.x = Math.PI / 2;
    roller.castShadow = true;
    put(roller, bx, beltR, 0);
  }
  for (const bx of [-1.12, -0.76, -0.40]) {
    for (const sz of [-0.16, 0.16]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.080, 0.080, 0.055, 10), dark);
      w.rotation.x = Math.PI / 2;
      put(w, bx, 0.125, sz);
    }
  }
  // Track lugs. From the side the whole lower half of the machine was one
  // black silhouette -- track, running board and seat all reading as a single
  // mass -- and no amount of shaping above it helps while that is true. Lugs
  // give the track a direction and a scale, and the light catches their tops.
  for (let i = 0; i < 11; i++) {
    const lx = -1.34 + i * 0.155;
    for (const sz of [-0.253, 0.253]) {
      put(new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.26, 0.014),
        new THREE.MeshStandardMaterial({ color: 0x2c3136, roughness: 0.95 })), lx, beltR, sz);
    }
  }
  // Slide rail: the pale line along the top of the track that separates it
  // from the tunnel above.
  put(new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.028, 0.54), steel), -0.62, 0.335, 0);

  /* ------------------------------------------- tunnel and running boards */
  put(new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.15, 0.54), steel), -0.60, 0.42, 0);
  // Painted tunnel sides. A real sled's tunnel is body-coloured or bright
  // aluminium, never black, and it is the single biggest thing separating the
  // seat from the track in a side view.
  for (const sz of [-0.276, 0.276]) {
    put(new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.19, 0.014), paint), -0.60, 0.44, sz);
  }
  for (const sz of [-0.385, 0.385]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.032, 0.24), steel);
    board.rotation.x = sz > 0 ? -0.17 : 0.17;
    put(board, -0.36, 0.35, sz);
  }
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.30, 0.50), rubber);
  flap.rotation.z = 0.20;
  put(flap, -1.52, 0.30, 0);
  // Taillight — small, but it is the thing that says the rear is the rear.
  put(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, 0.20),
    new THREE.MeshStandardMaterial({ color: 0xd6302a, emissive: 0x8e1410, emissiveIntensity: 0.5, roughness: 0.5 })),
    -1.46, 0.56, 0);

  /* ---------------------------------------------------------------- seat */
  // Scooped, with a raised bolster at the back. A flat slab is what made the
  // first version read as a black box sitting on a black box.
  const seatShape = new THREE.Shape();
  seatShape.moveTo(-0.66, 0.00);
  seatShape.lineTo(0.50, 0.00);
  seatShape.quadraticCurveTo(0.60, 0.05, 0.54, 0.17);
  seatShape.lineTo(0.06, 0.20);
  seatShape.quadraticCurveTo(-0.30, 0.21, -0.44, 0.26);
  seatShape.quadraticCurveTo(-0.60, 0.31, -0.66, 0.20);
  seatShape.closePath();
  put(sweep(seatShape, 0.46, seatMat), -0.60, 0.50, 0);
  // A lighter top panel and a piped edge. Upholstery is two tones and a seam;
  // one flat dark colour is what made this read as a loaf of bread.
  const topShape = new THREE.Shape();
  topShape.moveTo(-0.52, 0.00);
  topShape.lineTo(0.46, 0.00);
  topShape.quadraticCurveTo(0.53, 0.03, 0.48, 0.055);
  topShape.lineTo(-0.40, 0.075);
  topShape.quadraticCurveTo(-0.52, 0.075, -0.52, 0.03);
  topShape.closePath();
  put(sweep(topShape, 0.42, new THREE.MeshStandardMaterial({ color: 0x36404a, roughness: 0.7 })), -0.60, 0.665, 0);
  for (const sz of [-0.232, 0.232]) {
    put(new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.022, 0.012),
      new THREE.MeshStandardMaterial({ color: 0x8d959c, roughness: 0.6 })), -0.62, 0.655, sz);
  }
  // Grab strap at the back of the seat.
  put(new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.030, 0.09), dark), -1.02, 0.735, 0);

  /* ---------------------------------------------------------------- hood */
  const hoodShape = new THREE.Shape();
  hoodShape.moveTo(-0.56, 0.00);
  hoodShape.lineTo(0.56, 0.00);
  hoodShape.quadraticCurveTo(0.70, 0.04, 0.67, 0.19);
  hoodShape.quadraticCurveTo(0.58, 0.34, 0.30, 0.42);
  hoodShape.lineTo(-0.20, 0.46);
  hoodShape.lineTo(-0.56, 0.44);
  hoodShape.closePath();
  put(sweep(hoodShape, 0.78, paint), 0.62, 0.40, 0);

  // The narrower cowl that gives the hood its taper. An extrusion is constant
  // width along its sweep, so the only way to get a shoulder line is a second,
  // slimmer piece riding on the first.
  const cowlShape = new THREE.Shape();
  cowlShape.moveTo(-0.50, 0.00);
  cowlShape.quadraticCurveTo(0.10, 0.06, 0.34, 0.02);
  cowlShape.lineTo(0.32, -0.05);
  cowlShape.lineTo(-0.50, -0.07);
  cowlShape.closePath();
  put(sweep(cowlShape, 0.54, paint), 0.56, 0.86, 0);

  // Accent flash along each shoulder, and the louvres.
  for (const sz of [-0.395, 0.395]) {
    const flash = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.075, 0.012), accent);
    flash.rotation.z = 0.10;
    put(flash, 0.60, 0.66, sz);
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.030, 0.014), dark);
      v.rotation.z = 0.18;
      put(v, 0.72 + i * 0.02, 0.50 + i * 0.065, sz);
    }
  }
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.095, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xfff4d2, emissive: 0xffe08a, emissiveIntensity: 0.85, roughness: 0.25 })
  );
  light.rotation.z = -Math.PI / 2;
  put(light, 1.26, 0.66, 0);

  /* --------------------------------------------------------- windshield */
  // Raked back over the hood, not standing up behind it. A sector of a
  // cylinder gives a real curve across the rider's view.
  // Built as a swept side profile like every other curved part here, rather
  // than as a rotated cylinder sector. Orienting a cylinder took three Euler
  // rotations, and the third -- the rake -- ended up applied about the wrong
  // axis, so the screen tipped sideways instead of leaning back and sat
  // behind the handlebar instead of in front of it. A profile cannot get its
  // own rake wrong: the lean is drawn into the shape.
  const wsMat = new THREE.MeshStandardMaterial({
    color: 0xcfe0ea, roughness: 0.12, transparent: true, opacity: 0.42, side: THREE.DoubleSide
  });
  const wsShape = new THREE.Shape();
  wsShape.moveTo(0.07, 0.00);
  wsShape.quadraticCurveTo(0.02, 0.22, -0.13, 0.42);
  wsShape.lineTo(-0.16, 0.40);
  wsShape.quadraticCurveTo(-0.01, 0.21, 0.04, 0.00);
  wsShape.closePath();
  const ws = new THREE.ExtrudeGeometry(wsShape, { curveSegments: 12, bevelEnabled: false, depth: 0.50 });
  ws.translate(0, 0, -0.25);
  put(new THREE.Mesh(ws, wsMat), 0.40, 0.88, 0);
  // Two mounting tabs, so the screen is visibly bolted to the cowl rather
  // than balanced above it.
  for (const sz of [-0.18, 0.18]) {
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.016), dark);
    tab.rotation.z = 0.5;
    put(tab, 0.44, 0.89, sz);
  }

  /* ------------------------------------------- handlebar, grips, mirrors */
  const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.22, 8), steel);
  riser.rotation.z = 0.18;
  put(riser, 0.18, 0.94, 0);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.72, 8), steel);
  bar.rotation.x = Math.PI / 2;
  put(bar, 0.13, 1.04, 0);
  for (const sz of [-0.30, 0.30]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.13, 8), dark);
    grip.rotation.x = Math.PI / 2;
    put(grip, 0.13, 1.04, sz);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.018), paint);
    guard.rotation.y = sz > 0 ? -0.34 : 0.34;
    put(guard, 0.21, 1.07, sz * 1.14);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.16, 6), steel);
    stem.rotation.z = 0.30;
    put(stem, 0.10, 1.14, sz * 0.72);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.075, 0.11), dark);
    put(mirror, 0.07, 1.22, sz * 0.78);
  }

  /* ---------------------------------------------------- rear cargo rack */
  for (const sz of [-0.21, 0.21]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.60, 6), steel);
    rail.rotation.z = Math.PI / 2;
    put(rail, -1.18, 0.64, sz);
    for (const bx of [-0.90, -1.44]) {
      put(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.20, 6), steel), bx, 0.55, sz);
    }
  }
  const jerry = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.28, 0.16),
    new THREE.MeshStandardMaterial({ color: 0xb8442a, roughness: 0.65 }));
  jerry.castShadow = true;
  put(jerry, -1.18, 0.79, 0);
  // Lashed down, because a loose can on a moving sled is a lost can.
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.30, 0.18), dark);
  put(strap, -1.18, 0.79, 0);
  // Tow hitch for the Nansen sledge this thing exists to pull.
  put(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.09), steel), -1.60, 0.44, 0);

  g.userData.footprint = { w: 3.28, d: 1.20, h: 1.40 };
  return g;
}
