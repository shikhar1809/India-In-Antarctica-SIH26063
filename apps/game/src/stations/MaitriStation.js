import * as THREE from 'three';
import {
  MAT, stilt, crossBrace, latticeMast, radome, dish, flag, tricolour, bandFlag,
  signText, windowUnit, drum, container, routeMarker, snowVehicle,
  buildAccessStair, buildInterior, libraryShelf, readingDesk, storageBay, snowmobile,
  kitchenUnit, chestFreezer, potRack, INTERIOR_CEIL
} from './kit.js';
import { buildFloorPlan, PALETTE } from './interior.js';
import { bakeStatic, keepDynamic } from '../core/bake.js';
import { buildNPC, applyRestock } from './NPCs.js';
import { CATEGORIES } from '../data/archive.js';

/**
 * MaitriStation — built to match the published front elevation.
 *
 * Proportions are taken from the reference photography rather than drawings,
 * because — as the reference sheet itself flags — no architectural footprint
 * for the current Maitri structure is public. What IS documented and is
 * reproduced faithfully here:
 *
 *   · a single elongated block, elevated on a steel stilt understructure
 *   · two occupied storeys with a raised central section
 *   · the tricolour painted across the central facade panel
 *   · MAITRI in individual letters on the roof
 *   · a line of national flags along the approach (the oasis is shared —
 *     Novolazarevskaya is ~5 km away)
 *   · white route markers lining the path
 *
 * Local origin sits at ground level, centred under the building. +Z is the
 * approach direction (you walk toward the facade).
 */

export const MAITRI_SPEC = {
  length: 68,        // along X
  depth: 13,         // along Z
  clearance: 3.3,    // stilt height — snow blows under, not against
  storey: 3.15,
  storeys: 2,
  centralWidth: 19,
  centralRise: 3.4,
  parapet: 0.75
};

export function buildMaitri(engine, opts = {}) {
  const S = MAITRI_SPEC;
  const root = new THREE.Group();
  root.name = 'maitri';

  const interactables = [];
  const animated = [];
  const npcs = [];
  const doors = [];
  // Populated by blocks that run before the final `colliders` array is
  // constructed further down (e.g. the mezzanine) — merged in there.
  const extraColliders = [];
  // Interior plan groups, kept out of the exterior bake (the culler needs them).
  const labModuleMeshes = [];

  const bodyBottom = S.clearance;
  const bodyTop = bodyBottom + S.storey * S.storeys;      // 3.3 + 6.3 = 9.6
  const roofY = bodyTop + S.parapet;
  const centralTop = bodyTop + S.centralRise;

  const clad = MAT.cladding();
  const cladDark = MAT.claddingDark();
  const steel = MAT.steel();
  const frameMat = MAT.frame();
  const glassMat = MAT.glass();
  const litMat = MAT.glassLit();

  /* ---------------------------------------------------- understructure */
  // Two rows of stilts, cross-braced. This is the single most important
  // visual fact about the building and it is why it is still standing.
  const stiltGroup = new THREE.Group();
  const bays = 11;
  const bayStep = S.length / bays;
  for (let i = 0; i <= bays; i++) {
    const x = -S.length / 2 + i * bayStep;
    for (const z of [-S.depth / 2 + 1.2, S.depth / 2 - 1.2]) {
      const s = stilt(bodyBottom, 0.17, steel);
      s.position.set(x, 0, z);
      stiltGroup.add(s);
    }
    // Transverse beam tying the pair together.
    if (i <= bays) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, S.depth - 2.0), steel);
      beam.position.set(x, bodyBottom - 0.2, 0);
      beam.castShadow = true;
      stiltGroup.add(beam);
    }
  }
  // Longitudinal X-bracing in every other bay, on both faces — except the
  // bay(s) spanning the entrance (x≈0, where the stairs and door are). The
  // bracing pattern used to run the same every-other-bay rhythm straight
  // through that bay with no regard for what was there, so a diagonal brace
  // landed right across the view up the stairs from most approach angles —
  // structurally harmless (there's still bracing one bay either side) but
  // visually reads as junk cluttering the one part of the building every
  // player actually walks up to.
  for (let i = 0; i < bays; i += 2) {
    const x1 = -S.length / 2 + i * bayStep;
    const x2 = x1 + bayStep;
    // ±5 rather than ±3 — at ~6.18 m bay spacing, ±3 only ever excluded the
    // single bay dead-centred on the entrance; the two bays flanking it
    // still crossed close enough to the stairs and railings to show up in
    // frame from most approach angles, which is exactly what was still
    // visible after the first pass at this fix.
    if (x1 < 5 && x2 > -5) continue;
    for (const z of [-S.depth / 2 + 1.2, S.depth / 2 - 1.2]) {
      const br = crossBrace(x1, x2, bodyBottom - 0.3, steel, 0.06);
      br.position.z = z;
      stiltGroup.add(br);
    }
  }
  // Continuous ground beams the stilts sit on.
  for (const z of [-S.depth / 2 + 1.2, S.depth / 2 - 1.2]) {
    const gb = new THREE.Mesh(new THREE.BoxGeometry(S.length + 2, 0.3, 0.45), steel);
    gb.position.set(0, 0.15, z);
    gb.receiveShadow = true;
    stiltGroup.add(gb);
  }
  root.add(stiltGroup);

  /* ------------------------------------------------------------- body */
  // Underfloor deck — seen from below, this is a dark insulated soffit.
  const soffit = new THREE.Mesh(
    new THREE.BoxGeometry(S.length, 0.5, S.depth),
    new THREE.MeshStandardMaterial({ color: 0x3a4247, roughness: 0.9 })
  );
  soffit.position.y = bodyBottom + 0.25;
  soffit.castShadow = soffit.receiveShadow = true;
  root.add(soffit);

  // `main` used to be ONE box spanning the building's full 68 m length —
  // including the width the central block (and, inside it, the mess hall)
  // also occupies. Central's own geometry got a real doorway cut through it
  // (see below), but that only ever mattered once you could see far enough
  // in to reach where `main`'s solid mass was still sitting, completely
  // untouched, through the ENTIRE mess hall footprint: same x-range,
  // overlapping y-range (main's own 2-storey height covers the room's
  // 5.3 m ceiling with only ~1 m to spare), and z-range fully inside
  // central's. Before central's doorway was real, nobody could see far
  // enough in to notice; the moment it was, this was the very next thing
  // standing in the room — a solid cladding wall filling the doorway a
  // couple of metres past the frame, exactly the "white thing blocking the
  // view" report. Split into the two actual wings, flanking the central
  // block's width, since central's own (now-open) volume already covers
  // that span at every height that matters.
  const mainH = S.storey * S.storeys;
  const mainY = bodyBottom + 0.5 + mainH / 2;

  // ...and then the two wings were still SOLID BOXES, which is the same bug
  // one level out. Splitting `main` in two stopped it filling the mess hall,
  // but each wing is 24.5 m long, 13 m deep and both storeys tall, and the
  // interior floor plan now runs PX0..PX1 = -30..+30 -- so 20.5 m of solid
  // cladding block sat INSIDE the finished interior at each end of the
  // building. You could walk through it (the colliders are separate, and they
  // only cover the 4 m beyond the plan), but you could not see through it:
  // standing in the length corridor you looked down the hall and hit a
  // corrugated cladding face at x = +/-9.5, floor to ceiling, with the
  // corridor's own floor visibly continuing underneath it and out the other
  // side. That is exactly the "weird steel structure, passable but blocking
  // views" report.
  //
  // A building's exterior is a SKIN, not a solid. The interior builds its own
  // walls, floors and ceilings, so all the shell owes it is the outside
  // surface: the two long facades and an end cap. Nothing is lost visually --
  // from outside these are the only faces that were ever on screen -- and the
  // interior volume is finally actually empty.
  const SKIN = 0.3;
  const skinH = mainH + 0.6;                   // up into the roof slab's shadow
  const skinY = bodyBottom + 0.5 + skinH / 2;
  for (const [wx0, wx1] of [[-S.length / 2, -S.centralWidth / 2], [S.centralWidth / 2, S.length / 2]]) {
    const w = wx1 - wx0;
    const cx = (wx0 + wx1) / 2;
    // The two long facades.
    for (const sz of [-1, 1]) {
      const face = new THREE.Mesh(new THREE.BoxGeometry(w, skinH, SKIN), clad);
      face.position.set(cx, skinY, sz * (S.depth / 2 - SKIN / 2));
      face.castShadow = face.receiveShadow = true;
      applyRepeat(face, clad, w / 8, skinH / 3.2);
      root.add(face);
    }
    // The gable end, at the building's outer extreme -- never the central end,
    // which is exactly where the corridor has to run through.
    const outer = wx0 < 0 ? wx0 : wx1;
    const endX = outer + (wx0 < 0 ? SKIN / 2 : -SKIN / 2);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(SKIN, skinH, S.depth), clad);
    cap.position.set(endX, skinY, 0);
    cap.castShadow = cap.receiveShadow = true;
    applyRepeat(cap, clad, S.depth / 8, skinH / 3.2);
    root.add(cap);
  }

  // A darker recessed band at the floor split — visible on the real building
  // as the service/insulation zone between storeys. Built as two thin
  // facing strips (front + back), NOT the single solid S.depth-deep box
  // this used to be: that box was 13 m deep, spanning the building's ENTIRE
  // depth at y≈6.95–7.4 (world) — a full slab silently bisecting the
  // interior at head-and-above height everywhere inside it, invisible from
  // outside (where it just looked like the intended accent stripe) but a
  // solid, close-range occluder for any sightline inside the building that
  // crossed that height, mezzanine included. Confirmed by ray-testing the
  // exact camera ray that was failing to see the mezzanine's own new
  // canopy light: this band, 1.3 m away, was what was actually being
  // looked at — not a lighting problem at all. Two 0.1 m-thick facing
  // strips read identically from outside and leave the interior volume
  // actually open.
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x4a5459, roughness: 0.8, metalness: 0.2 });
  const bandY = bodyBottom + 0.5 + S.storey;
  for (const bz of [-S.depth / 2 - 0.03, S.depth / 2 + 0.03]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(S.length + 0.06, 0.42, 0.1), bandMat);
    band.position.set(0, bandY, bz);
    root.add(band);
  }

  /* ------------------------------------------- the interior envelope ---
   * The shell must not intrude into the space the floor plans occupy, and
   * until now the only record of where that space WAS lived 400 lines below,
   * next to the plans themselves. So every time the interior grew, the shell
   * silently kept its old idea of where the rooms ended -- which is how a
   * pair of 24 m3 cladding walls ended up standing across the length
   * corridor. Declared once, here, and used by both.
   */
  const INT_Z0 = -S.depth / 2 + 0.3;      // plan's south edge (PZ0 below)
  const INT_Z1 = S.depth / 2 - 0.3;       // plan's north edge (PZW below)
  const FLOOR2_Y = 6.8;                   // floor 2 slab
  const CEIL2_H = 2.4;                    // floor 2 clear height
  const INT_TOP = FLOOR2_Y + CEIL2_H;     // 9.2 -- nothing above this is interior

  /* --------------------------------------------------- central section */
  const cW = S.centralWidth, cD = S.depth + 1.6;
  const centralH = mainH + S.centralRise;
  const centralY = bodyBottom + 0.5 + centralH / 2;
  const centralMat = clad.clone();
  if (centralMat.map) { centralMat.map = centralMat.map.clone(); centralMat.map.repeat.set(cW / 8, centralH / 3.2); centralMat.map.needsUpdate = true; }
  if (centralMat.normalMap) { centralMat.normalMap = centralMat.normalMap.clone(); centralMat.normalMap.repeat.set(cW / 8, centralH / 3.2); centralMat.normalMap.needsUpdate = true; }

  // The doorway is a REAL gap in the geometry, not a face hidden behind a
  // transparent/invisible material — that was tried first (per-face
  // materials on a single BoxGeometry, one group set transparent+opacity:0)
  // and it did not work: a multi-material box still rendered every group
  // opaque regardless of one material's own transparent/opacity settings,
  // confirmed by literally recolouring each face a different colour and
  // seeing the "invisible" one still fill the screen solid. The previous
  // single-box `central` reached all the way to the door's own surface
  // (frontZ), so opening the door only ever revealed cladding a few
  // centimetres behind it — never an actual opening — which is what
  // "opens onto a black/solid screen" was, this many times over.
  //
  // Matches frameOuterW (the door frame dressing built below, in the
  // "entrance" section) exactly — that frame's own outer edge is where the
  // recessed jambs/lintel physically stop, so cutting the shell any
  // narrower than that leaves an unfinished pocket between the shell's cut
  // edge and the frame's outer edge with nothing closing it off, exposing
  // whatever sits behind (the building's structural steel) rather than a
  // clean, fully-dressed opening. 3.2 also matches the interior room's own
  // doorW, so all three layers — shell, frame, interior wall — now line up.
  // 2.35, not 2.8: floor 1's clear height came down to 2.6 when the second
  // storey went in, and a door cut through the shell TALLER than the room
  // behind it shows the floor-2 slab's cut edge through the top of its own
  // opening from outside.
  const doorGapHalf = 3.2 / 2, doorGapTopY = bodyBottom + 0.5 + 2.35;

  const frontZ = 0.8 + cD / 2;                 // the facade plane (unchanged)
  const shellFrontZ = frontZ - 0.5;             // where the bulk box now stops
  const centralD = shellFrontZ - (0.8 - cD / 2);
  const centralZ = 0.8 - cD / 2 + centralD / 2;
  const centralBottomY = bodyBottom + 0.5, centralTopY = bodyBottom + 0.5 + centralH;

  // `central` used to be a single solid box reaching the full width and
  // height — carving the thin OUTER strip open (below) left this bulk mass
  // completely untouched directly behind it, so standing at the open door
  // and looking straight in hit this box's own solid front face a few
  // centimetres past the frame: a flat lit cladding panel filling the
  // entire opening, exactly what "a white thing blocking the view" was.
  //
  // The mess hall (built below by buildInterior, roomX0..roomX1 wide) is
  // hollowed out of this SAME box, over nearly this SAME depth — central's
  // footprint isn't just "a wall with a door", it's most of the room's own
  // volume. A first pass at this fix only cut a doorGapHalf-wide slot
  // through it, matching the door — leaving the two edges of that slot as
  // full-depth, full-height solid walls running along BOTH SIDES OF THE
  // ROOM ITSELF, the width of a real wall short of the room's own furnished
  // walls. Standing inside reads as walking down a narrow tunnel between
  // two cladding walls toward the actual room, not as being in the room.
  // The flanks below are sized to the ROOM's own boundary instead — narrow
  // strips (cW/2 minus roomHalfW, i.e. just the ~0.6 m of real wall
  // thickness outside where buildInterior's own walls already stand) that
  // close off the true exterior mass without ever intruding into the
  // room's own interior air.
  const roomHalfW = cW / 2 - 0.6;   // matches buildInterior's own roomX0/roomX1 below
  const flankW = cW / 2 - roomHalfW;
  // ...and sizing them to "the room's own boundary" was right only while the
  // central block held ONE room. It now holds part of a 60 m floor plan with
  // a corridor running the length of the building straight through it, so
  // each of these was a 0.6 m thick, 9.7 m tall, 14 m deep corrugated wall
  // standing across that corridor at x = +/-9.2 -- cutting through six rooms
  // a side, on both floors. That is the grey ribbed panel blocking the view
  // down the hall, and hollowing out the WINGS did not touch it because it
  // was never the wings: it was the central block's own flanks.
  //
  // A flank is only real where it faces the outdoors. Three places do:
  // above the interior (the raised clerestory's sides), the 1.4 m the block
  // protrudes past the plan at the front, and the 0.3 m sliver at the back.
  // Everything between those is interior air and must not be built at all.
  const zA = centralZ - centralD / 2, zB = centralZ + centralD / 2;
  const SHELL_TOP = INT_TOP + 0.2;
  for (const sx of [-1, 1]) {
    const fx = sx * (roomHalfW + flankW / 2);
    const piece = (y0f, y1f, z0f, z1f) => {
      if (y1f - y0f < 0.05 || z1f - z0f < 0.05) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry(flankW, y1f - y0f, z1f - z0f), centralMat);
      m.position.set(fx, (y0f + y1f) / 2, (z0f + z1f) / 2);
      m.castShadow = m.receiveShadow = true;
      root.add(m);
    };
    piece(SHELL_TOP, centralTopY, zA, zB);            // clerestory sides, above the rooms
    piece(centralBottomY, SHELL_TOP, zA, INT_Z0);     // back sliver, behind the plan
    piece(centralBottomY, SHELL_TOP, INT_Z1, zB);     // the nose that protrudes at the front
  }
  // This used to start at doorGapTopY (2.8 m up) and run the full cW width —
  // correct for the THIN facade strip below (that's what lintel2 handles),
  // completely wrong for this deep bulk mass: the mess hall's ceiling isn't
  // until roomCeilH (5.3 m) up, and in between sits the radio mezzanine
  // (floorY+2.5 to roughly floorY+4.4 of stand-up headroom) — built
  // specifically to use "the height budget" this room has above the door's
  // own modest height. A cap starting at 2.8 m ran solid cladding straight
  // through the middle of that platform's headroom, the same class of bug
  // as the flanks above, just vertical instead of horizontal. Only above
  // the room's REAL ceiling — which is buildInterior's own separate slab,
  // already the true boundary between "inside the mess hall" and "unmodelled
  // mass above it" — is there anything here that actually needs to be solid.
  const roomCeilTopY = centralBottomY + 5.3 + 0.3;   // matches roomCeilH below, plus the ceiling slab's own thickness
  const capH = centralTopY - roomCeilTopY;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(cW, capH, centralD), centralMat);
  cap.position.set(0, roomCeilTopY + capH / 2, centralZ);
  cap.castShadow = cap.receiveShadow = true;
  root.add(cap);

  // The facing strip: two solid segments flanking a genuine doorway gap,
  // plus a lintel filling the wall ABOVE the opening back in, all sitting
  // in the shellFrontZ→frontZ slot the bulk box no longer occupies — from
  // outside the building looks identical to before (same facade plane,
  // same cladding), the doorway is just an actual hole now.
  const stripD = frontZ - shellFrontZ, stripZ = (shellFrontZ + frontZ) / 2;
  for (const sx of [-1, 1]) {
    const segW = cW / 2 - doorGapHalf;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(segW, centralH, stripD), centralMat);
    seg.position.set(sx * (doorGapHalf + segW / 2), centralY, stripZ);
    seg.castShadow = seg.receiveShadow = true;
    root.add(seg);
  }
  const lintelH2 = (bodyBottom + 0.5 + centralH) - doorGapTopY;
  const lintel2 = new THREE.Mesh(new THREE.BoxGeometry(doorGapHalf * 2, lintelH2, stripD), centralMat);
  lintel2.position.set(0, doorGapTopY + lintelH2 / 2, stripZ);
  lintel2.castShadow = lintel2.receiveShadow = true;
  root.add(lintel2);

  /* ------------------------------------------------------- roof + parapet */
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(S.length + 0.5, S.parapet, S.depth + 0.5), cladDark
  );
  roof.position.y = bodyTop + 0.5 + S.parapet / 2;
  roof.castShadow = roof.receiveShadow = true;
  root.add(roof);

  const centralRoof = new THREE.Mesh(
    new THREE.BoxGeometry(cW + 0.5, S.parapet, cD + 0.5), cladDark
  );
  centralRoof.position.set(0, centralTop + 0.5 + S.parapet / 2, 0.8);
  centralRoof.castShadow = true;
  root.add(centralRoof);

  /* ------------------------------------------------------- the tricolour */
  // Painted flat onto the central facade panel, upper storey.
  // A wide banner panel, as painted on the real building — roughly 3:1, not
  // the 3:2 of an actual flag, because it has to fit a facade band.
  const flagW = cW * 0.74, flagH = flagW / 3.05;
  const triGeo = new THREE.PlaneGeometry(flagW, flagH);
  const triMat = new THREE.MeshStandardMaterial({
    map: tricolour(), roughness: 0.62, metalness: 0.05
  });
  const triY = bodyBottom + 0.5 + S.storey + S.storey * 0.55;

  // The white surround goes on FIRST and sits flush with the wall. It has real
  // thickness, so the flag plane must clear the front of that box — putting the
  // plane inside the box's depth range hides it completely.
  const triFrame = new THREE.Mesh(
    new THREE.BoxGeometry(flagW + 0.7, flagH + 0.7, 0.10), MAT.white()
  );
  triFrame.position.set(0, triY, cD / 2 + 0.80);   // spans z 0.75 … 0.85
  root.add(triFrame);

  const tri = new THREE.Mesh(triGeo, triMat);
  tri.position.set(0, triY, cD / 2 + 0.94);        // clear of the frame's face
  root.add(tri);

  interactables.push({
    id: 'med-maitri-front',
    label: 'Read the station facade',
    position: new THREE.Vector3(0, bodyBottom + 1.0, cD / 2 + 6),
    radius: 5.5
  });

  /* ------------------------------------------------------ MAITRI signage */
  const signW = cW * 0.62;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(signW, signW * 0.28),
    new THREE.MeshStandardMaterial({
      map: signText('MAITRI', { color: '#ffffff' }),
      transparent: true, alphaTest: 0.35,
      // The sign must read against a bright sky even when the facade is in
      // shadow, so it is driven by emissive rather than diffuse. Sunlight
      // alone would leave the letters darker than the sky behind them.
      emissiveMap: signText('MAITRI', { color: '#ffffff' }),
      emissive: 0xffffff, emissiveIntensity: 1.35,
      roughness: 0.6, side: THREE.DoubleSide
    })
  );
  sign.position.set(0, centralTop + 0.5 + S.parapet + signW * 0.16, 0.8 + cD / 2 - 0.4);
  root.add(sign);
  // Support frame the letters are mounted on.
  for (const x of [-signW / 2, signW / 2]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, signW * 0.3, 6), MAT.galv());
    p.position.set(x, centralTop + 0.5 + S.parapet + signW * 0.15, 0.8 + cD / 2 - 0.4);
    root.add(p);
  }

  /* ----------------------------------------------------------- windows */
  // Instanced: ~90 window units would otherwise be 90 draw calls.
  const winW = 1.0, winH = 1.25;
  const winPositions = [];
  const perFloorGap = 3.4;
  const count = Math.floor((S.length - 6) / perFloorGap);
  for (let f = 0; f < S.storeys; f++) {
    const y = bodyBottom + 0.5 + S.storey * f + S.storey * 0.58;
    for (let i = 0; i < count; i++) {
      const x = -((count - 1) * perFloorGap) / 2 + i * perFloorGap;
      // Skip where the central block and entrance are.
      if (Math.abs(x) < cW / 2 + 0.6) continue;
      winPositions.push([x, y, S.depth / 2 + 0.02, 0]);        // front
      winPositions.push([x, y, -S.depth / 2 - 0.02, Math.PI]); // back
    }
    // Central block gets windows flanking the tricolour on the upper floor only.
    if (f === 1) {
      for (const x of [-cW / 2 + 1.8, cW / 2 - 1.8]) {
        winPositions.push([x, y, cD / 2 + 0.82, 0]);
      }
    }
  }
  // End walls.
  for (let f = 0; f < S.storeys; f++) {
    const y = bodyBottom + 0.5 + S.storey * f + S.storey * 0.58;
    for (const sx of [-1, 1]) {
      for (const z of [-3, 0, 3]) {
        winPositions.push([sx * (S.length / 2 + 0.02), y, z, sx * Math.PI / 2]);
      }
    }
  }

  addInstancedWindows(root, winPositions, winW, winH, frameMat, glassMat, litMat);
  // Tie the pre-picked "occupied" windows to the day/night cycle instead of
  // leaving them lit at a fixed brightness around the clock — see the
  // `winMat` handling in site.js's update loop.
  animated.push({ winMat: litMat, winBase: 1.6 });

  /* ---------------------------------------------------------- entrance */
  // Recessed doorway under the tricolour. Previously both the recess and
  // the door itself used near-black base colours (0x11171b, 0x243038) on
  // the assumption the porch light would carry them — but that surface
  // faces away from the sun most of the day by design (see the sunAlt/sunAzi
  // comment above), and even the porch light at full intensity barely lifted
  // it off pure black. Lightened both materials so the doorway reads as
  // "a doorway in shadow", not "a hole in the wall", regardless of what the
  // sun and the day/night light cycle are doing at any given moment.
  // A FRAME (two jambs + a lintel), not a solid slab — this used to be one
  // continuous 3.2×2.6m box, and shrinking its depth (an earlier pass on
  // this exact bug) only moved the problem, it didn't remove it: a flat
  // panel that wide is still dead ahead of anyone standing anywhere near
  // the door, and the approach stair's own landing (plus the "read the
  // station facade" / "enter the station log" interactables, both of which
  // pull the player in close) put players as little as ~0.6 m from its
  // face — close enough that a panel this size fills the ENTIRE camera
  // frustum regardless of lighting, which is exactly what "opens onto a
  // black screen" was: not a lighting bug, a wall physically too close to
  // the camera. There was also no collider on it, so nothing stopped a
  // player walking straight up to (or into) it either. A frame with a real
  // opening — matching the door's own doorClosedY/doorH span — means
  // there's no single surface big enough to do that: from any distance,
  // straight ahead is either a narrow jamb or open air through to the door
  // and the mess hall beyond it. Exactly the fix already applied to
  // Bharati's equivalent recess.
  const doorwayMat = new THREE.MeshStandardMaterial({ color: 0x2c3944, roughness: 0.85 });
  const frameOuterW = 3.2, frameOuterH = 2.6, frameOpenW = 1.9, frameDepth = 0.3;
  const frameY = bodyBottom + 0.5 + 1.35, frameZ = cD / 2 + 0.7;
  const jambW = (frameOuterW - frameOpenW) / 2;
  const jambColliders = [];
  for (const sx of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(jambW, frameOuterH, frameDepth), doorwayMat);
    const jx = sx * (frameOpenW / 2 + jambW / 2);
    jamb.position.set(jx, frameY, frameZ);
    root.add(jamb);
    jambColliders.push(box(jx, frameY - frameOuterH / 2, frameZ, jambW, frameOuterH, frameDepth));
  }
  const frameOpenH = 2.4;
  const lintelH = frameOuterH - frameOpenH;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(frameOuterW, lintelH, frameDepth), doorwayMat);
  lintel.position.set(0, frameY - frameOuterH / 2 + frameOpenH + lintelH / 2, frameZ);
  root.add(lintel);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 2.2, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x44586a, roughness: 0.55, metalness: 0.3 })
  );
  const doorClosedY = bodyBottom + 0.5 + 1.15;
  door.position.set(0, doorClosedY, cD / 2 + 0.9);
  root.add(door);

  // A lit vertical strip down the centre and a small view-window with a
  // warm glow behind it — both self-illuminating (emissive), so the door
  // reads clearly as "a door" even in full shadow rather than depending
  // entirely on ambient/point-light reaching this recessed surface.
  const doorStrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 2.0, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xbfe9ff, emissive: 0x5fd9ff, emissiveIntensity: 1.4, roughness: 0.4 })
  );
  doorStrip.position.set(0.68, 0, 0.07);
  door.add(doorStrip);
  const doorWindow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.42),
    new THREE.MeshStandardMaterial({
      color: 0xffe3ad, emissive: 0xffb85c, emissiveIntensity: 1.1, roughness: 0.5
    })
  );
  doorWindow.position.set(0, 0.35, 0.065);
  door.add(doorWindow);

  // Slides up into the recess above it (2.6 m tall recess vs. a 2.2 m door
  // leaves exactly enough headroom) rather than swinging — a sliding shutter
  // is both the more realistic mechanism for an Antarctic airlock-style entry
  // and the simplest animation: one axis, no hinge pivot to get wrong.
  doors.push({
    mesh: door, axis: 'y', rollHeight: 2.2, rollBottomY: doorClosedY - 1.1,
    localPosition: new THREE.Vector3(0, doorClosedY, cD / 2 + 0.9), radius: 5.5, state: 0
  });

  const porchLight = new THREE.PointLight(0xffd39a, 9, 16, 1.6);
  porchLight.position.set(0, bodyBottom + 0.5 + 2.5, cD / 2 + 1.4);
  root.add(porchLight);
  // A second, close-range light tucked just inside the recess — the porch
  // light alone sits far enough out (and dims far enough at night-sync's
  // daytime floor) that the recess interior still read dark; this one is
  // small, close, and specifically aimed at the door face itself.
  const alcoveLight = new THREE.PointLight(0xdcefff, 3.5, 6, 1.4);
  const alcoveLightPos = [0, bodyBottom + 0.5 + 2.0, cD / 2 + 0.6];
  alcoveLight.position.set(...alcoveLightPos);
  root.add(alcoveLight);
  // Small wall sconce housing — same reasoning as the mezzanine fixtures:
  // an invisible point light with nothing marking where it's mounted reads
  // as light floating unexplained in the middle of the recess.
  const sconce = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.1, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.6, metalness: 0.4 })
  );
  sconce.position.set(alcoveLightPos[0], alcoveLightPos[1], alcoveLightPos[2] - 0.35);
  root.add(sconce);
  animated.push({ light: porchLight, base: 6 });

  interactables.push({
    id: 'exp-maitri-build',
    label: 'Enter the station log',
    position: new THREE.Vector3(0, bodyBottom, cD / 2 + 2.4),
    radius: 4.0
  });

  /* ------------------------------------------------------------ stairs */
  // top must equal the interior floor level below, or the landing and the
  // room floor won't be at the same height and the seam becomes a wall.
  const floorY = bodyBottom + 0.5;
  // A 3.8 m rise at the realistic 0.18 m/step buildAccessStair defaults to
  // needs 21 steps — and 21 steps at the player-radius-safe minimum tread
  // (0.5 m, same MIN_TREAD constant buildAccessStair enforces internally)
  // need a 10.5 m run, not the 6.4 m this used to request. That mismatch
  // wasn't cosmetic: buildAccessStair silently widened the run to keep the
  // stair walkable, which pushes its landing ~4 m further from the door
  // than the door/porch/interior geometry below assumes — a real gap of
  // nothing between "top of the stairs" and "the floor", exactly where a
  // player climbing them got physically stuck, unable to reach the door at
  // all. Matching that same minimum here means the stair is never widened
  // out from under the fixed door position in the first place.
  const stepRise = 0.18;
  const stairSteps = Math.max(6, Math.round(floorY / stepRise));
  const stairRun = Math.max(6.4, stairSteps * 0.5);
  const stairBottomZ = cD / 2 + 1.0 + stairRun;   // buildAccessStair's z0 is the BOTTOM
  const stair = buildAccessStair({
    width: 4.2, top: floorY, run: stairRun, z0: stairBottomZ, baseY: 0,
    frameMat, steelMat: MAT.galv()
  });
  root.add(stair.mesh);

  // Reference points for anything that needs to actually walk in through
  // the front door and up these stairs (the resupply ground crew) rather
  // than cutting straight from the apron to an indoor point.
  const entranceOutside = new THREE.Vector3(0, 0, stairBottomZ + 3);
  const entranceInside = new THREE.Vector3(0, floorY, cD / 2 - 2);

  /* ----------------------------------------------------------- interior */
  // Maitri is ONE main building on stilts — living, dining, lounge, cold
  // store, plant — with the LABORATORIES in separate containerised modules
  // outside it. NCPOR describes the station as "one main building ... and a
  // number of smaller containerized modules", with "containerized laboratory
  // space" specifically called out. That is the structural difference from
  // Bharati's three stacked container levels, and it is built literally here:
  // this floor plate holds everything except the science, and the science
  // sits in three ground-level modules assembled after it.
  //
  // The plate is 17.8 x 13.5 m. A spine corridor runs north from the entry
  // airlock with a range of rooms either side — how a building this shape is
  // actually planned, so every room reaches an outside wall (and its windows)
  // and nothing ends up landlocked behind another room.
  // TWO STOREYS. MAITRI_SPEC has always said storeys: 2 and the shell has
  // always been built 6.3 m tall to match, but only one floor plate was ever
  // laid inside it — the upper half of the building was hollow, unreachable
  // and invisible. Floor 1 is entry, food, plant and workshop; floor 2 is
  // where the station sleeps, reads and gets treated, which is how a real
  // wintering station splits its levels (noisy, dirty, cold work downstairs;
  // quiet and warm upstairs).
  //
  // Heights are constrained top and bottom: the floor slab sits at
  // bodyBottom+0.5, and the central block's solid cap starts at
  // roomCeilTopY (9.4). 2.6 + 2.5 of clear height plus two 0.2 m slabs fits
  // exactly inside that, so neither floor has to be uncomfortably low.
  const roomCeilH = 2.6;                             // floor 1 clear height
  // floor2Y is floor 1's CEILING SLAB TOP, not its underside. buildFloorPlan
  // puts a room's ceiling slab at floorY+ceilH .. floorY+ceilH+0.2 and a
  // floor's own slab at floorY-0.2 .. floorY. At floor2Y = 6.6 those two
  // occupied exactly the same 6.4..6.6 volume, and two coplanar surfaces
  // fighting for the same depth is what produced the heavy horizontal
  // striping across the whole of floor 2 — classic z-fighting, not a texture.
  // 0.2 higher stacks them face to face instead.
  const floor2Y = FLOOR2_Y;
  const ceil2H = CEIL2_H;                            // floor 2 clear height
  const STAIR_RISE = (floor2Y - floorY) / 2;         // per flight of the switchback
  // THE PLATE NOW FILLS THE BUILDING.
  //
  // Maitri is 68 m long. The interior used to be cut to the CENTRAL BLOCK's
  // 19 m width — 17.8 m of usable plate — so 50 m of the building had no
  // inside, and every room was squeezed into a strip. That is why the station
  // office was a cupboard and the mess seated eight: not a furniture problem,
  // a plan problem.
  //
  // The plan is now what a 68 m linear building actually has: a corridor
  // running the LENGTH of it with rooms either side, rather than a short spine
  // across its width. Depth follows the real shell — the wings are S.depth
  // (13 m) deep, the central block projects further forward (cD 14.6), and
  // only the entrance hall uses that projection.
  const SPINE = 1.2;                                 // corridor half-width
  const PX0 = -30, PX1 = 30;                         // 60 m of the 68 m shell
  const PZ0 = INT_Z0;                                // -6.2, inside the wings
  const PZW = INT_Z1;                                // +6.2, wing front face
  const PZ1 = cD / 2;                                // +7.3, central projection
  const SW_X = 20;                                   // stair hall: x 20 .. PX1

  const plan = buildFloorPlan({
    floorY, ceilH: roomCeilH, palette: PALETTE.maitri, lowLights: engine.quality === 'low',
    rooms: [
      // The spine: one corridor, 50 m of it, the way a linear station is
      // actually planned. Everything doors off it.
      { id: 'corridor', x0: PX0, x1: SW_X, z0: -SPINE, z1: SPINE, theme: 'corridor' },
      // Entrance hall in the central block, using the depth the block projects
      // forward — this is the only part of the plan that reaches z = 7.3, and
      // it is where the front door actually is.
      { id: 'airlock',  x0: -5, x1: 5, z0: SPINE, z1: PZ1, theme: 'airlock', label: 'ENTRANCE' },
      // ---- north range -------------------------------------------------
      { id: 'cold',     x0: PX0,   x1: -26,  z0: SPINE, z1: PZW, theme: 'coldstore', label: 'COLD STORE' },
      { id: 'storage',  x0: -26,   x1: -21.5, z0: SPINE, z1: PZW, theme: 'storage',  label: 'DRY STORE' },
      { id: 'kitchen',  x0: -21.5, x1: -16,  z0: SPINE, z1: PZW, theme: 'kitchen',   label: 'GALLEY' },
      // 9 x 5 m and seated for the full winter complement of 25, with the
      // galley directly behind the servery wall so food never crosses the
      // corridor.
      { id: 'mess',     x0: -16,   x1: -5,   z0: SPINE, z1: PZW, theme: 'mess', label: 'MESS HALL', seats: 25 },
      { id: 'workshop', x0: 5,     x1: 13,   z0: SPINE, z1: PZW, theme: 'workshop',  label: 'WORKSHOP' },
      { id: 'garage',   x0: 13,    x1: SW_X, z0: SPINE, z1: PZW, theme: 'workshop',  label: 'VEHICLE BAY' },
      // ---- south range -------------------------------------------------
      // 11 m wide, because the real generator hall is 10.6 m of machine and
      // a plant room narrower than its own plant is not a plant room.
      { id: 'utility',  x0: PX0, x1: -19, z0: PZ0, z1: -SPINE, theme: 'utility', variant: 'genhall', label: 'POWER HOUSE' },
      { id: 'samples',  x0: -19, x1: -12, z0: PZ0, z1: -SPINE, theme: 'samplestore', variant: 'ice', label: 'CORE ARCHIVE' },
      { id: 'lab',      x0: -12, x1: -5,  z0: PZ0, z1: -SPINE, theme: 'lab', variant: 'glaciology', label: 'LABORATORY' },
      { id: 'command',  x0: -5,  x1: 2,   z0: PZ0, z1: -SPINE, theme: 'command', label: 'RADIO / OPS' },
      // The station office is the room the whole place is run from: a control
      // desk with a wall of screens and somebody sitting at it. 10 x 5 m.
      { id: 'office',   x0: 2,   x1: 12,  z0: PZ0, z1: -SPINE, theme: 'office', variant: 'control', label: 'STATION OFFICE' },
      { id: 'medical',  x0: 12,  x1: SW_X, z0: PZ0, z1: -SPINE, theme: 'medical', label: 'MEDICAL' },
      // ---- stair hall, full depth at the east end ----------------------
      { id: 'stairwell', x0: SW_X, x1: PX1, z0: PZ0, z1: PZW, theme: 'stairwell', label: 'STAIRS  ^  FLOOR 2', noCeil: true }
    ],
    doors: [
      // The front door's clear width has to match the hole cut through the
      // shell and the frame dressing exactly (doorGapHalf above), or the three
      // layers disagree and a jamb ends up standing in open air.
      { a: 'airlock', b: 'outside', side: 's', w: doorGapHalf * 2 },
      { a: 'airlock', b: 'corridor' },
      { a: 'corridor', b: 'cold' },    { a: 'corridor', b: 'storage' },
      { a: 'corridor', b: 'kitchen' }, { a: 'corridor', b: 'mess' },
      { a: 'corridor', b: 'workshop' },{ a: 'corridor', b: 'garage' },
      { a: 'corridor', b: 'utility' }, { a: 'corridor', b: 'samples' },
      { a: 'corridor', b: 'lab' },     { a: 'corridor', b: 'command' },
      { a: 'corridor', b: 'office' },  { a: 'corridor', b: 'medical' },
      { a: 'corridor', b: 'stairwell' },
      { a: 'garage',   b: 'stairwell', at: 3.7 },
      { a: 'medical',  b: 'stairwell', at: -3.7 },
      // Serving door straight from galley to mess — the one internal link that
      // isn't off the corridor, because a cook carrying a tray does not walk
      // the long way round.
      { a: 'kitchen', b: 'mess' }
    ]
  });
  root.add(plan.mesh);
  animated.push(...plan.animated);
  const RM = plan.rooms;
  // Published on the group so the interior can be checked programmatically —
  // floor coverage, reachability and NPC placement are all grid tests over
  // these rectangles, and a test that has to guess the room bounds is a test
  // that silently stops covering rooms you add later.
  root.userData.rooms = { ...plan.rooms };

  /* ------------------------------------------------- internal stair + floor 2 */
  // A switchback in the shaft: up the inboard side to a half-landing at the
  // south end, turn, back up the outboard side to floor 2. One straight
  // flight would need a 8 m run for this 2.8 m rise at a realistic 0.18 m
  // riser, which is more depth than a 13.5 m deep building can spare without
  // the stair eating a whole range of rooms.
  const HALF_Y = floorY + STAIR_RISE;                 // half-landing level
  const FA_X = 22.6, FB_X = 26.2, FLIGHT_W = 1.5;

  const flightA = buildAccessStair({
    width: FLIGHT_W, top: STAIR_RISE, run: 4.0, z0: 1.8, baseY: floorY, dir: -1,
    frameMat, steelMat: MAT.galv()
  });
  flightA.mesh.position.x = FA_X;
  root.add(flightA.mesh);
  extraColliders.push(...flightA.colliders.map(b => new THREE.Box3(
    b.min.clone().setX(b.min.x + FA_X), b.max.clone().setX(b.max.x + FA_X)
  )));

  const flightB = buildAccessStair({
    width: FLIGHT_W, top: STAIR_RISE, run: 4.0, z0: -2.4, baseY: HALF_Y, dir: 1,
    frameMat, steelMat: MAT.galv()
  });
  flightB.mesh.position.x = FB_X;
  root.add(flightB.mesh);
  extraColliders.push(...flightB.colliders.map(b => new THREE.Box3(
    b.min.clone().setX(b.min.x + FB_X), b.max.clone().setX(b.max.x + FB_X)
  )));

  // Flight A's own landing only reaches x=7.45; flight B's foot is at x=7.15
  // and its guard rails run the full length of the flight from z=-2.4. That
  // leaves the walk across from the top of one flight to the foot of the
  // next pinched between that guard and whatever bounds the landing to the
  // south — at 1.0 m of gap the player (0.84 m across) technically fits and
  // in practice cannot, so the half-landing is built DEEPER than flight A's
  // own landing rather than flush with it.
  //
  // Two pieces, butted against flight A's landing rather than overlapping
  // it: two colliders sharing a volume at the same height is what used to
  // fight over the player's position and fling them across the room.
  {
    const inner0 = SW_X + 0.08, inner1 = PX1 - 0.08;
    const aEast = FA_X + (FLIGHT_W + 1.4) / 2;        // 7.45, flight A's landing edge
    const aSouth = flightA.landingFarZ;               // -3.4
    const south = aSouth - 1.4;                       // -4.8, the real landing edge
    const north = flightA.landingZ + 0.2;

    const deck = (x0, x1, z0, z1) => {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.2, z1 - z0), frameMat);
      slab.position.set((x0 + x1) / 2, HALF_Y - 0.1, (z0 + z1) / 2);
      slab.castShadow = slab.receiveShadow = true;
      root.add(slab);
      extraColliders.push(new THREE.Box3(
        new THREE.Vector3(x0, HALF_Y - 0.2, z0), new THREE.Vector3(x1, HALF_Y, z1)
      ));
    };
    deck(aEast, inner1, aSouth, north);      // beside flight A's landing
    deck(inner0, inner1, south, aSouth);     // the turning space itself

    // Balustrade along the half-landing's open south edge — without it the
    // turn at the top of flight A is a 1.4 m drop back down to floor 1.
    const rail = new THREE.Mesh(new THREE.BoxGeometry(inner1 - inner0, 1.05, 0.08), MAT.galv());
    rail.position.set((inner0 + inner1) / 2, HALF_Y + 0.525, south + 0.04);
    root.add(rail);
    extraColliders.push(new THREE.Box3(
      new THREE.Vector3(inner0, HALF_Y, south),
      new THREE.Vector3(inner1, HALF_Y + 1.05, south + 0.12)
    ));
  }

  // FLOOR 2 — the quiet floor. Bunks, lounge/library and the medical bay,
  // plus the offices and the air handling that has to sit above the rooms it
  // serves. The stair shaft is a hole right through this slab, stopping
  // exactly at flight B's landing so there is continuous floor to step onto.
  const plan2 = buildFloorPlan({
    floorY: floor2Y, ceilH: ceil2H, palette: PALETTE.maitri, lowLights: engine.quality === 'low',
    floorHoles: [{ x0: SW_X - 0.1, x1: PX1 + 0.1, z0: PZ0 - 0.1, z1: flightB.landingFarZ }],
    rooms: [
      { id: 'corridor2', x0: PX0, x1: SW_X, z0: -SPINE, z1: SPINE, theme: 'corridor' },
      // ---- north range: sleeping and off-duty --------------------------
      { id: 'dorm',    x0: PX0, x1: -23, z0: SPINE, z1: PZW, theme: 'dorm', label: 'BUNK ROOM A' },
      { id: 'dormB',   x0: -23, x1: -16, z0: SPINE, z1: PZW, theme: 'dorm', label: 'BUNK ROOM B' },
      // 12 x 5 m — the room the archive shelving and reading desk stand in.
      { id: 'lounge2', x0: -16, x1: -4,  z0: SPINE, z1: PZW, theme: 'lounge', variant: 'library', label: 'LOUNGE / LIBRARY' },
      { id: 'dormC',   x0: -4,  x1: 4,   z0: SPINE, z1: PZW, theme: 'dorm', label: 'BUNK ROOM C' },
      { id: 'dormD',   x0: 4,   x1: 12,  z0: SPINE, z1: PZW, theme: 'dorm', label: 'BUNK ROOM D' },
      { id: 'store2',  x0: 12,  x1: SW_X, z0: SPINE, z1: PZW, theme: 'storage', label: 'LINEN STORE' },
      // ---- south range -------------------------------------------------
      // 10 x 5 m. A fitness room is the one piece of kit that keeps a winter
      // crew sane, and it was 7 x 3.2 with a treadmill wedged in it.
      { id: 'gym',      x0: PX0, x1: -20, z0: PZ0, z1: -SPINE, theme: 'gym',     label: 'FITNESS' },
      { id: 'medical2', x0: -20, x1: -13, z0: PZ0, z1: -SPINE, theme: 'medical', label: 'MEDICAL BAY' },
      { id: 'office2',  x0: -13, x1: -5,  z0: PZ0, z1: -SPINE, theme: 'office',  label: 'OFFICES' },
      { id: 'comms2',   x0: -5,  x1: 2,   z0: PZ0, z1: -SPINE, theme: 'command', label: 'COMMS' },
      { id: 'plant2',   x0: 2,   x1: 10,  z0: PZ0, z1: -SPINE, theme: 'utility', label: 'AIR HANDLING' },
      { id: 'meeting',  x0: 10,  x1: SW_X, z0: PZ0, z1: -SPINE, theme: 'office', label: 'CONFERENCE' },
      { id: 'stairwell2', x0: SW_X, x1: PX1, z0: PZ0, z1: PZW, theme: 'stairwell', label: 'STAIRS  v  FLOOR 1' }
    ],
    doors: [
      { a: 'corridor2', b: 'dorm' },    { a: 'corridor2', b: 'dormB' },
      { a: 'corridor2', b: 'lounge2' }, { a: 'corridor2', b: 'dormC' },
      { a: 'corridor2', b: 'dormD' },   { a: 'corridor2', b: 'store2' },
      { a: 'corridor2', b: 'gym' },     { a: 'corridor2', b: 'medical2' },
      { a: 'corridor2', b: 'office2' }, { a: 'corridor2', b: 'comms2' },
      { a: 'corridor2', b: 'plant2' },  { a: 'corridor2', b: 'meeting' },
      { a: 'corridor2', b: 'stairwell2' },
      { a: 'store2',    b: 'stairwell2', at: 3.7 },
      { a: 'meeting',   b: 'stairwell2', at: -3.7 }
    ]
  });
  root.add(plan2.mesh);
  extraColliders.push(...plan2.colliders);
  animated.push(...plan2.animated);
  Object.assign(root.userData.rooms, plan2.rooms);

  /* --------------------------------------------------- station controller */
  // Somebody has to be sitting at the desk, or a control room is a room with
  // screens in it. The station leader runs the day from here: who is outside,
  // what the power plant is doing, when the next sked is.
  {
    const OFF = RM.office;
    const ox = OFF.cx - Math.min(OFF.x1 - OFF.x0 - 2.4, 6.4) * 0.14, oz = OFF.z0 + 2.3;
    const controller = buildNPC(
      'technician', { x: ox, z: oz }, Math.PI,
      'Cdr. Arun Nair', 'Station Leader',
      [
        'Everything on that wall is one question: is anybody in trouble right now. Power, weather, and where every field party is. If all three are boring, I have had a good day.',
        'Twenty-five of us winter here. I am not their boss so much as the person who has to know where they all are — nobody steps outside without signing that board.',
        'The met screen is the one I watch. A blizzard closes in faster than people expect, and a party three hours out has to be turned round before it does, not after.',
        'We keep a radio schedule with Bharati and with Novolazarevskaya just up the road. In a place this empty you do not let a neighbour go quiet without asking why.'
      ]
    );
    controller.group.position.set(ox, floorY, oz);
    root.add(controller.group);
    npcs.push(controller);
    interactables.push({
      id: controller.id, label: controller.label, isNpc: true, npc: controller,
      position: new THREE.Vector3(ox, floorY, oz), radius: 3.0
    });
  }

  /* ------------------------------------------------------------ safety board */
  // Every real winter station runs a buddy system and a radio check-out
  // before anyone steps outside. It belongs in the airlock, which is now an
  // actual room you pass through rather than a notional spot by the door.
  {
    const boardX = RM.airlock.x1 - 0.35, boardZ = RM.airlock.cz;
    const safetyBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.46),
      new THREE.MeshStandardMaterial({
        map: signText('BUDDY SYSTEM — RADIO CHECK-OUT REQUIRED', { color: '#ffcf5c', bg: '#1c1408', w: 1024 }),
        roughness: 0.7
      })
    );
    safetyBoard.position.set(boardX, floorY + 1.6, boardZ);
    safetyBoard.rotation.y = -Math.PI / 2;
    root.add(safetyBoard);
    interactables.push({
      id: 'exp-maitri-safety',
      label: 'Read the safety board',
      position: new THREE.Vector3(boardX - 0.6, floorY, boardZ),
      radius: 2.2
    });
  }

  /* ------------------------------------------------ the National Polar */
  /* Data Archive, as a physical room feature — the shelving run and reading */
  /* desk stand in the library, which the real stations list as part of the  */
  /* recreation space. It is on FLOOR 2 now: the shelving run is 5.6 m wide  */
  /* and floor 1's lounge came down to 3.1 m when the stair shaft took the   */
  /* outboard strip, so left where it was the run punched straight through   */
  /* two walls and sealed the staircase. Floor 2's west-range library is     */
  /* 7 m wide and is where this actually belongs.                            */
  const LIB = plan2.rooms.lounge2;
  const libY = floor2Y;
  // Against the far wall, not the corridor wall: the corridor wall is where
  // the door is, and a 5.6 m shelving run parked across it sealed the room.
  const libX = LIB.cx, libZ = LIB.z1 - 0.36;
  const shelf = libraryShelf(CATEGORIES, 5.6, 0.32);
  shelf.position.set(libX, libY, libZ);
  root.add(shelf);

  const desk = readingDesk();
  desk.position.set(libX, libY, libZ - 1.45);
  desk.rotation.y = Math.PI;
  root.add(desk);

  interactables.push({
    id: 'library-desk',
    label: 'Browse the National Polar Data Archive',
    position: new THREE.Vector3(libX, libY, libZ - 1.45),
    radius: 2.4,
    opensCodex: true
  });

  /* --------------------------------------------------------- the galley */
  // The galley theme builds the counter run, range, hood, sink and dry-goods
  // shelving. The chest freezer is placed separately because the cook's own
  // dialogue talks about the between-resupply freezer stores, and it should
  // be a thing standing in the room he can gesture at, not an implication.
  const freezer = chestFreezer(1.3, 0.75);
  freezer.position.set(RM.kitchen.x0 + 0.75, floorY, RM.kitchen.cz + 0.5);
  root.add(freezer);

  const rack = potRack(1.1);
  rack.position.set(RM.kitchen.cx + 1.4, floorY + 1.55, RM.kitchen.z0 + 0.55);
  root.add(rack);

  /* --------------------------------------------------------- the cook */
  // At the range, working the stove that feeds thirteen people through eight
  // months of polar night. Stands on the room side of the counter run, facing
  // it (yaw = PI looks toward -Z, i.e. at the north wall the galley runs along).
  const cookX = RM.kitchen.cx - 1.35, cookZ = RM.kitchen.z0 + 1.45;
  const cook = buildNPC(
    'cook',
    { x: cookX, z: cookZ },
    Math.PI,
    'Ramesh', 'Station Cook',
    [
      'Thirteen of us through the winter, and I\'m the one who has to make the same freezer stores feel like a new meal every night.',
      'Everything you see here arrived on one ship, months ago. After that, this galley is the whole supply chain.',
      'Ask anyone who\'s wintered over — the cook is the most important person on the station. I\'m not being modest, it\'s just true.',
      'Back home I trained in a hotel kitchen in Kochi. Nothing prepares you for cooking at minus thirty except doing it.',
      'Every Tuesday is sweets — jalebi, halwa, whatever the dry-fruit stores allow. And on the worst storm days, when nobody\'s stepped outside in three days, it comes down to splitting the last packet of Maggi. You\'d be surprised how much that matters.',
      'Every drop of water in this kitchen comes from Lake Priyadarshini, out past the ridge. No desalination plant, no shipped-in water — just a frozen lake and a pump line, which is a lot more fragile than people assume until the day it isn\'t.'
    ],
    'med-winter'
  );
  cook.group.position.set(cookX, floorY, cookZ);
  root.add(cook.group);
  npcs.push(cook);
  interactables.push({
    id: cook.id, label: cook.label, isNpc: true, npc: cook,
    position: new THREE.Vector3(cookX, floorY, cookZ), radius: 3.0
  });

  /* -------------------------------------------------------------- storage */
  // The dry store is its own room now, straight off the airlock — which is
  // also the shortest possible path from the front door, i.e. exactly where
  // you would put the room every crate in the building has to pass through.
  // The storekeeper stands in the aisle between two of the racks.
  const storeX = RM.storage.cx - 1.6, storeZ = RM.storage.cz;
  const storagePoint = new THREE.Vector3(storeX, floorY, storeZ + 0.9);
  {
    const storekeeper = buildNPC(
      'technician', { x: storeX, z: storeZ }, Math.PI / 2,
      'Meera Kulkarni', 'Storekeeper',
      [
        'Every crate that comes off the pad goes through me before it goes on a shelf — checked against the manifest, logged, then stowed. Lose track of the stores here and you find out the hard way, months later.',
        'Lake Priyadarshini gives us water, but not food — every tin, every sack of dal, every drum of fuel came off a ship months ago. What\'s on this shelf right now is the entire remaining supply until the next one docks.',
        'Thirty-five years this station\'s been running, and the inventory system is still basically a notebook and this shelf. It works because someone actually checks it every single day. That someone is me.',
        'The ground crew hands it to me, I put it away. Small job, but skip it for a week and you\'d notice fast — nobody can find anything, and nobody knows what\'s actually left.'
      ]
    );
    storekeeper.group.position.set(storeX, floorY, storeZ);
    root.add(storekeeper.group);
    const skParts = storekeeper.group.children[0].userData.parts;
    storekeeper.update = (dt, elapsed) => applyRestock(skParts, elapsed);
    npcs.push(storekeeper);
    interactables.push({
      id: storekeeper.id, label: storekeeper.label, isNpc: true, npc: storekeeper,
      position: new THREE.Vector3(storeX, floorY, storeZ), radius: 3.0
    });
  }

  /* ------------------------------------------------------------ radio room */
  // The radio operator used to work from a mezzanine platform bolted into the
  // top of a double-height mess hall — a fun piece of geometry, but it needed
  // its own stair, its own guard rails, its own headroom carved out of the
  // shell, and it was the source of a long run of collision bugs. A real
  // station just gives comms a room. This is that room, and the console it
  // holds is the same console, at floor level, off the main corridor.
  {
    const conX = RM.command.cx, conZ = RM.command.z0 + 1.5;
    const radioOp = buildNPC(
      'scientist', { x: conX, z: conZ }, Math.PI,
      'Arjun Nair', 'Radio Operator',
      [
        'Every message in or out of Maitri goes through this desk. Satellite when the window is open, HF when it isn\'t — and in a blizzard, HF is all there is.',
        'I log every field party out and back in. If a team misses a scheduled call, the clock starts and everything else on the station stops.',
        'People imagine we are cut off out here. We are not — we are just on a delay, and the delay is the whole job.',
        'Best part of the shift is the aurora nights, when the band goes strange and you can hear stations you have no business hearing.'
      ]
    );
    radioOp.group.position.set(conX, floorY, conZ);
    root.add(radioOp.group);
    npcs.push(radioOp);
    interactables.push({
      id: radioOp.id, label: radioOp.label, isNpc: true, npc: radioOp,
      position: new THREE.Vector3(conX, floorY, conZ), radius: 3.0
    });
  }

  /* -------------------------------------------- containerised laboratories */
  // The part of Maitri that is genuinely NOT in the main building. Three
  // ground-level container modules standing off the south face, each one a
  // single lab room with its own door — which is what "containerized
  // laboratory space" actually looks like on a site like this: a lab is a
  // shipping container that was fitted out and craned into place.
  //
  // They sit at local y = 0 (site ground level), like every other ground prop
  // on this site, with a shallow plinth and a skirt so a small terrain
  // mismatch under them reads as a foundation rather than a floating box.
  const labModules = [
    { id: 'glac', x: -17.5, label: 'GLACIOLOGY',  variant: 'glaciology' },
    { id: 'met',  x: -9.2,  label: 'METEOROLOGY', variant: 'meteorology' },
    { id: 'geo',  x: 9.2,   label: 'GEOPHYSICS',  variant: 'geophysics' }
  ];
  const labColliders = [];
  const labRooms = {};
  for (const mod of labModules) {
    const mz0 = 9.4, mz1 = 12.6, halfW = 3.4;
    const modFloorY = 0.3, modCeilH = 2.4;
    const mp = buildFloorPlan({
      floorY: modFloorY, ceilH: modCeilH, palette: PALETTE.module, lowLights: engine.quality === 'low',
      rooms: [{
        id: mod.id, x0: mod.x - halfW, x1: mod.x + halfW, z0: mz0, z1: mz1,
        theme: 'lab', variant: mod.variant, label: mod.label
      }],
      // Door faces the main building, which is north of the modules.
      doors: [{ a: mod.id, b: 'outside', side: 'n', w: 1.3 }]
    });
    root.add(mp.mesh);
    labModuleMeshes.push(mp.mesh);
    labColliders.push(...mp.colliders);
    animated.push(...mp.animated);
    labRooms[mod.id] = mp.rooms[mod.id];
    root.userData.rooms[mod.id] = mp.rooms[mod.id];

    // Container silhouette: a dark plinth under the floor and a roof cap
    // over the ceiling, so from outside it reads as a placed container
    // rather than four walls standing on snow.
    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 2 + 0.24, 1.6, mz1 - mz0 + 0.24),
      new THREE.MeshStandardMaterial({ color: 0x2f3538, roughness: 0.9 })
    );
    skirt.position.set(mod.x, modFloorY - 0.85, (mz0 + mz1) / 2);
    skirt.receiveShadow = true;
    root.add(skirt);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 2 + 0.3, 0.22, mz1 - mz0 + 0.3),
      MAT.claddingDark()
    );
    cap.position.set(mod.x, modFloorY + modCeilH + 0.31, (mz0 + mz1) / 2);
    cap.castShadow = true;
    root.add(cap);
  }

  /* --------------------------------------------------- the lab scientists */
  // One researcher per module, each in the lab that matches their discipline
  // — the point of splitting the labs by science in the first place.
  {
    const gl = labRooms.glac;
    const gx = gl.cx + 1.2, gz = gl.cz;
    const glaciologist = buildNPC(
      'glaciologist', { x: gx, z: gz }, -Math.PI / 2,
      'Dr. Sunita Rathore', 'Glaciologist',
      [
        'These cores come out of the ice shelf in one-metre lengths, and every centimetre is a season nobody was here to write down.',
        'We keep them colder in that chest than the air outside, because the moment a core warms the record in it starts to blur.',
        'The Schirmacher Oasis is bare rock in the middle of an ice sheet. Standing on it tells you the ice was once far higher than it is now.',
        'Slow science. I will not see the conclusion of the work I did this season — someone reading these cores in twenty years will.'
      ]
    );
    glaciologist.group.position.set(gx, gl.floorY, gz);
    root.add(glaciologist.group);
    npcs.push(glaciologist);
    interactables.push({
      id: glaciologist.id, label: glaciologist.label, isNpc: true, npc: glaciologist,
      position: new THREE.Vector3(gx, gl.floorY, gz), radius: 3.0
    });

    const ml = labRooms.met;
    const mx = ml.cx + 1.2, mz = ml.cz;
    const metOfficer = buildNPC(
      'meteorologist', { x: mx, z: mz }, -Math.PI / 2,
      'Dr. Kavya Menon', 'Meteorologist',
      [
        'Every three hours, year round, someone reads this station and files it. Miss one and there is a hole in a record that has run since 1989.',
        'The Southern Ocean drives the Indian monsoon. That sentence is the entire reason this building exists.',
        'A katabatic wind is just cold air falling off the plateau under its own weight. Simple physics, and it will still take a tent off the ground.',
        'I can tell you what the next six hours will do. Past that, out here, anyone who sounds certain is guessing.'
      ]
    );
    metOfficer.group.position.set(mx, ml.floorY, mz);
    root.add(metOfficer.group);
    npcs.push(metOfficer);
    interactables.push({
      id: metOfficer.id, label: metOfficer.label, isNpc: true, npc: metOfficer,
      position: new THREE.Vector3(mx, ml.floorY, mz), radius: 3.0
    });

    const pl = labRooms.geo;
    const px = pl.cx + 1.2, pz = pl.cz;
    const geophysicist = buildNPC(
      'geophysicist', { x: px, z: pz }, -Math.PI / 2,
      'Dr. Imran Qureshi', 'Geophysicist',
      [
        'Those piers go down to bedrock and touch nothing else. If the floor of this container moved, the seismometer would record the floor, not the Earth.',
        'Antarctica is one of the quietest places on the planet seismically, which is exactly what makes it a good place to listen from.',
        'We have picked up earthquakes from the other side of the world on this instrument. It is a strange thing, feeling the planet ring.',
        'Geology here is legible in a way it never is at home — no soil, no vegetation, just the rock, sitting out in the open.'
      ]
    );
    geophysicist.group.position.set(px, pl.floorY, pz);
    root.add(geophysicist.group);
    npcs.push(geophysicist);
    interactables.push({
      id: geophysicist.id, label: geophysicist.label, isNpc: true, npc: geophysicist,
      position: new THREE.Vector3(px, pl.floorY, pz), radius: 3.0
    });
  }
  /* ----------------------------------------------------- roof equipment */
  const mast = latticeMast(11, 0.55, MAT.galv());
  mast.position.set(-cW / 2 - 5, roofY + 0.5, -2);
  root.add(mast);
  const mast2 = latticeMast(7, 0.4, MAT.galv());
  mast2.position.set(S.length / 2 - 6, roofY + 0.5, 0);
  root.add(mast2);

  const rd = radome(1.7);
  rd.position.set(-S.length / 2 + 7, roofY + 0.5, -1);
  root.add(rd);

  const dsh = dish(1.4);
  dsh.position.set(S.length / 2 - 13, roofY + 0.5, -2.5);
  dsh.rotation.y = 0.6;
  root.add(dsh);

  // Aviation obstruction light on the tall mast.
  const obLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 3 })
  );
  obLight.position.set(-cW / 2 - 5, roofY + 11.7, -2);
  root.add(obLight);
  animated.push({ blink: obLight });

  // Roof-mounted HVAC / snow-melt plant boxes.
  for (const x of [-22, -14, 16, 24]) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 2.0), MAT.galv());
    box.position.set(x, roofY + 1.05, -2.5);
    box.castShadow = true;
    root.add(box);
  }

  /* ------------------------------------------------------------- flags */
  // The oasis is shared. These are the neighbours Maitri actually cooperates with.
  const flagSet = [
    { tex: tricolour(), key: 'india' },
    { tex: bandFlag('russia'), key: 'russia' },
    { tex: bandFlag('southafrica'), key: 'southafrica' },
    { tex: bandFlag('germany'), key: 'germany' }
  ];
  flagSet.forEach((f, i) => {
    const fl = flag(f.tex, { poleH: 9.5, w: 2.6, h: 1.73 });
    // Two either side of the entrance stair, as in the reference photo.
    const side = i < 2 ? -1 : 1;
    const idx = i % 2;
    fl.position.set(side * (7 + idx * 6), 0, cD / 2 + 7.5);
    fl.rotation.y = -0.25 * side;
    root.add(fl);
    animated.push({ flag: fl });
  });

  interactables.push({
    id: 'inst-treaty',
    label: 'Read the flag line',
    position: new THREE.Vector3(0, 0, cD / 2 + 9),
    radius: 6
  });

  /* -------------------------------------------------------- ground kit */
  // Route markers along the approach — the navigation lifeline in a whiteout.
  for (let i = 0; i < 9; i++) {
    const z = cD / 2 + 12 + i * 8.5;
    for (const sx of [-1, 1]) {
      const m = routeMarker(1.3, sx > 0 ? 0xd83a2a : 0x2a6ed8);
      m.position.set(sx * (5.0 + Math.sin(i * 0.7) * 0.5), 0, z);
      root.add(m);
      animated.push({ winMat: m.userData.capMat, winBase: 2.2 });
    }
  }

  // Fuel drum stack — every Antarctic station has a field of these.
  // outdoorColliders collects an AABB per prop below — none of the yard
  // previously had any collision, so the player could walk straight through
  // a stacked container or a parked vehicle as if it were flat scenery.
  const outdoorColliders = [];
  const drumColors = ['#1f4f8f', '#1f4f8f', '#b23a1f', '#2f6f4e'];
  for (let i = 0; i < 26; i++) {
    const d = drum(drumColors[i % drumColors.length]);
    const row = Math.floor(i / 9), col = i % 9;
    const dx = -S.length / 2 - 6 - col * 0.68, dy = row > 1 ? 0.88 : 0, dz = 8 + row * 0.68;
    d.position.set(dx, dy, dz);
    root.add(d);
    outdoorColliders.push(box(dx, dy, dz, 0.6, 0.88, 0.6));
  }

  // Storage containers to the side of the building — four on the ground in
  // a 2×2, one stacked on top. The stacked one (i=4) previously computed
  // its own cz via the SAME `4 + floor(i/2)*3.4` formula as the ground
  // layer, which for i=4 lands on cz=10.8 — a Z position none of the four
  // ground containers (cz=4 or cz=7.4) actually occupy. It was a container
  // floating 2.59 m up with nothing underneath it at all. Anchoring it
  // explicitly to one of the real ground positions (i=2's) fixes that.
  const contColors = ['#2f6f4e', '#b8862a', '#8c3b28', '#2a5f8c'];
  for (let i = 0; i < 5; i++) {
    const c = container(contColors[i % contColors.length]);
    const cx = i === 4 ? S.length / 2 + 8 : S.length / 2 + 8 + (i % 2) * 7.2;
    const cz = i === 4 ? 7.4 : 4 + Math.floor(i / 2) * 3.4;
    const cy = i === 4 ? 2.59 : 0;
    c.position.set(cx, cy, cz);
    c.rotation.y = (i % 2) * 0.06;
    root.add(c);
    outdoorColliders.push(box(cx, cy, cz, 6.06, 2.59, 2.44));
  }

  // The vehicle bay had a VEHICLE BAY sign and no vehicle in it. Maitri runs
  // the same class of utility sled as Bharati; the workshop theme already
  // deliberately keeps the middle of this bay clear "because this is the bay
  // a vehicle is supposed to be able to sit in", so it goes exactly there.
  {
    const sled = snowmobile('#c94a1e');
    const sx = 16.4, sz = 3.9;
    sled.position.set(sx, floorY, sz);
    sled.rotation.y = Math.PI / 2;          // nose at the bay door
    root.add(sled);
    keepDynamic(sled);
    extraColliders.push(new THREE.Box3(
      new THREE.Vector3(sx - 0.62, floorY, sz - 1.66),
      new THREE.Vector3(sx + 0.62, floorY + 1.30, sz + 1.66)
    ));
  }

  const veh = snowVehicle('#c94a1e');
  const vehX = S.length / 2 - 4, vehZ = cD / 2 + 12;
  veh.position.set(vehX, 0, vehZ);
  veh.rotation.y = -0.9;
  root.add(veh);
  // Rotated ~-52°, meaningfully off-axis — a slightly widened AABB covers
  // the rotated footprint without needing an OBB collider.
  outdoorColliders.push(box(vehX, 0, vehZ, 4.6, 3.7, 4.0));

  interactables.push({
    id: 'exp-1981',
    label: 'Inspect the expedition vehicle',
    position: new THREE.Vector3(S.length / 2 - 4, 0, cD / 2 + 14),
    radius: 4.5
  });

  /* ----------------------------------------------------- colliders */
  // The two long wings have no modelled interior, so they stay solid blocks
  // starting exactly at the central block's half-width (cW/2) — anything
  // wider than that is unmodelled and impassable. The central block itself is
  // NOT solid any more: the mess hall built above supplies its own colliders
  // (floor, walls, furniture), which is what actually makes it walkable.
  // The solid wing blocks now only cover the shell OUTSIDE the modelled
  // plate. They used to start at the central block's half-width and swallow
  // 24.5 m of building each side — all of it walkable floor now.
  const wingSpan = S.length / 2 - PX1;             // 4
  const wingCx = (PX1 + S.length / 2) / 2;         // 32
  const colliders = [
    box(-wingCx, bodyBottom + 0.5, 0, wingSpan, mainH + 1.4, S.depth),
    box(wingCx, bodyBottom + 0.5, 0, wingSpan, mainH + 1.4, S.depth),
    // Stilts are walk-through-able in reality (you can go under the building),
    // so only the ground beams are solid.
    box(0, 0, -S.depth / 2 + 1.2, S.length, 0.35, 0.5),
    box(0, 0, S.depth / 2 - 1.2, S.length, 0.35, 0.5),
    ...stair.colliders,
    // The floor plan supplies its own floor slabs, walls (with the doorway
    // gaps already cut out of the collider run, not just the mesh) and
    // furniture colliders — see buildFloorPlan in interior.js.
    ...plan.colliders,
    ...labColliders,
    ...jambColliders,
    box(libX, libY, libZ, shelf.userData.collider.w, shelf.userData.collider.h, shelf.userData.collider.d),
    box(libX, libY, libZ - 1.45, 1.1, 0.8, 0.65),
    box(freezer.position.x, floorY, freezer.position.z, freezer.userData.collider.w, freezer.userData.collider.h, freezer.userData.collider.d),
    ...extraColliders,
    ...outdoorColliders
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
  keepDynamic(plan.mesh);
  keepDynamic(plan2.mesh);
  for (const m of labModuleMeshes) keepDynamic(m);
  keepDynamic(veh);
  bakeStatic(root);

  return { root, interactables, animated, npcs, doors, colliders, spec: S, bodyBottom, roofY, storagePoint, entranceInside, entranceOutside };
}

/* ========================================================== helpers */

function box(x, y, z, w, h, d) {
  return new THREE.Box3(
    new THREE.Vector3(x - w / 2, y, z - d / 2),
    new THREE.Vector3(x + w / 2, y + h, z + d / 2)
  );
}

function applyRepeat(mesh, mat, rx, ry) {
  // Clone the material so each surface can repeat at its own rate without
  // every other surface inheriting it.
  const m = mat.clone();
  if (m.map) { m.map = m.map.clone(); m.map.repeat.set(rx, ry); m.map.needsUpdate = true; }
  if (m.normalMap) { m.normalMap = m.normalMap.clone(); m.normalMap.repeat.set(rx, ry); m.normalMap.needsUpdate = true; }
  mesh.material = m;
}

/**
 * Instanced window units. Frames and glass are two InstancedMeshes, so an
 * entire 90-window elevation costs two draw calls.
 */
function addInstancedWindows(root, list, w, h, frameMat, glassMat, litMat) {
  const n = list.length;
  if (!n) return;

  const frameGeo = new THREE.BoxGeometry(w, h, 0.16);
  const glassGeo = new THREE.BoxGeometry(w - 0.18, h - 0.18, 0.06);

  const frames = new THREE.InstancedMesh(frameGeo, frameMat, n);
  const glass = new THREE.InstancedMesh(glassGeo, glassMat, n);
  frames.castShadow = true;
  glass.castShadow = false;

  // A handful of rooms are lit — the station is occupied.
  const litIdx = new Set();
  while (litIdx.size < Math.max(3, Math.floor(n * 0.16))) {
    litIdx.add(Math.floor(Math.random() * n));
  }
  const lit = new THREE.InstancedMesh(glassGeo, litMat, litIdx.size);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);

  let li = 0;
  list.forEach(([x, y, z, ry], i) => {
    q.setFromEuler(new THREE.Euler(0, ry, 0));
    p.set(x, y, z);
    m.compose(p, q, s);
    frames.setMatrixAt(i, m);

    // Push the glass a few cm proud of the frame along the facing direction.
    const off = new THREE.Vector3(0, 0, 0.06).applyQuaternion(q);
    m.compose(p.clone().add(off), q, s);
    if (litIdx.has(i)) lit.setMatrixAt(li++, m);
    else glass.setMatrixAt(i, m);
  });

  // Unused glass instances collapse to zero scale rather than sitting at origin.
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  litIdx.forEach(i => glass.setMatrixAt(i, zero));

  frames.instanceMatrix.needsUpdate = true;
  glass.instanceMatrix.needsUpdate = true;
  lit.instanceMatrix.needsUpdate = true;
  root.add(frames, glass, lit);
}

// The old inline stair builder was removed — it produced decorative geometry
// only, with no matching collider, which is exactly why the stairs could not
// be climbed. Replaced by buildAccessStair() in kit.js, which returns visual
// mesh and stepped Box3 colliders together so the two can never drift apart.
