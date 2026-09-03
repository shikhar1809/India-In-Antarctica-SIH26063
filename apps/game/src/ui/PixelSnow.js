import * as THREE from 'three';

/**
 * PixelSnow — a raymarched, pixel-art snowfall layer for the boot and menu
 * screens, ported verbatim (shader and defaults unchanged) from the
 * user-supplied React/react-bits component into a plain ES class, since
 * this project has no React anywhere in it — just Three.js directly (see
 * Sky.js/Weather.js for the same pattern: a class that owns its own
 * renderer/scene and exposes an imperative lifecycle).
 *
 * Deliberately its own small WebGL context rather than sharing the game's
 * main renderer — it only ever runs behind the boot/menu overlay, never
 * concurrently with the 3D world.
 */

const vertexShader = `
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

const fragmentShader = `
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uFlakeSize;
uniform float uMinFlakeSize;
uniform float uPixelResolution;
uniform float uSpeed;
uniform float uDepthFade;
uniform float uFarPlane;
uniform vec3 uColor;
uniform float uBrightness;
uniform float uGamma;
uniform float uDensity;
uniform float uVariant;
uniform float uDirection;

#define PI 3.14159265
#define PI_OVER_6 0.5235988
#define PI_OVER_3 1.0471976
#define INV_SQRT3 0.57735027
#define M1 1597334677U
#define M2 3812015801U
#define M3 3299493293U
#define F0 2.3283064e-10

#define hash(n) (n * (n ^ (n >> 15)))
#define coord3(p) (uvec3(p).x * M1 ^ uvec3(p).y * M2 ^ uvec3(p).z * M3)

const vec3 camK = vec3(0.57735027, 0.57735027, 0.57735027);
const vec3 camI = vec3(0.70710678, 0.0, -0.70710678);
const vec3 camJ = vec3(-0.40824829, 0.81649658, -0.40824829);

const vec2 b1d = vec2(0.574, 0.819);

vec3 hash3(uint n) {
  uvec3 hashed = hash(n) * uvec3(1U, 511U, 262143U);
  return vec3(hashed) * F0;
}

float snowflakeDist(vec2 p) {
  float r = length(p);
  float a = atan(p.y, p.x);
  a = abs(mod(a + PI_OVER_6, PI_OVER_3) - PI_OVER_6);
  vec2 q = r * vec2(cos(a), sin(a));
  float dMain = max(abs(q.y), max(-q.x, q.x - 1.0));
  float b1t = clamp(dot(q - vec2(0.4, 0.0), b1d), 0.0, 0.4);
  float dB1 = length(q - vec2(0.4, 0.0) - b1t * b1d);
  float b2t = clamp(dot(q - vec2(0.7, 0.0), b1d), 0.0, 0.25);
  float dB2 = length(q - vec2(0.7, 0.0) - b2t * b1d);
  return min(dMain, min(dB1, dB2)) * 10.0;
}

void main() {
  float invPixelRes = 1.0 / uPixelResolution;
  float pixelSize = max(1.0, floor(0.5 + uResolution.x * invPixelRes));
  float invPixelSize = 1.0 / pixelSize;

  vec2 fragCoord = floor(gl_FragCoord.xy * invPixelSize);
  vec2 res = uResolution * invPixelSize;
  float invResX = 1.0 / res.x;

  vec3 ray = normalize(vec3((fragCoord - res * 0.5) * invResX, 1.0));
  ray = ray.x * camI + ray.y * camJ + ray.z * camK;

  float timeSpeed = uTime * uSpeed;
  float windX = cos(uDirection) * 0.4;
  float windY = sin(uDirection) * 0.4;
  vec3 camPos = (windX * camI + windY * camJ + 0.1 * camK) * timeSpeed;
  vec3 pos = camPos;

  vec3 absRay = max(abs(ray), vec3(0.001));
  vec3 strides = 1.0 / absRay;
  vec3 raySign = step(ray, vec3(0.0));
  vec3 phase = fract(pos) * strides;
  phase = mix(strides - phase, phase, raySign);

  float rayDotCamK = dot(ray, camK);
  float invRayDotCamK = 1.0 / rayDotCamK;
  float invDepthFade = 1.0 / uDepthFade;
  float halfInvResX = 0.5 * invResX;
  vec3 timeAnim = timeSpeed * 0.1 * vec3(7.0, 8.0, 5.0);

  float t = 0.0;
  for (int i = 0; i < 128; i++) {
    if (t >= uFarPlane) break;

    vec3 fpos = floor(pos);
    uint cellCoord = coord3(fpos);
    float cellHash = hash3(cellCoord).x;

    if (cellHash < uDensity) {
      vec3 h = hash3(cellCoord);

      vec3 sinArg1 = fpos.yzx * 0.073;
      vec3 sinArg2 = fpos.zxy * 0.27;
      vec3 flakePos = 0.5 - 0.5 * cos(4.0 * sin(sinArg1) + 4.0 * sin(sinArg2) + 2.0 * h + timeAnim);
      flakePos = flakePos * 0.8 + 0.1 + fpos;

      float toIntersection = dot(flakePos - pos, camK) * invRayDotCamK;

      if (toIntersection > 0.0) {
        vec3 testPos = pos + ray * toIntersection - flakePos;
        float testX = dot(testPos, camI);
        float testY = dot(testPos, camJ);
        vec2 testUV = abs(vec2(testX, testY));

        float depth = dot(flakePos - camPos, camK);
        float flakeSize = max(uFlakeSize, uMinFlakeSize * depth * halfInvResX);

        float dist;
        if (uVariant < 0.5) {
          dist = max(testUV.x, testUV.y);
        } else if (uVariant < 1.5) {
          dist = length(testUV);
        } else {
          float invFlakeSize = 1.0 / flakeSize;
          dist = snowflakeDist(vec2(testX, testY) * invFlakeSize) * flakeSize;
        }

        if (dist < flakeSize) {
          float flakeSizeRatio = uFlakeSize / flakeSize;
          float intensity = exp2(-(t + toIntersection) * invDepthFade) *
                           min(1.0, flakeSizeRatio * flakeSizeRatio) * uBrightness;
          gl_FragColor = vec4(uColor * pow(vec3(intensity), vec3(uGamma)), 1.0);
          return;
        }
      }
    }

    float nextStep = min(min(phase.x, phase.y), phase.z);
    vec3 sel = step(phase, vec3(nextStep));
    phase = phase - nextStep + strides * sel;
    t += nextStep;
    pos = mix(pos + ray * nextStep, floor(pos + ray * nextStep + 0.5), sel);
  }

  gl_FragColor = vec4(0.0);
}
`;

const VARIANTS = { square: 0.0, round: 1.0, snowflake: 2.0 };

export class PixelSnow {
  /**
   * @param {HTMLElement} container  an empty, positioned element this fills
   *   with a canvas — see .pixel-snow-layer in style.css.
   * @param {object} [opts] — same defaults as the React component's props.
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.color = opts.color ?? '#ffffff';
    this.variant = VARIANTS[opts.variant ?? 'square'] ?? 0.0;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false, alpha: true, premultipliedAlpha: false,
      powerPreference: 'high-performance', stencil: false, depth: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const w = container.offsetWidth || window.innerWidth;
    const h = container.offsetHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const c = new THREE.Color(this.color);
    this.material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(w, h) },
        uFlakeSize: { value: opts.flakeSize ?? 0.01 },
        uMinFlakeSize: { value: opts.minFlakeSize ?? 1.25 },
        uPixelResolution: { value: opts.pixelResolution ?? 200 },
        uSpeed: { value: opts.speed ?? 1.25 },
        uDepthFade: { value: opts.depthFade ?? 8 },
        uFarPlane: { value: opts.farPlane ?? 20 },
        uColor: { value: new THREE.Vector3(c.r, c.g, c.b) },
        uBrightness: { value: opts.brightness ?? 1 },
        uGamma: { value: opts.gamma ?? 0.4545 },
        uDensity: { value: opts.density ?? 0.3 },
        uVariant: { value: this.variant },
        uDirection: { value: ((opts.direction ?? 125) * Math.PI) / 180 }
      },
      transparent: true
    });

    this.geometry = new THREE.PlaneGeometry(2, 2);
    this.scene.add(new THREE.Mesh(this.geometry, this.material));

    // IntersectionObserver (visibility) + debounced resize — same two
    // perf guards the source component uses: skip rendering entirely while
    // off-screen, and coalesce rapid resize events into one.
    this._visible = true;
    this._io = new IntersectionObserver(([entry]) => { this._visible = entry.isIntersecting; }, { threshold: 0 });
    this._io.observe(container);

    this._resizeTimer = 0;
    this._onResize = () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this._doResize(), 100);
    };
    window.addEventListener('resize', this._onResize);

    this._startTime = performance.now();
    this._raf = 0;
    this._animate = this._animate.bind(this);
    this._raf = requestAnimationFrame(this._animate);
  }

  _doResize() {
    const w = this.container.offsetWidth || window.innerWidth;
    const h = this.container.offsetHeight || window.innerHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.material.uniforms.uResolution.value.set(w, h);
  }

  _animate() {
    this._raf = requestAnimationFrame(this._animate);
    if (!this._visible) return;
    this.material.uniforms.uTime.value = (performance.now() - this._startTime) * 0.001;
    this.renderer.render(this.scene, this.camera);
  }

  /** Stops rendering (and the GPU work that goes with it) without tearing
   *  the context down — used while this screen is hidden behind another. */
  setVisible(v) { this._visible = v; }

  dispose() {
    cancelAnimationFrame(this._raf);
    clearTimeout(this._resizeTimer);
    window.removeEventListener('resize', this._onResize);
    this._io.disconnect();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.geometry.dispose();
    this.material.dispose();
  }
}
