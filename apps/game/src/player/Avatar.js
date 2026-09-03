import * as THREE from 'three';
import { bakeStatic, keepDynamic } from '../core/bake.js';
import { fabric } from '../stations/kit.js';

const _matCache = new Map();
function cachedMat(key, make) {
  if (!_matCache.has(key)) _matCache.set(key, make());
  return _matCache.get(key);
}

/**
 * Avatar / Character — a procedural expedition-member figure.
 *
 * `buildCharacter()` is the shared builder behind every NPC in the world
 * (the player is always first-person and has no body of their own to
 * render). It returns named part references (`parts.armR`, `parts.head`,
 * ...) so a caller can drive simple procedural animation — an arm stirring
 * a pot, a head tilted over a clipboard — without needing a rigged/skinned
 * mesh. That is a real scope cut (no skeletal animation), but it is enough
 * for "a figure that is visibly doing something" at the distance this game
 * is ever viewed from, and it costs nothing beyond a few extra Object3D
 * transforms per frame.
 *
 * Facing convention: despite the name, the modelled face (nose/eyes/goggles,
 * all built at local z ≈ +0.15) actually looks down local +Z, not −Z. A
 * stationary buildNPC() never exposed this — nobody notices which way a
 * standing figure's nose points — but anything that *moves* and tries to
 * face its own direction of travel using Player.forward()'s −Z convention
 * will walk facing the way it came from instead. See the matching note in
 * NPCs.js's buildFieldTeam/buildSupplyCrew, which face +Z correctly.
 */
export function buildCharacter(opts = {}) {
  const {
    parka = 0xe0611f,
    parkaDark = 0x8a3a12,
    trouserColor = 0x22262b,
    hoodOn = true,
    pack = false,
    // Goggles default to whatever the hood does — a hood-up figure reads as
    // dressed for outside, and outside is exactly where ski goggles belong;
    // a caller can still force either explicitly (e.g. an indoor character
    // who happens to have their hood up for warmth but no goggles on).
    goggles = hoodOn,
    skin = 0xc48a63
  } = opts;

  const g = new THREE.Group();
  const parts = {};

  // Cloth gets a woven canvas texture instead of a flat colour fill — see
  // kit.js's fabric() — so a parka reads as an actual garment under close
  // light rather than a solid-colour plastic shell. Hex numbers need a
  // '#rrggbb' string for the canvas fillStyle the texture is built from.
  const hex = n => '#' + n.toString(16).padStart(6, '0');

  // Every field team / crowd of NPCs shares a small handful of "looks"
  // (technician orange, scientist blue, ...), and nine of these thirteen
  // materials never vary at all — they're hardcoded colours regardless of
  // opts. Without caching, every single buildCharacter() call minted all
  // thirteen fresh, so a 10-15 character site carried 130-200 materials for
  // clothing alone. Keying by colour and sharing across every character
  // (module-scope cache, same pattern as kit.js's texture/MAT caches) cuts
  // that to one material per distinct colour actually used, everywhere.
  const mParka = cachedMat(`parka-${parka}`, () => new THREE.MeshStandardMaterial({ map: fabric(hex(parka)), roughness: 0.8 }));
  const mParkaDark = cachedMat(`parkaDark-${parkaDark}`, () => new THREE.MeshStandardMaterial({ map: fabric(hex(parkaDark)), roughness: 0.85 }));
  const mTrouser = cachedMat(`trouser-${trouserColor}`, () => new THREE.MeshStandardMaterial({ map: fabric(hex(trouserColor)), roughness: 0.88 }));
  const mBoot = cachedMat('boot', () => new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.7 }));
  const mSole = cachedMat('sole', () => new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.95 }));
  const mSkin = cachedMat(`skin-${skin}`, () => new THREE.MeshStandardMaterial({ color: skin, roughness: 0.85 }));
  const mHood = cachedMat('hood', () => new THREE.MeshStandardMaterial({ map: fabric('#6b2f0f'), roughness: 0.9 }));

  // A cream fur-trim / cuff tone reused wherever the parka needs a lighter
  // accent — the one detail every real expedition parka has that a flat
  // block of colour doesn't, and it is what actually reads as "clothing"
  // rather than "a coloured capsule" from a few metres away.
  const mFur = cachedMat('fur', () => new THREE.MeshStandardMaterial({ color: 0xe8ddc7, roughness: 0.95 }));
  const mEye = cachedMat('eye', () => new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.4 }));
  const mBrow = cachedMat('brow', () => new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.8 }));
  const mHair = cachedMat('hair', () => new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.85 }));
  const mGoggle = cachedMat('goggle', () => new THREE.MeshStandardMaterial({ color: 0x1a2530, roughness: 0.25, metalness: 0.3 }));
  const mGoggleLens = cachedMat('goggleLens', () => new THREE.MeshPhysicalMaterial({
    color: 0x2a8fb0, roughness: 0.15, metalness: 0.1, transmission: 0.35, thickness: 0.02
  }));

  const legs = new THREE.Group();
  const HIP_Y = 0.82;   // where the leg cylinder's own top edge sits
  for (const side of [-1, 1]) {
    // Thigh, boot, sole and cuff all hang off one hip-pivot group instead of
    // sitting as independent siblings at fixed heights. A sibling layout is
    // fine for a figure that never rotates its legs, but the moment
    // something DOES rotate `parts.legL/legR` — a technician crouching, a
    // field-team member walking — rotating just the thigh cylinder swings it
    // away from a boot that stays exactly where it was, i.e. the leg and the
    // foot visibly disconnect. Pivoting the whole assembly at the hip (the
    // one point a real leg actually bends from) means any rotation swings
    // thigh + boot + sole + cuff together as one limb.
    const hip = new THREE.Group();
    hip.position.set(side * 0.13, HIP_Y, 0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.115, 0.82, 8), mTrouser);
    leg.position.set(0, -0.41, 0);
    leg.castShadow = true;
    hip.add(leg);
    const bootMesh = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.13, 0.31), mBoot);
    bootMesh.position.set(0, 0.065 - HIP_Y, 0.045);
    bootMesh.castShadow = true;
    hip.add(bootMesh);
    // Sole — a thin dark slab under the boot, the detail that stops a boot
    // reading as "the leg's colour changed" and makes it read as footwear.
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.03, 0.33), mSole);
    sole.position.set(0, -HIP_Y, 0.045);
    hip.add(sole);
    // Boot-top cuff — a thin light band where trouser meets boot, the same
    // trick real cold-weather boots use so the leg doesn't read as one
    // undifferentiated cylinder.
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.108, 0.05, 8), mFur);
    cuff.position.set(0, 0.13 - HIP_Y, 0);
    hip.add(cuff);
    legs.add(hip);
    parts[side < 0 ? 'legL' : 'legR'] = hip;
  }
  g.add(legs);

  // Torso: a shoulder block and a slightly narrower waist block stacked
  // together, rather than one uniform box — the single change that most
  // stops the upper body reading as "a crate with arms". Both pieces are
  // grouped under `torso` so animation code driving parts.torso still
  // rotates the whole upper body as one unit.
  const torso = new THREE.Group();
  torso.position.set(0, 1.14, 0);
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.34, 0.33), mParka);
  shoulders.position.y = 0.13;
  shoulders.castShadow = true;
  torso.add(shoulders);
  const waist = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.32, 0.3), mParka);
  waist.position.y = -0.19;
  waist.castShadow = true;
  torso.add(waist);
  g.add(torso);
  parts.torso = torso;

  // Centre zip — a thin dark vertical strip down the front, breaking up the
  // torso further into "a garment with a closure" instead of two flat boxes.
  const zip = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, 0.58, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5, metalness: 0.4 })
  );
  zip.position.set(0, 0, 0.17);
  torso.add(zip);
  // Chest pocket flaps — a small asymmetric detail real parkas always have,
  // and asymmetry alone helps a silhouette read as "a garment" not "a box".
  for (const [sx, sy] of [[-0.14, 0.02], [0.14, 0.02]]) {
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.02), mParkaDark);
    pocket.position.set(sx, sy, 0.175);
    torso.add(pocket);
  }

  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.08, 0.33), mParkaDark);
  trim.position.set(0, 0.86, 0);
  g.add(trim);

  // Neck gaiter — a short ring at the collar, the accent colour that keeps
  // the head from looking like it just balances directly on the torso box.
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.14, 0.09, 10), mParkaDark);
  collar.position.set(0, 1.48, 0);
  g.add(collar);

  // Tricolour shoulder patch — a small identity detail tying every
  // character back to the game's own theme, the same way a real
  // expedition member's kit carries a flag patch. Three stacked strips
  // rather than a single textured plane — simplest way to get a readable
  // tricolour at this scale without generating another canvas texture.
  const patchGroup = new THREE.Group();
  const bandH = 0.02;
  const bandColors = [0xff9933, 0xffffff, 0x128807];
  bandColors.forEach((c, i) => {
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(0.09, bandH),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })
    );
    band.position.y = (1 - i) * bandH;
    patchGroup.add(band);
  });
  patchGroup.position.set(0.28, 1.28, 0.09);
  patchGroup.rotation.y = -0.3;
  g.add(patchGroup);

  // Arms are pivoted groups at the shoulder so animation can just set
  // rotation.x/z on `parts.armL` / `parts.armR` directly.
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.29, 1.38, 0);
    arm.rotation.z = side * 0.12;
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.078, 0.48, 8), mParka);
    upper.position.y = -0.24;
    upper.castShadow = true;
    arm.add(upper);
    // Wrist cuff, matching the boot-tops — same reasoning, same material.
    const wristCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.035, 8), mFur);
    wristCuff.position.y = -0.46;
    arm.add(wristCuff);
    const hand = new THREE.Group();
    hand.position.y = -0.48;
    // A mitten box instead of a bare sphere — cold-weather gloves are boxy
    // and padded, not round, and the flat faces catch light in a way that
    // reads as an actual object in the hand rather than a fist-shaped blob.
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.15), mParkaDark);
    glove.position.y = -0.03;
    glove.castShadow = true;
    hand.add(glove);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.05, 4, 6), mParkaDark);
    thumb.rotation.z = side * 0.9;
    thumb.position.set(side * 0.075, -0.02, 0.02);
    hand.add(thumb);
    arm.add(hand);
    g.add(arm);
    parts[side < 0 ? 'armL' : 'armR'] = arm;
    parts[side < 0 ? 'handL' : 'handR'] = hand;
  }

  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), mSkin);
  face.castShadow = true;
  head.add(face);

  // Eyebrows — a short dark bar above each eye. On their own they do more
  // for "this has an expression" than the eyes themselves; a face with eyes
  // but no brows reads as startled/blank no matter how you angle it.
  for (const side of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.01), mBrow);
    brow.position.set(side * 0.055, 0.035, 0.152);
    brow.rotation.z = side * 0.18;
    head.add(brow);
  }
  // A small nose bump — subtle, but it's what stops the face reading as
  // perfectly flat/spherical in profile.
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), mSkin);
  nose.position.set(0, -0.02, 0.157);
  head.add(nose);

  if (goggles) {
    // Ski goggles: a dark frame band wrapping the upper face with a tinted
    // lens window, plus a strap around the head — the single most
    // recognisable "dressed for outside, at altitude, in the cold" cue,
    // and it covers the eye-dot detail that reads a little blank on its own.
    const frame = new THREE.Mesh(
      new THREE.TorusGeometry(0.075, 0.028, 8, 6, Math.PI),
      mGoggle
    );
    frame.rotation.set(0, Math.PI, Math.PI / 2);
    frame.position.set(0, 0.015, 0.155);
    head.add(frame);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI), mGoggleLens);
    lens.rotation.set(-Math.PI / 2, 0, 0);
    lens.scale.set(1, 0.62, 0.5);
    lens.position.set(0, 0.015, 0.175);
    head.add(lens);
    const strap = new THREE.Mesh(
      new THREE.TorusGeometry(0.165, 0.014, 6, 12, Math.PI),
      mGoggle
    );
    strap.rotation.set(0, Math.PI, Math.PI / 2);
    strap.position.set(0, 0.015, -0.02);
    head.add(strap);
  } else {
    // No goggles: two small dark eye dots, same as before — plain but
    // legible, and correct for an indoor character who wouldn't be wearing
    // snow goggles at a desk.
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), mEye);
      eye.position.set(side * 0.055, 0.01, 0.148);
      head.add(eye);
    }
  }

  if (hoodOn) {
    const hoodMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.72),
      mHood
    );
    hoodMesh.position.set(0, 0.04, -0.02);
    hoodMesh.castShadow = true;
    head.add(hoodMesh);
    // Fur ruff around the hood opening — the iconic cold-weather-parka
    // detail, and it also nicely frames the face it would otherwise leave
    // as a bare disc surrounded by flat hood colour.
    const ruff = new THREE.Mesh(
      new THREE.TorusGeometry(0.185, 0.035, 8, 14, Math.PI * 1.5),
      mFur
    );
    ruff.rotation.x = Math.PI / 2;
    ruff.rotation.z = Math.PI * 0.25;
    ruff.position.set(0, 0.01, 0.11);
    head.add(ruff);
  } else {
    // No hood: give the head hair rather than leaving it a bare skin-toned
    // dome, which read as unfinished more than "hood down".
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.165, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      mHair
    );
    hair.position.set(0, 0.045, -0.01);
    hair.castShadow = true;
    head.add(hair);
  }
  g.add(head);
  parts.head = head;

  if (pack) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.16), mParkaDark);
    bag.position.set(0, 1.12, 0.22);
    bag.castShadow = true;
    g.add(bag);
    // A strap across the chest so the pack reads as worn, not glued on.
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.34), mFur);
    strap.position.set(-0.16, 1.2, 0.1);
    strap.rotation.z = 0.35;
    g.add(strap);
  }

  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });

  // BAKE THE RIG. A character is 34-40 separate meshes — parka panels, zip,
  // pockets, boot, sole, cuff, glove, thumb, goggles, brow — and nine of them
  // on screen is ~330 draw calls, which is more than the entire station
  // exterior costs after baking.
  //
  // Only the rig NODES animate (head, torso, the two arms, the two hip
  // pivots, the two hands); everything under each of them is rigid relative
  // to it. So each node's contents collapse to one mesh per material, the
  // node itself keeps animating, and the character looks and moves exactly as
  // before. The first attempt at this cost instead hid NPCs beyond 55 m,
  // which in a 60 m building meant the person you were walking toward
  // vanished — optimising away the one thing the game is actually about.
  const rig = ['head', 'torso', 'armL', 'armR', 'legL', 'legR', 'handL', 'handR'];
  for (const key of rig) if (parts[key]) bakeStatic(parts[key], { min: 2 });
  for (const key of rig) if (parts[key]) keepDynamic(parts[key]);
  bakeStatic(g, { min: 2 });

  g.userData.parts = parts;
  return g;
}
