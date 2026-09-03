import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * bake.js — collapse a static subtree into one mesh per material.
 *
 * A station exterior is built the readable way: a mesh per stilt, per beam,
 * per cross-brace, per cladding band, per drum, per container. Maitri came to
 * 817 draw calls before anything inside it was even considered, and every one
 * of those calls is CPU work the browser does on the main thread, every frame,
 * whether the GPU is busy or not. That is why an RTX 4060 was sitting at 21
 * fps: the bottleneck was never fill rate, it was submission.
 *
 * Nothing on a building moves, so it can all be baked. What CAN move is marked
 * `userData.keep` by the caller — doors, NPCs, vehicles, flags, and the
 * interior room groups, which must stay separate because the culler switches
 * them individually.
 *
 * Merging bakes each mesh's world transform into its vertices, so the result
 * must be added to a group with an identity transform — which is why this
 * takes the root it is baking and puts the merged meshes straight back on it.
 */

/** True when this object, or anything above it, is marked to survive. */
function isKept(o, root) {
  for (let p = o; p && p !== root.parent; p = p.parent) {
    if (p.userData && p.userData.keep) return true;
  }
  return false;
}

/**
 * @param {THREE.Object3D} root
 * @param {object} [opts]
 * @param {number} [opts.min]  don't bother below this many meshes
 * @returns {{ before:number, after:number }}
 */
export function bakeStatic(root, opts = {}) {
  // Escape hatch for the offline QA harness. Baking collapses the whole
  // exterior into ~15 meshes, which is the entire point in the game -- but it
  // also destroys every individual prop's identity, so the floating-prop
  // detector run against a baked station sees fifteen enormous merged meshes
  // and reports a clean bill of health no matter how many crates are hovering
  // a metre off the ground. That is exactly why the sheds outside Maitri kept
  // passing QA while visibly being wrong on screen.
  if (globalThis.__QA_NOBAKE) return { before: 0, after: 0 };
  const min = opts.min ?? 8;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();

  const victims = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (!o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
    if (isKept(o, root)) return;
    victims.push(o);
  });
  if (victims.length < min) return { before: victims.length, after: victims.length };

  const byMat = new Map();
  for (const o of victims) {
    const g = o.geometry.clone();
    // Relative to the root, so the merged mesh can sit on the root unchanged.
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (g.index) g.setIndex(Array.from(g.index.array));
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const key = mats[0];
    if (!key) continue;
    if (!byMat.has(key)) byMat.set(key, []);
    byMat.get(key).push(g);
  }

  for (const o of victims) o.parent?.remove(o);

  let after = 0;
  for (const [m, geos] of byMat) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) {
      for (const g of geos) { root.add(new THREE.Mesh(g, m)); after++; }
      continue;
    }
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.baked = true;
    root.add(mesh);
    after++;
  }
  return { before: victims.length, after };
}

/** Mark a subtree so bakeStatic leaves it alone. */
export function keepDynamic(obj) {
  if (obj) obj.userData.keep = true;
  return obj;
}
