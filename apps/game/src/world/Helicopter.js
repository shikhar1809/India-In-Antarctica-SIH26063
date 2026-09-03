import * as THREE from 'three';
import { MAT, container, signText } from '../stations/kit.js';

/**
 * Helicopter.js — the resupply run.
 *
 * There is no runway at Maitri or Bharati. Everything that arrives by air —
 * mail, fresh food while it lasts, spare parts, the next winterer's kit —
 * comes off the resupply ship during the short summer window and gets
 * shuttled the last leg to the station by helicopter, load by load, because
 * a ship this size cannot come any closer than open water allows. That is
 * the whole reason this exists: "food coming in from helicopter" is not
 * scenery, it is the actual supply chain for thirteen people wintering with
 * nothing else arriving until next year.
 *
 * Procedural model — same primitive-only vocabulary as every other asset in
 * this game (see kit.js) — flown through a small scripted state machine:
 * approach → hover → lowering (cargo down the cable) → unload (cable
 * retracts) → depart → gone → wait. There is no landing phase at all: the
 * aircraft holds a hover throughout and the crate goes down on a sling line,
 * which is both the more realistic mechanic for a station with no prepared
 * helipad and the one that actually reads as "delivering cargo" instead of
 * "a crate that appeared on the ground". Runs on a loop so it is not a
 * one-time cutscene; the resupply keeps happening the way the station's real
 * supply chain keeps happening.
 */

const STATES = ['waiting', 'approach', 'hover', 'lowering', 'unload', 'depart', 'gone'];

export class HelicopterFlight {
  /**
   * @param {THREE.Scene} scene
   * @param {{terrain, padX:number, padZ:number}} opts — the pad centre the
   *   flight approaches; the actual landing spot is offset from it so the
   *   aircraft never sits on top of the station itself.
   */
  constructor(scene, { terrain, padX, padZ }) {
    this.scene = scene;
    this.terrain = terrain;

    // Landing spot: start near the graded approach road the player spawns
    // on (site.js sets spawn = {x:pad.x, z:pad.z+82}), then search a small
    // neighbourhood for the locally flattest point. The road grading only
    // guarantees the spawn point itself is flat, not everywhere nearby, and
    // a helicopter sitting half into a slope reads as broken in a way a
    // person standing on the same slope doesn't.
    const found = pickFlatSpot(terrain, padX + 20, padZ + 82, 16, 5);
    this.landX = found.x;
    this.landZ = found.z;
    this.landY = found.y;
    this.cruiseAlt = 34;
    this.hoverAlt = 8.5;   // height held throughout the whole cargo-drop sequence

    // Approach and departure ends of the flight path, far enough out that
    // the aircraft is a distant dot when it first becomes audible/visible —
    // an arrival should be noticed before it's overhead, not popped in.
    const approachAngle = Math.PI * 0.15;
    this.farX = this.landX + Math.sin(approachAngle) * 260;
    this.farZ = this.landZ + Math.cos(approachAngle) * 260;

    this.group = buildHelicopterModel();
    scene.add(this.group);
    this.group.visible = false;

    this.state = 'waiting';
    this.t = 0;
    // First arrival happens soon after the world loads — a station should
    // not feel like it's waiting for the player to do something before its
    // own supply chain moves. After that, flights repeat on a loop.
    this.waitTimer = 14 + Math.random() * 10;

    this.cargo = null;   // crate group, revealed on touchdown, stays after
    // True once a crate is down and waiting to be carried in, false again
    // once main.js's ground crew claims it — read by the crew's own state
    // machine so it only walks out once there is actually something there.
    this.cargoAvailable = false;
    this.onArrive = null;   // (label:string) => void — HUD/toast hooks
    this.onUnload = null;
    this.onDepart = null;
  }

  /** The ground crew calls this once they've walked the crate off the pad
   *  and into station storage — hides it until the next delivery. */
  claimCargo() {
    if (!this.cargo) return;
    this.cargo.crate.visible = false;
    this.cargo.plate.visible = false;
    this.cargoAvailable = false;
  }

  /** Build the crate (and its label plate) once, positioned but not yet
   *  visible — _updateCargoDrop() drives it down the cable frame by frame. */
  _buildCargo() {
    if (this.cargo) return;
    const crate = container('#b8862a');
    crate.scale.setScalar(0.62);
    this.dropX = this.landX + 3.4; this.dropZ = this.landZ - 2.2;
    this.dropGroundY = this.terrain.heightAt(this.dropX, this.dropZ);
    crate.rotation.y = 0.4;
    crate.visible = false;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.3),
      new THREE.MeshStandardMaterial({
        map: signText('RESUPPLY — SUMMER RUN', { color: '#eef2f4', bg: '#1c2733', w: 1024 }),
        roughness: 0.7
      })
    );
    plate.visible = false;

    // The sling cable itself: a thin cylinder stretched between the hook and
    // the crate each frame in _updateCargoDrop — CylinderGeometry is built
    // unit-height along Y and rescaled, rather than rebuilt, every frame.
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 1, 6),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 })
    );
    cable.visible = false;

    this.scene.add(crate, plate, cable);
    this.cargo = { crate, plate, cable };
  }

  /**
   * Lowers the crate from the belly hook to the ground on a visible cable
   * while the aircraft holds a hover — real vertical replenishment, and the
   * reason a helicopter delivering cargo doesn't need to actually land.
   * `u` is 0 (crate at the hook) → 1 (crate on the ground).
   */
  _updateCargoDrop(u) {
    const hookWorld = this.group.position.clone().add(this.group.userData.hookWorldOffset);
    const cratePos = new THREE.Vector3(
      THREE.MathUtils.lerp(hookWorld.x, this.dropX, u),
      THREE.MathUtils.lerp(hookWorld.y - 0.3, this.dropGroundY + 0.5, u),
      THREE.MathUtils.lerp(hookWorld.z, this.dropZ, u)
    );
    const { crate, plate, cable } = this.cargo;
    crate.visible = plate.visible = cable.visible = true;
    crate.position.copy(cratePos);
    plate.position.set(cratePos.x, cratePos.y + 1.3, cratePos.z + 0.76);
    this._drawCable(hookWorld, cratePos);
  }

  /**
   * Retracts the empty hook back up alone once the crate is already on the
   * ground — the crate does NOT move here. `_updateCargoDrop` above was
   * being reused for this by running `u` back down from 1 to 0, which
   * interpolates the CRATE's own position too, not just the cable — so the
   * "empty hook returning to the aircraft" reads as "the crate rising back
   * off the ground and getting hauled back up", i.e. delivering a package
   * and then immediately un-delivering it. `t` is 1 (hook still at the
   * crate) → 0 (hook back at the aircraft).
   */
  _updateHookRetract(t) {
    const hookWorld = this.group.position.clone().add(this.group.userData.hookWorldOffset);
    const anchor = new THREE.Vector3(this.dropX, this.dropGroundY + 0.5, this.dropZ);
    const hookEnd = anchor.clone().lerp(hookWorld, 1 - t);
    this._drawCable(hookWorld, hookEnd);
  }

  /**
   * Fills `out` (a THREE.Box3) with the delivered crate's collision bounds,
   * or returns null while there is no crate on the ground yet — the player
   * could walk straight through it otherwise, since it is a purely visual
   * prop the site's static collider list was built before it ever existed.
   * Half-extents come from container()'s 6.06×2.59×2.44 box at this crate's
   * 0.62 scale, padded out for the 0.4 rad yaw so an axis-aligned box still
   * fully covers the rotated one.
   */
  getCargoBox(out) {
    if (!this.cargo || !this.cargo.crate.visible) return null;
    const p = this.cargo.crate.position;
    const hx = 2.05, hz = 1.45, height = 1.65;
    out.min.set(p.x - hx, p.y, p.z - hz);
    out.max.set(p.x + hx, p.y + height, p.z + hz);
    return out;
  }

  _drawCable(hookWorld, endPos) {
    const { cable } = this.cargo;
    const mid = hookWorld.clone().add(endPos).multiplyScalar(0.5);
    const len = hookWorld.distanceTo(endPos) || 0.001;
    cable.position.copy(mid);
    cable.scale.set(1, len, 1);
    cable.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      endPos.clone().sub(hookWorld).normalize()
    );
  }

  update(dt, elapsed) {
    this.t += dt;
    const g = this.group;

    // Rotor keeps spinning through the whole cycle except while parked and
    // invisible — a stopped rotor on a running flight reads as "broken", not
    // "resting".
    if (g.visible) {
      g.userData.mainRotor.rotation.y += dt * (this.state === 'gone' ? 0 : 26);
      g.userData.tailRotor.rotation.x += dt * (this.state === 'gone' ? 0 : 34);
    }

    switch (this.state) {
      case 'waiting':
        this.waitTimer -= dt;
        if (this.waitTimer <= 0) { this.state = 'approach'; this.t = 0; g.visible = true; }
        break;

      case 'approach': {
        // 22 s cruise in from the far point to just short of the pad, losing
        // altitude the whole way rather than dropping suddenly at the end.
        const dur = 22;
        const u = Math.min(1, this.t / dur);
        const x = THREE.MathUtils.lerp(this.farX, this.landX, u);
        const z = THREE.MathUtils.lerp(this.farZ, this.landZ, u);
        const alt = THREE.MathUtils.lerp(this.cruiseAlt, this.hoverAlt, Math.min(1, u * 1.15));
        g.position.set(x, this.terrain.heightAt(x, z) + alt, z);
        g.rotation.y = Math.atan2(this.landX - this.farX, this.landZ - this.farZ);
        // A gentle bank into the turn, eased out as it straightens for the pad.
        g.rotation.z = Math.sin(u * Math.PI) * 0.09 * (1 - u);
        g.rotation.x = -0.05;
        if (u >= 1) {
          this.state = 'hover'; this.t = 0;
          this.onArrive?.('Resupply flight inbound — touching down.');
        }
        break;
      }

      case 'hover': {
        // Holding a steady hover well clear of the ground — there is no
        // landing in this sequence at all; the load goes down on a cable
        // instead, which is how a real resupply run actually works when
        // there's no prepared pad to set the whole aircraft down on.
        const dur = 2.5;
        const bob = Math.sin(elapsed * 2.6) * 0.12;
        g.position.set(this.landX, this.landY + this.hoverAlt + bob, this.landZ);
        g.rotation.x = -0.04;
        g.rotation.z = 0;
        if (this.t >= dur) {
          this.state = 'lowering'; this.t = 0;
          this._buildCargo();
        }
        break;
      }

      case 'lowering': {
        const dur = 3.2;
        const bob = Math.sin(elapsed * 2.6) * 0.12;
        g.position.set(this.landX, this.landY + this.hoverAlt + bob, this.landZ);
        const u = Math.min(1, this.t / dur);
        this._updateCargoDrop(u);
        if (u >= 1) {
          this.state = 'unload'; this.t = 0;
          this.cargoAvailable = true;
          this.onUnload?.('A season\'s worth of food, fuel and spares just came down on that line — this is the entire supply chain until next summer\'s ship.');
        }
        break;
      }

      case 'unload': {
        // The cable stays extended for a beat — the load is on the ground
        // but the hook hasn't detached yet — then retracts as the aircraft
        // holds position, exactly how a real winch-release looks.
        const holdDur = 1.6, retractDur = 1.8;
        const bob = Math.sin(elapsed * 2.6) * 0.12;
        g.position.set(this.landX, this.landY + this.hoverAlt + bob, this.landZ);
        if (this.t > holdDur) {
          const u = Math.min(1, (this.t - holdDur) / retractDur);
          this._updateHookRetract(1 - u);
          if (u >= 1) { this.cargo.cable.visible = false; }
        }
        if (this.t >= holdDur + retractDur) { this.state = 'depart'; this.t = 0; }
        break;
      }

      case 'depart': {
        const dur = 20;
        const u = Math.min(1, this.t / dur);
        const x = THREE.MathUtils.lerp(this.landX, this.farX, u);
        const z = THREE.MathUtils.lerp(this.landZ, this.farZ, u);
        const alt = THREE.MathUtils.lerp(this.hoverAlt, this.cruiseAlt, Math.min(1, u * 1.15));
        g.position.set(x, this.terrain.heightAt(x, z) + alt, z);
        g.rotation.y = Math.atan2(this.farX - this.landX, this.farZ - this.landZ);
        g.rotation.z = -Math.sin(u * Math.PI) * 0.09 * u;
        g.rotation.x = 0.04;
        if (u === 0) this.onDepart?.('Resupply flight departing — back to the ship.');
        if (u >= 1) { this.state = 'gone'; this.t = 0; g.visible = false; }
        break;
      }

      case 'gone':
        // Long gap before the next run — this is a seasonal supply chain,
        // not a shuttle bus.
        this.waitTimer = 150 + Math.random() * 120;
        this.state = 'waiting';
        break;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.isMesh) { o.geometry?.dispose(); o.material?.dispose(); } });
    if (this.cargo) {
      this.scene.remove(this.cargo.crate, this.cargo.plate, this.cargo.cable);
    }
  }
}

/** Procedural utility helicopter: body, tail boom + fin, main + tail rotor, skids. */
function buildHelicopterModel() {
  const g = new THREE.Group();
  g.name = 'helicopter';

  // High-visibility polar search-and-rescue scheme — white over international
  // orange, the same reasoning real Antarctic utility helicopters (India's
  // ALH Dhruv among them) are painted that way: against ice and whiteout,
  // a plain civil colour scheme disappears.
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: 0.45, metalness: 0.15 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe8511f, roughness: 0.45, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24282b, roughness: 0.55, metalness: 0.35 });
  const skidMat = MAT.steelGrey();

  // Fuselage: a stretched, tapered capsule reads as an actual aircraft body
  // far better than a scaled sphere did — narrower in cross-section, longer
  // nose-to-tail, with a distinct belly line instead of one uniform blob.
  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.78, 2.3, 6, 12), white);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.scale.set(1, 1, 1.15);
  fuselage.position.set(0, 0.1, 0.2);
  fuselage.castShadow = true;
  g.add(fuselage);

  // Lower belly fairing, in the orange half of the scheme — this is what
  // actually sells "two-tone" rather than "one white blob with an orange tail".
  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 2.0, 6, 10), orange);
  belly.rotation.x = Math.PI / 2;
  belly.scale.set(1, 0.62, 1.05);
  belly.position.set(0, -0.42, 0.1);
  belly.castShadow = true;
  g.add(belly);

  // Cockpit canopy: angled, wrapping forward and down, the way a utility
  // helicopter's glazing actually reads instead of a plain dome stuck on front.
  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    MAT.glass()
  );
  cockpit.scale.set(1, 0.82, 1.3);
  cockpit.rotation.x = Math.PI * 0.62;
  cockpit.position.set(0, 0.2, 1.72);
  g.add(cockpit);
  // Nose cap below the canopy, closing the fuselage taper off cleanly.
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), white);
  nose.scale.set(1, 0.85, 1);
  nose.position.set(0, -0.02, 2.05);
  g.add(nose);

  // Engine cowling behind the rotor mast — the raised "greenhouse" hump
  // every twin-engine utility helicopter has, and the single detail that
  // most reads as "this has a specific front and back" from a distance.
  const cowling = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.42, 1.4), dark);
  cowling.position.set(0, 0.92, -0.15);
  cowling.castShadow = true;
  g.add(cowling);
  for (const sx of [-0.3, 0.3]) {
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.4, 8), dark);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(sx, 0.85, -0.95);
    g.add(exhaust);
  }

  // Tail boom, tapering back to the fin and tail rotor — thinner and longer
  // than before, matching the now-slimmer fuselage instead of dwarfing it.
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 4.3, 10), white);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 0.2, -3.5);
  boom.castShadow = true;
  g.add(boom);
  // A painted orange stripe along the boom — carries the two-tone scheme
  // through to the tail instead of it going flat white.
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.30, 3.6, 10, 1, true), orange);
  stripe.rotation.x = Math.PI / 2;
  stripe.position.set(0, 0.05, -3.4);
  g.add(stripe);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.15, 1.0), white);
  fin.position.set(0, 1.0, -5.55);
  fin.rotation.z = -0.14;
  g.add(fin);
  // Small horizontal stabiliser — another silhouette break utility
  // helicopters have that a bare boom+fin skips.
  const stab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.42), white);
  stab.position.set(0, 0.55, -5.0);
  g.add(stab);

  const tailRotorHub = new THREE.Group();
  tailRotorHub.position.set(0.26, 1.0, -5.65);
  const tailBlade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.12), dark);
  const tailBlade2 = tailBlade.clone();
  tailBlade2.rotation.x = Math.PI / 2;
  tailRotorHub.add(tailBlade, tailBlade2);
  g.add(tailRotorHub);

  // Skids, angled slightly outward at the base like real cross-tube gear
  // rather than two dead-straight parallel bars.
  for (const sx of [-1.0, 1.0]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 3.6, 8), skidMat);
    skid.rotation.z = Math.PI / 2;
    skid.position.set(sx, -1.28, 0.1);
    skid.castShadow = true;
    g.add(skid);
    for (const sz of [-1.15, 1.15]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.05, 6), skidMat);
      strut.rotation.z = 0.3 * Math.sign(sx);
      strut.position.set(sx * 0.72, -0.72, sz);
      g.add(strut);
    }
  }

  // Main rotor hub + two long blades, spun in update() — trimmed to a more
  // credible span relative to the now-slimmer body, with a visible hub
  // instead of the blades meeting at a bare point.
  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 1.42, 0.05);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.45, 8), skidMat);
  mast.position.y = -0.22;
  mainRotor.add(mast);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 10), dark);
  mainRotor.add(hub);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.5 });
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.045, 0.24), bladeMat);
    blade.rotation.y = a;
    blade.castShadow = true;
    mainRotor.add(blade);
  }
  g.add(mainRotor);

  // Belly cargo hook — the point the sling-load cable actually anchors to
  // in the cargo-drop sequence (see HelicopterFlight._updateCargoDrop).
  const hookMount = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 6), skidMat);
  hookMount.position.set(0, -1.05, 0.1);
  g.add(hookMount);

  // Roundel — an identifying marking, kept generic (no real service insignia).
  const roundel = new THREE.Mesh(
    new THREE.CircleGeometry(0.4, 16),
    new THREE.MeshStandardMaterial({
      map: signText('IN', { color: '#ffffff', bg: '#12324f', w: 256 }),
      roughness: 0.6
    })
  );
  roundel.position.set(0.82, 0.15, 0.1);
  roundel.rotation.y = Math.PI / 2;
  g.add(roundel);
  const roundelL = roundel.clone();
  roundelL.position.x = -0.82;
  roundelL.rotation.y = -Math.PI / 2;
  g.add(roundelL);

  g.userData.mainRotor = mainRotor;
  g.userData.tailRotor = tailRotorHub;
  g.userData.hookWorldOffset = new THREE.Vector3(0, -1.11, 0.1);
  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  return g;
}

/**
 * Search a ring of candidate points around (x0,z0) and return whichever has
 * the smallest local height variation — a stand-in for "flat enough to put
 * a helicopter down on" without needing the terrain's own grading system to
 * know this spot exists.
 */
function pickFlatSpot(terrain, x0, z0, radius, rings) {
  let best = { x: x0, z: z0, y: terrain.heightAt(x0, z0), slope: Infinity };
  const probe = (x, z) => {
    const y = terrain.heightAt(x, z);
    const d = 1.6;
    const slope = Math.abs(terrain.heightAt(x + d, z) - y) + Math.abs(terrain.heightAt(x, z + d) - y);
    if (slope < best.slope) best = { x, z, y, slope };
  };
  probe(x0, z0);
  for (let r = 1; r <= rings; r++) {
    const rad = (r / rings) * radius;
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      probe(x0 + Math.cos(a) * rad, z0 + Math.sin(a) * rad);
    }
  }
  return best;
}
