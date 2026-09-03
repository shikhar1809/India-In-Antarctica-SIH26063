import * as THREE from 'three';

/**
 * Direct port of the game's src/player/Avatar.js `buildCharacter()` +
 * src/stations/kit.js `fabric()` — same geometry, same materials, same
 * proportions, so a scientist sees exactly the figure the game builds for
 * every NPC. Trimmed to only the hoodOn:false / goggles:false branches
 * (what the scientist role actually uses) since the portal never needs a
 * hooded/goggled variant.
 */

const texCache = new Map<string, THREE.CanvasTexture>();

function fabric(color: string): THREE.CanvasTexture {
  const cached = texCache.get(color);
  if (cached) return cached;

  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.07)';
  g.lineWidth = 1;
  for (let i = -128; i < 128; i += 6) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 128, 128);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let i = -128; i < 128; i += 6) {
    g.beginPath();
    g.moveTo(i + 3, 0);
    g.lineTo(i + 131, 128);
    g.stroke();
  }
  for (let i = 0; i < 90; i++) {
    g.globalAlpha = 0.035 + Math.random() * 0.05;
    g.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
    g.beginPath();
    g.arc(Math.random() * 128, Math.random() * 128, 3 + Math.random() * 7, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  texCache.set(color, t);
  return t;
}

export interface CharacterParts {
  legL: THREE.Group;
  legR: THREE.Group;
  torso: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  handL: THREE.Group;
  handR: THREE.Group;
  head: THREE.Group;
}

export interface CharacterOptions {
  parka?: number;
  parkaDark?: number;
  trouserColor?: number;
  skin?: number;
  hairColor?: number;
}

export function buildCharacter(opts: CharacterOptions = {}): { group: THREE.Group; parts: CharacterParts } {
  const {
    parka = 0xdfe6ea,
    parkaDark = 0x9fb0ba,
    trouserColor = 0x1c2530,
    skin = 0xc48a63,
    hairColor = 0x2a1c12
  } = opts;

  const g = new THREE.Group();
  const parts: Partial<CharacterParts> = {};

  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  const mParka = new THREE.MeshStandardMaterial({ map: fabric(hex(parka)), roughness: 0.8 });
  const mParkaDark = new THREE.MeshStandardMaterial({ map: fabric(hex(parkaDark)), roughness: 0.85 });
  const mTrouser = new THREE.MeshStandardMaterial({ map: fabric(hex(trouserColor)), roughness: 0.88 });
  const mBoot = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.7 });
  const mSole = new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.95 });
  const mSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.85 });
  const mFur = new THREE.MeshStandardMaterial({ color: 0xe8ddc7, roughness: 0.95 });
  const mEye = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.4 });
  const mBrow = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.8 });
  const mHair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.85 });

  const legs = new THREE.Group();
  const HIP_Y = 0.82;
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.13, HIP_Y, 0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.115, 0.82, 8), mTrouser);
    leg.position.set(0, -0.41, 0);
    hip.add(leg);
    const bootMesh = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.13, 0.31), mBoot);
    bootMesh.position.set(0, 0.065 - HIP_Y, 0.045);
    hip.add(bootMesh);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.03, 0.33), mSole);
    sole.position.set(0, -HIP_Y, 0.045);
    hip.add(sole);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.108, 0.05, 8), mFur);
    cuff.position.set(0, 0.13 - HIP_Y, 0);
    hip.add(cuff);
    legs.add(hip);
    parts[side < 0 ? 'legL' : 'legR'] = hip;
  }
  g.add(legs);

  const torso = new THREE.Group();
  torso.position.set(0, 1.14, 0);
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.34, 0.33), mParka);
  shoulders.position.y = 0.13;
  torso.add(shoulders);
  const waist = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.32, 0.3), mParka);
  waist.position.y = -0.19;
  torso.add(waist);
  g.add(torso);
  parts.torso = torso;

  const zip = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, 0.58, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5, metalness: 0.4 })
  );
  zip.position.set(0, 0, 0.17);
  torso.add(zip);
  for (const [sx, sy] of [[-0.14, 0.02], [0.14, 0.02]]) {
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.02), mParkaDark);
    pocket.position.set(sx, sy, 0.175);
    torso.add(pocket);
  }

  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.08, 0.33), mParkaDark);
  trim.position.set(0, 0.86, 0);
  g.add(trim);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.14, 0.09, 10), mParkaDark);
  collar.position.set(0, 1.48, 0);
  g.add(collar);

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

  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.29, 1.38, 0);
    arm.rotation.z = side * 0.12;
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.078, 0.48, 8), mParka);
    upper.position.y = -0.24;
    arm.add(upper);
    const wristCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.035, 8), mFur);
    wristCuff.position.y = -0.46;
    arm.add(wristCuff);
    const hand = new THREE.Group();
    hand.position.y = -0.48;
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.15), mParkaDark);
    glove.position.y = -0.03;
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
  head.add(face);

  for (const side of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.01), mBrow);
    brow.position.set(side * 0.055, 0.035, 0.152);
    brow.rotation.z = side * 0.18;
    head.add(brow);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), mSkin);
  nose.position.set(0, -0.02, 0.157);
  head.add(nose);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), mEye);
    eye.position.set(side * 0.055, 0.01, 0.148);
    head.add(eye);
  }

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.165, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    mHair
  );
  hair.position.set(0, 0.045, -0.01);
  head.add(hair);

  g.add(head);
  parts.head = head;

  g.userData.parts = parts;
  return { group: g, parts: parts as CharacterParts };
}

/** The technician role's clipboard prop — same geometry, reused here so a
 * scientist can be shown holding it while note-taking. */
export function buildClipboard(): THREE.Group {
  const clipboard = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.32, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.7 })
  );
  const page = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.27),
    new THREE.MeshStandardMaterial({ color: 0xf0ede0, roughness: 0.9 })
  );
  page.position.z = 0.012;
  clipboard.add(board, page);
  clipboard.rotation.x = -0.3;
  clipboard.position.set(0, -0.05, -0.12);
  return clipboard;
}
