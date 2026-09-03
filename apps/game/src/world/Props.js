import * as THREE from 'three';
import { rng, clamp } from '../core/noise.js';

/**
 * Props — instanced terrain scatter, and the interaction beacons.
 *
 * Boulders are the single biggest thing that makes the Schirmacher Oasis read
 * as a real place rather than a noise field: it is a glacially scoured
 * landscape, so it is littered with erratics of every size. 900 of them cost
 * one draw call.
 */

export function scatterBoulders(engine, terrain, { count = 900, seed = 991 } = {}) {
  const r = rng(seed);
  const n = engine.quality === 'low' ? Math.floor(count * 0.45) : count;

  // Three base shapes, deformed per-instance by non-uniform scale + rotation.
  // An icosahedron with jittered vertices reads as weathered rock far better
  // than a sphere, and at 1 subdivision it is only 80 triangles.
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.attributes.position;
  const jr = rng(seed ^ 0x5bf03);
  for (let i = 0; i < p.count; i++) {
    const s = 0.72 + jr() * 0.5;
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.8, p.getZ(i) * s);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x6f6558, roughness: 0.96, metalness: 0.0, flatShading: true
  });

  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();

  const half = terrain.half - 20;
  let placed = 0, tries = 0;

  while (placed < n && tries < n * 8) {
    tries++;
    const x = (r() * 2 - 1) * half;
    const z = (r() * 2 - 1) * half;

    // Keep the graded site clear so it reads as bulldozed, not natural.
    if (Math.hypot(x, z + 10) < 52) continue;
    if (terrain.isGraded?.(x, z)) continue;

    const y = terrain.heightAt(x, z);
    const slope = terrain.slopeAt(x, z);

    // Boulders sit on moderate ground; sheer faces shed them.
    if (slope > 0.85) continue;
    // On the oasis profile, do not scatter into the lake basin.
    if (terrain.lakeLevel !== undefined && y < terrain.lakeLevel + 0.4) continue;

    // Size distribution: mostly small, a few large. Pow() biases the tail.
    const big = Math.pow(r(), 3.2);
    const s = 0.28 + big * 4.2;

    pos.set(x, y - s * 0.28, z);          // sink slightly so nothing floats
    e.set(r() * 0.5, r() * Math.PI * 2, r() * 0.5);
    q.setFromEuler(e);
    scl.set(s * (0.8 + r() * 0.5), s * (0.6 + r() * 0.4), s * (0.8 + r() * 0.5));
    m.compose(pos, q, scl);
    mesh.setMatrixAt(placed, m);

    // Tint variation: iron-stained browns through to pale granite greys.
    const v = r();
    col.setHSL(0.07 + v * 0.04, 0.10 + v * 0.14, 0.26 + v * 0.22);
    mesh.setColorAt(placed, col);

    placed++;
  }

  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  engine.scene.add(mesh);
  return mesh;
}

/**
 * Wind-packed snow drifts — flattened ellipsoids tucked into hollows.
 * Cheap, but they do a lot to break up bare terrain colour.
 */
export function scatterDrifts(engine, terrain, { count = 240, seed = 4242 } = {}) {
  const r = rng(seed);
  const n = engine.quality === 'low' ? Math.floor(count * 0.5) : count;
  const geo = new THREE.SphereGeometry(1, 12, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xeef6fc, roughness: 0.9, metalness: 0.0
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.receiveShadow = true;
  mesh.castShadow = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const half = terrain.half - 30;
  let placed = 0, tries = 0;

  while (placed < n && tries < n * 10) {
    tries++;
    const x = (r() * 2 - 1) * half;
    const z = (r() * 2 - 1) * half;
    const slope = terrain.slopeAt(x, z);
    if (slope > 0.22) continue;                 // drifts need shelter, i.e. flat
    // Graded ground is swept and driven on, so drift never survives there.
    if (terrain.isGraded?.(x, z)) continue;
    const y = terrain.heightAt(x, z);
    if (terrain.lakeLevel !== undefined && y < terrain.lakeLevel + 0.5) continue;

    const sx = 2.4 + r() * 6.5, sz = 2.4 + r() * 6.5, sy = 0.3 + r() * 0.7;
    // Sink most of the ellipsoid so only a low, soft crown shows.
    pos.set(x, y - sy * 0.72, z);
    q.setFromEuler(new THREE.Euler(0, r() * Math.PI, 0));
    scl.set(sx, sy, sz);
    m.compose(pos, q, scl);
    mesh.setMatrixAt(placed++, m);
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  engine.scene.add(mesh);
  return mesh;
}

/**
 * Beacon — the visible marker for an interactable.
 *
 * A vertical light shaft plus a slowly rotating ring. The shaft uses additive
 * blending and a fresnel-ish falloff so it glows without needing volumetrics,
 * and it is deliberately readable from a long way off: children should be able
 * to see where the next thing to do is without a quest arrow nagging them.
 */
export class Beacon {
  constructor(scene, position, { color = 0x5fd9ff, height = 9, radius = 0.5, light = true } = {}) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.collected = false;
    this.color = new THREE.Color(color);

    const shaftGeo = new THREE.CylinderGeometry(radius, radius * 1.25, height, 20, 1, true);
    this.shaftMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: this.color.clone() },
        uTime: { value: 0 },
        uFade: { value: 1 }
      },
      vertexShader: `
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){
          vUv = uv;
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uTime, uFade;
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){
          // Bright at the base, fading upward.
          float vert = pow(1.0 - vUv.y, 1.7);
          // Rim-bright so the cylinder reads as a volume, not a tube.
          float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
          float pulse = 0.72 + 0.28 * sin(uTime * 2.1);
          // Weighted toward the rim so the shaft stays legible from a
          // distance but does not curtain off whatever is behind it.
          float a = vert * (0.10 + rim * 0.62) * pulse * uFade;
          gl_FragColor = vec4(uColor, a);
        }`
    });
    this.shaft = new THREE.Mesh(shaftGeo, this.shaftMat);
    this.shaft.position.y = height / 2;
    this.group.add(this.shaft);

    // Ground ring.
    const ringGeo = new THREE.RingGeometry(radius * 1.5, radius * 1.9, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: this.color, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.position.y = 0.06;
    this.group.add(this.ring);

    // A small point light gives nearby geometry a coloured kick, which sells
    // the beacon as an actual light source rather than a decal. On weak
    // devices this is skipped entirely: a site typically has 20-30
    // interactables, i.e. 20-30 simultaneous real-time lights, and three.js's
    // default forward renderer loops over every scene light for every
    // fragment of every standard-material object — that shading cost is
    // additive to (and roughly as expensive as) the site's draw-call count,
    // and unlike resolution/shadows it isn't touched by the quality tiers in
    // Engine.js. The shaft + ring glow (ShaderMaterial/additive, not a real
    // THREE.Light) still reads as a beacon without it.
    this.light = light ? new THREE.PointLight(color, 2.2, 12, 2) : null;
    if (this.light) {
      this.light.position.y = 1.4;
      this.group.add(this.light);
    }

    scene.add(this.group);
  }

  update(dt, elapsed) {
    this.shaftMat.uniforms.uTime.value = elapsed;
    this.ring.rotation.y += dt * 0.55;
    const pulse = 0.75 + 0.25 * Math.sin(elapsed * 2.1);
    if (this.light) this.light.intensity = (this.collected ? 0.5 : 2.2) * pulse;
    this.ringMat.opacity = (this.collected ? 0.18 : 0.7) * pulse;
  }

  /** Dim to a "already collected" state rather than vanishing, so the world
   *  keeps a record of where you have been. */
  markCollected() {
    this.collected = true;
    this.color.setHex(0x3f6b7a);
    this.shaftMat.uniforms.uColor.value.setHex(0x3f6b7a);
    this.shaftMat.uniforms.uFade.value = 0.25;
    this.ringMat.color.setHex(0x3f6b7a);
    if (this.light) this.light.color.setHex(0x3f6b7a);
  }

  dispose(scene) {
    scene.remove(this.group);
    this.shaft.geometry.dispose(); this.shaftMat.dispose();
    this.ring.geometry.dispose(); this.ringMat.dispose();
  }
}
