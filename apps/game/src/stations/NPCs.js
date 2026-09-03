import * as THREE from 'three';
import { buildCharacter } from '../player/Avatar.js';
import { MAT, signText, crate } from './kit.js';

/**
 * NPCs.js — the winter crew.
 *
 * A station full of empty rooms and unattended instruments does not read as
 * "lived in" no matter how much furniture it has. This is the fix: a small
 * cast of characters, each visibly doing the job their role implies, built
 * on the same primitive character rig as the player's own third-person body
 * (buildCharacter() in Avatar.js) so there is no separate art pipeline to
 * maintain.
 *
 * Each NPC is a plain interactable in the same sense as an archive pickup —
 * approach, press E — except the payload is a line of dialogue (and,
 * sometimes, unlocking an archive entry that the conversation is literally
 * about) rather than a chart. That reuses the entire existing prompt/toast
 * machinery in main.js with no new UI.
 *
 * Animation is deliberately not skeletal: each role rotates two or three
 * named parts (`parts.armR`, `parts.head`, ...) on independent sine waves.
 * That reads as "doing a repetitive task" at a glance, which is exactly what
 * a stationary NPC in a small research base should look like anyway — nobody
 * here has room to pace.
 */

let _seed = 1;
const phase = () => (_seed = (_seed * 9301 + 49297) % 233280) / 233280 * Math.PI * 2;

/* ================================================================ roles */

function buildCook() {
  const character = buildCharacter({
    parka: 0xd8d8d0, parkaDark: 0x9a9a90, trouserColor: 0x2a2a2a, hoodOn: false, pack: false
  });
  const p = character.userData.parts;

  // Apron over the parka — the one visual cue that reads as "kitchen" from
  // across a room, faster than any prop would.
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.5, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 })
  );
  apron.position.set(0, 0.98, 0.17);
  character.add(apron);

  // A ladle held in the working hand — parented to the hand group so it
  // travels with the stir animation for free.
  const ladle = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.32, 6), MAT.steelGrey());
  handle.position.y = -0.16;
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), MAT.steelGrey());
  bowl.position.y = -0.33;
  bowl.rotation.x = Math.PI;
  ladle.add(handle, bowl);
  p.handR.add(ladle);

  const stove = new THREE.Group();
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 0.65), MAT.steelGrey());
  counter.position.y = 0.425;
  counter.castShadow = counter.receiveShadow = true;
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.28, 14), MAT.steelGrey());
  pot.position.set(0, 0.99, 0);
  pot.castShadow = true;
  const steamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 });
  const steam = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 10, 1, true), steamMat);
  steam.position.set(0, 1.35, 0);
  stove.add(counter, pot, steam);
  stove.userData.steam = steam;

  const ph = phase();
  return {
    character, extra: stove,
    animate(dt, t) {
      p.armR.rotation.x = -1.3 + Math.sin(t * 2.6 + ph) * 0.35;
      p.armR.rotation.z = -0.15;
      p.torso.rotation.y = Math.sin(t * 1.1 + ph) * 0.08;
      p.head.rotation.x = 0.25 + Math.sin(t * 1.3 + ph) * 0.05;
      stove.userData.steam.position.y = 1.35 + Math.sin(t * 1.7) * 0.05;
      stove.userData.steam.material.opacity = 0.12 + Math.sin(t * 2.1) * 0.06;
      stove.userData.steam.rotation.y = t * 0.4;
    }
  };
}

/**
 * A scientist, doing THEIR OWN job.
 *
 * Every scientist in the game used to share one animation -- the same
 * alternating hand-taps at the same rate, separated only by a random phase
 * offset. Put three of them in three adjacent huts and the phase offset does
 * nothing: you see one gesture, three times, and the labs stop reading as
 * three disciplines and start reading as three copies. Which is exactly the
 * "the scientists are doing the same animation, there is nothing unique"
 * report.
 *
 * The differences below are behavioural, not decorative. A glaciologist works
 * with both hands on something heavy and cold and keeps checking it; a met
 * officer writes, then looks up at an instrument, on a fixed cycle because the
 * synoptic hours are fixed; a geophysicist barely moves at all, because
 * watching a seismic trace IS the job. Rate, amplitude and asymmetry carry
 * that -- a fast symmetric wave reads as typing no matter what is in front of
 * the character, and a slow asymmetric one reads as handling something.
 *
 * @param {string} [task] discipline: glaciology | meteorology | geophysics
 */
function buildScientist(task) {
  const character = buildCharacter({
    parka: 0xdfe6ea, parkaDark: 0x9fb0ba, trouserColor: 0x1c2530, hoodOn: false, pack: false
  });
  const p = character.userData.parts;
  const ph = phase();

  const MOVES = {
    // Lifting a core section out of its sleeve, turning it to read the
    // stratigraphy, setting it back. Both arms, slow, and the whole torso
    // dips into it -- a metre of ice is heavy and you do not hold it at
    // arm's length.
    glaciology(t) {
      const cycle = Math.sin(t * 0.55 + ph);            // the lift
      const lift = Math.max(0, cycle);
      p.armR.rotation.x = -0.55 - lift * 0.75;
      p.armL.rotation.x = -0.55 - lift * 0.75;
      p.armR.rotation.z = -0.30 + lift * 0.10;
      p.armL.rotation.z = 0.30 - lift * 0.10;
      p.torso.rotation.x = 0.16 - lift * 0.16;
      p.torso.rotation.y = Math.sin(t * 0.27 + ph) * 0.22;   // turning it over
      p.head.rotation.x = 0.34 - lift * 0.22;
    },
    // Read the drum, write it down, look up again. The pause at the top is
    // deliberate: the reading is taken on the hour, not continuously.
    meteorology(t) {
      const c = (t * 0.42 + ph) % (Math.PI * 2);
      const writing = c < Math.PI * 1.2;
      p.armR.rotation.x = writing ? -1.05 + Math.sin(t * 6.4) * 0.16 : -0.5;
      p.armR.rotation.z = writing ? -0.22 : -0.05;
      p.armL.rotation.x = -0.35;
      p.armL.rotation.z = 0.12;
      p.head.rotation.x = writing ? 0.42 : -0.12;        // down at the pad, up at the drum
      p.torso.rotation.y = writing ? -0.16 : 0.20;
      p.torso.rotation.x = writing ? 0.12 : 0.02;
    },
    // Watching a trace. Almost nothing moves; the eyes do the work. The
    // occasional lean-in is the only real event, and that is the point --
    // stillness next to two busy neighbours is itself a characterisation.
    geophysics(t) {
      const lean = Math.max(0, Math.sin(t * 0.23 + ph) - 0.72) * 3.2;
      p.armR.rotation.x = -0.28 - lean * 0.5;
      p.armL.rotation.x = -0.26;
      p.armR.rotation.z = -0.34;
      p.armL.rotation.z = 0.34;
      p.head.rotation.y = Math.sin(t * 0.45 + ph) * 0.30;   // scanning the trace
      p.head.rotation.x = 0.10 + lean * 0.18;
      p.torso.rotation.x = 0.04 + lean * 0.14;
    },
    // The original: at a keyboard.
    default(t) {
      p.armR.rotation.x = -0.9 + Math.sin(t * 5.2 + ph) * 0.12;
      p.armL.rotation.x = -0.9 + Math.sin(t * 5.2 + ph + Math.PI) * 0.12;
      p.head.rotation.x = 0.18 + Math.max(0, Math.sin(t * 0.35 + ph)) * -0.3;
      p.torso.rotation.x = 0.06;
    }
  };
  const move = MOVES[task] ?? MOVES.default;

  return { character, extra: null, animate(dt, t) { move(t); } };
}

function buildTechnician(colorOverride) {
  // hoodOn:false — this role covers everyone from the storekeeper to the
  // weather observer stationed right at spawn, all named, dialogue-bearing
  // people the player is meant to actually look at when talking to them.
  // The default hood reads as a smooth, featureless dome from most angles,
  // which is exactly "the face isn't visible" complaint — a visible face
  // (goggles off too, since goggles defaults to hoodOn) matters more here
  // than outdoor-gear realism.
  // colorOverride lets a caller (e.g. one station's ground crew) restyle
  // the parka so the same role doesn't look identical at every station.
  const character = buildCharacter({
    parka: colorOverride?.parka ?? 0xff9933,
    parkaDark: colorOverride?.parkaDark ?? 0xb36b1f,
    trouserColor: 0x2a2620, hoodOn: false, pack: true
  });
  const p = character.userData.parts;

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

  const ph = phase();
  return {
    character, extra: null,
    onBuild: () => { character.userData.parts.handL.add(clipboard); },
    animate(dt, t) {
      // A mild forward lean and a lowered gaze — reads as "looking at
      // whatever's in your hands" (a clipboard, a shelf, an instrument
      // panel) across every context this role covers, rather than the much
      // more extreme reach-and-crouch this used to be, which only actually
      // fit the power technician adjusting equipment and looked like a
      // stiff, dramatic lunge on everyone else using the same role for a
      // calmer job (checking stock, reading a weather clipboard).
      // Deliberately NOT rotating legL/legR: see buildFieldTeam's
      // applyCollect for why a static hip-only leg bend still isn't safe
      // even with the hip-pivot rig fix.
      p.armR.rotation.x = -0.85 + Math.sin(t * 2.0 + ph) * 0.08;
      p.armR.rotation.z = 0.08;
      p.armL.rotation.x = -0.65;
      p.head.rotation.x = 0.22 + Math.sin(t * 1.1 + ph) * 0.05;
      p.torso.rotation.x = 0.18;
    }
  };
}

function buildRadioOperator() {
  const character = buildCharacter({
    parka: 0x2a4a6f, parkaDark: 0x1c3350, trouserColor: 0x1a1e24, hoodOn: false, pack: false
  });
  const p = character.userData.parts;

  // Headset — a thin band over the head plus a mic boom, built from the
  // same primitive vocabulary as everything else (cylinders/spheres).
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.155, 0.012, 6, 12, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 })
  );
  band.rotation.z = Math.PI;
  band.position.y = 0.06;
  p.head.add(band);
  const mic = new THREE.Group();
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
  boom.rotation.z = Math.PI / 2.4;
  boom.position.set(0.08, -0.05, 0.05);
  mic.add(boom);
  p.head.add(mic);

  const ph = phase();
  return {
    character, extra: null,
    animate(dt, t) {
      // Adjusting dials / writing on a log pad — small, precise hand motion,
      // very different in character from the cook's broad stirring arc.
      p.armR.rotation.x = -1.1 + Math.sin(t * 3.8 + ph) * 0.15;
      p.armR.rotation.z = -0.2;
      p.head.rotation.y = Math.sin(t * 0.6 + ph) * 0.12;
      p.torso.rotation.x = 0.05;
    }
  };
}

// The three discipline roles are the same builder with a different job to do.
// Registering them as roles (rather than threading an options bag through
// every buildNPC call site) keeps the change local to the two files that
// care.
const BUILDERS = {
  cook: buildCook, scientist: buildScientist,
  glaciologist: () => buildScientist('glaciology'),
  meteorologist: () => buildScientist('meteorology'),
  geophysicist: () => buildScientist('geophysics'),
  technician: buildTechnician, radioOperator: buildRadioOperator
};

/* ================================================================= label */

function buildNameplate(text) {
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.22),
    new THREE.MeshStandardMaterial({
      map: signText(text, { color: '#dcefff', bg: '#0c1b2b', w: 512 }),
      transparent: true, roughness: 0.6
    })
  );
  plate.position.y = 2.05;
  return plate;
}

/**
 * Build one NPC.
 *
 * A name is a small thing that does a lot of work: "Talk to the cook" reads
 * as a job title standing in a room; "Talk to Ramesh" reads as a person.
 * Every station-crew NPC gets a real name for exactly that reason — the
 * dialogue toast is titled with it, not with the role.
 *
 * @param {'cook'|'scientist'|'technician'|'radioOperator'} role
 * @param {THREE.Vector3|{x,z}} position  station-local (or site-local) coords
 * @param {number} facing  yaw, radians
 * @param {string} name    the person's name, e.g. "Ramesh"
 * @param {string} title   their role/job, e.g. "Station Cook" — shown under
 *   the name on the in-world nameplate
 * @param {string[]} lines dialogue shown one per press (cycles)
 * @param {string} [unlocks]  an archive entry id to award the first time this
 *   NPC is spoken to — used where the dialogue IS the archive record's story.
 */
export function buildNPC(role, position, facing, name, title, lines, unlocks) {
  const built = BUILDERS[role]?.() ?? BUILDERS.technician();
  const group = new THREE.Group();
  group.add(built.character);
  if (built.extra) {
    built.extra.position.set(0, 0, -0.55);
    built.extra.rotation.y = Math.PI;
    group.add(built.extra);
  }
  built.onBuild?.();
  group.add(buildNameplate(name));
  group.position.set(position.x, 0, position.z ?? position.y ?? 0);
  group.rotation.y = facing;

  let dialogueIndex = 0;
  return {
    group,
    id: `npc-${role}-${position.x}-${position.z}`,
    name,
    title,
    label: `Talk to ${name}`,
    unlocks,
    nextLine: () => {
      const line = lines[dialogueIndex % lines.length];
      dialogueIndex++;
      return line;
    },
    update(dt, elapsed) { built.animate(dt, elapsed); }
  };
}

/* ========================================================= field team */

/**
 * A generic walk cycle — alternating leg swing (now safe: buildCharacter's
 * hip-pivot groups mean rotating parts.legL/legR swings the boot with the
 * thigh instead of leaving it behind) with a smaller opposite-arm swing and
 * a light hip sway. Used by buildFieldTeam below for the stretches of the
 * route where a member is actually walking rather than working.
 */
function applyWalk(p, phase) {
  const swing = Math.sin(phase);
  p.legL.rotation.x = swing * 0.5;
  p.legR.rotation.x = -swing * 0.5;
  p.armL.rotation.x = -swing * 0.35;
  p.armR.rotation.x = swing * 0.35;
  p.torso.rotation.z = swing * 0.03;
  p.head.rotation.y = 0;
}

/**
 * The storekeeper's actual job, visibly: reach up to the shelf, place
 * something, come back down, pause, repeat. A generic idle sway (which is
 * all buildTechnician's animate() gives every technician-role NPC) reads as
 * "standing there" no matter how it's captioned — this cycles through the
 * motion a stock clerk actually makes so "arranging the shelf" is something
 * you can watch happen, not just something the dialogue claims.
 * Call as `npc.update = (dt, elapsed) => applyRestock(parts, elapsed)` after
 * buildNPC() — parts come from `npc.group.children[0].userData.parts`.
 */
export function applyRestock(p, t) {
  const cycle = 5.2;
  const u = t % cycle;
  if (u < 1.8) {
    // Reaching up to the shelf.
    const k = u / 1.8;
    p.armR.rotation.x = THREE.MathUtils.lerp(-0.3, -2.05, k);
    p.armR.rotation.z = THREE.MathUtils.lerp(0, 0.25, k);
    p.head.rotation.x = THREE.MathUtils.lerp(0.05, 0.4, k);
  } else if (u < 2.6) {
    // Placing it — a small settling wiggle, not a held statue-pose.
    p.armR.rotation.x = -2.05 + Math.sin((u - 1.8) * 14) * 0.04;
    p.armR.rotation.z = 0.25;
    p.head.rotation.x = 0.4;
  } else if (u < 3.6) {
    // Stepping back down.
    const k = (u - 2.6) / 1.0;
    p.armR.rotation.x = THREE.MathUtils.lerp(-2.05, -0.3, k);
    p.armR.rotation.z = THREE.MathUtils.lerp(0.25, 0, k);
    p.head.rotation.x = THREE.MathUtils.lerp(0.4, 0.05, k);
  } else {
    // A beat checking the manifest before the next item.
    p.armR.rotation.x = -0.3 + Math.sin(t * 1.3) * 0.04;
    p.head.rotation.x = 0.05 + Math.sin(t * 0.8) * 0.05;
  }
  p.armL.rotation.x = -0.5;
  p.torso.rotation.x = 0.1 + Math.max(0, Math.sin((u / cycle) * Math.PI)) * 0.08;
}

/** Bent forward over the work — the pose used while a member is "collecting
 *  samples" at a stop, sharing the same "lean, don't rotate the legs much"
 *  approach the technician fix settled on, just with a little more of it now
 *  that the hip pivot keeps the foot attached even so. */
function applyCollect(p, t) {
  // No leg rotation here, deliberately — an uneven static bend on both hips
  // (the previous version used two different fixed angles) reads as legs
  // and upper body pulling in different directions rather than one coherent
  // "bent over working" pose. The torso lean plus arm reach carries the
  // whole pose on its own, same as the technician crouch fix earlier.
  p.torso.rotation.x = 0.55 + Math.sin(t * 2.1) * 0.04;
  p.armR.rotation.x = -1.3 + Math.sin(t * 2.6) * 0.15;
  p.armL.rotation.x = -1.1 + Math.sin(t * 2.6 + Math.PI) * 0.1;
  p.head.rotation.x = 0.4;
}

/** Walking while gripping a shared crate between two people — arms held in
 *  toward the centre (not swinging freely, the way a free walk cycle
 *  would), legs still alternate normally since carrying something doesn't
 *  change how you walk. */
function applyCarry(p, phase, towardCentre) {
  const swing = Math.sin(phase);
  p.legL.rotation.x = swing * 0.4;
  p.legR.rotation.x = -swing * 0.4;
  const side = towardCentre > 0 ? 1 : -1;
  p.armR.rotation.x = -1.0 + Math.sin(phase) * 0.04;
  p.armR.rotation.z = -0.25 * side;
  p.armL.rotation.x = -1.0 + Math.sin(phase + Math.PI) * 0.04;
  p.armL.rotation.z = 0.25 * side;
  p.torso.rotation.x = 0.12;
}

/**
 * A small crew that actually goes somewhere: out to a field site, stopped
 * there working a "collect" pose for a while, then back to the station to
 * "process" what they found (another work stop, e.g. at a lab hut) before
 * looping the whole circuit again. Modelled on how a real Antarctic field
 * party runs a sampling trip — walk out, work the site, walk back, write it
 * up — rather than the single-spot idle animation every other NPC in this
 * file uses; this is deliberately the one role in the game that moves.
 *
 * @param {{x:number,z:number,pause?:number,activity?:'collect'|'idle'}[]} waypoints
 *   Looped in order. `pause` (seconds) holds the member there playing
 *   `activity` before continuing to the next point; omitted = walk through.
 * @param {object} terrain  needs .heightAt(x,z) so the team follows ground.
 * @param {object} [opts]
 */
// What a field-team member actually says depends on what they're doing right
// now, not a fixed script — walking out, working the site, or back
// processing what they found are three different things to explain, and
// "they should stop and tell what they are doing and how it is necessary"
// only lands if the answer matches what the player is actually watching.
// Two stations, two entirely separate crews — the same pool used for both
// (which is what a single shared constant here would mean, since
// buildFieldTeam is the exact same code called once per station) is what
// made a Bharati field scientist and a Maitri field scientist come out as
// literally the same name. opts.names lets each site.js call pass its own
// station's pool instead of falling back to this default.
const FIELD_NAMES_DEFAULT = {
  technician: ['Rahul Verma', 'Manoj Thapa', 'Arjun Bhatt', 'Vikas Rawat'],
  scientist: ['Dr. Neha Kulkarni', 'Dr. Ayesha Khan', 'Dr. Farah Sheikh', 'Dr. Ritu Deshmukh']
};
const FIELD_LINES = {
  technician: {
    transit: [
      'Heading out to the sampling site — same route every time, so nobody has to think about navigation with their hands full of gear.',
    ],
    collect: [
      'I handle the gear at this stop — corer, filters, sample bottles. The scientists tell me what to grab, I make sure it survives the walk back in one piece.',
      'Half of fieldwork here is just keeping equipment from freezing solid before you get a reading out of it.',
    ],
    idle: [
      'Cleaning and stowing the field kit before the next run. Salt and meltwater wreck instruments fast if you don\'t rinse them down the same day.',
    ]
  },
  scientist: {
    transit: [
      'Back to the water source for another round — this is routine, not a special trip. Long records only exist because someone kept showing up.',
    ],
    collect: [
      'This is where the actual samples get taken — water chemistry, ice cores, whatever this trip is logging. Half the archive\'s field records start right here.',
      'One data point means nothing on its own. It\'s the fact that we\'ve been doing this on the same schedule for years that makes it useful.',
    ],
    idle: [
      'Logging what we brought back while it\'s still fresh in my head — every sample gets catalogued the same day, or the context gets lost.',
    ]
  }
};

export function buildFieldTeam(waypoints, terrain, opts = {}) {
  const count = opts.count ?? 4;
  const roles = opts.roles ?? ['technician', 'scientist', 'technician', 'scientist', 'cook'];
  const speed = opts.speed ?? 1.5;

  // When there's more than one field team (two crews visiting two different
  // sites), each buildFieldTeam() call would otherwise start drawing names
  // from the same pool at index 0 — the second team's technician gets the
  // exact same name as the first team's. nameOffset shifts where a
  // multi-team caller starts drawing from, so a second call passes
  // nameOffset:1 (or similar) to land on different names.
  const nameOffset = opts.nameOffset ?? 0;
  const namePool = opts.names ?? FIELD_NAMES_DEFAULT;
  const nameUsed = { technician: nameOffset, scientist: nameOffset };
  const members = [];
  for (let i = 0; i < count; i++) {
    const role = roles[i % roles.length];
    const built = BUILDERS[role]?.() ?? BUILDERS.technician();
    const group = new THREE.Group();
    group.add(built.character);
    const p = built.character.userData.parts;
    // A small lateral offset so a 4-5 person team reads as a loose group
    // walking together rather than perfectly stacked figures.
    const lateral = (i - (count - 1) / 2) * 0.85;
    // Stagger starting position along the route so they don't move in lockstep.
    const startFrac = i / count;
    const names = namePool[role] ?? namePool.technician ?? FIELD_NAMES_DEFAULT.technician;
    const name = names[(nameUsed[role] ?? 0) % names.length];
    nameUsed[role] = (nameUsed[role] ?? 0) + 1;
    const title = role === 'scientist' ? 'Field Scientist' : 'Field Technician';
    members.push({
      group, p, lateral, seg: 0, segT: startFrac, wait: 0, phase: Math.random() * 10,
      role, name, title, worldPosition: new THREE.Vector3(),
      dialogueIndex: 0
    });
  }

  const segLen = [];
  for (let i = 0; i < waypoints.length; i++) {
    const a = waypoints[i], b = waypoints[(i + 1) % waypoints.length];
    segLen.push(Math.max(0.01, Math.hypot(b.x - a.x, b.z - a.z)));
  }

  // A waypoint near the shore (the krill net is necessarily right at the
  // water's edge) is fine for the CENTRE of the path — but every member
  // also carries a lateral offset so a team reads as a loose group rather
  // than stacked figures, and that offset is applied blindly, with no
  // check on what's actually under the offset foot. On a path that runs
  // close enough to a shoreline, the offset alone was enough to walk the
  // outer member of the pair straight into the water while the waypoint
  // itself, and everyone else, stayed on dry ground. Falling back to the
  // un-offset centreline whenever the offset point reads as underwater
  // keeps the group looking like a group without ever putting a foot in
  // the sea — seaLevel itself is checked first since a station with no
  // real sea nearby reports a placeholder far below any real terrain.
  const onLand = (x, z, fbX, fbZ) => {
    if (terrain.seaLevel > -900 && terrain.heightAt(x, z) < terrain.seaLevel + 0.3) {
      return [fbX, fbZ];
    }
    return [x, z];
  };

  function update(dt, elapsed) {
    for (const m of members) {
      const a = waypoints[m.seg], b = waypoints[(m.seg + 1) % waypoints.length];
      m.phase += dt;

      if (m.wait > 0) {
        m.wait -= dt;
        m.currentActivity = a.activity ?? 'idle';
        if (a.activity === 'collect') applyCollect(m.p, m.phase);
        else applyWalk(m.p, 0);
        // Face along the direction just walked while working the stop.
        const [x, z] = onLand(a.x + m.lateral * 0.3, a.z, a.x, a.z);
        m.group.position.set(x, terrain.heightAt(x, z), z);
        m.worldPosition.copy(m.group.position);
        continue;
      }

      m.segT += (dt * speed) / segLen[m.seg];
      if (m.segT >= 1) {
        m.segT = 0;
        m.seg = (m.seg + 1) % waypoints.length;
        const arrived = waypoints[m.seg];
        if (arrived.pause) { m.wait = arrived.pause; continue; }
      }

      const na = waypoints[m.seg], nb = waypoints[(m.seg + 1) % waypoints.length];
      const t = m.segT;
      const dx = nb.x - na.x, dz = nb.z - na.z;
      const len = Math.hypot(dx, dz) || 1;
      // Perpendicular offset so members walk side-by-side, not single-file
      // on top of each other.
      const px = -dz / len, pz = dx / len;
      const [x, z] = onLand(
        na.x + dx * t + px * m.lateral, na.z + dz * t + pz * m.lateral,
        na.x + dx * t, na.z + dz * t
      );
      m.group.position.set(x, terrain.heightAt(x, z), z);
      // NOT atan2(-dx,-dz): buildCharacter()'s own docstring claims the rig
      // faces local -Z to match Player.forward(), but the actual modelled
      // face (nose/eyes/goggles in Avatar.js, all at local z=+0.15ish) sits
      // at +Z instead. A stationary buildNPC() never exposed that — nobody
      // notices which way a standing figure's nose points — but a walking
      // one facing the direction it just came from is a character sliding
      // backward across the ground, i.e. exactly "the NPCs are moonwalking".
      m.group.rotation.y = Math.atan2(dx, dz);
      applyWalk(m.p, m.phase * 5.5);
      m.currentActivity = 'transit';
      m.worldPosition.copy(m.group.position);
    }
  }

  const interactables = members.map(m => ({
    id: `npc-field-${m.role}-${m.name.replace(/\s+/g, '')}`,
    label: `Talk to ${m.name}`,
    isNpc: true,
    radius: 3.2,
    worldPosition: m.worldPosition,
    npc: {
      name: m.name,
      title: m.title,
      nextLine: () => {
        const set = (FIELD_LINES[m.role] ?? FIELD_LINES.technician)[m.currentActivity ?? 'transit']
          ?? FIELD_LINES.technician.transit;
        const line = set[m.dialogueIndex % set.length];
        m.dialogueIndex++;
        return line;
      }
    }
  }));

  return { groups: members.map(m => m.group), update, interactables };
}

/**
 * The resupply ground crew — unlike buildFieldTeam's fixed loop, this one is
 * gated on the actual helicopter delivery: it waits at the station's storage
 * bay until `opts.cargoReady()` says a crate is actually down, walks out to
 * `opts.getDropPoint()`, "loads" it (calling `opts.onPickup` — the caller
 * uses this to hide the world crate via HelicopterFlight.claimCargo()), and
 * carries a visible crate prop all the way back into storage before waiting
 * for the next flight. This is the direct answer to "the NPC taking cargo
 * doesn't have anything to carry, doesn't wait for the drop, and never
 * actually takes the supply inside" — every part of that sequence is now a
 * real state instead of an ambient loop that happened to pass near the pad.
 */
export function buildSupplyCrew(path, terrain, opts = {}) {
  // `path`: ordered waypoints from the storage bay (index 0) out to just
  // outside the front door (last index) — e.g. [storagePoint,
  // entranceInside, entranceOutside]. Each is a THREE.Vector3 with a real
  // (already-resolved) y, so the crew's whole indoor-to-outdoor route
  // actually climbs the building's own stairs and passes through its own
  // door instead of cutting a straight line under the building at ground
  // level, which is what a single home-point-to-dropPoint leg used to do —
  // visually "the crew stands under the building and the box just
  // appears/disappears there" instead of ever entering. One more, dynamic
  // leg (opts.getDropPoint(), a plain {x,z} with no y — resolved against
  // live terrain instead) extends the route out to wherever the helicopter
  // actually put the crate down.
  const speed = opts.speed ?? 1.7;
  const loadDur = opts.loadDur ?? 3;
  const storeDur = opts.storeDur ?? 2;
  const home = path[0];

  const posAt = (wp) => ({
    x: wp.x, z: wp.z,
    y: wp.y !== undefined ? wp.y : terrain.heightAt(wp.x, wp.z)
  });

  // Two different stations, two different ground crews — a caller passes
  // its own opts.names (and can restyle the parka via opts.parka/parkaDark)
  // so Bharati's crew and Maitri's crew aren't the same two people.
  const supplyNames = opts.names ?? ['Karan Bisht', 'Sanjay Oraon'];
  const members = [0, 1].map(i => {
    const built = BUILDERS.technician(opts.parka ? { parka: opts.parka, parkaDark: opts.parkaDark } : undefined);
    const group = new THREE.Group();
    group.add(built.character);
    return {
      p: built.character.userData.parts, group, lateral: (i - 0.5) * 0.85,
      name: supplyNames[i], worldPosition: new THREE.Vector3(), dialogueIndex: 0
    };
  });
  // One crate, carried BETWEEN the two of them (each gripping their own
  // side), not one member carrying it alone while the other walks empty-
  // handed — and bigger than the single-carrier version, since a two-person
  // lift is for something that size, not a box one person would just sling
  // on a shoulder. Parented to neither character: its position is driven
  // directly off the shared anchor every frame instead.
  const sharedCrate = crate('#8a6a3a');
  sharedCrate.scale.set(2.6, 2.2, 2.4);
  sharedCrate.visible = false;

  let anchor = posAt(home);
  for (const m of members) m.group.position.set(anchor.x, anchor.y, anchor.z);

  let state = 'wait';
  let direction = 'out';   // 'out' = heading to the drop point, 'in' = heading home
  let t = 0;
  let routeStack = [];     // remaining waypoints in the current multi-leg trip
  let legFrom = anchor, legTo = anchor, legLen = 1;

  function beginLegTo(wp) {
    legFrom = { x: anchor.x, y: anchor.y, z: anchor.z };
    legTo = posAt(wp);
    legLen = Math.max(0.01, Math.hypot(legTo.x - legFrom.x, legTo.z - legFrom.z));
    t = 0;
  }

  function startRoute(waypoints) {
    routeStack = waypoints.slice();
    beginLegTo(routeStack.shift());
  }

  /** Advances to the next queued leg; returns false once the route is done. */
  function advanceLeg() {
    anchor = { x: legTo.x, y: legTo.y, z: legTo.z };
    if (routeStack.length === 0) return false;
    beginLegTo(routeStack.shift());
    return true;
  }

  function settle() {
    // Park the team, side by side, at the current anchor with no travel
    // direction to derive a facing from — used for the wait/loading/storing
    // states, which all hold one fixed spot.
    for (const m of members) {
      const x = anchor.x + m.lateral, z = anchor.z;
      m.group.position.set(x, anchor.y, z);
      m.worldPosition.copy(m.group.position);
    }
  }

  function update(dt, elapsed) {
    t += dt;
    switch (state) {
      case 'wait':
        settle();
        for (const m of members) applyWalk(m.p, 0);
        if (opts.cargoReady?.()) {
          direction = 'out';
          startRoute([...path.slice(1), opts.getDropPoint()]);
          state = 'walking';
        }
        break;

      case 'walking': {
        const u = Math.min(1, (t * speed) / legLen);
        const ax = legFrom.x + (legTo.x - legFrom.x) * u;
        const ay = legFrom.y + (legTo.y - legFrom.y) * u;
        const az = legFrom.z + (legTo.z - legFrom.z) * u;
        anchor = { x: ax, y: ay, z: az };
        const dx = legTo.x - legFrom.x, dz = legTo.z - legFrom.z;
        const len = Math.hypot(dx, dz) || 1;
        const px = -dz / len, pz = dx / len;
        // See the matching comment in buildFieldTeam — the rig's modelled
        // face is at local +Z, not the -Z its own docstring claims.
        const yaw = Math.atan2(dx, dz);
        for (const m of members) {
          const x = ax + px * m.lateral, z = az + pz * m.lateral;
          // ay directly, not terrain.heightAt(x,z): mid-staircase the real
          // ground height under an indoor point is meaningless (and often
          // far below the floor), so members must stay locked to the
          // interpolated route height, not re-snap to the terrain each frame.
          m.group.position.set(x, ay, z);
          m.group.rotation.y = yaw;
          if (direction === 'in') applyCarry(m.p, elapsed * 5.5, m.lateral);
          else applyWalk(m.p, elapsed * 5.5 + m.lateral * 3);
          m.worldPosition.copy(m.group.position);
        }
        if (direction === 'in') {
          sharedCrate.position.set(ax, ay + 1.0, az);
          sharedCrate.rotation.y = yaw;
        }
        if (u >= 1) {
          if (advanceLeg()) break;   // more legs queued — keep walking
          if (direction === 'out') { state = 'loading'; t = 0; }
          else { state = 'storing'; t = 0; }
        }
        break;
      }

      case 'loading':
        settle();
        for (const m of members) applyCollect(m.p, elapsed);
        if (t >= loadDur) {
          sharedCrate.visible = true;
          opts.onPickup?.();
          direction = 'in';
          startRoute([...path].reverse());
          state = 'walking';
        }
        break;

      case 'storing':
        settle();
        sharedCrate.position.set(anchor.x, anchor.y + 1.0, anchor.z);
        for (const m of members) applyCollect(m.p, elapsed);
        if (t >= storeDur) {
          sharedCrate.visible = false;
          opts.onStored?.();
          state = 'wait'; t = 0;
        }
        break;
    }
  }

  const SUPPLY_LINES = {
    wait: [
      'Waiting on the next resupply flight. Nothing to carry until the helicopter actually puts something down.',
    ],
    toDrop: ['Helicopter dropped a load — heading out to bring it in before the weather does anything to it.'],
    loading: [
      'This is the resupply crate — food, fuel, spares, whatever the ship sent this run. Getting it off the pad and into storage is the whole job.',
    ],
    toHome: ['Got it. Carrying this straight to storage now.'],
    storing: [
      'Logging it into storage. Once it\'s shelved it\'s officially part of the station\'s stores, not just cargo sitting on a pad.',
    ]
  };

  const interactables = members.map(m => ({
    id: `npc-supply-${m.name.replace(/\s+/g, '')}`,
    label: `Talk to ${m.name}`,
    isNpc: true,
    radius: 3.2,
    worldPosition: m.worldPosition,
    npc: {
      name: m.name,
      title: 'Resupply Crew',
      nextLine: () => {
        const key = state === 'walking' ? (direction === 'out' ? 'toDrop' : 'toHome') : state;
        const set = SUPPLY_LINES[key] ?? SUPPLY_LINES.wait;
        const line = set[m.dialogueIndex % set.length];
        m.dialogueIndex++;
        return line;
      }
    }
  }));

  return { groups: [...members.map(m => m.group), sharedCrate], update, interactables };
}
