import * as THREE from 'three';
import { buildCharacter, buildClipboard, type CharacterOptions } from './buildCharacter';

export class AvatarScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 10);
  private parts: ReturnType<typeof buildCharacter>['parts'];
  private characterGroup: THREE.Group;
  private raf = 0;
  private running = false;
  private reducedMotion: boolean;
  private phase = Math.random() * Math.PI * 2;
  private lookUpAt = 3 + Math.random() * 2;

  constructor(canvas: HTMLCanvasElement, opts?: CharacterOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);

    const { group, parts } = buildCharacter(opts ?? {
      parka: 0xdfe6ea, parkaDark: 0x9fb0ba, trouserColor: 0x1c2530
    });
    this.characterGroup = group;
    this.parts = parts;
    parts.handL.add(buildClipboard());
    this.scene.add(group);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1.4, 2.2, 2.2);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd9ff, 0.7);
    fill.position.set(-1.6, 1.2, -1);
    this.scene.add(fill);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    this.camera.position.set(0, 1.5, 1.55);
    this.camera.lookAt(0, 1.42, 0);

    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.pose(0);
  }

  setAppearance(opts: CharacterOptions) {
    this.scene.remove(this.characterGroup);
    // dispose old character geometry/materials
    this.characterGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      }
    });

    const { group, parts } = buildCharacter(opts);
    this.characterGroup = group;
    this.parts = parts;
    parts.handL.add(buildClipboard());
    this.scene.add(group);
    this.pose(0);
  }

  private pose(t: number) {
    const p = this.parts;
    const ph = this.phase;
    p.armL.rotation.x = -0.75;
    p.armL.rotation.z = 0.1;
    p.armR.rotation.x = -0.95 + Math.sin(t * 6 + ph) * 0.07;
    p.armR.rotation.z = -0.15 + Math.sin(t * 6 + ph + 0.6) * 0.05;
    const cycle = (t + ph) % this.lookUpAt;
    const lookUp = cycle > this.lookUpAt - 0.9 ? Math.sin(((cycle - (this.lookUpAt - 0.9)) / 0.9) * Math.PI) : 0;
    p.head.rotation.x = 0.26 - lookUp * 0.3;
    p.torso.rotation.x = 0.16;
  }

  setSize(px: number, dpr: number) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(px, px, false);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    const clock = new THREE.Clock();
    const loop = () => {
      if (!this.running) return;
      const t = clock.getElapsedTime();
      if (!this.reducedMotion) this.pose(t);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.stop();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      }
    });
    this.renderer.dispose();
  }
}
