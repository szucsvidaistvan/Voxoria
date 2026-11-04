import * as THREE from 'three';

/**
 * A kézben tartott tárgy első személyű nézetben: a kamerához rögzített kép (a tárgy ikonja), jobbra lent.
 * Járás közben billeg, bontáskor/ütéskor/lerakáskor lendül; a napszak fénye színezi.
 * A kép ugyanaz az ikon, mint a hotbaron (`paint`), így minden tárgy és blokk megjelenik.
 */
export function createHandItem(camera: THREE.Camera, paint: (c: HTMLCanvasElement, id: number) => void) {
  const SIZE = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.1, side: THREE.DoubleSide, depthTest: false, transparent: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), mat);
  mesh.renderOrder = 999;
  mesh.frustumCulled = false;
  const root = new THREE.Group();
  root.add(mesh);
  root.visible = false;
  camera.add(root);

  const REST = new THREE.Vector3(0.36, -0.3, -0.62);
  let shownId = -1;
  let dirty = true;
  let bob = 0;
  let swing = 0; // 0..1 a lendítés fázisa
  let swinging = false;

  return {
    /** új textúra töltődött be: a kép újrarajzolandó */
    invalidate(): void { dirty = true; },
    /**
     * @param id a kézben lévő tárgy (0 vagy kisebb: üres kéz)
     * @param visible látszik-e (első személyű nézet és játékban)
     * @param moving 0..1 a járás üteme
     * @param act ütés/bontás/lerakás folyamatban van
     */
    update(dt: number, id: number, visible: boolean, moving: number, act: boolean, light: [number, number, number]): void {
      root.visible = visible && id > 0;
      if (!root.visible) { swing = 0; return; }
      if (id !== shownId || dirty) {
        shownId = id; dirty = false;
        canvas.getContext('2d')!.clearRect(0, 0, SIZE, SIZE);
        paint(canvas, id);
        tex.needsUpdate = true;
      }
      bob += dt * (3 + 6 * moving);
      if (act) swinging = true;
      if (swinging) {
        swing += dt * 3.2;
        if (swing >= 1) { swing = 0; swinging = act; }
      }
      const s = Math.sin(swing * Math.PI);
      root.position.set(
        REST.x + Math.cos(bob * 0.5) * 0.012 * moving - s * 0.12,
        REST.y + Math.abs(Math.sin(bob * 0.5)) * 0.02 * moving - s * 0.1,
        REST.z - s * 0.12,
      );
      root.rotation.set(-s * 0.9, 0.35 - s * 0.3, -0.12 + s * 0.35);
      mat.color.setRGB(Math.max(light[0], 0.45), Math.max(light[1], 0.45), Math.max(light[2], 0.5));
    },
  };
}
