import * as THREE from 'three';
import type { Atlas } from './atlas';
import { createPlayerView } from './mobview';

/**
 * A karakter kis előnézete az inventoryban (mint a kockajátékokban): a viselt páncéllal és a kézben tartott tárggyal,
 * a feje és a teste az egér felé fordul. Külön (kicsi, átlátszó hátterű) renderelőn fut.
 */
export function createInventoryPreview(canvas: HTMLCanvasElement, atlas: Atlas, base: string = import.meta.env.BASE_URL) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  cam.position.set(0, 1.0, 5.6);
  cam.lookAt(0, 0.95, 0);
  const view = createPlayerView(scene, base, atlas);
  view.visible = true;
  let size = '';
  let armorSig = '';

  return {
    /**
     * @param armor a viselt páncél (4 azonosító), @param held a kézben tartott tárgy
     * @param mx, my az egér helye a képernyőn (a modell felé fordul)
     */
    render(armor: number[], held: number, mx: number, my: number): void {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      if (size !== `${w}x${h}`) {
        size = `${w}x${h}`;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h, false);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
      const sig = armor.join(',');
      if (sig !== armorSig) { armorSig = sig; view.setArmor(armor); }
      view.setHeld(held);
      const r = canvas.getBoundingClientRect();
      const dx = Math.max(-1, Math.min(1, (mx - (r.left + r.width / 2)) / 260));
      const dy = Math.max(-1, Math.min(1, (my - (r.top + r.height * 0.3)) / 260));
      // a modell a kamera felé néz (+z), és az egér irányába fordul
      view.set(0, 0, 0, Math.PI + dx * 0.9, 0, 0, [1, 1, 1]);
      void dy;
      renderer.render(scene, cam);
    },
  };
}
