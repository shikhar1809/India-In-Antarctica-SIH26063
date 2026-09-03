import * as THREE from 'three';
import { buildMaitri } from './MaitriStation.js';
import { buildBharati } from './BharatiStation.js';
import { buildGangotri } from './GangotriSite.js';
import { MAT, latticeMast, routeMarker, drum, signText, dish } from './kit.js';
import { PADS } from '../world/Terrain.js';
import { buildNPC, buildFieldTeam } from './NPCs.js';
import { SIDEQUESTS } from '../data/sidequests.js';
import { bakeStatic, keepDynamic } from '../core/bake.js';
import { buildCargoShip } from '../world/CargoShip.js';

/**
 * site.js — assembles a complete playable site: the station building, the
 * field science instruments scattered around it, and the interaction points
 * that unlock archive records.
 *
 * The field kit is the pedagogically important half. A child who only walks up
 * to a building has seen a building; a child who walks to an ice-core drill, a
 * weather mast and a magnetometer hut has seen what the building is FOR.
 */
export function buildSite(engine, terrain, stationId) {
  const root = new THREE.Group();
  root.name = `site-${stationId}`;

  const builders = { maitri: buildMaitri, bharati: buildBharati, gangotri: buildGangotri };
  const build = builders[stationId] || buildMaitri;

  // Drop the station onto its graded pad.
  const pad = PADS[0];
  const station = build(engine, { terrain });
  const padY = terrain.heightAt(pad.x, pad.z);
  station.root.position.set(pad.x, padY, pad.z);
  root.add(station.root);

  const interactables = [];
  const animated = [...(station.animated || [])];
  const npcs = [...(station.npcs || [])];
  const colliders = [];

  // Station-local interactables → world space.
  for (const it of station.interactables) {
    interactables.push({
      ...it,
      worldPosition: it.position.clone().add(station.root.position)
    });
  }
  // Station-local doors → world space. The mesh itself is a normal child of
  // station.root and doesn't need converting — only the proximity-check
  // point does, since that's compared against the player's own world
  // position in update() below.
  const doors = (station.doors || []).map(d => ({
    ...d,
    worldPosition: d.localPosition.clone().add(station.root.position)
  }));
  // Station-local colliders → world space.
  for (const b of station.colliders) {
    colliders.push(new THREE.Box3(
      b.min.clone().add(station.root.position),
      b.max.clone().add(station.root.position)
    ));
  }
  // The indoor storage bay's drop-off point, if this station has one — same
  // local-to-world conversion as doors above, used by main.js to route the
  // resupply ground crew all the way in from the helipad.
  const storagePoint = station.storagePoint
    ? station.storagePoint.clone().add(station.root.position)
    : null;
  // Same conversion, for the two waypoints the ground crew's route through
  // the actual front door and stairs needs (see buildSupplyCrew).
  const entranceInside = station.entranceInside
    ? station.entranceInside.clone().add(station.root.position)
    : null;
  const entranceOutside = station.entranceOutside
    ? station.entranceOutside.clone().add(station.root.position)
    : null;

  /* ==================================================== field science kit */
  const field = new THREE.Group();
  // Named so the culler can find it: it is a kilometre of field instruments
  // and none of it is visible from inside the station.
  field.name = 'field-kit';
  root.add(field);

  const place = (obj, x, z, yaw = 0) => {
    obj.position.set(x, terrain.heightAt(x, z), z);
    obj.rotation.y = yaw;
    field.add(obj);
    return obj;
  };

  // Every field-kit structure below was hand-offset from the station pad by
  // a fixed (x, z) picked without checking what the terrain actually does
  // out there — fine on the oasis profile (Maitri), which has no sea at
  // all, but Bharati's coastal profile carves a real bay into the
  // landform, and more than half of those fixed offsets land in it: the
  // AWS mast, ice-core drill, both instrument huts, the memorial cairn, the
  // satcom rig and the wildlife blind all sampled below sea level, sitting
  // on the seafloor looking (and being) "inaccessible", exactly like the
  // ICE CORE SITE 4 screenshot showed. Rather than hand-tune 13 magic
  // numbers against one seed, snap any point that lands underwater out to
  // the nearest dry ground on a widening ring search — a no-op on any
  // profile without a sea (seaLevel stays -999) and self-correcting if the
  // terrain noise ever changes.
  const landify = (x, z, minH = terrain.seaLevel + 3) => {
    if (terrain.seaLevel < -900 || terrain.heightAt(x, z) >= minH) return { x, z };
    for (let r = 6; r <= 140; r += 6) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
        const tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r;
        if (terrain.heightAt(tx, tz) >= minH) return { x: tx, z: tz };
      }
    }
    return { x, z };   // no dry ground found within range — leave as-is
  };

  // --- Automatic Weather Station -----------------------------------------
  const aws = buildAWS();
  const { x: awsX, z: awsZ } = landify(pad.x + 92, pad.z - 58);
  place(aws.group, awsX, awsZ, 0.4);
  animated.push({ aws });
  interactables.push({
    id: 'ds-weather',
    label: 'Download the weather station log',
    minigame: 'weather',
    color: 0x7ef0a0,
    radius: 5,
    worldPosition: new THREE.Vector3(awsX, terrain.heightAt(awsX, awsZ), awsZ)
  });

  // A technician crouched at the mast, mid-check — the AWS runs unattended
  // most of the time, but someone has to visit every so often to confirm the
  // sensors haven't iced over, which is exactly as unglamorous as it sounds.
  {
    const tx = awsX + 1.6, tz = awsZ + 0.8;
    // This whole field-kit section is shared code, built once per station —
    // without a per-station swap here, "Priya" checking the mast was
    // literally the same person at both Bharati and Maitri.
    const AWS_TECH_BY_STATION = {
      bharati: {
        name: 'Priya', lines: [
          'Every sensor on this mast has to be checked by hand — the cold cracks solder joints that would last decades anywhere else.',
          'The anemometer cups ice over first. If they stop turning, the whole weather record goes flat and nobody notices for days.',
          'This one instrument feeds monsoon forecasting back home. A farmer in Maharashtra is downstream of whether I did my job properly.',
          'I applied for this posting three times before I got in. People think it\'s a hardship posting — I think it\'s the best job in the country.'
        ]
      },
      maitri: {
        name: 'Divya Prasad', lines: [
          'This mast sits out here alone because it has to — anything closer to the building throws its own heat and wind shadow into the reading.',
          'Schirmacher gets genuinely violent katabatic wind off the plateau. This is the instrument that actually measures it, not the forecast.',
          'I check this by hand every few days regardless of weather. An automatic station that nobody visits is just a very expensive guess.',
          'Three seasons here now. You stop counting them as hardship postings and start counting them as the only job that has ever felt like it mattered this much.'
        ]
      }
    };
    const awsTech = AWS_TECH_BY_STATION[stationId] ?? AWS_TECH_BY_STATION.bharati;
    const tech = buildNPC(
      'technician', { x: tx, z: tz }, -2.4,
      awsTech.name, 'Field Technician',
      awsTech.lines
    );
    tech.group.position.set(tx, terrain.heightAt(tx, tz), tz);
    field.add(tech.group);
    npcs.push(tech);
    interactables.push({
      id: tech.id, label: tech.label, isNpc: true, npc: tech,
      radius: 3.2,
      worldPosition: new THREE.Vector3(tx, terrain.heightAt(tx, tz), tz)
    });
  }

  // --- Ice core drill ------------------------------------------------------
  const drill = buildDrillRig();
  const { x: dx, z: dz } = landify(pad.x - 76, pad.z + 88);
  place(drill, dx, dz, -0.5);
  interactables.push({
    id: 'ds-icecore',
    label: 'Drill an ice core',
    minigame: 'icecore',
    color: 0x5fd9ff,
    radius: 5.5,
    worldPosition: new THREE.Vector3(dx, terrain.heightAt(dx, dz), dz)
  });

  // --- Geomagnetic observatory hut ----------------------------------------
  // Sited deliberately far from the station: every vehicle and generator is a
  // magnetic source, so the hut has to be well away from the metal.
  const hut = buildInstrumentHut('GEOMAGNETIC OBSERVATORY', 0xd8dee2);
  const { x: gx, z: gz } = landify(pad.x + 140, pad.z + 96);
  place(hut, gx, gz, 0.9);
  interactables.push({
    id: 'ds-magnet',
    label: 'Read the magnetometer',
    color: 0xb98cff,
    radius: 5,
    worldPosition: new THREE.Vector3(gx, terrain.heightAt(gx, gz), gz)
  });

  // --- Ozone / atmospheric lab --------------------------------------------
  const lab = buildInstrumentHut('ATMOSPHERIC LAB', 0xe3e8ea);
  const { x: ox, z: oz } = landify(pad.x - 132, pad.z - 44);
  place(lab, ox, oz, -0.7);
  const spec = buildSpectrometer();
  place(spec, ox + 5, oz + 3, 0.3);
  interactables.push({
    id: 'ds-ozone',
    label: 'Take an ozone reading',
    minigame: 'ozone',
    color: 0xffcf5c,
    radius: 5,
    worldPosition: new THREE.Vector3(ox + 5, terrain.heightAt(ox + 5, oz + 3), oz + 3)
  });

  // --- Biology quadrat ------------------------------------------------------
  const quad = buildQuadrat();
  const { x: bx, z: bz } = landify(pad.x + 46, pad.z + 118);
  place(quad, bx, bz, 0.2);
  interactables.push({
    id: 'pub-lichen',
    label: 'Survey the lichen quadrat',
    color: 0x7ef0a0,
    radius: 4.5,
    worldPosition: new THREE.Vector3(bx, terrain.heightAt(bx, bz), bz)
  });

  // --- Memorial cairn for Dakshin Gangotri ---------------------------------
  const cairn = buildCairn();
  const { x: cx, z: cz } = landify(pad.x - 168, pad.z + 150);
  place(cairn, cx, cz, 0);
  interactables.push({
    id: 'exp-dg-loss',
    label: 'Read the Dakshin Gangotri memorial',
    color: 0xffcf5c,
    radius: 4.5,
    worldPosition: new THREE.Vector3(cx, terrain.heightAt(cx, cz), cz)
  });

  // --- NCPOR comms terminal ------------------------------------------------
  const term = buildCommsTerminal();
  const tx = pad.x + 22, tz = pad.z + 46;
  place(term, tx, tz, Math.PI);
  interactables.push({
    id: 'inst-ncpor',
    label: 'Open the link to NCPOR, Goa',
    color: 0xff9933,
    radius: 4.5,
    worldPosition: new THREE.Vector3(tx, terrain.heightAt(tx, tz), tz)
  });

  // --- Monsoon / oceanography buoy station ---------------------------------
  const buoy = buildBuoy();
  // buildBuoy() models a display mockup on a cradle stand, not something
  // rigged to float at the sea surface — placed on the seafloor (as the raw
  // offset did) it was a fully submerged, unreachable exhibit rather than a
  // "look, a buoy" prop on the shore.
  const { x: yx, z: yz } = landify(pad.x - 40, pad.z + 150);
  place(buoy, yx, yz, 0.5);
  interactables.push({
    id: 'pub-monsoon',
    label: 'Check the ocean mooring data',
    color: 0x5fd9ff,
    radius: 4.5,
    worldPosition: new THREE.Vector3(yx, terrain.heightAt(yx, yz), yz)
  });

  // --- Krill / marine sampling station -------------------------------------
  const net = buildSamplingRig();
  const kx = pad.x + 168, kz = pad.z + 26;
  place(net, kx, kz, -1.2);
  interactables.push({
    id: 'ds-krill',
    label: 'Haul the krill sampling net',
    minigame: 'krill',
    color: 0x7ef0a0,
    radius: 5,
    worldPosition: new THREE.Vector3(kx, terrain.heightAt(kx, kz), kz)
  });

  // --- Field sampling teams ---------------------------------------------------
  // Two small crews, each walking its OWN real circuit, to two different
  // field sites — one team of four visiting only one site (with the other
  // four field-kit installations sitting there permanently unattended) read
  // as everyone taking the same day trip rather than a station actually
  // running several lines of fieldwork at once. Each pair goes out to a
  // different site, works a sample-collection pose there, processes what
  // they brought back at a different hut, then home and around again —
  // modelled on how a real Antarctic field party runs a sampling trip.
  //
  // Bharati and Maitri each draw from their OWN name pool — buildFieldTeam
  // is the exact same shared code called once per station, so without this
  // a Bharati field scientist and a Maitri field scientist came out as
  // literally the same person, twice, which is the whole "these two
  // stations feel repetitive" complaint in miniature.
  const FIELD_NAME_POOLS = {
    bharati: {
      technician: ['Rahul Verma', 'Manoj Thapa', 'Arjun Bhatt', 'Vikas Rawat'],
      scientist: ['Dr. Neha Kulkarni', 'Dr. Ayesha Khan', 'Dr. Farah Sheikh', 'Dr. Ritu Deshmukh']
    },
    maitri: {
      technician: ['Bhupendra Singh', 'Tashi Norbu', 'Irfan Sheikh', 'Dev Karki'],
      scientist: ['Dr. Meenal Joshi', 'Dr. Kiran Bose', 'Dr. Shalini Nair', 'Dr. Alok Mehta']
    }
  };
  const fieldNames = FIELD_NAME_POOLS[stationId] ?? FIELD_NAME_POOLS.bharati;
  const fieldTeamA = buildFieldTeam(
    [
      { x: pad.x, z: pad.z + 30 },
      { x: kx, z: kz, pause: 14, activity: 'collect' },
      { x: ox, z: oz, pause: 10, activity: 'idle' },
    ],
    terrain,
    { count: 2, names: fieldNames }
  );
  const fieldTeamB = buildFieldTeam(
    [
      { x: pad.x - 20, z: pad.z + 30 },
      { x: dx, z: dz, pause: 14, activity: 'collect' },
      { x: gx, z: gz, pause: 10, activity: 'idle' },
    ],
    terrain,
    { count: 2, roles: ['scientist', 'technician'], nameOffset: 2, names: fieldNames }
  );
  for (const grp of fieldTeamA.groups) field.add(grp);
  for (const grp of fieldTeamB.groups) field.add(grp);
  // Interactables with a live worldPosition (the same Vector3 buildFieldTeam
  // updates every frame in fieldTeam.update, not a one-time snapshot) — the
  // nearest-interactable scan in main.js just reads whatever it currently
  // points at, so a moving NPC can be walked up to and talked to exactly
  // like a stationary one.
  interactables.push(...fieldTeamA.interactables, ...fieldTeamB.interactables);

  // --- Side-quest field kit -------------------------------------------------
  // Unlike the field kit above (present at every station), these are gated
  // to the one station each SIDEQUESTS entry names in sidequests.js — a
  // wildlife census only makes sense where Bharati's ice-free coastline is,
  // a live geomagnetic trace only where Maitri's actual magnetometer sits.
  if (stationId === 'bharati') {
    // --- the resupply ship, beset in the fast ice ------------------------
    // Bharati is a coastal station and the only reason it can exist is a ship
    // — one arrives once a year with a year's fuel and food, and nothing else
    // reaches the place. Putting that ship on the horizon, stuck, is the
    // clearest statement the world can make about how far away everything
    // else is. Subject is MV Vasiliy Golovnin, the vessel that actually
    // resupplies Bharati and Maitri, at its real 164 m (docs/REFERENCES.md).
    //
    // Sited out on the sea ice off the station's seaward side, angled across
    // the view rather than square to it so the whole length reads at once.
    {
      const ship = buildCargoShip();
      // Close in behind the station, not out on the horizon: at 250 m the
      // vessel read as a distant silhouette rather than the imposing thing
      // moored off the back door that the reference photograph shows.
      const sx = pad.x + 18, sz = pad.z - 132;
      // Sits at sea level, not on the seabed contour: it is floating (nipped)
      // in the sheet, so its waterline IS the ice surface.
      ship.group.position.set(sx, terrain.seaLevel, sz);
      ship.group.rotation.y = -0.30;
      root.add(ship.group);
      animated.push(ship.animated);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ship.group.rotation.y);
      for (const b of ship.colliders) {
        // Rotated hull: expand the AABB to cover the turned footprint rather
        // than carry an OBB through the collision system for one object.
        const box = b.clone().applyMatrix4(new THREE.Matrix4().compose(
          ship.group.position, q, new THREE.Vector3(1, 1, 1)));
        colliders.push(box);
      }
      interactables.push({
        id: 'exp-bharati-ship',
        label: 'Study the beset resupply ship',
        color: 0x9ec8ff,
        radius: 26,
        worldPosition: new THREE.Vector3(sx, terrain.seaLevel + 8, sz)
      });
    }

    // Wildlife census — an observation blind with binoculars on a tripod,
    // sited toward the coast the way a real transect start point would be.
    const blind = buildWildlifeBlind();
    const { x: wx, z: wz } = landify(pad.x + 100, pad.z + 140);
    place(blind, wx, wz, 0.6);
    interactables.push({
      id: SIDEQUESTS.find(q => q.id === 'quest-wildlife-census').id,
      label: 'Walk the wildlife transect',
      minigame: 'wildlifeCensus',
      color: 0x7ef0a0,
      radius: 5,
      worldPosition: new THREE.Vector3(wx, terrain.heightAt(wx, wz), wz)
    });

    // Satellite uplink — a ground satcom trailer, dish tipped toward the sky.
    const satcom = buildSatcomRig();
    const { x: ux, z: uz } = landify(pad.x - 100, pad.z - 90);
    place(satcom, ux, uz, -0.3);
    interactables.push({
      id: SIDEQUESTS.find(q => q.id === 'quest-satellite-uplink').id,
      label: 'Track the satellite pass',
      minigame: 'satelliteUplink',
      color: 0xff9933,
      radius: 5,
      worldPosition: new THREE.Vector3(ux, terrain.heightAt(ux, uz), uz)
    });
  }

  if (stationId === 'maitri') {
    // Geomagnetic live trace — the all-sky-camera annex next to the
    // archival magnetometer hut, not the same building: the archived log
    // (ds-magnet, above) and the live feed are two different things to see.
    const annex = buildInstrumentHut('ALL-SKY CAMERA ANNEX', 0xc9d6de);
    const { x: gx2, z: gz2 } = landify(pad.x + 162, pad.z + 68);
    place(annex, gx2, gz2, 1.3);
    interactables.push({
      id: SIDEQUESTS.find(q => q.id === 'quest-geomagnetic').id,
      label: 'Watch the live magnetometer trace',
      minigame: 'geomagnetic',
      color: 0xb98cff,
      radius: 5,
      worldPosition: new THREE.Vector3(gx2, terrain.heightAt(gx2, gz2), gz2)
    });

    // Seismology watch — a small vault housing the broadband seismometer.
    const vault = buildInstrumentHut('SEISMOLOGY VAULT', 0xd8d2c4);
    const { x: sx2, z: sz2 } = landify(pad.x - 60, pad.z - 100);
    place(vault, sx2, sz2, -1.1);
    interactables.push({
      id: SIDEQUESTS.find(q => q.id === 'quest-seismology').id,
      label: 'Watch the seismometer trace',
      minigame: 'seismology',
      color: 0xff5a5a,
      radius: 5,
      worldPosition: new THREE.Vector3(sx2, terrain.heightAt(sx2, sz2), sz2)
    });
  }

  // --- Route markers linking the outposts, so nobody gets lost -------------
  // Only the field outposts get a marked route, and only from a single trail
  // head. Running a line to every interactable from the building turns the
  // apron into a forest of poles.
  const trailHead = new THREE.Vector3(pad.x, 0, pad.z + 34);
  for (const it of interactables) {
    if (!it.minigame && it.id !== 'ds-magnet') continue;   // field science only
    const target = it.worldPosition;
    const n = Math.floor(trailHead.distanceTo(target) / 22);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = trailHead.x + (target.x - trailHead.x) * t;
      const z = trailHead.z + (target.z - trailHead.z) * t;
      if (Math.hypot(x - pad.x, z - pad.z) < 46) continue;  // not on the apron
      // A trail linking a coastal site can legitimately run close to shore,
      // and a marker whose (x,z) happens to land in the bay was still
      // getting its height from the same terrain.heightAt() as everywhere
      // else — which returns the actual seafloor contour there, not the sea
      // surface. The pole then stood at its correct, grounded height, but
      // with the sea plane sitting well above that point, it read as "the
      // pole is floating above the water" (the water's surface visually
      // sat below where the pole's own base actually was). Skipping a
      // marker that lands underwater is safer than moving it off the
      // straight line between trailhead and site.
      if (terrain.seaLevel > -900 && terrain.heightAt(x, z) < terrain.seaLevel + 1.5) continue;
      const m = routeMarker(1.3, 0x2a6ed8);
      m.position.set(x, terrain.heightAt(x, z), z);
      field.add(m);
      animated.push({ winMat: m.userData.capMat, winBase: 2.2 });
    }
  }

  // The field kit is ~420 meshes of instruments, huts, masts and markers
  // scattered over a kilometre — all of it static, none of it ever moving.
  // Baking it collapses that to one mesh per material. The anemometer cups and
  // wind vane spin, so they are held out.
  for (const a of animated) {
    if (a.aws) { keepDynamic(a.aws.cups); keepDynamic(a.aws.vane); }
    if (a.flag) keepDynamic(a.flag);
  }
  bakeStatic(field);

  /* ------------------------------------------------------------- spawn */
  // Start on the graded approach road, facing the station, far enough back
  // that the first thing you see is the whole front elevation. yaw 0 looks
  // toward -Z, which is where the station is.
  const spawn = { x: pad.x, z: pad.z + 82, yaw: 0 };

  /* ------------------------------------------------------------ update */
  const update = (dt, elapsed, playerPos, nightFactor = 0, extraDoorTriggers = null) => {
    // Exterior lights (porch lamps, window glow, the obstruction light) dim
    // to a low ember by day and come up to full brightness at station-night
    // — "turn the lights on when it's dark" is the whole point of a light
    // fixture, and previously every one of these sat at one fixed brightness
    // regardless of what the sun overhead was doing.
    const lightMul = 0.22 + nightFactor * 0.78;
    for (const a of animated) {
      if (a.flag) {
        const u = a.flag.userData.cloth?.userData?.uniforms;
        if (u) u.uTime.value = elapsed;
      }
      if (a.blink) {
        a.blink.material.emissiveIntensity = (Math.sin(elapsed * 3.2) > 0.4) ? 4 : 0.2;
      }
      if (a.light) {
        a.light.intensity = a.base * (0.9 + Math.sin(elapsed * 1.7) * 0.06) * lightMul;
      }
      if (a.winMat) {
        // Unlike lightMul (which keeps fixtures at a low ember by day),
        // windows should read as fully dark glass in daylight and only
        // glow once night actually falls — a flat-lit window at noon reads
        // as a rendering error, not "occupied".
        a.winMat.emissiveIntensity = nightFactor * (a.winBase ?? 1.4);
      }
      if (a.aws) {
        a.aws.cups.rotation.y += dt * (3.5 + Math.sin(elapsed * 0.7) * 1.6);
        a.aws.vane.rotation.y = Math.sin(elapsed * 0.35) * 0.5 + 0.7;
      }
      // Generic hook. The tag-per-behaviour style above works fine for the
      // handful of exterior props it was written for, but the station
      // interiors have dozens of small moving things — fans, chart drums,
      // status LEDs, an oscilloscope trace — and every one of them would
      // otherwise need its own tag and its own branch in this loop, in a
      // file that knows nothing about interiors. A closure keeps the motion
      // next to the geometry that owns it.
      // playerPos too: the interior light pool needs to know which rooms are
      // worth putting a real light in this frame.
      if (a.tick) a.tick(dt, elapsed, nightFactor, playerPos);
    }
    for (const npc of npcs) npc.update(dt, elapsed);
    fieldTeamA.update(dt, elapsed);
    fieldTeamB.update(dt, elapsed);

    // Doors open for whoever is standing near them and close again once
    // nobody is — the same "reacts to you" cue a real airlock gives, driven
    // purely by distance so it doesn't need its own interact-key wiring.
    if (playerPos) {
      for (const d of doors) {
        // Also opens for the supply crew walking their own route through it
        // — a closed door with the ground crew visibly passing "through"
        // it looked broken in exactly the way a closed door for the player
        // would.
        const near = d.worldPosition.distanceTo(playerPos) < d.radius ||
          (extraDoorTriggers?.some(pos => d.worldPosition.distanceTo(pos) < d.radius) ?? false);
        const target = near ? 1 : 0;
        d.state += (target - d.state) * Math.min(1, dt * 2.2);
        // Ease rather than lerp linearly — a door that starts fast and
        // settles reads as motorised, a constant-speed slide reads as a
        // looping animation.
        const eased = d.state * d.state * (3 - 2 * d.state);
        if (d.rollHeight != null) {
          // Roller-shutter doors: a rigid slab can't curl into a coil, so a
          // plain vertical slide either leaves it jammed in the opening (not
          // open) or pushes the whole slab up past the top of the frame,
          // where — since there is no housing box up there — it just hangs
          // in open air as a disconnected floating panel once the player
          // walks close enough to trigger it. Shrinking its height while
          // pinning the BOTTOM edge in place (not the centre) reads as the
          // slab retracting into a housing right at the top of the frame,
          // and it disappears to a thin sliver instead of floating.
          const scale = 1 - eased * (1 - 0.05);
          d.mesh.scale[d.rollAxis ?? 'y'] = scale;
          d.mesh.position[d.axis] = d.rollBottomY + (d.rollHeight * scale) / 2;
        } else {
          d.mesh.position[d.axis] = d.closedValue + (d.openValue - d.closedValue) * eased;
        }
      }
    }
  };

  return { root, interactables, colliders, spawn, update, station, npcs, doors, pad, storagePoint, entranceInside, entranceOutside };
}

/* ====================================================== field structures */

/** Automatic Weather Station: mast, anemometer cups, wind vane, radiation shield. */
function buildAWS() {
  const group = new THREE.Group();
  const mast = latticeMast(6.5, 0.34, MAT.galv());
  group.add(mast);

  // Guy wires — a 6 m mast in 90-knot wind needs them.
  const wire = new THREE.MeshBasicMaterial({ color: 0x8a949c });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const end = new THREE.Vector3(Math.cos(a) * 4, 0, Math.sin(a) * 4);
    const top = new THREE.Vector3(0, 6.2, 0);
    const len = top.distanceTo(end);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 4), wire);
    w.position.copy(top).add(end).multiplyScalar(0.5);
    w.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(top).normalize());
    group.add(w);
  }

  // Anemometer.
  const cups = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.36, 4), MAT.galv());
    arm.rotation.z = Math.PI / 2;
    arm.position.set(Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18);
    arm.rotation.y = -a;
    const cup = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xf0f3f5, roughness: 0.5 })
    );
    cup.position.set(Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36);
    cup.rotation.z = Math.PI / 2; cup.rotation.y = -a;
    cups.add(arm, cup);
  }
  cups.position.y = 6.7;
  group.add(cups);

  // Wind vane.
  const vane = new THREE.Group();
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.02), new THREE.MeshStandardMaterial({ color: 0xff9933 }));
  tail.position.x = -0.32;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), MAT.galv());
  body.rotation.z = Math.PI / 2;
  vane.add(tail, body);
  vane.position.y = 6.3;
  group.add(vane);

  // Stevenson-style radiation shield (the stack of white plates).
  const shield = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const p = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17 - i * 0.004, 0.19 - i * 0.004, 0.03, 14),
      new THREE.MeshStandardMaterial({ color: 0xf4f7f9, roughness: 0.6 })
    );
    p.position.y = i * 0.07;
    shield.add(p);
  }
  shield.position.set(0.42, 2.2, 0);
  group.add(shield);

  // Solar panel + battery box.
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.04, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x11213a, roughness: 0.25, metalness: 0.6 })
  );
  panel.position.set(-0.5, 3.3, 0);
  panel.rotation.z = -0.5;
  group.add(panel);

  const bat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.4), MAT.galv());
  bat.position.set(0, 0.28, 0.5);
  bat.castShadow = true;
  group.add(bat);

  group.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group, cups, vane };
}

/** Ice-core drill rig: tripod, winch, barrel, and a rack of recovered cores. */
function buildDrillRig() {
  const g = new THREE.Group();
  const steel = MAT.steelGrey();

  // Tripod.
  const H = 4.6;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const foot = new THREE.Vector3(Math.cos(a) * 1.7, 0, Math.sin(a) * 1.7);
    const top = new THREE.Vector3(0, H, 0);
    const len = foot.distanceTo(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, len, 8), steel);
    leg.position.copy(foot).add(top).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
    leg.castShadow = true;
    g.add(leg);
  }

  // Winch head and cable.
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10), MAT.steel());
  head.position.y = H;
  g.add(head);

  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, H - 1.2, 4),
    new THREE.MeshBasicMaterial({ color: 0x2b3238 }));
  cable.position.y = H - (H - 1.2) / 2;
  g.add(cable);

  // Drill barrel hanging on the cable.
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.8, 12), MAT.galv());
  barrel.position.y = 1.9;
  barrel.castShadow = true;
  g.add(barrel);
  const cutter = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.18, 12),
    new THREE.MeshStandardMaterial({ color: 0x2b3238, metalness: 0.9, roughness: 0.3 }));
  cutter.position.y = 0.98;
  g.add(cutter);

  // Borehole collar.
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 18), MAT.steel());
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.06;
  g.add(collar);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.26, 18),
    new THREE.MeshBasicMaterial({ color: 0x04121e }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.07;
  g.add(hole);

  // Core rack — the recovered sections, laid out and labelled.
  const rack = new THREE.Group();
  const railMat = MAT.steelGrey();
  for (const z of [-0.35, 0.35]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.1), railMat);
    rail.position.set(0, 0.55, z);
    rack.add(rail);
  }
  for (const x of [-1.5, 0, 1.5]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.8), railMat);
    leg.position.set(x, 0.275, 0);
    rack.add(leg);
  }
  const iceMat = new THREE.MeshPhysicalMaterial({
    color: 0xcfe8f6, roughness: 0.15, metalness: 0,
    transmission: 0.65, thickness: 0.2, ior: 1.31
  });
  for (let i = 0; i < 4; i++) {
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.098, 0.72, 14), iceMat);
    core.rotation.z = Math.PI / 2;
    core.position.set(-1.2 + i * 0.8, 0.66, 0);
    core.castShadow = true;
    rack.add(core);
  }
  rack.position.set(2.6, 0, 1.2);
  rack.rotation.y = 0.4;
  g.add(rack);

  // Site board.
  g.add(signBoard('ICE CORE SITE 4', 0x1f4f8f, 2.2, 1.1));
  g.children[g.children.length - 1].position.set(-2.4, 0, 1.6);

  return g;
}

/** Wildlife observation blind: a low wooden hide with binoculars on a
 *  tripod out front, sited toward whatever it's watching. */
function buildWildlifeBlind() {
  const g = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.85 });

  const hide = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 1.4), woodMat);
  hide.position.y = 0.65;
  hide.castShadow = hide.receiveShadow = true;
  g.add(hide);

  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.16, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x0a0e12, roughness: 0.9 })
  );
  slot.position.set(0, 0.95, 0.71);
  g.add(slot);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.1, 1.7), MAT.steelGrey());
  roof.position.y = 1.35;
  roof.rotation.z = 0.05;
  roof.castShadow = true;
  g.add(roof);

  // Tripod + binoculars out front, angled toward the water.
  const tripod = new THREE.Group();
  for (const a of [0, 2.1, 4.2]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.85, 5), MAT.steel());
    leg.position.set(Math.cos(a) * 0.3, 0.42, Math.sin(a) * 0.3);
    leg.rotation.z = Math.cos(a) * 0.35;
    leg.rotation.x = Math.sin(a) * 0.35;
    tripod.add(leg);
  }
  const binocMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.5, metalness: 0.4 });
  for (const sx of [-0.045, 0.045]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.22, 8), binocMat);
    barrel.rotation.x = Math.PI / 2.3;
    barrel.position.set(sx, 0.86, 0.05);
    tripod.add(barrel);
  }
  tripod.position.set(0, 0, 1.3);
  g.add(tripod);

  g.add(signBoard('WILDLIFE TRANSECT', 0x2f6f4e, 1.8, 0.5));
  g.children[g.children.length - 1].position.set(-2.1, 0, 0.3);

  return g;
}

/** Ground satcom rig: a small utility trailer with a dish tipped skyward. */
function buildSatcomRig() {
  const g = new THREE.Group();

  const trailer = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.9, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x4a5158, roughness: 0.6, metalness: 0.3 })
  );
  trailer.position.y = 0.55;
  trailer.castShadow = trailer.receiveShadow = true;
  g.add(trailer);

  for (const sx of [-0.7, 0.7]) for (const sz of [-0.45, 0.45]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 12), MAT.steel());
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx, 0.22, sz);
    g.add(wheel);
  }

  const d = dish(0.85);
  d.position.set(0, 1.0, 0);
  d.rotation.y = 0.6;
  g.add(d);

  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), MAT.galv());
  cable.position.set(0.6, 0.7, -0.5);
  cable.rotation.x = 0.3;
  g.add(cable);

  g.add(signBoard('SATCOM UPLINK', 0xff9933, 1.6, 0.45));
  g.children[g.children.length - 1].position.set(-1.9, 0, 0.2);

  return g;
}

/** A small insulated instrument hut on a low frame. */
function buildInstrumentHut(label, color = 0xdde3e6) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 2.5, 3.0),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.15 })
  );
  body.position.y = 1.75;
  body.castShadow = body.receiveShadow = true;
  g.add(body);

  // Low stilts — same principle as the main station, smaller scale.
  for (const sx of [-1.7, 1.7]) for (const sz of [-1.15, 1.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), MAT.steel());
    leg.position.set(sx, 0.25, sz);
    leg.castShadow = true;
    g.add(leg);
  }

  // Shallow roof.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.18, 3.3), MAT.steelGrey());
  roof.position.y = 3.1;
  roof.castShadow = true;
  g.add(roof);

  // Door and a small window. Both used to be dark enough (0x2b4258 door,
  // plain glass window with nothing behind it) that from most angles under
  // overcast polar light they read as solid black rectangles punched in the
  // wall rather than a door and a window — lightened the door and given the
  // window its own warm emissive glow, the same "someone's in there" cue
  // the station buildings' windows already use, so it reads as lit glass
  // rather than a dark hole.
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x4a5f6e, roughness: 0.55, metalness: 0.25 }));
  door.position.set(0, 1.45, 1.52);
  g.add(door);
  const doorHandle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6),
    new THREE.MeshStandardMaterial({ color: 0xd7dde1, roughness: 0.4, metalness: 0.6 })
  );
  doorHandle.rotation.z = Math.PI / 2;
  doorHandle.position.set(0.32, 1.45, 1.57);
  g.add(doorHandle);
  const win = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.6, 0.06),
    new THREE.MeshStandardMaterial({
      color: 0xbfe3ff, emissive: 0xffcf8a, emissiveIntensity: 0.9, roughness: 0.3
    })
  );
  win.position.set(1.3, 2.1, 1.52);
  g.add(win);
  const porchLight = new THREE.PointLight(0xffd39a, 2.5, 6, 1.8);
  porchLight.position.set(0, 2.3, 1.9);
  g.add(porchLight);

  // Label board on the front.
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, 0.5),
    new THREE.MeshStandardMaterial({
      map: signText(label, { color: '#ffffff', bg: '#12324f', w: 1024 }),
      roughness: 0.7
    })
  );
  board.position.set(0, 2.72, 1.53);
  g.add(board);

  return g;
}

/** Dobson-style spectrophotometer on a tripod, pointed at the sky. */
function buildSpectrometer() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.16, 12), MAT.steelGrey());
  base.position.y = 0.08;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.0, 10), MAT.steelGrey());
  col.position.y = 0.6;
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd8dfe3, roughness: 0.5, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.42), bodyMat);
  body.position.y = 1.28;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.75, 12), bodyMat);
  tube.position.set(0.1, 1.62, 0);
  tube.rotation.z = -0.45;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16),
    new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.1, metalness: 0.6 }));
  lens.position.set(0.42, 1.92, 0);
  lens.rotation.set(0, 0, -0.45);
  [base, col, body, tube].forEach(m => { m.castShadow = true; });
  g.add(base, col, body, tube, lens);
  return g;
}

/** A biology quadrat: a marked square of rock with sampling pegs. */
function buildQuadrat() {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xffcf5c, roughness: 0.6 });
  const S = 2.0;
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(S, 0.05, 0.05), frameMat);
    const a = (i / 4) * Math.PI * 2;
    bar.position.set(Math.cos(a) * S / 2, 0.12, Math.sin(a) * S / 2);
    bar.rotation.y = a + Math.PI / 2;
    g.add(bar);
  }
  // Lichen patches — flat discs with an organic edge.
  const lichenMat = [
    new THREE.MeshStandardMaterial({ color: 0x8a9a3f, roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: 0xc4a83c, roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: 0x5f6b52, roughness: 1 })
  ];
  for (let i = 0; i < 14; i++) {
    const r = 0.08 + Math.random() * 0.2;
    const patch = new THREE.Mesh(new THREE.CircleGeometry(r, 9), lichenMat[i % 3]);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set((Math.random() - 0.5) * S * 0.9, 0.02 + Math.random() * 0.01, (Math.random() - 0.5) * S * 0.9);
    g.add(patch);
  }
  const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), frameMat);
  peg.position.set(S / 2, 0.25, S / 2);
  g.add(peg);
  return g;
}

/** Memorial cairn with a plaque — the Dakshin Gangotri marker. */
function buildCairn() {
  const g = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x554c44, roughness: 0.97, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const t = i / 26;
    const r = 1.3 * (1 - t * 0.75);
    const a = i * 2.4;
    const s = 0.22 + Math.random() * 0.26;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    rock.position.set(Math.cos(a) * r * (0.5 + Math.random() * 0.5), t * 1.9 + s * 0.4, Math.sin(a) * r * (0.5 + Math.random() * 0.5));
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rock.castShadow = rock.receiveShadow = true;
    g.add(rock);
  }
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.75),
    new THREE.MeshStandardMaterial({
      map: signText('DAKSHIN GANGOTRI  1984–1990', { color: '#e8c87a', bg: '#2a2317', w: 1024 }),
      roughness: 0.6, metalness: 0.4
    })
  );
  plaque.position.set(0, 1.1, 1.05);
  plaque.rotation.x = -0.25;
  g.add(plaque);
  return g;
}

/** Comms terminal: a ruggedised console on a pedestal with a satellite uplink. */
function buildCommsTerminal() {
  const g = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 0.7), MAT.steelGrey());
  ped.position.y = 0.5;
  ped.castShadow = true;
  const screen = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x0d1a24, roughness: 0.2 }));
  screen.position.set(0, 1.28, 0.1);
  screen.rotation.x = -0.4;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.58),
    new THREE.MeshStandardMaterial({
      map: signText('NCPOR · GOA', { color: '#5fd9ff', bg: '#071722', w: 512 }),
      emissive: 0x2a6a8a, emissiveIntensity: 1.2, roughness: 0.4
    }));
  glow.position.set(0, 1.29, 0.16);
  glow.rotation.x = -0.4;
  g.add(ped, screen, glow);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), MAT.galv());
  ant.position.set(0.45, 1.9, -0.2);
  g.add(ant);
  return g;
}

/** Ocean mooring buoy on a cradle, waiting for deployment. */
function buildBuoy() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xffb020, roughness: 0.55, metalness: 0.2 })
  );
  hull.scale.y = 0.8;
  hull.position.y = 1.0;
  hull.castShadow = true;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.5, 8), MAT.galv());
  tower.position.y = 2.2;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffb020, emissiveIntensity: 2 }));
  lamp.position.y = 3.0;
  // Cradle.
  const cradle = new THREE.Group();
  for (const sx of [-0.8, 0.8]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 1.8), MAT.steel());
    bar.position.set(sx, 0.25, 0);
    cradle.add(bar);
  }
  g.add(hull, tower, lamp, cradle);
  return g;
}

/** Net-hauling frame for the plankton / krill tow. */
function buildSamplingRig() {
  const g = new THREE.Group();
  const steel = MAT.steel();
  // A-frame.
  for (const sx of [-1.1, 1.1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 3.4, 8), steel);
    leg.position.set(sx, 1.7, 0);
    leg.rotation.z = -sx * 0.16;
    leg.castShadow = true;
    g.add(leg);
  }
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.0, 8), steel);
  top.rotation.z = Math.PI / 2;
  top.position.y = 3.35;
  g.add(top);

  // Conical net.
  const net = new THREE.Mesh(
    new THREE.ConeGeometry(0.62, 2.2, 16, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xdfe8ee, roughness: 0.9, side: THREE.DoubleSide,
      transparent: true, opacity: 0.55
    })
  );
  net.position.y = 1.9;
  net.rotation.x = Math.PI;
  g.add(net);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 8, 20), MAT.galv());
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 3.0;
  g.add(ring);
  const codend = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.4, 10),
    new THREE.MeshStandardMaterial({ color: 0x2a6ed8, roughness: 0.5 }));
  codend.position.y = 0.75;
  g.add(codend);

  // Sample crates.
  for (let i = 0; i < 3; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x1f6f8f, roughness: 0.7 }));
    crate.position.set(1.9, 0.2 + (i % 2) * 0.42, -0.6 + i * 0.6);
    crate.castShadow = true;
    g.add(crate);
  }
  return g;
}

/** A generic site signboard on two posts. */
function signBoard(text, bg = 0x12324f, w = 2.0, h = 1.0) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(w, h * 0.5, 0.06),
    new THREE.MeshStandardMaterial({
      map: signText(text, { color: '#ffffff', bg: '#' + bg.toString(16).padStart(6, '0'), w: 1024 }),
      roughness: 0.7
    })
  );
  board.position.y = h + 0.25;
  board.castShadow = true;
  g.add(board);
  for (const sx of [-w / 2 + 0.12, w / 2 - 0.12]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h + 0.4, 6), MAT.galv());
    post.position.set(sx, (h + 0.4) / 2, 0);
    post.castShadow = true;
    g.add(post);
  }
  return g;
}
