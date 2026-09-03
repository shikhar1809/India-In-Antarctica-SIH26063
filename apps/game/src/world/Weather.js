import * as THREE from 'three';
import { clamp, damp } from '../core/noise.js';

/**
 * Weather — blowing snow, drift haze and wind.
 *
 * The particles live in a box that follows the camera and wrap around when
 * they leave it, so a few thousand points cover an infinite snowfield. All
 * the motion happens in the vertex shader from a single time uniform: zero
 * per-frame CPU work, zero buffer uploads.
 *
 * Antarctic snow almost never falls straight down. What you see at a coastal
 * station is nearly horizontal — katabatic wind picking loose crystals off the
 * surface and driving them past you. So the horizontal component dominates,
 * and gusts modulate it.
 */
export class Weather {
  constructor(engine, cfg = {}) {
    this.engine = engine;
    this.windKt = cfg.windKt ?? 24;
    this.intensity = cfg.intensity ?? 0.45;   // 0 clear → 1 blizzard
    this.windDir = cfg.windDir ?? 0.7;        // radians
    this._gust = 0;

    this.box = new THREE.Vector3(160, 60, 160);
    this._build();
  }

  _build() {
    const N = this.engine.particleBudget;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    const size = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * this.box.x;
      pos[i * 3 + 1] = Math.random() * this.box.y;
      pos[i * 3 + 2] = (Math.random() - 0.5) * this.box.z;
      seed[i] = Math.random();
      // A wide size spread reads as depth: near flakes are big and fast-moving,
      // distant ones are specks. Same particle system, no LOD needed.
      size[i] = 0.35 + Math.pow(Math.random(), 2.6) * 1.9;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);

    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime:      { value: 0 },
        uWind:      { value: new THREE.Vector2(Math.sin(this.windDir), Math.cos(this.windDir)) },
        uSpeed:     { value: this.windKt * 0.5 },
        uBox:       { value: this.box.clone() },
        uOrigin:    { value: new THREE.Vector3() },
        uIntensity: { value: this.intensity },
        uPixelRatio:{ value: 1 }
      },
      vertexShader: /* glsl */`
        attribute float aSeed;
        attribute float aSize;
        uniform float uTime, uSpeed, uIntensity, uPixelRatio;
        uniform vec2  uWind;
        uniform vec3  uBox, uOrigin;
        varying float vAlpha;
        varying float vSeed;

        void main(){
          vec3 p = position;

          // Drift: horizontal wind plus a slow fall. Per-particle seed offsets
          // phase so the field never looks like a marching grid.
          float t = uTime;
          float sway = sin(t * 1.7 + aSeed * 34.0) * 1.4 * (1.0 - aSize * 0.12);
          p.x += uWind.x * uSpeed * t + sway;
          p.z += uWind.y * uSpeed * t + cos(t * 1.3 + aSeed * 21.0) * 1.4;
          p.y -= (0.9 + aSeed * 1.6) * t * 1.4;

          // Wrap into a box centred on the camera. mod() on a negative number
          // is why the +uBox term is there before the second mod.
          // NOTE: this must not be named 'half' -- that is a reserved word in
          // GLSL ES and the shader fails to compile with a syntax error.
          vec3 halfBox = uBox * 0.5;
          vec3 rel = p - uOrigin + halfBox;
          rel = mod(mod(rel, uBox) + uBox, uBox);
          p = rel - halfBox + uOrigin;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float dist = -mv.z;

          // Clamp the near size: without this a flake 1 m from the lens covers
          // a quarter of the screen and reads as a bokeh blob, not snow.
          gl_PointSize = min(aSize * uPixelRatio * (90.0 / max(dist, 1.5)), 26.0 * uPixelRatio);
          gl_Position = projectionMatrix * mv;

          // Fade at both ends of the box so particles pop neither in nor out.
          vAlpha = uIntensity
                 * smoothstep(1.2, 7.0, dist)
                 * (1.0 - smoothstep(halfBox.x * 0.55, halfBox.x, dist));
          vSeed = aSeed;
        }
      `,
      fragmentShader: /* glsl */`
        varying float vAlpha;
        varying float vSeed;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c);
          if (d > 0.25) discard;
          // Soft-edged disc; snow crystals at this distance are just blur.
          float a = smoothstep(0.25, 0.02, d) * vAlpha;
          gl_FragColor = vec4(vec3(0.94, 0.97, 1.0), a * 0.85);
        }
      `
    });

    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.engine.scene.add(this.points);
  }

  setIntensity(v) {
    this.intensity = clamp(v, 0, 1);
  }

  setWind(kt, dirRad) {
    this.windKt = kt;
    if (dirRad !== undefined) {
      this.windDir = dirRad;
      this.mat.uniforms.uWind.value.set(Math.sin(dirRad), Math.cos(dirRad));
    }
  }

  update(dt, elapsed, cameraPos, dpr = 1) {
    const u = this.mat.uniforms;
    u.uTime.value = elapsed;
    u.uOrigin.value.copy(cameraPos);
    u.uPixelRatio.value = dpr;

    // Gusts: a slow random walk on top of the base wind, so the blizzard
    // breathes instead of running at a constant rate.
    this._gust = damp(this._gust, (Math.sin(elapsed * 0.23) + Math.sin(elapsed * 0.71)) * 0.5, 1.2, dt);
    const gustFactor = 1 + this._gust * 0.45;
    u.uSpeed.value = this.windKt * 0.5 * gustFactor;
    u.uIntensity.value = this.intensity * (0.85 + this._gust * 0.25);

    this.effectiveWindKt = this.windKt * gustFactor;
  }

  dispose() {
    this.points.geometry.dispose();
    this.mat.dispose();
    this.engine.scene.remove(this.points);
  }
}
