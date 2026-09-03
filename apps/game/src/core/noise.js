/**
 * noise.js — deterministic pseudo-random primitives.
 *
 * Everything in the world (terrain, boulder scatter, snow drift, flag ripple)
 * is generated from a seed, so the same station always produces the identical
 * landscape on every machine and every reload. That matters more than it
 * sounds: judges comparing two screenshots of "the same place" should be
 * looking at the same place.
 */

/** mulberry32 — small, fast, good enough distribution for scatter. */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D simplex noise, seeded. Returns roughly -1..1. */
export class Simplex {
  constructor(seed = 1337) {
    const r = rng(seed);
    this.p = new Uint8Array(512);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (r() * (i + 1)) | 0;
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }

  noise2D(xin, yin) {
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    const p = this.p;

    let n = 0;
    const corner = (x, y, gi) => {
      let t0 = 0.5 - x * x - y * y;
      if (t0 < 0) return 0;
      t0 *= t0;
      const g = GRAD[gi % 12];
      return t0 * t0 * (g[0] * x + g[1] * y);
    };
    n += corner(x0, y0, p[ii + p[jj]]);
    n += corner(x1, y1, p[ii + i1 + p[jj + j1]]);
    n += corner(x2, y2, p[ii + 1 + p[jj + 1]]);
    return 70 * n;
  }

  /** Fractal Brownian motion — layered noise, the standard terrain workhorse. */
  fbm(x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2D(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /**
   * Ridged noise — abs() folded and inverted. Produces sharp crests instead of
   * rolling hills, which is what exposed Antarctic bedrock actually looks like
   * after a few million years of glacial scouring.
   */
  ridged(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.noise2D(x * freq, y * freq));
      sum += amp * n * n;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

const GRAD = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [1, 0], [-1, 0],
  [0, 1], [0, -1], [0, 1], [0, -1]
];

/* --------------------------------------------------------------- helpers */
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach. `k` is roughly 1/half-life. */
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
