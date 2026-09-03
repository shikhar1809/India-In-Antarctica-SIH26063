import * as THREE from 'three';

/**
 * Culler.js — draw only what is actually in front of you.
 *
 * The lesson from the PS2-era open-world games (Vice City is the canonical
 * example) is that the win never comes from making the geometry cheaper. It
 * comes from NOT SUBMITTING IT. Those games ran a whole city on 32 MB by doing
 * three things, and all three apply directly here:
 *
 *   1. A HARD DRAW DISTANCE, hidden by fog. Nothing beyond it is drawn at all;
 *      the fog means you never see the edge where it stops.
 *   2. SECTOR CULLING. The world is chopped into cells and only the cells near
 *      the player are considered. Frustum culling alone is not enough, because
 *      it still has to test every object every frame.
 *   3. INTERIORS ARE SEPARATE WORLDS. Step inside and the exterior is simply
 *      not there any more.
 *
 * This class is (2) and (3). The stations are 54 and 29 rooms, every one of
 * them built, furnished and submitted every frame no matter where the player
 * was standing — a couple of thousand meshes of furniture on the other side of
 * a steel wall, or on another floor. Rooms are their own groups (see
 * interior.js), so hiding a group drops its entire subtree out of the render
 * list before any per-mesh work happens at all.
 *
 * The rule is deliberately simple: a room is drawn if the player is within
 * `radius` of its floor plan rectangle AND on roughly its level. That one test
 * handles both cases without needing to know whether the player is "inside" —
 * standing at the front door you see the entrance hall and its neighbours, and
 * standing in a corridor you see the rooms off it, and nothing else exists.
 */
export class SceneCuller {
  constructor(opts = {}) {
    this.radius = opts.radius ?? 22;      // how far a room stays drawn
    this.floorSpan = opts.floorSpan ?? 5; // vertical reach: same storey only
    this.rooms = [];
    this.farGroups = [];
    // Individually distance-culled objects (NPCs). A character is ~35 meshes
    // — head, torso, four limbs, hands, boots, hood, goggles, parka trim — and
    // it is articulated, so unlike a building it cannot be baked into one
    // mesh. Seven of them is ~245 draw calls, paid in full whether the nearest
    // one is two metres away or a hundred.
    this.props = [];
    this.propRadius = opts.propRadius ?? 55;
    this.inside = false;
    this._acc = 1e9;
    this._v = new THREE.Vector3();
  }

  /**
   * @param {THREE.Object3D} stationRoot  the station group (holds room-* groups)
   * @param {object} roomTable            station.root.userData.rooms
   * @param {THREE.Object3D[]} farGroups  world detail to drop while indoors
   */
  rebuild(stationRoot, roomTable, farGroups = [], props = []) {
    this.rooms.length = 0;
    this.props = props.filter(Boolean).map(o => ({ obj: o, v: new THREE.Vector3() }));
    this.farGroups = farGroups.filter(Boolean);
    this.inside = false;
    if (!stationRoot || !roomTable) return;

    const offset = new THREE.Vector3();
    stationRoot.getWorldPosition(offset);

    stationRoot.traverse(o => {
      if (!o.name || !o.name.startsWith('room-')) return;
      const id = o.name.slice(5);
      const r = roomTable[id];
      if (!r) return;
      // Room rectangles are in the station's own space; the player is in world
      // space, so bake the offset in once here rather than every frame.
      this.rooms.push({
        group: o,
        x0: r.x0 + offset.x, x1: r.x1 + offset.x,
        z0: r.z0 + offset.z, z1: r.z1 + offset.z,
        y: r.floorY + offset.y
      });
    });
    this._acc = 1e9;
  }

  /** Everything visible again — used when tearing a site down. */
  releaseAll() {
    for (const r of this.rooms) r.group.visible = true;
    for (const g of this.farGroups) g.visible = true;
    for (const p of this.props) p.obj.visible = true;
  }

  update(playerPos, dt) {
    if (!this.rooms.length || !playerPos) return;
    this._acc += dt;
    // 8 Hz. A room appearing an eighth of a second early is invisible; doing
    // this every frame is not free at 54 rooms.
    if (this._acc < 0.12) return;
    this._acc = 0;

    const R2 = this.radius * this.radius;
    let inside = false;
    // REVEAL BUDGET. Hiding a room is free, but SHOWING one can be expensive
    // the first time: three.js compiles a material's shader the first time the
    // object is actually drawn, and on ANGLE that is tens of milliseconds
    // each. Walking into the building used to reveal fourteen rooms in a
    // single frame and pay for all of them at once. Revealing at most two per
    // tick spreads any residual compilation over a quarter of a second instead
    // of stacking it into one visible freeze.
    let budget = 2;

    for (const r of this.rooms) {
      const dy = Math.abs(playerPos.y - r.y);
      if (dy > this.floorSpan) { r.group.visible = false; continue; }
      // Distance to the rectangle, not to its centre: a 12 m room whose centre
      // is 25 m away can still have a wall two metres from your face.
      const cx = Math.min(Math.max(playerPos.x, r.x0), r.x1);
      const cz = Math.min(Math.max(playerPos.z, r.z0), r.z1);
      const dx = playerPos.x - cx, dz = playerPos.z - cz;
      const d2 = dx * dx + dz * dz;
      const want = d2 < R2;
      if (want && !r.group.visible) {
        if (budget > 0) { r.group.visible = true; budget--; }   // reveal, rationed
      } else if (!want) {
        r.group.visible = false;                                // hiding is free
      }
      if (d2 < 0.01 && dy < 2.6) inside = true;    // standing in this room
    }

    // Distance-cull the articulated props (NPCs).
    const PR2 = this.propRadius * this.propRadius;
    for (const p of this.props) {
      p.obj.getWorldPosition(p.v);
      p.obj.visible = p.v.distanceToSquared(playerPos) < PR2;
    }

    // The interiors-are-separate-worlds half. Indoors, a kilometre of field
    // instruments, the beset ship and the boulder field are all behind a steel
    // wall and none of them can be seen — so none of them are drawn.
    if (inside !== this.inside) {
      this.inside = inside;
      for (const g of this.farGroups) g.visible = !inside;
    }
  }
}
