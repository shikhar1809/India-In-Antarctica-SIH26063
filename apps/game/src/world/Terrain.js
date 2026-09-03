import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { Simplex, clamp, smoothstep, lerp } from '../core/noise.js';

// Patch three's raycast with the BVH accelerator. Without this, every ground
// probe walks 180k triangles; with it, a raycast is a handful of AABB tests.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/**
 * Terrain — a seeded heightfield with three landform profiles matching the
 * three real sites.
 *
 *   oasis   (Maitri)    Schirmacher: wind-scoured bedrock ridges, ice-free,
 *                       snow only in the hollows, a freshwater lake basin.
 *   coastal (Bharati)   Larsemann Hills: low rounded outcrops dropping into
 *                       Prydz Bay, sea level at 0.
 *   shelf   (Gangotri)  Flat floating ice shelf, ribbed with sastrugi — the
 *                       wind-carved ridges that make ice look like a ploughed field.
 *
 * Heights live in a Float32Array so the player controller can sample the
 * ground analytically (bilinear interpolation, ~200ns) instead of raycasting
 * every frame. The BVH mesh is kept for the things that genuinely need a ray:
 * object placement and the interaction cursor.
 */
export class Terrain {
  constructor(engine, profile = 'oasis', seed = 20260130) {
    this.engine = engine;
    this.profile = profile;
    this.seed = seed;

    this.size = 1000;                 // metres across
    // 320x320 is 205k triangles of ground, most of it fogged out or behind
    // the player. Height sampling is analytic (heightAt), so the mesh
    // resolution only affects how the ground LOOKS, and at this scale nobody
    // can tell 160 from 320.
    this.seg = engine.quality === 'low' ? 96 : engine.quality === 'medium' ? 128 : 176;
    this.half = this.size / 2;
    this.step = this.size / this.seg;

    this.simplex = new Simplex(seed);
    this.simplex2 = new Simplex(seed ^ 0x9e3779b9);

    this.seaLevel = profile === 'coastal' ? 0 : -999;
    this.lake = null;

    // Derive the graded (pad/road) height from this profile's own natural
    // landform rather than a constant tuned for one specific site. Without
    // this, a pad height baked for the oasis's ~18 m baseline would plant
    // Bharati's building 20+ m underground, or Gangotri's on a floating mesa
    // above a ~2 m ice shelf.
    //
    // Sampling the single centre point is not enough on its own: on the
    // coastal profile that point can land in the tidal margin, well below sea
    // level, which would sink the whole graded pad underwater. A site
    // engineer picks the highest workable ground within the building
    // envelope and cuts down to it, so this samples a ring inside the pad
    // footprint and grades to the highest point found, minus a small cut
    // margin — the same reasoning as the real siting logic (Maitri and
    // Bharati are both built on the driest/highest ground available, never
    // the lowest).
    this.gradeY = this._pickGradeY();

    this._generate();
    this._buildMesh();
    if (profile === 'oasis') this._buildLake();
    if (profile === 'coastal') this._buildSea();
  }

  /** See the constructor comment above for why this samples a ring, not a point. */
  _pickGradeY() {
    const pad = PADS[0];
    let best = -Infinity;
    const N = 10;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = pad.r * 0.45;
      const h = this._rawHeightAt(pad.x + Math.cos(a) * r, pad.z + Math.sin(a) * r);
      if (h > best) best = h;
    }
    const centre = this._rawHeightAt(pad.x, pad.z);
    best = Math.max(best, centre);
    let y = best - 1.2;   // small cut into the high point, not a build-up
    // A coastal station is sited on the hillside overlooking the water, never
    // at the tideline — keep the pad clear of the sea by a working margin.
    if (this.profile === 'coastal') y = Math.max(y, this.seaLevel + 8);
    return y;
  }

  /* ================================================================ height */

  /** The natural landform, with NO pad/road grading applied. */
  _rawHeightAt(x, z) {
    const S = this.simplex, S2 = this.simplex2;
    const nx = x / this.size, nz = z / this.size;
    let h;

    if (this.profile === 'shelf') {
      // An ice shelf is almost perfectly flat. What relief exists is sastrugi:
      // hard wind-carved ridges, all aligned with the prevailing wind, plus a
      // very long-wavelength swell from the ice flexing over the sea beneath.
      const swell = S.fbm(nx * 1.4, nz * 1.4, 3) * 3.2;
      const windAngle = 0.6;
      const u = x * Math.cos(windAngle) + z * Math.sin(windAngle);
      const sastrugi = Math.abs(Math.sin(u * 0.09 + S.noise2D(nx * 8, nz * 8) * 1.6)) * 0.55;
      const rough = S2.fbm(nx * 22, nz * 22, 3) * 0.28;
      h = swell + sastrugi + rough + 2.0;
    } else if (this.profile === 'coastal') {
      // Larsemann Hills: rounded, ice-polished knolls with a clear coastline.
      // The distance term pulls terrain below sea level toward the north edge,
      // which is what creates the bay.
      const shore = smoothstep(-0.16, 0.30, nz + S.fbm(nx * 2.2, nz * 2.2, 3) * 0.16);
      const knolls = S.fbm(nx * 3.0, nz * 3.0, 5) * 26;
      const bumps = S2.fbm(nx * 9.0, nz * 9.0, 4) * 5.5;
      const detail = S.fbm(nx * 34, nz * 34, 3) * 0.9;
      const raw = (knolls + bumps) * shore + detail;
      // Sea floor drops away smoothly rather than ending in a cliff.
      h = raw - (1 - shore) * 14 + 4;
    } else {
      // ---- oasis (Maitri) ------------------------------------------------
      // Schirmacher is a corridor of exposed bedrock between the polar plateau
      // (high, to the south) and the ice shelf (low, to the north). So there is
      // a real large-scale tilt across the map, with ridged bedrock on top.
      const tilt = -nz * 46;
      const ridges = S.ridged(nx * 2.4, nz * 2.4, 5) * 44;
      const hills = S.fbm(nx * 4.2, nz * 4.2, 5) * 14;
      const detail = S2.fbm(nx * 26, nz * 26, 4) * 1.5;
      h = tilt + ridges + hills + detail + 18;

      // Lake Priyadarshini: carve a basin. A smooth radial falloff keeps the
      // shoreline organic rather than a perfect circle.
      const lx = x - LAKE.x, lz = z - LAKE.z;
      const d = Math.hypot(lx, lz) / LAKE.r + S.fbm(nx * 12, nz * 12, 3) * 0.14;
      const basin = 1 - smoothstep(0.55, 1.05, d);
      h = lerp(h, LAKE.floor, basin * 0.95);
    }

    return h;
  }

  /**
   * The analytic height function used everywhere else. Station pad + approach
   * road grading applies on top of the raw landform for EVERY profile, both
   * flattened to `this.gradeY` — the natural height already sampled at the
   * pad centre — so the graded area blends into whichever terrain it sits on
   * instead of imposing one profile's elevation onto another's.
   */
  _heightAt(x, z) {
    let h = this._rawHeightAt(x, z);

    for (const pad of PADS) {
      const pd = Math.hypot(x - pad.x, z - pad.z) / pad.r;
      const w = 1 - smoothstep(0.7, 1.25, pd);
      h = lerp(h, this.gradeY, w * 0.97);
    }
    const rd = distToSegment(x, z, ROAD.ax, ROAD.az, ROAD.bx, ROAD.bz);
    const rw = 1 - smoothstep(ROAD.width, ROAD.width + ROAD.feather, rd);
    h = lerp(h, this.gradeY, rw * 0.94);

    return h;
  }

  _generate() {
    const n = this.seg + 1;
    this.heights = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      const z = -this.half + j * this.step;
      for (let i = 0; i < n; i++) {
        const x = -this.half + i * this.step;
        this.heights[j * n + i] = this._heightAt(x, z);
      }
    }
  }

  /* ================================================================== mesh */

  _buildMesh() {
    const n = this.seg + 1;
    const geo = new THREE.PlaneGeometry(this.size, this.size, this.seg, this.seg);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();

    // Palette sampled from photographs of each site.
    const ROCK_DARK = new THREE.Color(0x3d3630);
    const ROCK      = new THREE.Color(0x6b6055);
    const ROCK_LIT  = new THREE.Color(0x8b7d6d);
    const GRAVEL    = new THREE.Color(0x9a8b77);
    const SNOW      = new THREE.Color(0xf2f7fb);
    const SNOW_BLUE = new THREE.Color(0xd6e6f5);
    const ICE       = new THREE.Color(0x9dc4dd);

    for (let i = 0; i < pos.count; i++) {
      const gx = i % n, gz = (i / n) | 0;
      const h = this.heights[gz * n + gx];
      pos.setY(i, h);

      // Slope from central differences on the height grid.
      const hL = this.heights[gz * n + Math.max(0, gx - 1)];
      const hR = this.heights[gz * n + Math.min(n - 1, gx + 1)];
      const hD = this.heights[Math.max(0, gz - 1) * n + gx];
      const hU = this.heights[Math.min(n - 1, gz + 1) * n + gx];
      const slope = Math.hypot(hR - hL, hU - hD) / (2 * this.step);

      const x = -this.half + gx * this.step;
      const z = -this.half + gz * this.step;
      const jitter = this.simplex2.fbm(x * 0.04, z * 0.04, 3);

      if (this.profile === 'shelf') {
        c.copy(SNOW).lerp(SNOW_BLUE, clamp(slope * 1.4 + jitter * 0.2, 0, 1));
      } else if (this.profile === 'coastal') {
        const rocky = smoothstep(1.2, 5.5, h) * (1 - smoothstep(0.30, 0.75, slope));
        c.copy(SNOW).lerp(ROCK, clamp(rocky + jitter * 0.18, 0, 1));
        if (h < 0.6) c.lerp(ICE, smoothstep(0.6, -2.0, h));
        const built = gradedFactor(x, z);
        if (built > 0.01) c.lerp(GRAVEL, built * 0.6);
      } else {
        // Oasis: bare rock is the DEFAULT here, not the exception. This is the
        // whole reason Maitri was sited in the Schirmacher Oasis rather than on
        // the shelf — wind-scoured rock does not accumulate snow, so the
        // station does not get buried the way Dakshin Gangotri did.
        const steep = smoothstep(0.22, 0.62, slope);
        c.copy(ROCK).lerp(ROCK_DARK, steep * 0.8);
        c.lerp(ROCK_LIT, clamp(jitter * 0.5 + 0.3, 0, 1) * 0.55);

        // Graded ground: the road and the station apron are bulldozed gravel.
        const nearPad = PADS.some(p => Math.hypot(x - p.x, z - p.z) < p.r * 1.35);
        const roadD = distToSegment(x, z, ROAD.ax, ROAD.az, ROAD.bx, ROAD.bz);
        const onRoad = 1 - smoothstep(ROAD.width, ROAD.width + 10, roadD);
        const built = Math.max(onRoad, nearPad ? 0.8 : 0);

        // Snow accumulation: needs shelter (flat, low) AND undisturbed ground.
        // Graded surfaces are swept and driven on, so they stay bare-ish —
        // but even a cleared road gets a blown-snow dusting between passes,
        // it is never scoured back to bare gravel the way this used to
        // render, so `built` now only partially suppresses drift rather than
        // almost erasing it.
        //
        // Coverage is pushed well past what the bare-rock Schirmacher Oasis
        // shows in still photographs — a deliberate departure for visual
        // drama over strict single-moment accuracy, and one that reads as
        // "after a real snowfall" rather than "wrong": rock only stays
        // exposed on genuinely steep faces now, not merely un-flat ones.
        const flat = 1 - smoothstep(0.20, 0.70, slope);
        const drift = clamp(flat * (0.78 + jitter * 0.3), 0, 1) * (1 - built * 0.45);
        c.lerp(SNOW, drift * 0.97);

        // Gravel goes on last so it survives the snow blend, but only
        // partially — the point is "snow over a graded road", not "road
        // with the snow scrubbed off".
        if (built > 0.01) c.lerp(GRAVEL, built * 0.38);
        // Lake ice.
        if (h < LAKE.floor + 2.5) c.lerp(ICE, smoothstep(LAKE.floor + 2.5, LAKE.floor, h));
      }

      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    geo.computeBoundsTree({ maxLeafTris: 8 });

    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.0,
      flatShading: false,
      dithering: true          // kills banding across the huge smooth snow gradients
    });
    this._injectDetail(this.material);

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = 'terrain';
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
    this.engine.scene.add(this.mesh);
  }

  /**
   * A vertex-coloured heightfield alone looks like plastic at close range —
   * there is no surface texture between vertices, which are 3 m apart. This
   * injects procedural high-frequency detail in the fragment shader: fine
   * grain everywhere, plus a glint term that only fires on bright, near-white
   * surfaces so snow sparkles and rock does not.
   */
  _injectDetail(mat) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      this._detailUniforms = shader.uniforms;

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n varying vec3 vWorldP;`)
        .replace('#include <worldpos_vertex>',
          `#include <worldpos_vertex>\n vWorldP = (modelMatrix * vec4(transformed,1.0)).xyz;`);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', /* glsl */`
          #include <common>
          varying vec3 vWorldP;
          uniform float uTime;
          float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
          float vn(vec2 p){
            vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
            return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y);
          }
        `)
        .replace('#include <color_fragment>', /* glsl */`
          #include <color_fragment>
          {
            // Three octaves of grain at metre, decimetre and centimetre scale.
            float g = vn(vWorldP.xz * 0.9) * 0.5 + vn(vWorldP.xz * 4.1) * 0.32 + vn(vWorldP.xz * 17.0) * 0.18;
            diffuseColor.rgb *= 0.86 + g * 0.28;

            // Snow glint: only on surfaces already bright and facing up.
            float lum = dot(diffuseColor.rgb, vec3(0.299,0.587,0.114));
            float snowy = smoothstep(0.55, 0.82, lum);
            float sp = vn(vWorldP.xz * 46.0 + floor(uTime * 3.0) * 0.37);
            diffuseColor.rgb += snowy * smoothstep(0.93, 1.0, sp) * 0.5;
          }
        `);
    };
    mat.customProgramCacheKey = () => 'terrain-detail-v1';
  }

  /* ================================================================= water */

  _buildLake() {
    // Priyadarshini is frozen for most of the year and thaws at the margins in
    // high summer — so this is ice, not open water: near-opaque, faintly blue,
    // low roughness with a cracked pattern rather than a mirror.
    const g = new THREE.CircleGeometry(LAKE.r * 1.02, 72);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({
      color: 0x9fc8e0, roughness: 0.24, metalness: 0.0,
      transparent: true, opacity: 0.94
    });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP=(modelMatrix*vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWP;
          float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          float vn2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
            return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            // Pressure cracks: thin dark ridges where the noise field folds.
            float n = vn2(vWP.xz*0.16)+vn2(vWP.xz*0.55)*0.5;
            float crack = smoothstep(0.06,0.0,abs(fract(n*3.0)-0.5)-0.44);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42,0.60,0.72), crack*0.75);
            diffuseColor.rgb *= 0.92 + vn2(vWP.xz*2.4)*0.16;
          }`);
    };
    this.lake = new THREE.Mesh(g, m);
    this.lake.position.set(LAKE.x, LAKE.floor + LAKE.depth, LAKE.z);
    this.lake.receiveShadow = true;
    this.engine.scene.add(this.lake);
    this.lakeLevel = LAKE.floor + LAKE.depth;
  }

  _buildSea() {
    const g = new THREE.PlaneGeometry(3000, 3000, 1, 1);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({
      color: 0x14384f, roughness: 0.18, metalness: 0.35,
      transparent: true, opacity: 0.95,
      // A PlaneGeometry only has one visible face by default (its +normal
      // side, up). If the camera ever ends up below that plane — the
      // terrain clamp below keeps walkable GROUND at seaLevel+8, but the
      // camera itself can still dip under sea level near the shoreline
      // through bob, pitch, or a collision push — the water doesn't fade
      // or look wrong, it just isn't drawn at all: looking up through
      // where the surface should be shows empty space straight through to
      // the sky. DoubleSide means there's still a surface to see from
      // underneath, which is the first half of "being underwater" actually
      // reading as being underwater rather than the water having vanished.
      side: THREE.DoubleSide
    });
    this.sea = new THREE.Mesh(g, m);
    this.sea.position.y = this.seaLevel;
    this.engine.scene.add(this.sea);
  }

  /* ================================================================ sample */

  /**
   * Bilinear height lookup. This is the hot path — called several times per
   * frame by the character controller — so it deliberately avoids allocation
   * and raycasting.
   */
  heightAt(x, z) {
    const n = this.seg + 1;
    const fx = (x + this.half) / this.step;
    const fz = (z + this.half) / this.step;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.seg || j >= this.seg) {
      return this._heightAt(x, z);      // outside the grid: fall back to analytic
    }
    const tx = fx - i, tz = fz - j;
    const h00 = this.heights[j * n + i];
    const h10 = this.heights[j * n + i + 1];
    const h01 = this.heights[(j + 1) * n + i];
    const h11 = this.heights[(j + 1) * n + i + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  /** Surface normal via finite differences. Used for slope limits and props. */
  normalAt(x, z, out = new THREE.Vector3()) {
    const d = this.step;
    const hL = this.heightAt(x - d, z), hR = this.heightAt(x + d, z);
    const hD = this.heightAt(x, z - d), hU = this.heightAt(x, z + d);
    return out.set(hL - hR, 2 * d, hD - hU).normalize();
  }

  /**
   * Is this ground graded (road or station apron)? Used by the scatter passes
   * so that snow drifts, boulders and markers do not end up sitting in the
   * middle of a bulldozed vehicle route.
   */
  isGraded(x, z) {
    if (this.profile !== 'oasis') return false;
    if (distToSegment(x, z, ROAD.ax, ROAD.az, ROAD.bx, ROAD.bz) < ROAD.width + 8) return true;
    return PADS.some(p => Math.hypot(x - p.x, z - p.z) < p.r * 1.2);
  }

  /** Slope in radians at a point — 0 is flat. */
  slopeAt(x, z) {
    const nrm = this.normalAt(x, z, _v);
    return Math.acos(clamp(nrm.y, -1, 1));
  }

  update(dt, elapsed) {
    if (this._detailUniforms) this._detailUniforms.uTime.value = elapsed;
  }

  dispose() {
    this.mesh.geometry.disposeBoundsTree?.();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.engine.scene.remove(this.mesh);
    if (this.lake) { this.lake.geometry.dispose(); this.lake.material.dispose(); this.engine.scene.remove(this.lake); }
    if (this.sea) { this.sea.geometry.dispose(); this.sea.material.dispose(); this.engine.scene.remove(this.sea); }
  }
}

const _v = new THREE.Vector3();

/** Perpendicular distance from (px,pz) to the segment (ax,az)-(bx,bz). */
/** 0..1 — how strongly a point sits on graded ground (pad or road). */
function gradedFactor(x, z) {
  const onRoad = 1 - smoothstep(ROAD.width, ROAD.width + 10, distToSegment(x, z, ROAD.ax, ROAD.az, ROAD.bx, ROAD.bz));
  const nearPad = PADS.some(p => Math.hypot(x - p.x, z - p.z) < p.r * 1.35) ? 0.8 : 0;
  return Math.max(onRoad, nearPad);
}

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 ? clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Lake Priyadarshini basin, in world units. Sited off the approach corridor
 *  so the walk in from the landing point is never blocked by water. */
export const LAKE = { x: 168, z: 150, r: 88, floor: -4, depth: 3.6 };

/**
 * The graded approach. Every Antarctic station has one: a bulldozed corridor
 * from the landing point to the door, because you cannot drive a loaded
 * tractor over glacial moraine. It is also what guarantees the player's first
 * view of the station is the front elevation rather than the back of a ridge.
 */
export const ROAD = { ax: 0, az: 104, bx: 0, bz: -10, y: 16.5, width: 11, feather: 26 };

/** Flattened benches for built structures. */
export const PADS = [
  { x: 0,    z: -10,  r: 62, y: 16.5 },   // Maitri main building
  { x: -110, z: 40,   r: 30, y: 14.0 },   // container yard / summer camp
  { x: 120,  z: -70,  r: 26, y: 19.0 }    // AWS + instrument field
];
