import * as THREE from 'three';
import { BLOCKS } from '../shared/blocks';
import { ITEMS } from '../shared/items';
import type { Atlas } from './atlas';
import { buildCubeGeo } from './blockgeo';
import { extrudeItem, itemImage } from './itemgeo';
import { TEXTURED } from './mobmodels';
import { texturedGeo } from './mobview';

const D2R = Math.PI / 180;
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const rot = (axis: 'x' | 'y' | 'z', a: number) => new THREE.Quaternion().setFromAxisAngle(AX[axis], a);

/** ennyi ideig tart egy ütés (a kockajátékokban 6 tick) */
const SWING_TIME = 0.3;
/** ennyi ideig tart egy étel megevése (32 tick) */
export const EAT_TIME = 1.6;
/** a tárgycsere sebessége: a régi tárgy lesüllyed, az új felemelkedik (mp⁻¹) */
const EQUIP_RATE = 4;
/** a kamera látószögéhez igazítás (a kockajátékok 70°-ot használnak, itt 75° van) */
const K = 0.4 * 1.096;

/**
 * A kézben tartott tárgy első személyű nézetben, a kockajátékok elrendezése szerint:
 *  - a kéz a jobb alsó sarokból nyúlik be (0.56, −0.52, −0.72), 45°-kal befelé fordítva;
 *  - ütéskor (bal/jobb klikk) a kéz íves mozdulatot tesz: eltolódás (−0.4·sin√p, 0.2·sin(2√p), −0.2·sin p) és forgatás
 *    (−20° y, −20° z, −80° x);
 *  - evéskor a tárgy a szájhoz emelkedik, és rágás közben billeg;
 *  - tárgycserekor a régi tárgy lesüllyed, az új felemelkedik;
 *  - üres kéz: a játékos karja.
 * Külön jelenetben rajzolódik, a világ után, mélység-törléssel: így a víz és a sötétség nem takarja el, és nem lóg bele a falba.
 */
export function createHandItem(paint: (c: HTMLCanvasElement, id: number) => void, atlas: Atlas, isItem: (id: number) => boolean, base: string) {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(75, 1, 0.05, 20);

  // ---- anyagok
  const flatMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const cubeMat = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.5 });
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  const iconMat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.1, side: THREE.DoubleSide, transparent: true });
  const skinTex = new THREE.TextureLoader().load(`${base}textures/entity/player.png`);
  skinTex.colorSpace = THREE.SRGBColorSpace;
  skinTex.magFilter = THREE.NearestFilter;
  skinTex.minFilter = THREE.NearestFilter;
  const armMat = new THREE.MeshBasicMaterial({ map: skinTex, vertexColors: true, alphaTest: 0.5 });

  // ---- tárgy: swingG (ütés-eltolás) > eatG (evés) > baseG (a kéz helye, 45°-os fordítás, ütés-forgatás, méretezés) > a tárgy
  const swingG = new THREE.Group();
  const eatG = new THREE.Group();
  const baseG = new THREE.Group();
  baseG.scale.setScalar(K);
  scene.add(swingG);
  swingG.add(eatG);
  eatG.add(baseG);
  const flat = new THREE.Mesh(new THREE.BufferGeometry(), flatMat);
  flat.scale.setScalar(1.7);
  flat.position.set(0, 0.25, 0.125);
  flat.rotation.y = -20 * D2R; // a 45°-os kézfordítással együtt kb. 25°: a lap a kamera felé néz, kicsit befelé fordulva
  const cube = new THREE.Mesh(new THREE.BufferGeometry(), cubeMat);
  cube.scale.setScalar(1.15);
  const icon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), iconMat);
  icon.scale.setScalar(1.5);
  icon.position.set(0, 0.1, 0);
  icon.rotation.y = -20 * D2R;
  baseG.add(flat, cube, icon);

  // ---- üres kéz: a játékos jobb karja
  const armSwingG = new THREE.Group();
  const armBaseG = new THREE.Group();
  armSwingG.add(armBaseG);
  const arm = new THREE.Mesh(texturedGeo(TEXTURED.player![4]), armMat);
  arm.scale.setScalar(0.72);
  arm.rotation.set(2.1, -0.25, 0.12);
  armBaseG.add(arm);
  scene.add(armSwingG);

  for (const m of [flat, cube, icon, arm]) { m.frustumCulled = false; m.visible = false; }

  type Kind = 'none' | 'arm' | 'cube' | 'flat' | 'icon';
  let kind: Kind = 'arm';
  let shown = 0;
  let equip = 1;
  let dirty = true;
  let swing = 0;
  let swinging = false;
  let bob = 0;
  let f3 = 0;
  let eatElapsed = 0;
  let visible = false;

  /** a megjelenítendő tárgy modelljének összeállítása */
  const rebuild = (id: number) => {
    let k: Kind = 'arm';
    if (id > 0) {
      const def = BLOCKS[id];
      if (isItem(id)) {
        k = 'none';
        const name = ITEMS[id]?.tex;
        const img = name ? itemImage(base, name, () => { dirty = true; }) : null;
        if (img && img.width > 0) { flat.geometry = extrudeItem(img, 1.0); k = 'flat'; }
      } else if (def && !def.parts && !def.conn && !def.door) {
        cube.geometry = buildCubeGeo(atlas, id);
        k = 'cube';
      } else {
        canvas.getContext('2d')!.clearRect(0, 0, 64, 64);
        paint(canvas, id);
        tex.needsUpdate = true;
        k = 'icon';
      }
    }
    kind = k;
    flat.visible = k === 'flat'; cube.visible = k === 'cube'; icon.visible = k === 'icon'; arm.visible = k === 'arm';
  };

  return {
    /** az ütés fázisa 0..1 (0: nincs ütés) */
    get swingP(): number { return swinging ? swing : 0; },
    /** az evés mozdulatának előrehaladása 0..1 (1: a tárgy a szájnál van) */
    get eatP(): number { return f3; },
    /** az evés óta eltelt idő (mp), a rágás fázisához */
    get eatPhase(): number { return eatElapsed; },
    get visible(): boolean { return visible; },
    /** új textúra töltődött be: a modell újraépítendő */
    invalidate(): void { dirty = true; },

    /**
     * @param id a kézben lévő tárgy (0: üres kéz)
     * @param show látszik-e (első személyű nézet és játékban)
     * @param moving 0..1 a járás üteme
     * @param act ütés indul / tart (bal gomb nyomva, vagy sikeres lerakás/használat)
     * @param eating az evés eddigi ideje másodpercben (negatív: nem eszik)
     */
    update(dt: number, id: number, show: boolean, moving: number, act: boolean, light: [number, number, number], eating = -1): void {
      // időzítők (nézettől függetlenül: a harmadik személyű modell is használja)
      if (act && !swinging) { swinging = true; swing = 0; }
      if (swinging) {
        swing += dt / SWING_TIME;
        if (swing >= 1) { swing = 0; swinging = act; }
      }
      if (eating >= 0) {
        eatElapsed = eating;
        const f = EAT_TIME * 20 - eating * 20 + 1; // hátralévő tickek
        const f1 = f / (EAT_TIME * 20);
        f3 = 1 - Math.pow(Math.max(0, Math.min(1, f1)), 27);
      } else { f3 = 0; eatElapsed = 0; }

      visible = show;
      if (!show) return;

      // tárgycsere: a régi lesüllyed, majd az új felemelkedik
      if (id !== shown) {
        equip -= dt * EQUIP_RATE;
        if (equip <= 0) { equip = 0; shown = id; dirty = true; }
      } else if (equip < 1) equip = Math.min(1, equip + dt * EQUIP_RATE);
      if (dirty) { dirty = false; rebuild(shown); }

      bob += dt * (3 + 6 * moving);
      const walkX = Math.cos(bob * 0.5) * 0.012 * moving;
      const walkY = Math.abs(Math.sin(bob * 0.5)) * 0.02 * moving;
      const p = swinging ? swing : 0;
      const sp = Math.sin(p * p * Math.PI);        // f
      const s1 = Math.sin(Math.sqrt(p) * Math.PI); // f1

      if (kind === 'arm') {
        // üres kéz: a kar előre lendül (a kockajátékok kéz-mozdulata)
        armSwingG.position.set(-0.3 * s1 + walkX, 0.4 * Math.sin(Math.sqrt(p) * Math.PI * 2) + walkY, -0.4 * Math.sin(p * Math.PI));
        armBaseG.position.set(0.36, -0.33 + (1 - equip) * -0.6, -0.36);
        armBaseG.quaternion.copy(rot('y', 45 * D2R * 0).multiply(rot('y', s1 * 70 * D2R * 0.4)).multiply(rot('z', sp * -20 * D2R)));
        swingG.visible = false;
        armSwingG.visible = true;
      } else {
        swingG.visible = true;
        armSwingG.visible = false;
        // ütés-eltolás
        swingG.position.set(-0.4 * s1 + walkX, 0.2 * Math.sin(Math.sqrt(p) * Math.PI * 2) + walkY, -0.2 * Math.sin(p * Math.PI));
        // evés: a tárgy a szájhoz emelkedik, rág (billeg)
        let bobY = 0;
        if (eating >= 0) {
          const f = EAT_TIME * 20 - eating * 20 + 1;
          const f1 = f / (EAT_TIME * 20);
          bobY = f1 >= 0.8 ? 0 : Math.abs(Math.cos((f / 4) * Math.PI)) * 0.1;
        }
        eatG.position.set(f3 * 0.6, bobY - f3 * 0.5, 0);
        eatG.quaternion.copy(rot('y', f3 * 90 * D2R).multiply(rot('x', f3 * 10 * D2R)).multiply(rot('z', f3 * 30 * D2R)));
        // a kéz helye és az ütés-forgatás
        baseG.position.set(0.56, -0.52 + (1 - equip) * -0.6, -0.72);
        baseG.quaternion.copy(rot('y', 45 * D2R).multiply(rot('y', sp * -20 * D2R)).multiply(rot('z', s1 * -20 * D2R)).multiply(rot('x', s1 * -80 * D2R)));
      }

      const r = Math.max(light[0], 0.45), g = Math.max(light[1], 0.45), b = Math.max(light[2], 0.5);
      for (const m of [flatMat, cubeMat, iconMat, armMat]) m.color.setRGB(r, g, b);
    },

    /** a világ után hívandó: a kéz külön rajzolódik, törölt mélységgel */
    render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
      if (!visible || kind === 'none') return;
      cam.projectionMatrix.copy(camera.projectionMatrix);
      cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      const prev = renderer.autoClear;
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(scene, cam);
      renderer.autoClear = prev;
    },
  };
}
