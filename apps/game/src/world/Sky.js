import * as THREE from 'three';

/**
 * Sky — a shader dome plus the lighting rig.
 *
 * Antarctic light is genuinely different and worth getting right, because it
 * is the first thing that sells the place:
 *
 *  - The sun sits LOW even at midday. In polar summer it circles the horizon
 *    rather than rising overhead, so shadows are long and almost horizontal
 *    all "day". Sun altitude here is driven from the per-station data.
 *  - Bounce light dominates. Snow reflects ~85% of the light hitting it
 *    (albedo 0.8–0.9), so the ground throws almost as much light back up as
 *    the sky sends down. That is what kills the harsh contrast you would get
 *    on a desert at the same sun angle, and it is why a HemisphereLight with
 *    a bright ground colour matters more here than in any other setting.
 *  - The whole scene is cool-biased, with a warm rim only near the sun.
 */
export class Sky {
  constructor(engine, cfg = {}) {
    this.engine = engine;
    this.scene = engine.scene;

    this.sunAlt = cfg.sunAlt ?? 14;    // degrees above horizon
    this.sunAzi = cfg.sunAzi ?? 208;   // degrees, clockwise from north
    this.tint = new THREE.Color(cfg.skyTint ?? 0x9fc4e8);
    this.overcast = cfg.overcast ?? 0.25;

    this._buildDome();
    this._buildLights();
    this._buildStars();
    this.setSun(this.sunAlt, this.sunAzi);
  }

  /* ------------------------------------------------------------------ dome */
  _buildDome() {
    const geo = new THREE.SphereGeometry(4200, 48, 24);
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uSun:       { value: new THREE.Vector3(0, 0.2, -1) },
        uZenith:    { value: new THREE.Color(0x1c4f80) },
        uHorizon:   { value: new THREE.Color(0xbcd8ef) },
        uGround:    { value: new THREE.Color(0xdfeaf2) },
        uSunColor:  { value: new THREE.Color(0xfff0d8) },
        uOvercast:  { value: this.overcast },
        uAurora:    { value: 0.0 },
        uTime:      { value: 0.0 }
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        uniform vec3  uSun, uZenith, uHorizon, uGround, uSunColor;
        uniform float uOvercast, uAurora, uTime;

        // cheap hash-based value noise for the aurora curtain
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float vnoise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                     mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
        }

        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;

          // Vertical gradient. pow() shapes how tightly the bright band hugs
          // the horizon — low sun means a very wide, soft band.
          float t = clamp(h, 0.0, 1.0);
          vec3 col = mix(uHorizon, uZenith, pow(t, 0.62));

          // Below the horizon line, fade into the reflected snow field so the
          // dome never shows an ugly hard edge where it meets the terrain.
          col = mix(col, uGround, smoothstep(0.0, -0.14, h));

          // Forward scattering: a broad warm halo around the sun, plus a
          // tight core. Real polar air is full of ice crystals, which makes
          // this halo much wider than it would be in temperate air.
          float mu = max(dot(d, normalize(uSun)), 0.0);
          float halo = pow(mu, 6.0) * 0.55 + pow(mu, 60.0) * 0.9;
          col += uSunColor * halo * (1.0 - uOvercast * 0.6);

          // Overcast flattens everything toward a uniform luminous grey —
          // the "whiteout" condition where the horizon disappears entirely.
          col = mix(col, vec3(0.80,0.85,0.90), uOvercast * 0.55);

          // Aurora curtain: vertical bands rippling along the southern sky.
          if (uAurora > 0.001) {
            float band = vnoise(vec2(atan(d.z,d.x)*2.6 + uTime*0.06, h*3.0 - uTime*0.02));
            float curtain = smoothstep(0.30, 0.85, band) * smoothstep(-0.02, 0.42, h) * smoothstep(0.95, 0.35, h);
            vec3 aur = mix(vec3(0.15,1.0,0.55), vec3(0.35,0.55,1.0), band);
            col += aur * curtain * uAurora;
          }

          // NOTE: deliberately no <tonemapping_fragment> / <colorspace_fragment>.
          // When three renders into a render target (which EffectComposer always
          // does) it omits the tone-mapping function from the program entirely —
          // including the chunk here makes the shader reference an undefined
          // function, the program fails to link, and the whole sky renders black.
          // The composer's OutputPass applies tone mapping and sRGB at the end,
          // so this shader must emit LINEAR colour and nothing else.
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    this.dome = new THREE.Mesh(geo, this.mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    this.scene.add(this.dome);
  }

  /* ---------------------------------------------------------------- lights */
  _buildLights() {
    // Key light = the sun. Warm, low, and the only shadow caster.
    this.sun = new THREE.DirectionalLight(0xfff2dd, 3.4);
    this.sun.castShadow = true;
    const s = this.engine.shadowSize;
    this.sun.shadow.mapSize.set(s, s);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 900;
    // 190 m of shadow frustum spread a 2048 map over a 380 m square — about
    // 5 texels per metre, which is both blurry AND expensive, because every
    // caster in that whole square has to be re-rendered whenever the map is
    // refreshed. 80 m covers everything you can actually see shadow detail on
    // and quadruples the effective resolution.
    const ext = 80;
    Object.assign(this.sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext });
    // Low sun + long shadows = severe acne unless the bias is tuned. Normal
    // bias handles sloped terrain far better than a flat depth bias here.
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.9;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Snow bounce. Ground colour is nearly as bright as the sky colour —
    // this single light is what makes the scene read as snow rather than sand.
    this.hemi = new THREE.HemisphereLight(0xbcdcf6, 0xe6eef5, 1.45);
    this.scene.add(this.hemi);

    // A very slight fill from the anti-sun side stops deep shadow faces from
    // going to flat black under ACES.
    this.fill = new THREE.DirectionalLight(0xbcd6f0, 0.55);
    this.scene.add(this.fill);

    this.ambient = new THREE.AmbientLight(0x4e6a86, 0.55);
    this.scene.add(this.ambient);

    // Distance haze. Antarctic air is exceptionally clear, so this is subtle —
    // far enough out that it hides the terrain edge without looking foggy.
    // Density comes from the quality tier, because it is half of the draw
    // distance contract (Engine._applyQualityCaps). At the old 0.00058 you
    // could see about 1.7 km, which is why nothing could ever be culled.
    this._fogBase = this.engine.fogDensity ?? 0.0034;
    this.scene.fog = new THREE.FogExp2(0xd2e2ef, this._fogBase);
  }

  /* ----------------------------------------------------------------- stars */
  _buildStars() {
    const N = 1400;
    const pos = new Float32Array(N * 3);
    const siz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // Only place stars above the horizon; below is terrain anyway.
      const u = Math.random(), v = Math.random() * 0.5;
      const theta = u * Math.PI * 2, phi = Math.acos(1 - 2 * (0.5 + v * 0.5));
      const r = 3900;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(phi));
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      siz[i] = 4 + Math.random() * 12;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(siz, 1));

    this.starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: `
        attribute float size; varying float vS;
        void main(){
          vS = size;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uOpacity; varying float vS;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.06, d) * uOpacity;
          gl_FragColor = vec4(vec3(0.9,0.95,1.0), a);
        }`
    });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -999;
    this.scene.add(this.stars);
  }

  /* ------------------------------------------------------------------- api */
  setSun(altDeg, aziDeg) {
    this.sunAlt = altDeg; this.sunAzi = aziDeg;
    const alt = THREE.MathUtils.degToRad(altDeg);
    const azi = THREE.MathUtils.degToRad(aziDeg);
    const dir = new THREE.Vector3(
      Math.cos(alt) * Math.sin(azi),
      Math.sin(alt),
      Math.cos(alt) * Math.cos(azi)
    );
    this.sunDir = dir;
    this.mat.uniforms.uSun.value.copy(dir);

    this.sun.position.copy(dir).multiplyScalar(420);
    this.sun.target.position.set(0, 0, 0);
    this.fill.position.copy(dir).multiplyScalar(-300).setY(120);

    // Warmth and intensity fall off hard as the sun approaches the horizon,
    // the same way a sunset does — just stretched over hours instead of minutes.
    const k = THREE.MathUtils.clamp(altDeg / 25, 0, 1);
    // Night, 0..1, ramps up as the sun sinks below the horizon and is fully
    // saturated once it reaches the station's trough altitude. Computed
    // before the colour/intensity work below because everything from the
    // sky dome's horizon band (which dominates the screen at a normal,
    // near-level pitch — the zenith darkening alone was invisible from eye
    // height) to the fill/ambient lights needs to fade with it, or "night"
    // only shows up as a slightly darker patch directly overhead while the
    // rest of the world still reads as broad daylight.
    const night = THREE.MathUtils.clamp(-altDeg / 8, 0, 1);

    // Stored separately from this.sun.intensity itself: setOvercast() derives
    // the actual displayed intensity from this baseline every time it's
    // called (which now happens every frame, driven by the blizzard system),
    // rather than multiplying the previous frame's already-dimmed value —
    // that compounding would decay the sun toward black within seconds.
    this._clearSunIntensity = (0.8 + 2.7 * k) * (1 - night * 0.95);
    this.sun.intensity = this._clearSunIntensity * (1 - this.overcast * 0.5);
    this.sun.color.setHSL(0.09, 0.42 * (1 - k) + 0.06, 0.62 + 0.16 * k);

    const zenithL = THREE.MathUtils.lerp(0.16 + 0.20 * k, 0.025, night);
    const horizonL = THREE.MathUtils.lerp(0.52 + 0.22 * k, 0.045, night);
    const groundL = THREE.MathUtils.lerp(0.90, 0.05, night);
    this.mat.uniforms.uZenith.value.setHSL(0.60, 0.5 - 0.1 * (1 - k) - 0.25 * night, zenithL);
    this.mat.uniforms.uHorizon.value.setHSL(0.56 + 0.04 * (1 - k), 0.35 - 0.15 * night, horizonL);
    this.mat.uniforms.uGround.value.setHSL(0.58, 0.15, groundL);

    // Night: below the horizon we fade the stars in and let the aurora run.
    this.starMat.uniforms.uOpacity.value = night;
    this.mat.uniforms.uAurora.value = night * 0.9;
    this.hemi.intensity = 1.45 * (1 - night * 0.82);
    this.fill.intensity = 0.55 * (1 - night * 0.75);
    this.ambient.intensity = 0.55 * (1 - night * 0.5) + 0.12 * night;

    // NOT every frame. shadowMap.autoUpdate is off precisely so this pass is
    // not paid 60 times a second, and calling refreshShadows() unconditionally
    // here quietly undid that — a full extra scene render, every frame, of
    // every shadow caster in the frustum. Refresh only when the sun has
    // actually swung far enough for the shadows to be visibly wrong.
    // Rate-limited as well as angle-limited. The in-game sun sweeps a full
    // 360 degrees per day, and setSun() is called five times a second, so an
    // angle test alone tripped a complete shadow re-render every couple of
    // seconds — a full extra pass over every caster, forever, whether the
    // player was moving or not. Shadows this soft, from a sun this low, do not
    // need re-baking more than once every few seconds.
    const now = performance.now();
    const angleMoved = !this._lastShadowDir || this._lastShadowDir.dot(this.sunDir) < 0.998;
    if (angleMoved && now - (this._lastShadowBake || 0) > 4000) {
      this._lastShadowBake = now;
      this._lastShadowDir = this.sunDir.clone();
      // The light has moved, so the snapped centre has to be re-applied with
      // the new direction — clear it so the next follow() does the work.
      this._shadowAt = null;
      this.engine.refreshShadows();
    }
  }

  setOvercast(v) {
    this.overcast = THREE.MathUtils.clamp(v, 0, 1);
    this.mat.uniforms.uOvercast.value = this.overcast;
    // Absolute, derived from the clear-sky baseline every call — safe to
    // call every frame (the blizzard system does) without the dimming
    // compounding on itself.
    this.sun.intensity = (this._clearSunIntensity ?? this.sun.intensity) * (1 - this.overcast * 0.5);
    this.scene.fog.density = this._fogBase + this.overcast * 0.0042;
  }

  /**
   * Keep the shadow frustum centred on the player so it never runs out.
   *
   * SNAPPED TO A GRID, and this is the whole point. Following the player
   * continuously means the shadow camera moves every frame, so the shadow map
   * is different every frame, so it has to be re-rendered every frame — a
   * second full pass over every caster, and the single biggest reason the game
   * was smooth standing still and stuttered the moment you walked. Quantising
   * the centre to a 12 m grid means it only actually moves a few times as you
   * cross the site, and only those frames pay for a refresh. It also removes
   * shadow shimmer, because the texel grid stops sliding under the geometry.
   */
  follow(target) {
    // 24 m, not 12. Every time this grid cell changes the whole shadow map is
    // re-rendered — a full extra pass over every caster in one frame, which is
    // exactly the periodic hitch you feel while walking a long approach.
    // Doubling the cell halves how often that frame happens; the 80 m frustum
    // is comfortably big enough to absorb the extra slack.
    const G = 24;
    const sx = Math.round(target.x / G) * G;
    const sz = Math.round(target.z / G) * G;
    if (this._shadowAt && this._shadowAt.x === sx && this._shadowAt.z === sz) return;
    this._shadowAt = { x: sx, z: sz };
    const c = new THREE.Vector3(sx, target.y, sz);
    this.sun.position.copy(this.sunDir).multiplyScalar(420).add(c);
    this.sun.target.position.copy(c);
    this.sun.target.updateMatrixWorld();
    this.engine.refreshShadows();
  }

  update(dt, elapsed) {
    this.mat.uniforms.uTime.value = elapsed;
  }
}
