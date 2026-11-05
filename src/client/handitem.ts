import * as THREE from 'three';
import { BLOCKS } from '../shared/blocks';
import { ITEMS } from '../shared/items';
import type { Atlas } from './atlas';
import { buildCubeGeo } from './blockgeo';
import { TEXTURED } from './mobmodels';
import { texturedGeo } from './mobview';
import { extrudeItem, itemImage } from './itemgeo';

/**
 * A kézben tartott tárgy első személyű nézetben, a kamerához rögzítve, jobbra lent:
 * - üres kéz: a játékos karja (a saját skinnel),
 * - tömör blokk: valódi 3D kocka,
 * - tárgy (eszköz, étel ...): a textúrájából kihúzott, 1 pixel vastag modell,
 * - alakos blokk (kerítés, ajtó ...): az ikonja nagy képként.
 * Járáskor billeg, bontáskor/ütéskor/lerakáskor lendül, evéskor a szájhoz emelkedik és rágás közben rezeg.
 */
export function createHandItem(camera: THREE.Camera, paint: (c: HTMLCanvasElement, id: number) => void, atlas: Atlas, isItem: (id: number) => boolean, base: string) {
  const SIZE = 64;
  const root = new THREE.Group();
  root.visible = false;
  camera.add(root);
  const tint = new THREE.Color();

  // ---- alakos blokk: az ikon képként
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  const iconMat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.1, side: THREE.DoubleSide, depthTest: false, transparent: true });
  const icon = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), iconMat);

  // ---- tömör blokk
  const cubeMat = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.5, depthTest: false });
  const cube = new THREE.Mesh(new THREE.BufferGeometry(), cubeMat);
  cube.scale.setScalar(0.25);
  const cubeGeos = new Map<number, THREE.BufferGeometry>();

  // ---- tárgy: a textúra pixeleiből kihúzott modell
  const flatMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, depthTest: false });
  const flat = new THREE.Mesh(new THREE.BufferGeometry(), flatMat);
  let dirty = true;

  // ---- üres kéz: a játékos jobb karja
  const skinTex = new THREE.TextureLoader().load(`${base}textures/entity/player.png`);
  skinTex.colorSpace = THREE.SRGBColorSpace;
  skinTex.magFilter = THREE.NearestFilter;
  skinTex.minFilter = THREE.NearestFilter;
  const armMat = new THREE.MeshBasicMaterial({ map: skinTex, vertexColors: true, alphaTest: 0.5, depthTest: false });
  const arm = new THREE.Mesh(texturedGeo(TEXTURED.player![4]), armMat);
  arm.scale.setScalar(0.72);

  for (const m of [icon, cube, flat, arm]) { m.renderOrder = 999; m.frustumCulled = false; m.visible = false; root.add(m); }

  type Kind = 'none' | 'arm' | 'cube' | 'flat' | 'icon';
  let kind: Kind = 'none';
  let shownId = -2;
  let lastId = 0;
  let bob = 0;
  let swing = 0;
  let swinging = false;
  let eatT = 0;
  let eatUp = 0;
  const EAT_TIME = 1.3;

  return {
    /** az ütés fázisa 0..1 (0: nincs ütés) */
    get swingP(): number { return swing; },
    /** az evés előrehaladása: 0..1 (1: a szájnál) */
    get eatP(): number { return eatUp; },
    /** az evés közbeni rágás fázisa (mp) */
    get eatPhase(): number { return EAT_TIME - eatT; },
    /** új textúra töltődött be: a kép újrarajzolandó */
    invalidate(): void { dirty = true; },
    /** evés animációja (a kéz a szájhoz emeli az ételt, és rág) */
    eat(): void { eatT = EAT_TIME; },
    /**
     * @param id a kézben lévő tárgy (0: üres kéz)
     * @param visible látszik-e (első személyű nézet és játékban)
     * @param moving 0..1 a járás üteme
     * @param act ütés/bontás/lerakás folyamatban van
     */
    update(dt: number, id: number, visible: boolean, moving: number, act: boolean, light: [number, number, number]): void {
      // az időzítők nézettől függetlenül futnak (harmadik személyben a karakter modellje használja őket)
      if (id > 0) lastId = id;
      if (eatT > 0) eatT = Math.max(0, eatT - dt);
      if (act) swinging = true;
      if (swinging) {
        swing += dt * 2.8;
        if (swing >= 1) { swing = 0; swinging = act; }
      }
      const et0 = EAT_TIME - eatT;
      eatUp = eatT > 0 ? Math.min(1, et0 / 0.25) * Math.min(1, eatT / 0.2) : 0;
      root.visible = visible;
      if (!visible) return;
      const show = id > 0 ? id : eatT > 0 ? lastId : 0; // az utolsó falat evése közben a tárgy még látszik

      if (show !== shownId || dirty) {
        shownId = show; dirty = false;
        let k: Kind = 'arm';
        if (show > 0) {
          const def = BLOCKS[show];
          if (isItem(show)) {
            k = 'none';
            const name = ITEMS[show]?.tex;
            const img = name ? itemImage(base, name, () => { dirty = true; }) : null;
            if (img && img.width > 0) {
              flat.geometry = extrudeItem(img, 0.7);
              k = 'flat';
            }
          } else if (def && !def.parts && !def.conn && !def.door) {
            let g = cubeGeos.get(show);
            if (!g) { g = buildCubeGeo(atlas, show); cubeGeos.set(show, g); }
            cube.geometry = g;
            k = 'cube';
          } else {
            canvas.getContext('2d')!.clearRect(0, 0, SIZE, SIZE);
            paint(canvas, show);
            tex.needsUpdate = true;
            k = 'icon';
          }
        }
        kind = k;
        icon.visible = k === 'icon'; cube.visible = k === 'cube'; flat.visible = k === 'flat'; arm.visible = k === 'arm';
      }

      bob += dt * (3 + 6 * moving);
      // ütés: a kéz hátrahúzódik, majd lecsap előre-lefelé és visszatér (ív, mint a kockajátékok csapása)
      const sq = Math.sin(Math.sqrt(swing) * Math.PI);
      const s1 = Math.sin(swing * Math.PI);
      const s2 = Math.sin(swing * swing * Math.PI);
      const dx = -sq * 0.22, dy = Math.sin(Math.sqrt(swing) * 2 * Math.PI) * 0.06 + sq * 0.02, dz = -s1 * 0.14;
      const rx = -sq * 0.85, ry = -sq * 0.45, rz = -s2 * 0.3;
      const walkX = Math.cos(bob * 0.5) * 0.012 * moving;
      const walkY = Math.abs(Math.sin(bob * 0.5)) * 0.02 * moving;

      // evés: az első 0,25 mp-ben a szájhoz emelkedik, utána rág (rezeg), az utolsó 0,2 mp-ben visszatér
      const et = EAT_TIME - eatT;
      const up = eatUp;
      const chew = eatT > 0 ? Math.sin(et * 26) * 0.025 * up : 0;

      if (kind === 'arm') {
        // a kar a jobb alsó sarokból előre-fel nyúlik; ütéskor előre lendül
        root.position.set(0.36 + walkX + dx * 0.6, -0.33 + walkY + dy, -0.36 + dz);
        root.rotation.set(2.1 + rx * 0.5, -0.25 + ry * 0.5, 0.12 + rz * 0.5);
        arm.position.set(0, 0, 0);
      } else if (kind === 'cube') {
        root.position.set(0.4 + walkX + dx - up * 0.34, -0.34 + walkY + dy + up * 0.16 + chew, -0.7 + dz + up * 0.14);
        root.rotation.set(0.3 + rx * 0.7 + up * 0.3, 0.55 + ry * 0.5 - up * 0.4, 0.05 + rz * 0.6);
      } else {
        root.position.set(0.44 + walkX + dx - up * 0.38, -0.33 + walkY + dy + up * 0.22 + chew, -0.68 + dz + up * 0.12);
        root.rotation.set(rx + up * 0.5, 0.35 + ry - up * 0.5, -0.12 + rz + up * 0.3);
      }
      tint.setRGB(Math.max(light[0], 0.45), Math.max(light[1], 0.45), Math.max(light[2], 0.5));
      for (const m of [iconMat, cubeMat, flatMat, armMat]) m.color.copy(tint);
    },
  };
}
