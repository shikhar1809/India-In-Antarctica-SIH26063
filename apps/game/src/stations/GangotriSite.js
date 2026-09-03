import * as THREE from 'three';
import { MAT, latticeMast, routeMarker, drum, signText, flag, tricolour, container } from './kit.js';

/**
 * GangotriSite — Dakshin Gangotri as it is now: buried.
 *
 * There is nothing to walk into here, and that is the point of the level. The
 * original prefabricated timber blocks are under the ice; what remains above
 * the surface is a mast, a supply depot that is still in use as a transit
 * camp, and a survey trench cut down to the roof of Block B.
 *
 * The reference sheet is explicit that no architectural survey exists for this
 * structure, so the reconstruction is deliberately partial — you see the corner
 * of a roof in a trench, not a confident model of a building nobody measured.
 */
export function buildGangotri(engine) {
  const root = new THREE.Group();
  root.name = 'gangotri';

  const interactables = [];
  const animated = [];
  const colliders = [];

  const snow = new THREE.MeshStandardMaterial({ color: 0xeaf3fa, roughness: 0.9 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x6d5844, roughness: 0.92 });
  const timberDark = new THREE.MeshStandardMaterial({ color: 0x4a3b2d, roughness: 0.95 });

  /* ------------------------------------------------------ survey trench */
  // A cut in the ice exposing the roof of Block B.
  const trench = new THREE.Group();
  const TW = 9, TL = 14, TD = 3.4;

  // Trench walls — inward-facing so you see the ice section.
  const iceWall = new THREE.MeshStandardMaterial({
    color: 0xbcd8ec, roughness: 0.55, side: THREE.BackSide
  });
  const pit = new THREE.Mesh(new THREE.BoxGeometry(TW, TD, TL), iceWall);
  pit.position.y = -TD / 2;
  trench.add(pit);

  // Annual layering visible in the cut face — the thing that buried the station.
  for (let i = 0; i < 14; i++) {
    const y = -0.24 - i * 0.23;
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(TW - 0.02, 0.05, TL - 0.02),
      new THREE.MeshStandardMaterial({
        color: i % 2 ? 0x9fc0d8 : 0xd6e8f5, roughness: 0.6, side: THREE.BackSide
      })
    );
    band.position.y = y;
    trench.add(band);
  }

  // The exposed roof corner of Block B.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.5, 8.0), timber);
  roof.position.y = -TD + 0.3;
  roof.castShadow = roof.receiveShadow = true;
  trench.add(roof);
  for (let i = 0; i < 9; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.06, 0.72), timberDark);
    plank.position.set(0, -TD + 0.57, -3.6 + i * 0.88);
    trench.add(plank);
  }
  // A rusted vent pipe and the corner of a window frame.
  const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.2, 10), MAT.steel());
  vent.position.set(1.8, -TD + 1.0, -2.2);
  trench.add(vent);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x14202a, roughness: 0.4 }));
  win.position.set(-2.4, -TD + 0.9, 4.05);
  trench.add(win);

  // Ladder down.
  const ladder = new THREE.Group();
  for (const sx of [-0.28, 0.28]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, TD + 0.6, 6), MAT.galv());
    rail.position.set(sx, -TD / 2 + 0.3, 0);
    ladder.add(rail);
  }
  for (let i = 0; i < 10; i++) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), MAT.galv());
    rung.rotation.z = Math.PI / 2;
    rung.position.y = -0.2 - i * 0.32;
    ladder.add(rung);
  }
  ladder.position.set(0, 0, TL / 2 - 0.6);
  trench.add(ladder);

  // Safety rail around the lip.
  const railMat = new THREE.MeshStandardMaterial({ color: 0xffcf5c, roughness: 0.6 });
  for (let i = 0; i < 4; i++) {
    const horiz = i % 2 === 0;
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(horiz ? TW + 0.6 : 0.07, 0.07, horiz ? 0.07 : TL + 0.6),
      railMat
    );
    const a = (i / 4) * Math.PI * 2;
    bar.position.set(
      horiz ? 0 : Math.sign(Math.cos(a)) * (TW / 2 + 0.3),
      1.0,
      horiz ? Math.sign(Math.sin(a || 1)) * (TL / 2 + 0.3) : 0
    );
    trench.add(bar);
  }
  trench.position.set(0, 0, 0);
  root.add(trench);

  interactables.push({
    id: 'exp-dg-build',
    label: 'Look into the survey trench',
    position: new THREE.Vector3(0, 0, TL / 2 + 3),
    radius: 5,
    color: 0xffcf5c
  });
  interactables.push({
    id: 'exp-dg-loss',
    label: 'Count the annual snow layers',
    position: new THREE.Vector3(TW / 2 + 3, 0, 0),
    radius: 5,
    color: 0xffcf5c
  });

  // The trench is a hole — keep the player out of it with a ring of colliders.
  colliders.push(
    boxOf(0, 0, TL / 2 + 0.35, TW + 1.2, 1.2, 0.5),
    boxOf(0, 0, -TL / 2 - 0.35, TW + 1.2, 1.2, 0.5),
    boxOf(TW / 2 + 0.35, 0, 0, 0.5, 1.2, TL + 1.2),
    boxOf(-TW / 2 - 0.35, 0, 0, 0.5, 1.2, TL + 1.2)
  );

  /* --------------------------------------------------------- memorial */
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x5c5750, roughness: 0.95 }));
  plinth.position.set(-16, 0.65, 10);
  plinth.castShadow = true;
  root.add(plinth);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.62),
    new THREE.MeshStandardMaterial({
      map: signText('DAKSHIN GANGOTRI · 1984', { color: '#e8c87a', bg: '#221c12', w: 1024 }),
      roughness: 0.5, metalness: 0.45
    }));
  plaque.position.set(-16, 0.95, 10.42);
  root.add(plaque);

  const fl = flag(tricolour(), { poleH: 8, w: 2.2, h: 1.47 });
  fl.position.set(-19, 0, 10);
  root.add(fl);
  animated.push({ flag: fl });

  interactables.push({
    id: 'exp-1981',
    label: 'Read the 1984 dedication',
    position: new THREE.Vector3(-16, 0, 12.5),
    radius: 4.5,
    color: 0xff9933
  });

  /* ------------------------------------------------------ transit camp */
  // Still in use as a supply depot, so there is live kit here.
  for (let i = 0; i < 6; i++) {
    const c = container(['#8c3b28', '#2a5f8c', '#6a6f74'][i % 3]);
    const cx = 22 + (i % 3) * 7.2, cz = -8 + Math.floor(i / 3) * 3.6;
    c.position.set(cx, 0, cz);
    c.rotation.y = 0.05 * i;
    root.add(c);
    colliders.push(boxOf(cx, 0, cz, 6.06, 2.59, 2.44));
    // Half-drifted: a snow ramp on the windward side of each.
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.1, 2.2), snow);
    ramp.position.set(22 + (i % 3) * 7.2, 0.3, -9.9 + Math.floor(i / 3) * 3.6);
    ramp.rotation.x = 0.22;
    ramp.receiveShadow = true;
    root.add(ramp);
  }
  for (let i = 0; i < 14; i++) {
    const d = drum('#b23a1f');
    const dx = 30 + (i % 7) * 0.68, dy = Math.floor(i / 7) * 0.88;
    d.position.set(dx, dy, 6);
    root.add(d);
    colliders.push(boxOf(dx, dy, 6, 0.6, 0.88, 0.6));
  }

  const mast = latticeMast(12, 0.6, MAT.galv());
  mast.position.set(14, 0, -20);
  root.add(mast);
  const obLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 3 })
  );
  obLight.position.set(14, 12.2, -20);
  root.add(obLight);
  animated.push({ blink: obLight });

  interactables.push({
    id: 'inst-maitri2',
    label: 'Check the depot manifest',
    position: new THREE.Vector3(26, 0, -2),
    radius: 5,
    color: 0x5fd9ff
  });

  /* --------------------------------------------------------- markers */
  for (let i = 0; i < 20; i++) {
    const m = routeMarker(1.7, 0xd83a2a);
    const a = i * 0.42;
    m.position.set(Math.cos(a) * (26 + i * 1.6), 0, TL / 2 + 6 + i * 3.4);
    root.add(m);
    animated.push({ winMat: m.userData.capMat, winBase: 2.2 });
  }

  return { root, interactables, animated, colliders, spec: { buried: true } };
}

function boxOf(x, y, z, w, h, d) {
  return new THREE.Box3(
    new THREE.Vector3(x - w / 2, y, z - d / 2),
    new THREE.Vector3(x + w / 2, y + h, z + d / 2)
  );
}
