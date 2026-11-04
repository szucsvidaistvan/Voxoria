import * as THREE from 'three';
import { BLOCKS } from '../shared/blocks';
import type { Atlas } from './atlas';
import { buildCubeGeo } from './blockgeo';

/**
 * A kézben tartott tárgy első személyű nézetben: a kamerához rögzített kép (a tárgy ikonja), jobbra lent.
 * Járás közben billeg, bontáskor/ütéskor/lerakáskor lendül; a napszak fénye színezi.
 * A tömör blokkok valódi 3D kockaként, a tárgyak és az alakos blokkok nagy képként (az ikonjuk, mint a hotbaron: `paint`) jelennek meg.
 */
export function createHandItem(camera: THREE.Camera, paint: (c: HTMLCanvasElement, id: number) => void, atlas: Atlas, isItem: (id: number) => boolean) {
  const SIZE = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.1, side: THREE.DoubleSide, depthTest: false, transparent: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.78), mat);
  mesh.renderOrder = 999;
  mesh.frustumCulled = false;
  const cubeMat = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.5, depthTest: false, side: THREE.FrontSide });
  const cube = new THREE.Mesh(new THREE.BufferGeometry(), cubeMat);
  cube.renderOrder = 999;
  cube.frustumCulled = false;
  const cubeGeos = new Map<number, THREE.BufferGeometry>();
  const root = new THREE.Group();
  cube.scale.setScalar(0.34);
  root.add(mesh, cube);
  root.visible = false;
  camera.add(root);

  let asCube = false;
  const REST_ITEM = new THREE.Vector3(0.38, -0.34, -0.7);
  const REST_CUBE = new THREE.Vector3(0.46, -0.4, -0.78);
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
        const def = BLOCKS[id];
        asCube = !isItem(id) && !!def && !def.parts && !def.conn && !def.door;
        if (asCube) {
          let g = cubeGeos.get(id);
          if (!g) { g = buildCubeGeo(atlas, id); cubeGeos.set(id, g); }
          cube.geometry = g;
        } else {
          canvas.getContext('2d')!.clearRect(0, 0, SIZE, SIZE);
          paint(canvas, id);
          tex.needsUpdate = true;
        }
      }
      bob += dt * (3 + 6 * moving);
      if (act) swinging = true;
      if (swinging) {
        swing += dt * 3.2;
        if (swing >= 1) { swing = 0; swinging = act; }
      }
      const s = Math.sin(swing * Math.PI);
      mesh.visible = !asCube;
      cube.visible = asCube;
      const REST = asCube ? REST_CUBE : REST_ITEM;
      root.position.set(
        REST.x + Math.cos(bob * 0.5) * 0.012 * moving - s * 0.12,
        REST.y + Math.abs(Math.sin(bob * 0.5)) * 0.02 * moving - s * 0.1,
        REST.z - s * 0.12,
      );
      if (asCube) root.rotation.set(0.3 - s * 0.9, 0.55 - s * 0.3, 0.05 + s * 0.2);
      else root.rotation.set(-s * 0.9, 0.35 - s * 0.3, -0.12 + s * 0.35);
      cubeMat.color.setRGB(Math.max(light[0], 0.45), Math.max(light[1], 0.45), Math.max(light[2], 0.5));
      mat.color.setRGB(Math.max(light[0], 0.45), Math.max(light[1], 0.45), Math.max(light[2], 0.5));
    },
  };
}
