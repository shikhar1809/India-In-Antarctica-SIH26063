import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/noise.js';

/**
 * Player — a kinematic character controller.
 *
 * Deliberately not a physics engine. The player is a vertical capsule that
 * samples terrain height analytically and resolves against a small list of
 * axis-aligned boxes. That is enough for walking around a research station,
 * costs microseconds, and never produces the jitter a general solver gives
 * you when a capsule rests on a triangle seam.
 *
 * Movement is tuned for a child on a laptop trackpad: forgiving acceleration,
 * generous step height, no fall damage, and it is impossible to get stuck.
 */
export class Player {
  constructor(engine, terrain, input) {
    this.engine = engine;
    this.terrain = terrain;
    this.input = input;

    this.position = new THREE.Vector3(0, 0, 40);
    this.velocity = new THREE.Vector3();
    this.yaw = Math.PI;          // face -Z, toward the station
    this.pitch = -0.05;

    this.height = 1.72;          // eye height, roughly an adult in a parka
    this.radius = 0.42;
    this.grounded = true;

    // Metres per second. Antarctic clothing is bulky; nobody sprints in it.
    this.walkSpeed = 3.4;
    this.runSpeed = 7.2;
    this.swimSpeed = 2.0;      // slower than walking — a parka is not swimwear
    this.accel = 22;
    this.friction = 14;
    this.gravity = 22;
    this.jumpSpeed = 6.2;
    this.stepHeight = 0.62;
    this.maxSlope = THREE.MathUtils.degToRad(52);

    this.colliders = [];
    this.bob = 0;
    this._bobPhase = 0;
    this._camY = 0;
    this.underwater = false;   // read by main.js to drive the blue-tint overlay

    this.onFootstep = null;
    this.frozen = false;

    this.camera = engine.camera;

    this._snapToGround();
  }

  setColliders(list) { this.colliders = list; }

  teleport(x, z, yaw = this.yaw) {
    this.position.set(x, 0, z);
    this.yaw = yaw;
    this.velocity.set(0, 0, 0);
    this._snapToGround();
    this._camY = this.position.y + this.height;
  }

  _snapToGround() {
    this.position.y = this.terrain.heightAt(this.position.x, this.position.z);
    this._camY = this.position.y + this.height;
  }

  update(dt) {
    if (this.frozen) {
      // Drain and discard look input while frozen instead of leaving it to
      // pile up in the input buffer. Nothing consumed it while frozen was
      // true (this branch returns before reaching consumeLook() below), so
      // every mouse-look sample during a pause, a dialogue, or the faint
      // sequence was quietly accumulating — the instant control returned,
      // the very next frame drained the whole backlog in one shot, snapping
      // the view hard in whatever direction the mouse had drifted while
      // frozen. That is what "mouse movement is broken" actually was.
      this.input.consumeLook();
      this._updateCamera(dt, true);
      return;
    }

    /* ---------------------------------------------------------- look */
    const look = this.input.consumeLook();
    this.yaw += look.x;
    this.pitch = clamp(this.pitch + look.y, -1.35, 1.35);

    // Underwater is judged by the EYE, not the feet — the moment the camera
    // itself crosses the sea surface is the moment the view should actually
    // change, a step or two before the feet necessarily have.
    const seaLevel = this.terrain.seaLevel ?? -999;
    this.underwater = (this.position.y + this.height) < seaLevel;

    /* --------------------------------------------------------- intent */
    const want = _v1.set(this.input.move.x, 0, -this.input.move.y);
    if (want.lengthSq() > 0) {
      want.applyAxisAngle(UP, this.yaw);
      want.normalize();
    }

    const speed = this.underwater ? this.swimSpeed : (this.input.run ? this.runSpeed : this.walkSpeed);
    const target = _v2.copy(want).multiplyScalar(speed * Math.min(1, Math.hypot(this.input.move.x, this.input.move.y) || 0));

    // Horizontal velocity approaches the target; the exponential form keeps
    // acceleration identical at 30 fps and 144 fps.
    this.velocity.x = damp(this.velocity.x, target.x, want.lengthSq() ? this.accel : this.friction, dt);
    this.velocity.z = damp(this.velocity.z, target.z, want.lengthSq() ? this.accel : this.friction, dt);

    /* -------------------------------------------------------- gravity */
    if (this.underwater) {
      // Buoyant, not weightless — sinks slowly with no input, rises gently
      // while swimming "up" isn't a control this game exposes, so treat
      // vertical intent as neutral and let a mild net-positive buoyancy
      // carry the player back toward the surface rather than the sea floor.
      this.velocity.y = damp(this.velocity.y, 0.6, 3, dt);
    } else {
      this.velocity.y -= this.gravity * dt;
    }

    /* ------------------------------------------------------- integrate */
    // Sub-step so that at high speed we cannot tunnel through a collider.
    const move = _v3.copy(this.velocity).multiplyScalar(dt);
    const steps = Math.min(4, Math.ceil(move.length() / (this.radius * 0.8)) || 1);
    for (let i = 0; i < steps; i++) {
      this._integrate(dt / steps);
    }

    /* ------------------------------------------------------ footsteps */
    const hspeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.underwater) {
      // A slower, wider sway reads as a swimming stroke rather than a
      // footstep cadence — no footstep sound callback underwater, either.
      this._bobPhase += dt * (hspeed + 0.6) * 0.9;
    } else if (this.grounded && hspeed > 0.6) {
      this._bobPhase += dt * hspeed * 1.65;
      if (this._bobPhase > Math.PI) {
        this._bobPhase -= Math.PI;
        this.onFootstep?.(hspeed > this.walkSpeed + 0.5);
      }
    } else {
      this._bobPhase = damp(this._bobPhase, 0, 6, dt);
    }
    // Vertical head bob, scaled by speed. Subtle — big bob makes people ill.
    this.bob = this.underwater
      ? Math.sin(this._bobPhase) * 0.09
      : Math.sin(this._bobPhase * 2) * 0.035 * clamp(hspeed / this.runSpeed, 0, 1);

    this._updateCamera(dt);
  }

  _integrate(dt) {
    const p = this.position;
    const nx = p.x + this.velocity.x * dt;
    const nz = p.z + this.velocity.z * dt;

    // --- horizontal: try the move, then resolve out of any collider -------
    let cx = nx, cz = nz;
    for (const b of this.colliders) {
      const feet = p.y, head = p.y + this.height;
      if (head < b.min.y || feet > b.max.y) continue;   // vertically clear

      // Nearest point on the box in XZ; push out along the shallowest axis.
      const closeX = clamp(cx, b.min.x, b.max.x);
      const closeZ = clamp(cz, b.min.z, b.max.z);
      const dx = cx - closeX, dz = cz - closeZ;
      const d2 = dx * dx + dz * dz;

      if (d2 < this.radius * this.radius) {
        // If the top of the box is a small step up, walk onto it instead.
        //
        // The lower bound is deliberately `b.max.y >= p.y - EPS`, not a
        // strict `b.max.y > p.y`. Once the vertical resolver below has
        // already snapped the player's feet to exactly this box's height —
        // which happens the instant a step is climbed — this same collider
        // is tested again next frame with p.y === b.max.y. A strict `>`
        // makes that equality read as "the box is not above me", falls
        // through to the wall-collision branch, and shoves the player back
        // off the step they are already standing on. On a single kerb this
        // is easy to miss; on a staircase, where every frame re-tests the
        // tread you are centred over, it turns into a permanent stall a few
        // centimetres past step one — which is exactly the "can't climb the
        // stairs" bug this comment is here to stop from coming back.
        const STEP_EPS = 0.02;
        if (b.max.y - p.y <= this.stepHeight && b.max.y >= p.y - STEP_EPS) {
          p.y = b.max.y;
          if (this.velocity.y < 0) this.velocity.y = 0;
          this.grounded = true;
          continue;
        }
        const d = Math.sqrt(d2) || 1e-5;
        if (d2 > 1e-8) {
          const push = (this.radius - d) / d;
          cx += dx * push;
          cz += dz * push;
        } else {
          // Dead centre: pick the shallowest face to eject through.
          const toMin = cx - b.min.x, toMax = b.max.x - cx;
          const toMinZ = cz - b.min.z, toMaxZ = b.max.z - cz;
          const m = Math.min(toMin, toMax, toMinZ, toMaxZ);
          if (m === toMin) cx = b.min.x - this.radius;
          else if (m === toMax) cx = b.max.x + this.radius;
          else if (m === toMinZ) cz = b.min.z - this.radius;
          else cz = b.max.z + this.radius;
        }
        // Kill the velocity component pointing into the box.
        const n = _v4.set(cx - closeX, 0, cz - closeZ).normalize();
        const into = this.velocity.dot(n);
        if (into < 0) this.velocity.addScaledVector(n, -into);
      }
    }

    // --- slope limit ------------------------------------------------------
    // Refuse moves onto terrain steeper than maxSlope, so the player cannot
    // walk up a cliff face. Sliding along it still works.
    const gh = this.terrain.heightAt(cx, cz);
    const rise = gh - p.y;
    const travel = Math.hypot(cx - p.x, cz - p.z);
    if (travel > 1e-4 && rise > 0) {
      const slope = Math.atan2(rise, travel);
      if (slope > this.maxSlope) {
        // Blocked: keep the component parallel to the contour.
        const nrm = this.terrain.normalAt(cx, cz, _v5);
        const horiz = _v6.set(nrm.x, 0, nrm.z).normalize();
        const into = _v7.set(cx - p.x, 0, cz - p.z);
        into.addScaledVector(horiz, -into.dot(horiz));
        cx = p.x + into.x; cz = p.z + into.z;
      }
    }

    p.x = cx; p.z = cz;

    // --- vertical ---------------------------------------------------------
    p.y += this.velocity.y * dt;

    let ground = this.terrain.heightAt(p.x, p.z);
    // Standing on top of a collider counts as ground.
    for (const b of this.colliders) {
      if (p.x > b.min.x - this.radius && p.x < b.max.x + this.radius &&
          p.z > b.min.z - this.radius && p.z < b.max.z + this.radius) {
        if (b.max.y > ground && b.max.y <= p.y + this.stepHeight) ground = b.max.y;
      }
    }

    if (p.y <= ground) {
      p.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
  }

  jump() {
    if (this.grounded) {
      this.velocity.y = this.jumpSpeed;
      this.grounded = false;
    }
  }

  _updateCamera(dt, still = false) {
    const cam = this.camera;

    // Smooth the camera height rather than the position: stepping onto a
    // stair tread should not snap the view up 19 cm instantly.
    const targetY = this.position.y + this.height + this.bob;
    this._camY = still ? targetY : damp(this._camY, targetY, 16, dt);

    const dir = _v1.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );

    cam.position.set(this.position.x, this._camY, this.position.z);
    cam.lookAt(
      cam.position.x - dir.x,
      cam.position.y - dir.y,
      cam.position.z - dir.z
    );
  }

  /** Forward vector on the horizontal plane — used for interaction tests. */
  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }

  /**
   * Compass heading in degrees, 0 = north (−Z), increasing clockwise.
   * Forward is (−sin yaw, 0, −cos yaw), so increasing yaw swings the player
   * anticlockwise — the compass bearing is therefore the negated yaw.
   */
  heading() {
    return (360 - (THREE.MathUtils.radToDeg(this.yaw) % 360) + 360) % 360;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _v7 = new THREE.Vector3();
