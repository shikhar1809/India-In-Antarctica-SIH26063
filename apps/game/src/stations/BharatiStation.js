import * as THREE from 'three';
import {
  MAT, stilt, latticeMast, radome, dish, flag, tricolour, bandFlag,
  signText, container, drum, routeMarker, snowVehicle,
  buildAccessStair, buildInterior, storageBay, archiveServerRack, dataTerminal, snowmobile,
  trackedExcavator
} from './kit.js';
import { buildFloorPlan, PALETTE } from './interior.js';
import { bakeStatic, keepDynamic } from '../core/bake.js';
import { buildNPC, applyRestock } from './NPCs.js';
import { buildGeneratorHall, buildStatusPanel, buildPowerPanelInteractable } from './PowerSystem.js';
import { CATEGORIES } from '../data/archive.js';

/**
 * BharatiStation — the one site where real published dimensions exist.
 *
 * From the bof Architekten / Dlubal documentation:
 *   footprint   ~50 m × 30 m  (~164 ft × 98 ft)
 *   height      >12 m, three floors
 *   floor area  ~2,500 m²
 *   structure   134 interlocked 20 ft ISO containers, wrapped in an
 *               insulated steel skin
 *   elevated    on steel columns
 *
 * The shape is the science. Flat walls create a lee where snow settles and
 * eventually buries the building; the faceted, tapered shell keeps airflow
 * attached so drift is carried past. That is modelled here literally — the
 * body is a prismatoid whose widest section is at mid-height, narrowing at
 * both the base and the roof, exactly as built.
 */

export const BHARATI_SPEC = {
  length: 50,
  width: 30,
  height: 12,
  floors: 3,
  clearance: 2.6,
  containers: 134,
  floorArea: 2500
};

export function buildBharati(engine) {
  const S = BHARATI_SPEC;
  const root = new THREE.Group();
  root.name = 'bharati';

  const interactables = [];
  const animated = [];
  const npcs = [];
  const doors = [];
  // Populated by the upper-floor block below, before the final `colliders`
  // array is assembled further down — same pattern Maitri's mezzanine uses.
  const extraColliders = [];

  const skin = MAT.skin();
  const skinDark = MAT.skinDark();
  const glassMat = MAT.glass();
  const litMat = MAT.glassLit();

  /* ------------------------------------------------------- understructure */
  // Steel columns on a grid. Bharati's undercroft is tall enough to drive a
  // vehicle under, which is the point.
  const colGroup = new THREE.Group();
  for (let i = -2; i <= 2; i++) {
    for (let j = -1; j <= 1; j++) {
      const x = i * (S.length / 5.4);
      const z = j * (S.width / 3.2);
      const c = stilt(S.clearance, 0.26, MAT.steelGrey());
      c.position.set(x, 0, z);
      colGroup.add(c);
    }
  }
  // Deck grillage.
  for (let j = -1; j <= 1; j++) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(S.length * 0.92, 0.4, 0.3), MAT.steelGrey()
    );
    beam.position.set(0, S.clearance - 0.2, j * (S.width / 3.2));
    beam.castShadow = true;
    colGroup.add(beam);
  }
  root.add(colGroup);

  /* ----------------------------------------------------------- the shell */
  // Prismatoid: four plan rings stacked, widest at mid-height.
  const y0 = S.clearance;
  const rings = [
    { y: y0,            hx: S.length * 0.44, hz: S.width * 0.36, cut: 0.30 },
    { y: y0 + 1.2,      hx: S.length * 0.48, hz: S.width * 0.46, cut: 0.28 },
    { y: y0 + S.height * 0.42, hx: S.length * 0.50, hz: S.width * 0.50, cut: 0.26 },
    { y: y0 + S.height * 0.80, hx: S.length * 0.46, hz: S.width * 0.44, cut: 0.30 },
    { y: y0 + S.height,  hx: S.length * 0.33, hz: S.width * 0.26, cut: 0.38 }
  ];

  // Door opening in world terms, hoisted up from the entrance section below
  // (which builds the frame/shutter dressing at these same numbers) so the
  // hull itself can be cut open to match rather than left solid behind it.
  // MUST match the interior room's own doorW (3.6, see buildInterior below)
  // exactly — cutting the shell any wider than the wall it opens into
  // leaves an unfinished gap between the shell's cut edge and the interior
  // wall's edge with nothing closing it off (the building's structural
  // steel showing through), and cutting it narrower puts solid shell in
  // front of what should be open interior. Every layer — shell, frame,
  // interior wall — has to agree on the same opening width.
  const doorSillY = y0, doorHullH = 2.4, doorFrameH = doorHullH + 0.4;
  const doorTopY = doorSillY + doorFrameH;
  const doorXHalf = 3.6 / 2;

  // A ring inserted at exactly doorTopY gives prismatoid() a clean layer
  // boundary to cut at — every band below it can be a straight left/right
  // split, nothing needs to straddle the doorway's top edge.
  const doorRing = ringAt(rings, doorTopY);
  const hullRings = [...rings];
  const insertAt = hullRings.findIndex(r => r.y > doorTopY);
  hullRings.splice(insertAt < 0 ? hullRings.length : insertAt, 0, doorRing);

  const shell = prismatoid(hullRings, skin, { doorCut: { xHalf: doorXHalf, yTop: doorTopY } });
  shell.castShadow = shell.receiveShadow = true;
  root.add(shell);

  // Darker recessed bands marking the floor levels — the horizontal lines
  // that break up the shell in every photograph.
  for (const f of [0.36, 0.68]) {
    const y = y0 + S.height * f;
    const ring = ringAt(rings, y);
    const band = prismatoid([
      { y: y - 0.28, hx: ring.hx + 0.06, hz: ring.hz + 0.06, cut: ring.cut },
      { y: y + 0.28, hx: ring.hx + 0.06, hz: ring.hz + 0.06, cut: ring.cut }
    ], skinDark, { caps: false });
    root.add(band);
  }

  /* ------------------------------------------------- glazed front facade */
  // The big raked window wall that faces the bay.
  const glazeGroup = new THREE.Group();
  const gw = S.length * 0.52, gh = S.height * 0.34;
  const glazing = new THREE.Mesh(
    new THREE.BoxGeometry(gw, gh, 0.3),
    new THREE.MeshPhysicalMaterial({
      color: 0x16303f, roughness: 0.06, metalness: 0.1,
      clearcoat: 1, clearcoatRoughness: 0.04, reflectivity: 0.9
    })
  );
  const gz = ringAt(rings, y0 + S.height * 0.55).hz;
  glazing.position.set(0, y0 + S.height * 0.60, gz + 0.1);
  glazing.rotation.x = -0.16;
  glazeGroup.add(glazing);

  // Mullions.
  const mullMat = MAT.galv();
  const bays = 9;
  for (let i = 0; i <= bays; i++) {
    const x = -gw / 2 + (i / bays) * gw;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, gh + 0.1, 0.16), mullMat);
    m.position.set(x, y0 + S.height * 0.60, gz + 0.26);
    m.rotation.x = -0.16;
    glazeGroup.add(m);
  }
  for (const fy of [-0.34, 0.34]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(gw + 0.2, 0.14, 0.16), mullMat);
    m.position.set(0, y0 + S.height * 0.60 + fy * gh, gz + 0.26 + fy * 0.06);
    m.rotation.x = -0.16;
    glazeGroup.add(m);
  }
  root.add(glazeGroup);

  // Warm interior glow behind the glass — the station is occupied.
  const glazingLight = new THREE.PointLight(0xffcf8a, 14, 40, 2);
  glazingLight.position.set(0, y0 + S.height * 0.55, gz - 2);
  root.add(glazingLight);
  animated.push({ light: glazingLight, base: 14 });

  interactables.push({
    id: 'med-bharati-shell',
    label: 'Study the aerodynamic shell',
    position: new THREE.Vector3(0, 0, gz + 12),
    radius: 6
  });

  /* ----------------------------------------------------------- windows */
  // Small punched windows in the flanks, on all three floors.
  const winGeo = new THREE.BoxGeometry(1.0, 0.9, 0.2);
  const winCount = 9;
  const frames = new THREE.InstancedMesh(winGeo, MAT.frame(), winCount * 3 * 2);
  const glassI = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.84, 0.74, 0.1), glassMat, winCount * 3 * 2
  );
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const zeroScale = new THREE.Vector3(0, 0, 0);
  const total = winCount * 3 * 2;

  // A share of windows read as occupied/lit at night — plain dark glass by
  // day, MAT.glassLit() glowing amber once nightFactor comes up (see the
  // `winMat` handling in site.js's update loop). Without this every window
  // on the building stayed the same flat dark glass at any hour, which is
  // the other half of "why in night not happening" — the sky darkening
  // alone still left the station itself looking uninhabited after dark.
  const litIdx = new Set();
  while (litIdx.size < Math.max(4, Math.floor(total * 0.22))) {
    litIdx.add(Math.floor(Math.random() * total));
  }
  const litWin = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.84, 0.74, 0.1), litMat, litIdx.size
  );

  let idx = 0, li = 0;
  for (let f = 0; f < 3; f++) {
    const y = y0 + 1.6 + f * (S.height / 3.4);
    const ring = ringAt(rings, y);
    for (let i = 0; i < winCount; i++) {
      const x = -ring.hx * 0.78 + (i / (winCount - 1)) * ring.hx * 1.56;
      for (const sz of [1, -1]) {
        // The 9 window columns are evenly spaced with no idea the front
        // face (sz=1) has a real doorway cut through it at ground level —
        // the middle column lands at exactly x=0, dead centre of the door.
        // With the shell now genuinely open there (see doorCut above) that
        // window has no wall left to sit in and just floats in the opening.
        // Skip any ground-floor front-face window whose frame would
        // overlap the cut.
        const inDoorGap = f === 0 && sz === 1 && Math.abs(x) < doorXHalf + 0.6;
        q.setFromEuler(new THREE.Euler(0, sz > 0 ? 0 : Math.PI, 0));
        const p = new THREE.Vector3(x, y, sz * (ring.hz + 0.06));
        if (inDoorGap) {
          m4.compose(p, q, zeroScale);
          frames.setMatrixAt(idx, m4);
          glassI.setMatrixAt(idx, m4);
          idx++;
          continue;
        }
        m4.compose(p, q, one);
        frames.setMatrixAt(idx, m4);
        // Glass is smaller than the frame box in every axis, so at the
        // frame's own centre it sits fully nested inside that solid
        // geometry and never actually shows — pushed proud along the local
        // outward normal instead, past the frame's front face, exactly the
        // way addInstancedWindows() already does for Maitri.
        const off = new THREE.Vector3(0, 0, 0.08).applyQuaternion(q);
        const gp = p.clone().add(off);
        if (litIdx.has(idx)) {
          m4.compose(gp, q, one);
          litWin.setMatrixAt(li++, m4);
          m4.compose(gp, q, zeroScale);
          glassI.setMatrixAt(idx, m4);
        } else {
          m4.compose(gp, q, one);
          glassI.setMatrixAt(idx, m4);
        }
        idx++;
      }
    }
  }
  frames.count = glassI.count = idx;
  // A door-gap window that happened to be one of the randomly-chosen "lit"
  // instances is skipped above without ever calling litWin.setMatrixAt for
  // it, so li can land short of litIdx.size — trim the count to match what
  // was actually written, or the untouched tail instances default to an
  // identity matrix sitting at the station's local origin.
  litWin.count = li;
  frames.instanceMatrix.needsUpdate = true;
  glassI.instanceMatrix.needsUpdate = true;
  litWin.instanceMatrix.needsUpdate = true;
  frames.castShadow = true;
  root.add(frames, glassI, litWin);
  animated.push({ winMat: litMat, winBase: 1.6 });

  /* ---------------------------------------------------------- entrance */
  // Under the shell, reached by a stair up into the undercroft — the ground
  // floor sits a full 2.6 m up (S.clearance), so unlike a doorstep this is a
  // genuine climb, not a step.
  const doorZ = ringAt(rings, y0).hz;   // 10.8 — the ring edge at floor level

  // The door itself belongs at the TOP of that climb — its bottom edge
  // level with the landing floor (S.clearance), not centred on the climb
  // itself. It was previously positioned at y≈0.05–2.45: almost exactly the
  // stairwell's own rise, i.e. plugging the shaft the stairs climb through
  // rather than sitting in the opening at the top of it. From any normal
  // approach angle that put the actual door slab down inside the stairwell,
  // out of the sightline of someone standing on the landing looking at the
  // doorway ahead of them — which is the real reason for "still no door",
  // not a rendering bug at all.
  const doorH = doorHullH;
  const shutterClosedY = doorSillY + doorH / 2;

  // Built as a frame (two jambs + a lintel), NOT the single solid slab this
  // used to be. That slab was 5.0 m wide and sat at doorZ-0.2 — INSIDE the
  // interior room's own z1=doorZ boundary (buildInterior's doorway gap is
  // cut into the wall right at z1, and z1-0.2 is on the interior side of
  // it) — so it stood as a second, undocumented back wall directly behind
  // the door, immediately inside the real doorway. The actual wall gap was
  // correctly open, but this slab re-sealed it a few centimetres further
  // in: opening the shutter revealed nothing but this dark panel filling
  // the view up close, exactly the "no interior visible" / "gap where the
  // door should connect to the building" report. A frame with a real
  // opening — matching the interior's own doorW=3.6 clear width — leaves
  // the throat all the way from the shutter through to the lab genuinely
  // open, the same fix already applied to Maitri's equivalent recess.
  const doorwayMat = new THREE.MeshStandardMaterial({ color: 0x1a2229, roughness: 0.9 });
  const frameOpenW = doorXHalf * 2, frameOuterW = frameOpenW + 1.4, frameOuterH = doorFrameH;
  const frameZ = doorZ - 0.2, frameY = doorSillY + frameOuterH / 2;
  const jambW = (frameOuterW - frameOpenW) / 2;
  for (const sx of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(jambW, frameOuterH, 0.4), doorwayMat);
    jamb.position.set(sx * (frameOpenW / 2 + jambW / 2), frameY, frameZ);
    root.add(jamb);
  }
  const lintelH = frameOuterH - doorH;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(frameOuterW, lintelH, 0.4), doorwayMat);
  lintel.position.set(0, doorSillY + doorH + lintelH / 2, frameZ);
  root.add(lintel);

  // A flat light-grey (0xb8bec2), fairly metallic panel turned out to be
  // almost the same tone as the overcast sky it sits against — from any
  // normal approach distance it read as "no door there at all" rather than
  // "a closed shutter", which is exactly the "still no door" report this is
  // fixing. Darkened and de-metalled for real contrast against snow glare,
  // plus the same emissive stripe + lit port Maitri's door already uses so
  // it reads as a door (and a working one) regardless of what the sky is
  // doing at any given moment, not just at night when the porch light wins.
  const shutter = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, doorH, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x384552, roughness: 0.7, metalness: 0.15 })
  );
  shutter.position.set(0, shutterClosedY, doorZ + 0.02);
  root.add(shutter);

  const shutterStripe = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.08, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xbfe9ff, emissive: 0x5fd9ff, emissiveIntensity: 1.5, roughness: 0.4 })
  );
  shutterStripe.position.set(0, 0.55, 0.08);
  shutter.add(shutterStripe);
  const shutterPort = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xffe3ad, emissive: 0xffb85c, emissiveIntensity: 1.2, roughness: 0.5 })
  );
  shutterPort.position.set(0, -0.15, 0.075);
  shutter.add(shutterPort);

  // Rolls up like the real roller shutter it's modelled as, rather than
  // swinging on a hinge — matches the panel's own proportions (wide, flat,
  // no visible hinge line) better than a door animation would.
  doors.push({
    mesh: shutter, axis: 'y', rollHeight: doorH, rollBottomY: doorSillY,
    localPosition: new THREE.Vector3(0, shutterClosedY, doorZ + 0.02), radius: 6, state: 0
  });

  const porch = new THREE.PointLight(0xffd39a, 9, 18, 1.8);
  porch.position.set(0, doorSillY + doorH + 0.3, doorZ + 1.6);
  root.add(porch);
  animated.push({ light: porch, base: 9 });

  interactables.push({
    id: 'exp-bharati-build',
    label: 'Read the construction record',
    position: new THREE.Vector3(0, doorSillY, doorZ + 4),
    radius: 4.5
  });

  /* --------------------------------------------------------------- stair */
  // Bharati never had a climbable stair at all before — only decorative
  // door dressing sat above a 2.6 m drop with nothing to walk up.
  // Matches buildAccessStair's own MIN_TREAD floor (steps × 0.5 m) up front
  // instead of requesting a shorter run and letting it get silently
  // widened — the same mismatch that left Maitri's front door physically
  // unreachable (see the long comment on that station's own entrance
  // stair for the full story) would apply here too otherwise.
  const stairStepRise = 0.18;
  const stairSteps = Math.max(6, Math.round(S.clearance / stairStepRise));
  const stairRun = Math.max(4.6, stairSteps * 0.5);
  const landingZ = doorZ + 0.5;
  const stair = buildAccessStair({
    width: 4.2, top: S.clearance, run: stairRun, z0: landingZ + stairRun, baseY: 0,
    frameMat: MAT.frame(), steelMat: MAT.steelGrey()
  });
  root.add(stair.mesh);

  // Reference points for anything that needs to actually walk in through
  // the front door and up these stairs (the resupply ground crew) rather
  // than cutting straight from the apron to an indoor point — one ground-
  // level stop at the foot of the stairs, one floor-level stop just past
  // the threshold.
  const entranceOutside = new THREE.Vector3(0, 0, landingZ + stairRun + 3);
  const entranceInside = new THREE.Vector3(0, y0, doorZ - 2);

  /* ----------------------------------------------------------- interior */
  // An ops/lab room on the ground floor. z1 MUST sit inside the stair
  // landing's own z-range (landingZ ± ~1.2) or there is a gap between "top
  // of the stairs" and "edge of the room floor" with no collider covering
  // it at all — which is exactly the hole the player fell through here on
  // the first pass. Flush with the ring's own z=y0 boundary (doorZ) is both
  // architecturally correct (the wall sits where the shell wall sits) and
  // guaranteed to overlap the landing, since the landing was built 0.5 m
  // proud of that same doorZ.
  //
  // x is kept well inside hx-cx (the octagon's flat-edge span at z=±hz) so
  // the room's front corners never poke through the tapered hull — see the
  // ring definition above: hx=22, cut=0.30, so the flat edge only reaches
  // ±(22×0.7)=±15.4 at z=±10.8.
  // Bharati's LOWER level is, per bof architekten's own description of the
  // building, "the laboratories and the storage spaces, the technical
  // spaces, the CHP unit as well as the garage which includes a workshop" —
  // i.e. the working floor. The living accommodation is all one level up.
  // That split is the whole reason this station reads differently from
  // Maitri, so it is built literally rather than as one general-purpose room.
  //
  // A spine corridor runs north from the entry airlock; the vehicle bay
  // takes the whole east side (it needs the clear span), science and stores
  // sit west, and plant sits at the cold north end away from the door.
  const CEIL1 = 3.0;
  // Hoisted: floor 2 and 3 heights are referenced by props placed earlier in
  // source order than the floors themselves are built.
  const floor2Y = 6.2, ceil2 = 3.0;
  const floor3Y = 9.8, ceil3 = 3.0;
  const SPINE = 2.2;                 // corridor half-width, all three floors
  // The hull's own extent at floor level (ring hx = 22, hz = 10.8), less a
  // wall thickness. Every plate is now cut to the shell rather than to a
  // number picked independently of it — that mismatch is what made the
  // outside and the inside read as two different buildings.
  const OUT_W = -21.5, OUT_E = 21.5, OUT_Z = -10.3;
  const STAIRW = { x0: -14, x1: -8, z0: -8, z1: 8 };   // stairwell shaft footprint

  const floor1 = buildFloorPlan({
    floorY: y0, ceilH: CEIL1, palette: PALETTE.bharati, lowLights: engine.quality === 'low',
    rooms: [
      { id: 'airlock',  x0: -SPINE, x1: SPINE, z0: 8,    z1: doorZ, theme: 'airlock',  label: 'ENTRY' },
      { id: 'spine',    x0: -SPINE, x1: SPINE, z0: OUT_Z, z1: 8,    theme: 'corridor' },
      { id: 'warm',     x0: -8,     x1: -SPINE, z0: 4.6, z1: 8,     theme: 'corridor' },
      // The stairwell is a shaft: no ceiling, so the flight climbing out of
      // it has somewhere to go without needing a hole cut in a slab.
      { id: 'stairwell', ...STAIRW, theme: 'stairwell', label: 'STAIRS  ^  FLOORS 2-3', noCeil: true },
      { id: 'labocean', x0: -8, x1: -SPINE, z0: 2,  z1: 4.6, theme: 'lab', variant: 'oceanography', label: 'OCEANOGRAPHY' },
      { id: 'labearth', x0: -8, x1: -SPINE, z0: -3, z1: 2,  theme: 'lab', variant: 'geophysics',   label: 'EARTH SCIENCES' },
      { id: 'store1',   x0: -8, x1: -SPINE, z0: OUT_Z, z1: -3, theme: 'storage',  label: 'STORES' },
      { id: 'garage',   x0: SPINE, x1: 14,  z0: 2,  z1: doorZ, theme: 'workshop', label: 'GARAGE / WORKSHOP' },
      // The CHP hall takes the whole north end. It has to: the real plant is
      // four gensets in a row plus the fuel gauge manifold, about 10.5 m of
      // machine, and the 5.8 m room it used to be given could not physically
      // contain it — the hall was built anyway and its collider ran straight
      // through the west wall, across the doorway and out into the next room,
      // which is what sealed the plant and the cold store off entirely.
      // Bharati's sample store is the coastal counterpart to Maitri's core
      // archive, and deliberately not the same room: the science here is
      // oceanography and marine biology, so it is chilled sample fridges and
      // upright freezers, a preservation cabinet of bottled specimens and a
      // wet bench with a sink — not ice-core racking (docs/REFERENCES.md 4).
      { id: 'samples',  x0: SPINE, x1: 8,   z0: -3, z1: 2,  theme: 'samplestore', variant: 'bio', label: 'SAMPLE STORE' },
      { id: 'cold',     x0: 8,     x1: 14,  z0: -3, z1: 2,  theme: 'coldstore', label: 'COLD STORE' },
      { id: 'plant',    x0: SPINE, x1: 14,  z0: -8, z1: -3, theme: 'utility',   label: 'CHP PLANT', variant: 'genhall' },
      { id: 'tanks',    x0: SPINE, x1: 14,  z0: OUT_Z, z1: -8, theme: 'utility',  label: 'MELTWATER TANKS' },

      // ---- OUTBOARD BAYS -------------------------------------------------
      // The shell is 50 m long. Until now the interior stopped at x = +-14,
      // so 22 m of the building's own length — nearly half of it — had no
      // inside at all, and the exterior and interior were describing two
      // different buildings. bof architekten publish ~2,500 m2 of gross floor
      // area across three floors; the old plates came to about half that.
      // These bays fill the hull out to the ring at floor level (hx = 22) and
      // bring the modelled area into line with the published figure.
      { id: 'water',    x0: OUT_W, x1: -14, z0: 8,     z1: doorZ, theme: 'utility', label: 'WATER PLANT' },
      { id: 'labbio',   x0: OUT_W, x1: -14, z0: 2,     z1: 8,     theme: 'lab', variant: 'oceanography', label: 'MARINE BIOLOGY' },
      { id: 'labchem',  x0: OUT_W, x1: -14, z0: -3,    z1: 2,     theme: 'lab', variant: 'general',      label: 'CHEMISTRY / PREP' },
      { id: 'bulk',     x0: OUT_W, x1: -14, z0: OUT_Z, z1: -3,    theme: 'storage', label: 'BULK STORES' },
      { id: 'vehicle',  x0: 14, x1: OUT_E,  z0: 2,     z1: doorZ, theme: 'workshop', label: 'VEHICLE BAY' },
      { id: 'fuel',     x0: 14, x1: OUT_E,  z0: -3,    z1: 2,     theme: 'utility',  label: 'FUEL / PUMP ROOM' },
      { id: 'waste',    x0: 14, x1: OUT_E,  z0: OUT_Z, z1: -3,    theme: 'storage',  label: 'WASTE HANDLING' },
      // The two remaining holes in the plate, found by the coverage checker
      // rather than by eye: the strip north of the stairwell, and the strip
      // south of it. A floor plan is a partition of a rectangle; anything the
      // rooms do not claim is dead volume between the shell and the interior.
      { id: 'dry',      x0: -14, x1: -SPINE, z0: 8,     z1: doorZ, theme: 'airlock', label: 'DRYING ROOM' },
      { id: 'switch',   x0: -14, x1: -8,     z0: OUT_Z, z1: -8,    theme: 'utility', label: 'SWITCHGEAR' }
    ],
    doors: [
      // Must match the hull cut and the frame dressing exactly (doorXHalf).
      { a: 'airlock', b: 'outside', side: 's', w: doorXHalf * 2 },
      { a: 'airlock', b: 'spine' },
      { a: 'airlock', b: 'garage' },
      { a: 'spine', b: 'warm', w: 2.6 },
      { a: 'warm', b: 'stairwell', w: 3.0 },
      { a: 'spine', b: 'labocean' },
      { a: 'spine', b: 'labearth' },
      { a: 'spine', b: 'store1' },
      { a: 'spine', b: 'garage' },
      // South end of the hall's west wall, so you step into the working
      // aisle rather than into the end of the genset row.
      { a: 'spine', b: 'plant', at: -3.9 },
      { a: 'spine', b: 'samples' },
      { a: 'samples', b: 'cold' },
      { a: 'spine', b: 'tanks' },
      // Outboard bays hang off the rooms they actually touch. The first pass
      // wired the west bays to the labs, which do not border them — the
      // stairwell shaft sits between the two — and sealed ten rooms off. Door
      // pairs are only meaningful between rooms that share an edge.
      // Flight 1 runs hard against the shaft's west wall from z=6.6 down to
      // z=-3.4, so a door punched in that wall anywhere along the flight
      // opens straight into the guard rail. Only the stretch south of the
      // landing is clear; the rest of the west bay chains off it, which is
      // how a linear container plan works anyway.
      { a: 'stairwell', b: 'bulk',    at: -5.5 },
      { a: 'bulk',      b: 'labchem' },
      { a: 'labchem',   b: 'labbio' },
      { a: 'labbio',    b: 'water' },
      { a: 'stairwell', b: 'switch' },
      { a: 'stairwell', b: 'dry' },
      { a: 'airlock',   b: 'dry' },
      { a: 'dry',       b: 'water' },
      { a: 'garage',    b: 'vehicle' },
      { a: 'cold',      b: 'fuel' },
      { a: 'plant',     b: 'waste', at: -5.5 },
      { a: 'tanks',     b: 'waste', at: -9.2 }
    ]
  });
  root.add(floor1.mesh);
  animated.push(...floor1.animated);
  const R1 = floor1.rooms;
  root.userData.rooms = { ...floor1.rooms };
  // Kept under the old name so the collider assembly and the props below
  // read the same way they always did.
  const interior = floor1;

  /* ------------------------------------------------------------ safety board */
  // Every real winter station runs on a mandatory buddy system and a radio
  // check-out before anyone goes outside — this is the board that enforces
  // it, mounted where you'd actually pass it on the way out the door.
  {
    const boardX = 1.55, boardZ = doorZ - 0.16;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 0.5),
      new THREE.MeshStandardMaterial({
        map: signText('BUDDY SYSTEM — RADIO CHECK-OUT REQUIRED', { color: '#ffcf5c', bg: '#1c1408', w: 1024 }),
        roughness: 0.7
      })
    );
    board.position.set(boardX, y0 + 1.6, boardZ);
    root.add(board);
    interactables.push({
      id: 'exp-bharati-safety',
      label: 'Read the safety board',
      position: new THREE.Vector3(boardX, y0, boardZ),
      radius: 2.5
    });
  }

  /* ------------------------------------------------------- the ops desk */
  // buildInterior's 'lab' theme puts the desk at (cx, z0+wt+0.55) facing the
  // far wall — see kit.js. Stand the scientist on the door side of it,
  // facing the same way, so the view is "person working at the terminal"
  // rather than "person standing in front of furniture".
  {
    const nx = R1.labearth.cx + 0.9, nz = R1.labearth.cz;
    const scientist = buildNPC(
      'scientist', { x: nx, z: nz }, 0,
      'Dr. Anjali Rao', 'Atmospheric Scientist',
      [
        'Bharati runs three floors on containers and steel — but the science we do here is the same as anywhere: measure carefully, write it down, measure again.',
        'The Larsemann Hills are shared ground. China\'s Zhongshan and Russia\'s Progress are a few kilometres that way — we compare notes more than you\'d think.',
        'People ask why India spends money on Antarctica. The Southern Ocean drives the monsoon. That\'s the whole answer, really.',
        'I\'ve done two winters here now. The first one changes you. The second one you do because you already know what you\'re signing up for.',
        'India was the first country to build an Antarctic station mostly out of shipping containers — this whole place went up in 127 days. People assume that means it\'s temporary. It\'s not; it means someone was clever about logistics.'
      ]
    );
    scientist.group.position.set(nx, y0, nz);
    root.add(scientist.group);
    npcs.push(scientist);
    interactables.push({
      id: scientist.id, label: scientist.label, isNpc: true, npc: scientist,
      position: new THREE.Vector3(nx, y0, nz), radius: 3.0
    });
  }

  /* --------------------------------------------------------- generator hall */
  // The real plant, in the room that is now actually big enough for it: four
  // CHP gensets in a row (three running, one standby) with the fuel gauge
  // manifold on the end, stood against the north wall so the whole south half
  // of the hall stays open floor to walk and work in.
  //
  // The collider is MEASURED off the assembled group rather than typed in.
  // The hand-written 10.8 x 1.8 x 1.26 box that used to sit here was a
  // leftover from a much larger single-room layout, and nothing linked it to
  // the geometry it was supposed to represent — so when the room around it
  // shrank, the box did not, and it quietly walled off two rooms.
  {
    const genHall = buildGeneratorHall();
    const span = new THREE.Box3().setFromObject(genHall);   // local, unpositioned
    const genX = R1.plant.cx - (span.min.x + span.max.x) / 2;
    const genZ = R1.plant.z0 + 1.0 + (span.max.z - span.min.z) / 2 - (span.min.z + span.max.z) / 2;
    genHall.position.set(genX, y0, genZ);
    root.add(genHall);
    if (genHall.userData.animated) animated.push(genHall.userData.animated);
    extraColliders.push(new THREE.Box3(
      new THREE.Vector3(genX + span.min.x - 0.1, y0, genZ + span.min.z - 0.1),
      new THREE.Vector3(genX + span.max.x + 0.1, y0 + 1.85, genZ + span.max.z + 0.1)
    ));

    // Wall readout on the spine side of the hall, at head height, clear of
    // the doorway keep-out.
    const panelZ = R1.plant.cz + 1.4;
    const panel = buildStatusPanel('winter');
    panel.position.set(R1.plant.x0 + 0.14, y0 + 1.5, panelZ);
    panel.rotation.y = Math.PI / 2;
    root.add(panel);
    interactables.push(buildPowerPanelInteractable(
      new THREE.Vector3(R1.plant.x0 + 0.9, y0, panelZ),
      { id: 'power-panel-bharati', radius: 3, variant: 'winter' }
    ));

    // The technician stands in the working aisle in front of the machines,
    // facing them — not inside them.
    const tx = R1.plant.cx, tz = genZ + (span.max.z - span.min.z) / 2 + 1.6;
    const technician = buildNPC(
      'technician', { x: tx, z: tz }, 0,
      'Vikram', 'Power Systems Technician',
      [
        'Three of these run at any time, the fourth just sits ready. Lose one mid-winter and the station cannot afford to notice — the standby has to already be there.',
        'We ship in about a year\'s diesel at a time, plus a safety margin, because nothing else is coming until next summer\'s resupply. I watch the tank levels more closely than I watch the weather.',
        'The waste heat off these engines heats the building — we are not burning fuel twice, once for power and once for warmth. That loop is the whole trick.',
        'Solar earns its keep for about half the year. Right now, in the dark, it is doing nothing at all — these four engines are the only reason the lights are on.'
      ]
    );
    technician.group.position.set(tx, y0, tz);
    root.add(technician.group);
    npcs.push(technician);
    interactables.push({
      id: technician.id, label: technician.label, isNpc: true, npc: technician,
      position: new THREE.Vector3(tx, y0, tz), radius: 3.0
    });
  }

  /* -------------------------------------------------------- medical officer */
  // Open floor south-east of the generator hall — clear of the desk, the
  // bench and the shelf, and well clear of the generator hall's own Z-range
  // (which ends around z=-1.5). A winter team this size carries exactly one
  // doctor, which makes them one of the most consequential people in the
  // building despite having no dedicated room of their own here.
  {
    const mx = 9.4, mz = 0.9;   // floor-2 OP room (x 8..14, z -2..2)
    const medic = buildNPC(
      'technician', { x: mx, z: mz }, -2.6,
      'Dr. Kavita Menon', 'Station Medical Officer',
      [
        'I\'m the only doctor for twenty-five people, and for eight months of the year I\'m also the only doctor within three thousand kilometres — nobody is flying in for a second opinion.',
        'We keep a telemedicine link running back to hospitals in India for anything past what I can handle alone. It has saved people\'s confidence more often than it\'s saved a life, and that matters too.',
        'Half my job happens before the ice even forms — a mandatory medical and psychiatric screening. Winter-over isolation finds the crack in someone who\'d have told you nothing could touch them.',
        'If something goes seriously wrong in June, there is no evacuation. No aircraft flies here in the dark. Whatever happens, we handle it right here, with whatever is already in this room.'
      ]
    );
    medic.group.position.set(mx, floor2Y, mz);
    root.add(medic.group);
    npcs.push(medic);
    interactables.push({
      id: medic.id, label: medic.label, isNpc: true, npc: medic,
      position: new THREE.Vector3(mx, floor2Y, mz), radius: 3.0
    });
  }

  /* -------------------------------------------------------------- storage */
  // Hard against the west wall (x0 = -14), well clear of the upper-floor
  // stairwell (stair1, built at STAIR_X=-8, whose colliders reach out to
  // about x=-9.6) as well as the desk/generator/medic cluster on the east
  // side — an earlier placement at x=-10 overlapped stair1's own colliders,
  // which is exactly the "storage is blocking the stairs" bug reported for
  // Maitri's equivalent room. Narrower than that attempt (3.6 m, not 4.6) so
  // it fits inside the wall with margin to spare either side.
  // Offset into the aisle between two racks — the storage theme puts a rack
// on the room's centre line when the room is wide enough, so cx itself is
// solid shelving, not floor.
  const storageX = R1.store1.cx - 1.4, storageZ = R1.store1.cz;
  {
    // The standalone storageBay prop used to stand here. The stores room now
    // furnishes itself from the floor plan's own 'storage' theme (racks,
    // crates, aisles sized to the player's radius), so dropping the prop
    // removes both a visual double-up and a 3.6 x 3.0 x 2.2 m collider that
    // was swallowing the storekeeper standing next to it.
  }
  const storagePoint = new THREE.Vector3(storageX, y0, storageZ + 1.4);

  // The other half of the resupply loop: the ground crew hands the crate
  // off here, and this is who actually unpacks it — logging tins onto the
  // shelf against the manifest rather than the crate just sitting there.
  {
    const skX = storageX + 0.9, skZ = storageZ + 0.4;
    const storekeeper = buildNPC(
      'technician', { x: skX, z: skZ }, 0,
      'Ganesh Pillai', 'Storekeeper',
      [
        'Every crate that comes off the pad goes through me before it goes on a shelf — checked against the manifest, logged, then stowed. Lose track of the stores here and you find out the hard way, months later.',
        'Tinned rations, mostly — dal, vegetables, whatever keeps. Nothing fresh survives between resupply runs, so this shelf is the menu for the next six months, like it or not.',
        'People imagine Antarctica as empty. This room is the opposite of empty — every centimetre of shelf is accounted for, because there is no corner shop to cover a shortfall.',
        'The ground crew hands it to me, I put it away. Small job, but skip it for a week and you\'d notice fast — nobody can find anything, and nobody knows what\'s actually left.'
      ]
    );
    storekeeper.group.position.set(skX, y0, skZ);
    root.add(storekeeper.group);
    const skParts = storekeeper.group.children[0].userData.parts;
    storekeeper.update = (dt, elapsed) => applyRestock(skParts, elapsed);
    npcs.push(storekeeper);
    interactables.push({
      id: storekeeper.id, label: storekeeper.label, isNpc: true, npc: storekeeper,
      position: new THREE.Vector3(skX, y0, skZ), radius: 3.0
    });
  }

  /* ------------------------------------------------------------ upper floors */
  // Bharati is genuinely three floors in real life — this was ground-floor
  // only for most of this project, with a single blanket collider sealing
  // everything above it as "unmodelled, like the wings of a building nobody
  // walks into". That was fair for a first pass on a building this size, but
  // it undersells the real thing badly. Two more floors, reached by a single
  // stairwell shaft stacked directly on top of itself (floor 2's flight
  // occupies y 2.6→6.2 in that shaft, floor 3's flight continues 6.2→9.8
  // directly above it) — the same footprint climbing twice rather than two
  // separately-routed staircases, which is both the realistic way a real
  // stairwell works and the layout least likely to accidentally overlap
  // something else in a building already fairly full at ground level.
  //
  // Bounds for both floors were checked against the shell's own tapering
  // rings (see ringAt()) at both floor and ceiling height for each level —
  // the prismatoid narrows a lot by floor 3, so floor 3's room is
  // deliberately smaller than floor 2's, not just copy-pasted.
  // Every call site below only ever built the housing + glowing lens mesh —
  // a light fixture that looks lit but casts no actual light, because
  // nothing here ever added a real THREE.PointLight next to it (the
  // Maitri mezzanine's equivalent helper has the same gap, but every call
  // site there happens to add its own separate PointLight alongside it;
  // none of these did). With every ceiling fixture in floors 2 and 3
  // decorative-only, those rooms had nothing but weak ambient bounce to
  // read by — which is exactly "the floor is completely black".
  const lightFixture = (x, y, z) => {
    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.1, 0.08, 10),
      new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.6, metalness: 0.4 })
    );
    housing.position.set(x, y + 0.06, z);
    root.add(housing);
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.02, 10),
      new THREE.MeshStandardMaterial({ color: 0xfff6df, emissive: 0xfff1cf, emissiveIntensity: 1.8 })
    );
    lens.position.set(x, y, z);
    root.add(lens);
    // 4.5 (the first pass at "give this a real light at all") turned out to
    // be too much once every one of the 8 call sites for this on floors 2
    // and 3 had a genuine PointLight stacking with buildInterior's own 3
    // strip lights per room — overcorrected from "completely black" to
    // washed-out white. 2.2 still reliably lights the floor without that.
    const light = new THREE.PointLight(0xfff1cf, 2.2, 9, 2);
    light.position.set(x, y - 0.15, z);
    root.add(light);
  };


  // The main entrance stair below (built earlier in this function) also
  // auto-widens its run under buildAccessStair's MIN_TREAD rule — its
  // caller asked for run:4.6, but with 14 steps that widens to 7.0, which
  // silently moves its actual landing to local z≈8.9, not the z≈11.3 the
  // variable names nearby imply. This stairwell's z0=9 sits almost exactly
  // on top of that real landing — centred on x=0, the two would physically
  // overlap. Off-centring this whole stairwell (both flights, both rooms)
  // to x=-8 clears the main landing by several metres in X, which is a
  // simpler and more robust fix than trying to thread a narrow Z gap
  // between two stairs that both computed their own real dimensions late.
  // Both flights live in the one stairwell shaft (STAIRW above), side by
  // side in X rather than stacked in Z: flight 1 runs down the west half,
  // flight 2 up the east half, so arriving on floor 2 you step off one
  // landing and walk three metres across to the foot of the next. Stacking
  // them in Z instead is what forces a floor slab to be both "the landing
  // you stand on" and "the hole the next flight climbs through" at the same
  // coordinates, which is the shape of every stairwell bug in this file's
  // history.
  // A SWITCHBACK, not two parallel flights. The shaft is 6 m wide; two 2.6 m
  // flights side by side left 0.4 m between their guard rails and 0.2 m to
  // the east wall, so the guards — which run the full length of every flight
  // by design, because they are what stops you walking off the side — formed
  // an unbroken palisade with no gap wide enough for the player's 0.84 m
  // body to get between. The stairs were built, lit and visible, and there
  // was physically no way onto a tread. That is the "stairs are there but
  // inaccessible" bug.
  //
  // Real flights are ~1.2-1.5 m wide, not 2.6. Narrowing them to 1.5 and
  // running flight 2 the OTHER way (dir: +1) buys a 2.2 m aisle down the
  // middle of the shaft and turns the climb into what a real station
  // stairwell actually is: up the west side, turn on the floor-2 landing,
  // back up the east side.
  const STAIR_X = -13.1;      // flight 1: floor 1 -> floor 2, climbing -z
  const STAIR2_X = -10.4;     // flight 2: floor 2 -> floor 3, climbing +z
  const STAIR_W = 1.5;

  const stair1 = buildAccessStair({
    width: STAIR_W, top: floor2Y - y0, run: 10.0, z0: 6.6, baseY: y0, dir: -1,
    frameMat: MAT.frame(), steelMat: MAT.steelGrey()
  });
  stair1.mesh.position.x = STAIR_X;
  root.add(stair1.mesh);
  const stair1Colliders = stair1.colliders.map(b => new THREE.Box3(
    b.min.clone().setX(b.min.x + STAIR_X), b.max.clone().setX(b.max.x + STAIR_X)
  ));
  extraColliders.push(...stair1Colliders);
  {
    const midY = (y0 + floor2Y) / 2, midZ = (6.6 + stair1.landingZ) / 2;
    lightFixture(STAIR_X, midY + 1.6, midZ);
    // The shared lightFixture()'s intensity/range (2.2 over 9 units) is
    // tuned for floors 2/3's low ceil2/ceil3=3.0 rooms — this shaft is
    // taller (climbing the full floor1→floor2 rise through the ceilHole
    // cut above) and wider open air besides, so the one fixture here left
    // most of the climb looking up into it as a dim point in otherwise
    // total black — reported as "the hole for the stairs is a black dot".
    // A brighter, longer-throw supplemental light (no extra visible
    // fixture needed; the housing above already reads as the source)
    // actually fills the shaft instead of just marking a point in it.
    // (Originally tuned much higher — 11 — while the floor-level accent
    // bands were still solid capped discs sealing every floor off from the
    // one above; that trapped this light in a small sealed pocket, and
    // this intensity was what it took to fill even that. Now that the
    // bands are open rings (see the real fix: prismatoid()'s caps option),
    // light actually reaches through to the floor above instead of
    // bouncing around a sealed box, and the old value overexposed badly.)
    const shaftLight = new THREE.PointLight(0xeaf2ff, 6, 20, 1.6);
    shaftLight.position.set(STAIR_X, midY + 1.6, midZ);
    root.add(shaftLight);
    // The top of the climb sits in a gap between floor1's ceiling hole and
    // floor2's own room (floor2's z1 boundary is well short of the
    // landing, at z≈-2.3 vs. the landing's z≈-1) — a stub of shaft that
    // belongs to neither room's own lighting, and mid-shaft falloff from
    // the light above doesn't reach it either. Left dark, that's exactly
    // the last stretch of climb (and the ceiling right above the hole)
    // that read as "a black dot" rather than an opening into anything.
    const topLight = new THREE.PointLight(0xeaf2ff, 4, 14, 1.8);
    topLight.position.set(STAIR_X, floor2Y - 0.3, stair1.landingZ);
    root.add(topLight);
  }

  // z1 is NOT stair1.landingZ directly — buildAccessStair's own landing
  // collider extends 1.2 m south of landingZ (see kit.js: "flush with the
  // last tread"), and starting the room's floor collider exactly at
  // landingZ made it overlap that landing collider for that whole 1.2 m
  // stretch. Two colliders occupying the same space fought over which one
  // resolved the player's position each frame, which is what turned into a
  // sudden multi-metre teleport right at the top of the first flight.
  // Starting the room 1.3 m further in gives the landing collider a clean
  // handoff to the room floor with no shared volume.
  // FLOOR 2 — the living floor. bof architekten list it as "24 single and
  // double rooms ... a kitchen and dining room, a library, a fitness room,
  // an OP room, as well as the offices and a lounge", and that is the room
  // schedule built here. Cabins run down the west side off the spine (four
  // rooms of six berths reads as ~24 the way the real thing counts them),
  // the social rooms take the east side where the big glazed facade is, and
  // the offices sit at the quiet north end.
  //
  // The stairwell keeps the same footprint as floor 1 but with a hole in the
  // slab over flight 1's shaft — the flight climbs into this floor, so the
  // floor cannot be solid where it arrives. The hole stops short of the
  // landing so there is continuous support to step out onto.
  // Floor 2 sits in a wider band of the hull than floor 1 does (the
  // prismatoid is widest at mid-height), so its plate is cut to that ring
  // rather than copying floor 1's.
  const OUT_W2 = -23.5, OUT_E2 = 23.5;
  const floor2 = buildFloorPlan({
    floorY: floor2Y, ceilH: ceil2, palette: PALETTE.bharati, lowLights: engine.quality === 'low',
    floorHoles: [{ x0: STAIR_X - 1.15, x1: STAIR_X + 1.15, z0: stair1.landingFarZ, z1: 2.7 }],
    rooms: [
      { id: 'spine2',     x0: -SPINE, x1: SPINE, z0: -13, z1: 13, theme: 'corridor' },
      { id: 'warm2',      x0: -8, x1: -SPINE, z0: 4.6, z1: 8, theme: 'corridor' },
      { id: 'stairwell2', ...STAIRW, theme: 'stairwell', label: 'STAIRS  ^  FLOOR 3', noCeil: true },
      { id: 'cabin1', x0: -8, x1: -SPINE, z0: 2,   z1: 4.6, theme: 'dorm', label: 'CABINS 1-6' },
      { id: 'cabin2', x0: -8, x1: -SPINE, z0: -2,  z1: 2,  theme: 'dorm', label: 'CABINS 7-12' },
      { id: 'cabin3', x0: -8, x1: -SPINE, z0: -6,  z1: -2, theme: 'dorm', label: 'CABINS 13-18' },
      { id: 'cabin4', x0: -8, x1: -SPINE, z0: -10, z1: -6, theme: 'dorm', label: 'CABINS 19-24' },
      { id: 'laundry', x0: -8, x1: -SPINE, z0: -13, z1: -10, theme: 'storage', label: 'LAUNDRY' },
      { id: 'kitchen2', x0: SPINE, x1: 6,  z0: 6,   z1: 13, theme: 'kitchen', label: 'KITCHEN' },
      // Bharati winters ~25 too, and this is their one dining room — sized and
      // seated for the whole complement, same rule as Maitri's mess.
      { id: 'dining',   x0: 6,     x1: 14, z0: 6,   z1: 13, theme: 'mess',    label: 'DINING', seats: 25 },
      { id: 'lounge2',  x0: SPINE, x1: 8,  z0: 2,   z1: 6,  theme: 'lounge',  label: 'LOUNGE' },
      { id: 'library',  x0: 8,     x1: 14, z0: 2,   z1: 6,  theme: 'lounge',  label: 'LIBRARY' },
      { id: 'gym',      x0: SPINE, x1: 8,  z0: -2,  z1: 2,  theme: 'gym',     label: 'FITNESS' },
      { id: 'medical2', x0: 8,     x1: 14, z0: -2,  z1: 2,  theme: 'medical', label: 'OP ROOM' },
      { id: 'office1',  x0: SPINE, x1: 8,  z0: -6,  z1: -2, theme: 'office',  label: 'OFFICES' },
      { id: 'office2',  x0: 8,     x1: 14, z0: -6,  z1: -2, theme: 'office',  label: 'OFFICES' },
      { id: 'archive',  x0: SPINE, x1: 14, z0: -10, z1: -6, theme: 'office',  label: 'DATA ARCHIVE' },
      { id: 'sick2',    x0: SPINE, x1: 14, z0: -13, z1: -10, theme: 'medical', label: 'SICK BAY' },

      // ---- OUTBOARD BAYS, living floor -----------------------------------
      // bof architekten list "24 single and double rooms" on this floor. Four
      // six-berth rooms was a way of counting to 24 in half the space; with
      // the plate cut to the hull there is room for the cabins the drawing
      // actually describes, plus the rec and service rooms that go with them.
      // Cabins do not open off each other. The west bay gets its own corridor
      // against the shaft wall, and every cabin doors onto that — which is
      // also the only way to reach them, since flight 1 occupies the shaft
      // wall itself for most of its length.
      { id: 'wcorr',  x0: -17.5,  x1: -14, z0: -7,  z1: 13,  theme: 'corridor' },
      { id: 'cabinA', x0: OUT_W2, x1: -17.5, z0: 8,   z1: 13,  theme: 'dorm', label: 'CABINS 25-28' },
      { id: 'cabinB', x0: OUT_W2, x1: -17.5, z0: 3,   z1: 8,   theme: 'dorm', label: 'CABINS 29-32' },
      { id: 'cabinC', x0: OUT_W2, x1: -17.5, z0: -2,  z1: 3,   theme: 'dorm', label: 'CABINS 33-36' },
      { id: 'cabinD', x0: OUT_W2, x1: -17.5, z0: -7,  z1: -2,  theme: 'dorm', label: 'CABINS 37-40' },
      { id: 'quiet',  x0: OUT_W2, x1: -14, z0: -13, z1: -7,  theme: 'lounge', label: 'QUIET ROOM' },
      { id: 'rec',    x0: 14, x1: OUT_E2,  z0: 6,   z1: 13,  theme: 'lounge', label: 'RECREATION' },
      { id: 'games',  x0: 14, x1: OUT_E2,  z0: 0,   z1: 6,   theme: 'lounge', label: 'GAMES ROOM' },
      { id: 'comms2', x0: 14, x1: OUT_E2,  z0: -6,  z1: 0,   theme: 'command', label: 'COMMS' },
      { id: 'meeting',x0: 14, x1: OUT_E2,  z0: -13, z1: -6,  theme: 'office',  label: 'CONFERENCE' },
      { id: 'lobby2', x0: -14, x1: -SPINE,  z0: 8,   z1: 13,  theme: 'corridor' },
      { id: 'plant2b',x0: -14, x1: -8,      z0: -13, z1: -8,  theme: 'utility', label: 'AIR HANDLING' }
    ],
    doors: [
      { a: 'spine2', b: 'warm2', w: 2.6 },
      { a: 'warm2', b: 'stairwell2', w: 3.0 },
      { a: 'spine2', b: 'cabin1' }, { a: 'spine2', b: 'cabin2' },
      { a: 'spine2', b: 'cabin3' }, { a: 'spine2', b: 'cabin4' },
      { a: 'spine2', b: 'kitchen2' }, { a: 'kitchen2', b: 'dining' },
      { a: 'spine2', b: 'lounge2' },  { a: 'lounge2', b: 'library' },
      { a: 'spine2', b: 'gym' },      { a: 'gym', b: 'medical2' },
      { a: 'spine2', b: 'office1' },  { a: 'office1', b: 'office2' },
      { a: 'spine2', b: 'archive' },
      { a: 'spine2', b: 'laundry' },
      { a: 'spine2', b: 'sick2' },
      // Same correction as floor 1: the west cabins border the stairwell
      // shaft, not the inboard cabins.
      { a: 'wcorr', b: 'cabinA' }, { a: 'wcorr', b: 'cabinB' },
      { a: 'wcorr', b: 'cabinC' }, { a: 'wcorr', b: 'cabinD' },
      { a: 'wcorr', b: 'quiet' },
      { a: 'wcorr', b: 'lobby2' },
      { a: 'stairwell2', b: 'plant2b' },
      { a: 'stairwell2', b: 'lobby2' },
      { a: 'spine2',     b: 'lobby2', at: 10.5 },
      { a: 'lobby2',     b: 'cabinA' },
      { a: 'quiet',      b: 'plant2b' },
      { a: 'dining', b: 'rec' },    { a: 'library', b: 'games' },
      { a: 'medical2', b: 'comms2' }, { a: 'comms2', b: 'meeting' },
      { a: 'sick2', b: 'meeting' }
    ]
  });
  root.add(floor2.mesh);
  extraColliders.push(...floor2.colliders);
  animated.push(...floor2.animated);
  const R2 = floor2.rooms;
  Object.assign(root.userData.rooms, floor2.rooms);

  /* ---------------------------------------------------- data archive room */
  // Bharati's own National Polar Data Archive feature — bigger than
  // Maitri's (7.5 m of cabinet frontage vs. 6.0 m of shelving) and built
  // from entirely different assets (archiveServerRack + dataTerminal, not
  // libraryShelf + readingDesk): a bank of steel records cabinets with
  // glowing category labels and status LEDs, and a terminal to query them
  // from, on the central floor of a three-storey building rather than
  // tucked into a corner of the ground floor.
  {
    // Flush against the room's own north wall (z0=-9) — clear of stair2's
    // ceiling hole (x -10..-6, z -6.7..-3.2) and both NPCs below (z=-6.5)
    // since the rack never leaves the -9..-6.9-ish band at all, and clear
    // of the glaciologist (x=-14) / comms officer (x=-2) since its 7.5 m
    // width centred on STAIR_X only reaches x -11.75..-4.25.
    const archX = R2.archive.cx, archZ = R2.archive.z0 + 0.5, termZ = R2.archive.z0 + 2.1;
    const rack = archiveServerRack(CATEGORIES, 7.5, 0.5);
    rack.position.set(archX, floor2Y, archZ);
    root.add(rack);
    extraColliders.push(boxOf(archX, floor2Y, archZ, 7.6, 2.3, 0.6));

    const terminal = dataTerminal();
    terminal.position.set(archX, floor2Y, termZ);
    root.add(terminal);
    extraColliders.push(boxOf(archX, floor2Y, termZ + 0.3, 1.4, 0.8, 0.9));

    const archiveLight = new THREE.PointLight(0x5fd9ff, 1.1, 6, 2);
    archiveLight.position.set(archX, floor2Y + 2.0, archZ + 1.0);
    root.add(archiveLight);

    interactables.push({
      id: 'bharati-data-archive',
      label: 'Query the National Polar Data Archive',
      position: new THREE.Vector3(archX, floor2Y, termZ),
      radius: 3.2,
      opensCodex: true
    });
  }

  {
    // Clear of the sample carousel the oceanography variant puts just
    // off the room centre, and of the bench run along the far wall.
    const gx = R1.labocean.cx - 1.2, gz = R1.labocean.cz;
    const glaciologist = buildNPC(
      'scientist', { x: gx, z: gz }, 0.6,
      'Dr. Ramesh Iyer', 'Glaciologist',
      [
        'Everything I know about this ice sheet\'s past comes from cores drilled right here — each metre down is roughly another few decades back in time.',
        'Floor two is where the actual analysis happens. What you saw drilled downstairs on a data run gets sectioned, logged and read up here.',
        'Larsemann Hills sits on exposed bedrock, not ice — which is exactly why it was picked. We can anchor instruments to real rock instead of a moving ice sheet.',
        'People assume glaciology is about the past. Mostly it\'s about the next fifty years — how fast this ice actually moves is the number everyone downstream is waiting on.'
      ]
    );
    // Floor 1: the labs are on the lower level in this building, and gx/gz
    // above are a floor-1 room. Leaving the Y on floor 2 put him one storey
    // up, standing inside a bunk in the cabins.
    glaciologist.group.position.set(gx, y0, gz);
    root.add(glaciologist.group);
    npcs.push(glaciologist);
    interactables.push({
      id: glaciologist.id, label: glaciologist.label, isNpc: true, npc: glaciologist,
      position: new THREE.Vector3(gx, y0, gz), radius: 3.0
    });

    const cx2 = R2.office1.cx, cz2 = R2.office1.cz + 1.1;
    const commsOfficer = buildNPC(
      'radioOperator', { x: cx2, z: cz2 }, -0.6,
      'Priyanka Shah', 'Communications Officer',
      [
        'This floor is where the satellite window actually gets worked — the dish on the roof is just the antenna, the schedule and the queue live up here.',
        'Every winterer gets a call-home slot. Scheduling twenty-five people through one narrow satellite pass a day is the real puzzle of this job.',
        'Three countries share these hills — Bharati, Zhongshan, Progress. Half my week is routine coordination traffic with stations that are, technically, our neighbours.',
        'When the link genuinely drops for a stretch, this floor gets very quiet very fast. People notice being cut off from home a lot faster than they\'d ever admit.',
        'Personal calls aren\'t the only traffic through here — Bharati is a ground station for Indian earth-observation satellites. Cartosat, Scatsat, Resourcesat — the raw imagery comes down through this roof before it ever reaches Hyderabad for processing.'
      ]
    );
    commsOfficer.group.position.set(cx2, floor2Y, cz2);
    root.add(commsOfficer.group);
    npcs.push(commsOfficer);
    interactables.push({
      id: commsOfficer.id, label: commsOfficer.label, isNpc: true, npc: commsOfficer,
      position: new THREE.Vector3(cx2, floor2Y, cz2), radius: 3.0
    });
  }

  // stair2 does NOT reuse stair1's own z0=9/run=10 corridor. It looked
  // elegant on paper — "one stairwell shaft, second flight stacked directly
  // above the first" — but a walking player's head sits 1.72 m above their
  // feet, and for roughly the top third of stair1's climb that head is
  // already higher than floor2Y, i.e. already inside stair2's own collider
  // range even though the feet are nowhere near stair2 yet. The two flights
  // sharing a footprint meant a climbing player's head kept snagging stair2
  // treads from below, which is what was actually behind the violent
  // mid-climb teleport this took a long time to track down. Building stair2
  // Flight 2 is the return leg of the switchback: same 10 m run and same
  // realistic 0.18 m rise as flight 1, but climbing +z up the middle of the
  // shaft. The two flights never share a Z-range at the same height, so
  // there is no airspace for a head to intrude into, and the earlier
  // workaround for that — a 0.5 m stepRise, i.e. 7 half-metre risers with
  // 1.4 m treads, a ladder rather than a stair — is gone.
  const stair2 = buildAccessStair({
    // z0 was -4.4, which put the top landing at z = 3.4..6.8 -- and floor 3's
    // north wall is at z = 6.92. A landing whose far edge is 12 cm from a wall
    // is not a landing you can stand on: the player's 0.42 m radius means the
    // last 0.42 m of it is unusable, and with the last step's guard posts
    // closing in from the sides the only remaining way off the stairs was a
    // 0.45 m gap. Starting the flight 2.2 m further south lands it at
    // z = 3.2..4.6 and leaves a clear 2.4 m of real floor to step out onto.
    width: STAIR_W, top: floor3Y - floor2Y, run: 10.0, z0: -6.6, baseY: floor2Y, dir: 1,
    frameMat: MAT.frame(), steelMat: MAT.steelGrey()
  });
  stair2.mesh.position.x = STAIR2_X;
  root.add(stair2.mesh);
  const stair2Colliders = stair2.colliders.map(b => new THREE.Box3(
    b.min.clone().setX(b.min.x + STAIR2_X), b.max.clone().setX(b.max.x + STAIR2_X)
  ));
  extraColliders.push(...stair2Colliders);
  {
    const midY = (floor2Y + floor3Y) / 2, midZ = (-6.6 + stair2.landingZ) / 2;
    lightFixture(STAIR2_X, midY + 1.6, midZ);
  }

  // FLOOR 3 — "the air conditioning system as well as the terrace which can
  // be used for diverse scientific experiments". Not living space: a plant
  // room and an open deck. The shell has narrowed a lot by this height (see
  // the rings), so this floor is deliberately smaller than floor 2 rather
  // than the same rectangle copied upward.
  const floor3 = buildFloorPlan({
    floorY: floor3Y, ceilH: ceil3, palette: PALETTE.bharati, lowLights: engine.quality === 'low',
    // The hole has to start where a DESCENDING player's head would otherwise
    // meet the underside of this slab. Two things make that further out than
    // the ramp line suggests, and both were got wrong first time round: the
    // player stands on a step's TOP, which is up to a full 0.18 m rise above
    // the ramp at that z, and the capsule is 0.42 m in radius, so the head
    // fouls the slab's cut edge nearly half a metre before reaching it.
    // Together that is 0.6 m of extra clearance over the naive figure -- the
    // difference between a clean walk down and clipping the soffit at
    // z = -2.0, which the flight probe caught.
    floorHoles: [{ x0: STAIR2_X - 1.15, x1: STAIR2_X + 1.15, z0: -2.9, z1: stair2.landingFarZ }],
    rooms: [
      // Runs the full depth now: flight 2 climbs +z and arrives at z=+5.6, so
      // a stairwell that stopped at z=-2 did not contain its own landing.
      { id: 'stairwell3', x0: -12, x1: -8, z0: -8, z1: 7,  theme: 'stairwell', label: 'STAIRS  v  FLOOR 2' },
      { id: 'plant3',     x0: -8,  x1: 4,  z0: -8, z1: 7,  theme: 'utility', variant: 'ahu', label: 'AIR HANDLING' },
      // Was an "experiment terrace": a roofless room with literally nothing
      // in it, which is not a space, it is a gap in the plan. A station lands
      // a year of everything in one summer and it has to live somewhere, so
      // this is the store that holds it — numbered pallet racking, palletised
      // loads, painted forklift lanes and a picking desk.
      { id: 'terrace',    x0: 4,   x1: 12, z0: -8, z1: 7,  theme: 'highbay', label: 'SUMMER STORE' }
    ],
    doors: [
      { a: 'stairwell3', b: 'plant3', w: 2.6 },
      { a: 'plant3', b: 'terrace' }
    ]
  });
  root.add(floor3.mesh);
  extraColliders.push(...floor3.colliders);
  animated.push(...floor3.animated);
  const R3 = floor3.rooms;
  Object.assign(root.userData.rooms, floor3.rooms);

  // Named the same way the huts and observatory out in the field already
  // are — otherwise a fully furnished floor (tables, the cook, the stove)
  // reads as just "a room" rather than the mess hall it actually is.
  const messSign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.45),
    new THREE.MeshStandardMaterial({
      map: signText('MESS HALL', { color: '#ffffff', bg: '#12324f', w: 1024 }),
      roughness: 0.7
    })
  );
  // This was at (STAIR_X, floor3Y + 2.3, stair2.landingZ - 1.5) -- x = -13.1,
  // which is outside floor 3 entirely (its rooms span x = -12..12), at a z
  // with no wall behind it. So a 2.4 m MESS HALL sign hung in clear air
  // outside the building, on the floor that holds the plant room and the
  // summer store and no mess at all. The dining room is on FLOOR 2, and the
  // flight that lands there is stair1, so the sign belongs on the wall a
  // climber faces as they arrive: the stairwell's south wall at z = -8.
  messSign.position.set(STAIR_X, floor2Y + 2.3, -7.85);
  messSign.rotation.y = 0;
  root.add(messSign);

  lightFixture(STAIR_X, floor3Y + ceil3 - 0.15, -8.5);
  lightFixture(STAIR_X - 8, floor3Y + ceil3 - 0.15, -9.5);
  lightFixture(STAIR_X + 8, floor3Y + ceil3 - 0.15, -9.5);

  {
    const kx = R2.kitchen2.cx - 1.3, kz = R2.kitchen2.z0 + 1.5;
    const cook = buildNPC(
      'cook', { x: kx, z: kz }, Math.PI,
      'Deepak Nair', 'Station Cook',
      [
        'Top floor, mess hall, same as every station down here — heat rises, and nobody wants to carry hot food up two flights instead of down.',
        'Twenty-five people, three meals a day, for months with nothing else arriving — the menu repeats eventually, but running out isn\'t an option, so I plan the stores like it\'s a siege.',
        'Meal times are the one point in the day the whole winter team is actually in the same room. That matters here as much as the food does.',
        'I trained in a hotel kitchen in Kochi. Nothing about that prepared me for provisioning six months at a time, but you learn fast when the alternative is a very unhappy building.',
        'Tuesdays are sweets, no matter what else is going on — jalebi, halwa, dry-fruit laddoos if the stores allow it. On a storm day when nobody\'s left the building in three days, that one small ritual does more than people admit.'
      ]
    );
    cook.group.position.set(kx, floor3Y, kz);
    root.add(cook.group);
    npcs.push(cook);
    interactables.push({
      id: cook.id, label: cook.label, isNpc: true, npc: cook,
      position: new THREE.Vector3(kx, floor3Y, kz), radius: 3.0
    });
  }

  /* ------------------------------------------------------- roof equipment */
  const roofY = y0 + S.height;
  const topRing = rings[rings.length - 1];

  const rd = radome(1.9);
  rd.position.set(-topRing.hx * 0.5, roofY, 0);
  root.add(rd);

  const dsh = dish(1.6);
  dsh.position.set(topRing.hx * 0.45, roofY, -1);
  dsh.rotation.y = -0.5;
  root.add(dsh);

  const mast = latticeMast(9, 0.5, MAT.galv());
  mast.position.set(topRing.hx * 0.1, roofY, topRing.hz * 0.4);
  root.add(mast);

  const obLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 3 })
  );
  obLight.position.set(topRing.hx * 0.1, roofY + 9.3, topRing.hz * 0.4);
  root.add(obLight);
  animated.push({ blink: obLight });

  // Solar array on the roof.
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x0f1c33, roughness: 0.22, metalness: 0.7
  });
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.08, 1.6), panelMat);
    p.position.set(-topRing.hx * 0.6 + i * 3.3, roofY + 0.7, -topRing.hz * 0.35);
    p.rotation.x = -0.62;
    p.castShadow = true;
    root.add(p);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), MAT.galv());
    stand.position.set(-topRing.hx * 0.6 + i * 3.3, roofY + 0.35, -topRing.hz * 0.35);
    root.add(stand);
  }

  /* ------------------------------------------------------------- signage */
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 3.9),
    new THREE.MeshStandardMaterial({
      map: signText('BHARATI', { color: '#ffffff' }),
      transparent: true, alphaTest: 0.35,
      emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.6
    })
  );
  sign.position.set(0, y0 + S.height * 0.90, ringAt(rings, y0 + S.height * 0.90).hz + 0.25);
  root.add(sign);

  const triPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 4),
    new THREE.MeshStandardMaterial({ map: tricolour(), roughness: 0.6 })
  );
  const tz = ringAt(rings, y0 + S.height * 0.30);
  triPanel.position.set(-tz.hx * 0.62, y0 + S.height * 0.30, tz.hz + 0.2);
  root.add(triPanel);

  /* --------------------------------------------------------------- flags */
  [
    { tex: tricolour() },
    { tex: bandFlag('china') },
    { tex: bandFlag('russia') }
  ].forEach((f, i) => {
    const fl = flag(f.tex, { poleH: 9, w: 2.4, h: 1.6 });
    fl.position.set(-10 + i * 10, 0, ringAt(rings, y0).hz + 14);
    root.add(fl);
    animated.push({ flag: fl });
  });

  interactables.push({
    id: 'pub-larsemann',
    label: 'Read the ASMA 6 management plan',
    position: new THREE.Vector3(0, 0, ringAt(rings, y0).hz + 16),
    radius: 6
  });

  /* --------------------------------------------------- container yard */
  // The leftovers from construction, now the station's warehouse. These are
  // the same objects the building itself is made of, which is worth seeing.
  //
  // Every prop placed here also gets an AABB pushed into outdoorColliders —
  // previously none of the yard (containers, drums, the vehicle) had any
  // collision at all, so the player could walk straight through a stacked
  // shipping container as if it were painted scenery.
  const outdoorColliders = [];
  const colors = ['#2f6f4e', '#b8862a', '#8c3b28', '#2a5f8c', '#6a6f74'];
  for (let i = 0; i < 16; i++) {
    const c = container(colors[i % colors.length]);
    const row = Math.floor(i / 6), col = i % 6;
    const cx = -S.length * 0.55 - 12 + col * 7.0;
    const cy = row === 2 ? 2.59 : 0;
    const cz = 18 + (row % 2) * 3.6;
    c.position.set(cx, cy, cz);
    c.rotation.y = (i % 3) * 0.04;
    root.add(c);
    // Real container footprint (6.06 x 2.59 x 2.44, see kit.js) — the tiny
    // rotation above (≤0.08 rad) is small enough to ignore for an AABB.
    outdoorColliders.push(boxOf(cx, cy, cz, 6.06, 2.59, 2.44));
  }

  interactables.push({
    id: 'med-winter',
    label: 'Look inside the container store',
    position: new THREE.Vector3(-S.length * 0.55 - 2, 0, 22),
    radius: 5
  });

  for (let i = 0; i < 18; i++) {
    const d = drum(i % 3 === 0 ? '#b23a1f' : '#1f4f8f');
    const dx = S.length * 0.55 + 6 + (i % 6) * 0.68;
    const dy = Math.floor(i / 6) > 1 ? 0.88 : 0;
    const dz = -14 - Math.floor(i / 6) * 0.68;
    d.position.set(dx, dy, dz);
    root.add(d);
    outdoorColliders.push(boxOf(dx, dy, dz, 0.6, 0.88, 0.6));
  }

  // A utility snowmobile parked in the vehicle bay, which is what that room
  // is FOR and what it was conspicuously missing. Bharati runs sleds of this
  // class for sea-ice and short-range traverse work; the bay is 7.5 m x 8.8 m,
  // so a 3.28 m sled nosed at the roller door sits in it with room to walk
  // right round, which is how a vehicle bay is actually laid out.
  {
    const sled = snowmobile('#1c5fa8');
    const sx = 18.4, sz = 6.4;
    sled.position.set(sx, y0, sz);
    sled.rotation.y = Math.PI / 2;          // nose toward the bay door (+z)
    root.add(sled);
    keepDynamic(sled);                       // its own curved profiles, not baked flat
    // Rotated a quarter turn, so its 3.28 m length lies along Z and its
    // 1.20 m width along X.
    extraColliders.push(new THREE.Box3(
      new THREE.Vector3(sx - 0.62, y0, sz - 1.66),
      new THREE.Vector3(sx + 0.62, y0 + 1.30, sz + 1.66)
    ));
  }

  // A tracked hydraulic excavator parked hard against the building, which is
  // exactly where the real one sits in the reference photograph of Bharati —
  // by the stair foot, boom folded, slewed off the fore-and-aft line. Cat 330
  // GC class, the machine Antarctica New Zealand actually cold-weather prepare
  // for the ice (docs/REFERENCES.md §5). This used to be the snow groomer
  // prop wearing yellow paint, which is a different machine entirely and read
  // as one.
  // Parked the way an operator leaves one: boom up, stick folded back, bucket
  // set down on the ground. Not a detail — a machine left with its bucket in
  // the air is a machine that has been left unsafe, and the first pose here
  // buried the bucket 0.8 m UNDER the ground because the linkage angles were
  // picked by eye instead of solved. These are solved against the real 6.2 m
  // boom / 3.2 m stick so the teeth land on grade.
  const veh = trackedExcavator('#e3a712', { slew: -0.7, boom: 0.6, stick: -1.85 });
  const vehX = S.length * 0.4, vehZ = ringAt(rings, y0).hz + 18;
  veh.position.set(vehX, 0, vehZ);
  veh.rotation.y = 1.4;
  veh.traverse(o => { if (o.isMesh) o.castShadow = true; });
  root.add(veh);
  animated.push({ tick: (dt, t) => {
    // The beacon on a parked machine is left running; in a place that is dark
    // half the year that is not decoration, it is how you avoid walking into
    // it. Slow rotating-mirror pulse, not a blink.
    const b = veh.userData.beacon;
    if (b) b.material.emissiveIntensity = 0.5 + Math.pow(Math.max(0, Math.sin(t * 2.4)), 6) * 3.4;
  } });
  // Tracks run 4.2 m fore-and-aft on a 2.6 m gauge, and the boom folds forward
  // past the nose; rotated ~80 deg that long axis lies mostly along world Z.
  outdoorColliders.push(boxOf(vehX, 0, vehZ, 3.6, 3.4, 5.6));

  /* ------------------------------------------------------------ markers */
  for (let i = 0; i < 12; i++) {
    const z = ringAt(rings, y0).hz + 20 + i * 4.5;
    for (const sx of [-1, 1]) {
      const m = routeMarker(1.5, sx > 0 ? 0xd83a2a : 0x2a6ed8);
      m.position.set(sx * 4.2, 0, z);
      root.add(m);
      animated.push({ winMat: m.userData.capMat, winBase: 2.2 });
    }
  }

  /* --------------------------------------------------------- colliders */
  // Previously this was ONE solid box covering the entire ground floor (so
  // the interior could never be entered) plus a second box sitting exactly
  // in the doorway opening (so even the threshold was sealed). Replaced
  // with: each floor's own real colliders, both new stairs' own stepped
  // colliders (side-guarded automatically — see buildAccessStair), and a
  // single blanket block covering only the attic void above floor 3's own
  // ceiling — genuinely unmodelled, unreachable, same reasoning as Maitri's
  // long unmodelled wings.
  const atticStart = floor3Y + ceil3;
  const colliders = [
    boxOf(0, atticStart, 0, S.length * 0.98, (y0 + S.height) - atticStart, S.width * 0.98),
    ...stair.colliders,
    ...interior.colliders,
    ...outdoorColliders,
    ...extraColliders
  ];


  /* --------------------------------------------------------------- bake */
  // Everything above builds the station the readable way: a mesh per stilt,
  // per beam, per brace, per cladding band, per drum. That came to EIGHT
  // HUNDRED AND SEVENTEEN draw calls for Maitri's exterior alone — CPU
  // submission work done on the main thread every frame, which is what was
  // holding an RTX 4060 at 21 fps. None of it moves, so all of it can be one
  // mesh per material.
  //
  // What genuinely moves is marked first and left alone: the doors (they
  // slide), the NPCs (they walk), the vehicle (its beacon pulses), the flags
  // (a vertex shader animates the cloth), and the interior floor plans (the
  // culler switches those room groups individually, so merging them would
  // destroy the culling that makes interiors cheap).
  for (const d of doors) keepDynamic(d.mesh);
  for (const n of npcs) keepDynamic(n.group);
  for (const a of animated) { if (a.flag) keepDynamic(a.flag); }
  keepDynamic(root.getObjectByName('field-kit'));
  keepDynamic(floor1.mesh);
  keepDynamic(floor2.mesh);
  keepDynamic(floor3.mesh);
  keepDynamic(veh);
  bakeStatic(root);

  return { root, interactables, animated, npcs, doors, colliders, spec: S, storagePoint, entranceInside, entranceOutside };
}

/* ================================================================ helpers */

function boxOf(x, y, z, w, h, d) {
  return new THREE.Box3(
    new THREE.Vector3(x - w / 2, y, z - d / 2),
    new THREE.Vector3(x + w / 2, y + h, z + d / 2)
  );
}

/** Interpolate a plan ring at an arbitrary height. */
function ringAt(rings, y) {
  if (y <= rings[0].y) return rings[0];
  if (y >= rings[rings.length - 1].y) return rings[rings.length - 1];
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / (b.y - a.y);
      return {
        y,
        hx: a.hx + (b.hx - a.hx) * t,
        hz: a.hz + (b.hz - a.hz) * t,
        cut: a.cut + (b.cut - a.cut) * t
      };
    }
  }
  return rings[0];
}

/**
 * Build a closed faceted solid from a stack of octagonal plan rings.
 * `cut` is the chamfer fraction at each corner — this is what turns a box into
 * the wind-splitting form, so it is a first-class parameter rather than a bevel
 * modifier applied afterwards.
 */
function prismatoid(rings, material, { caps = true, doorCut = null } = {}) {
  const plan = (hx, hz, cut) => {
    const cx = hx * cut, cz = hz * cut;
    return [
      [-hx + cx, -hz], [hx - cx, -hz],
      [hx, -hz + cz], [hx, hz - cz],
      [hx - cx, hz], [-hx + cx, hz],
      [-hx, hz - cz], [-hx, -hz + cz]
    ];
  };

  const positions = [];
  const normals = [];
  const uvs = [];

  const layers = rings.map(r => ({ y: r.y, pts: plan(r.hx, r.hz, r.cut) }));
  const N = layers[0].pts.length;

  const pushTri = (a, b, c) => {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ac = new THREE.Vector3().subVectors(c, a);
    const n = new THREE.Vector3().crossVectors(ab, ac).normalize();
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
    }
    uvs.push(0, 0, 1, 0, 1, 1);
  };

  // Sides. Edge i=4→5 is the flat front face (plan()'s two front-corner
  // points, both at z=+hz) — the one wall every station entrance sits
  // against. When doorCut is given and this band's top doesn't clear the
  // doorway, that edge is split into a left and right strip clipped at
  // ±xHalf instead of one unbroken quad, leaving a REAL hole through the
  // shell rather than door dressing bolted onto a solid wall behind it
  // (which is what this looked like before: the shell was one continuous
  // lofted solid with no opening at all, so from outside — or through the
  // open shutter — there was never anything but cladding to see). Callers
  // insert a ring at exactly doorCut.yTop first, so no band straddles the
  // cut boundary and the rest of the hull needs no special-casing.
  for (let l = 0; l < layers.length - 1; l++) {
    const lo = layers[l], hi = layers[l + 1];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      if (doorCut && i === 4 && hi.y <= doorCut.yTop + 1e-4) {
        const xh = doorCut.xHalf;
        const loZ = lo.pts[4][1], hiZ = hi.pts[4][1];
        // Right strip: from the true right corner in to the door edge.
        const loR1 = new THREE.Vector3(lo.pts[4][0], lo.y, loZ);
        const loR2 = new THREE.Vector3(xh, lo.y, loZ);
        const hiR1 = new THREE.Vector3(xh, hi.y, hiZ);
        const hiR2 = new THREE.Vector3(hi.pts[4][0], hi.y, hiZ);
        pushTri(loR1, loR2, hiR1);
        pushTri(loR1, hiR1, hiR2);
        // Left strip: from the door edge out to the true left corner.
        const loL1 = new THREE.Vector3(-xh, lo.y, loZ);
        const loL2 = new THREE.Vector3(lo.pts[5][0], lo.y, lo.pts[5][1]);
        const hiL1 = new THREE.Vector3(hi.pts[5][0], hi.y, hi.pts[5][1]);
        const hiL2 = new THREE.Vector3(-xh, hi.y, hiZ);
        pushTri(loL1, loL2, hiL1);
        pushTri(loL1, hiL1, hiL2);
        continue;
      }
      const a = new THREE.Vector3(lo.pts[i][0], lo.y, lo.pts[i][1]);
      const b = new THREE.Vector3(lo.pts[j][0], lo.y, lo.pts[j][1]);
      const c = new THREE.Vector3(hi.pts[j][0], hi.y, hi.pts[j][1]);
      const d = new THREE.Vector3(hi.pts[i][0], hi.y, hi.pts[i][1]);
      pushTri(a, b, c);
      pushTri(a, c, d);
    }
  }

  // Caps (fan from centre) — only when actually wanted. The main hull uses
  // this to close off its roof and foundation, which is correct: those are
  // the building's real top and bottom, nothing needs to be seen past them.
  // But the SAME function was reused for the two floor-level accent bands
  // lower down (a thin ring wrapping the shell at each storey split), and
  // capped, a "band" stops being a thin ring and becomes a SOLID DISC
  // spanning the entire footprint — a false floor/ceiling sitting mid-air
  // at head height inside the building, in both interiors AND square in
  // the stairwells that are supposed to climb through that exact height.
  // That was the real reason the floor above never became visible no
  // matter how much light was thrown at the stairwell: the sightline
  // itself was blocked by solid geometry a couple of metres up, the same
  // class of bug as Maitri's own full-depth "band" strip.
  if (caps) {
    const capTop = layers[layers.length - 1];
    const capBot = layers[0];
    const ct = new THREE.Vector3(0, capTop.y, 0);
    const cb = new THREE.Vector3(0, capBot.y, 0);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      pushTri(
        ct,
        new THREE.Vector3(capTop.pts[i][0], capTop.y, capTop.pts[i][1]),
        new THREE.Vector3(capTop.pts[j][0], capTop.y, capTop.pts[j][1])
      );
      pushTri(
        cb,
        new THREE.Vector3(capBot.pts[j][0], capBot.y, capBot.pts[j][1]),
        new THREE.Vector3(capBot.pts[i][0], capBot.y, capBot.pts[i][1])
      );
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
