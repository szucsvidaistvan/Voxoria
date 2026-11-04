import * as THREE from 'three';
import type { Arrow, Mob, MobKind } from '../shared/mobs';
import { TEXTURED, partGeom, type TexName } from './mobmodels';

/**
 * A mobok megjelenítése: a háziállatok a Good Vibes csomag lény-skinjeivel textúrázott dobozmodellek (mobmodels.ts),
 * a zombi és a csontváz is textúrázott modell,
 * járás-animációval, sebzés-villanással, és a halál utáni eldőléssel.
 * A koordináták a lábak alatti ponttól számítanak; az előre a −z irány (a mob yaw szögével forgatva).
 */

type V3 = [number, number, number];

interface View {
  root: THREE.Group;
  /** a lény anyagai (a textúrázottak textúránként egy; a színes részeké `plain`); mind kapja a napszak-színezést */
  mats: THREE.MeshBasicMaterial[];
  limbs: { g: THREE.Group; swing: number; tilt: number; flap: number; aim: number }[];
  /** az íj (a csontváz kezében): a mob célzás-állapotához */
  bow?: THREE.Mesh;
}

/** A lény-skinek betöltése (közös, egyszer) */
const skins = new Map<TexName, THREE.Texture>();
function skin(base: string, name: TexName): THREE.Texture {
  let t = skins.get(name);
  if (!t) {
    t = new THREE.TextureLoader().load(`${base}textures/entity/${name}.png`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    skins.set(name, t);
  }
  return t;
}

/** Egy tárgy-textúra (a kézben tartott tárgyakhoz) */
const itemTexs = new Map<string, THREE.Texture>();
function itemTex(base: string, name: string): THREE.Texture {
  let t = itemTexs.get(name);
  if (!t) {
    t = new THREE.TextureLoader().load(`${base}textures/item/${name}.png`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    itemTexs.set(name, t);
  }
  return t;
}

/** Egy textúrázott rész BufferGeometry-je: a v tengely a three flipY-os textúrájához megfordítva */
function texturedGeo(part: Parameters<typeof partGeom>[0]): THREE.BufferGeometry {
  const g = partGeom(part);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv.map((x, i) => (i % 2 ? 1 - x : x)), 2));
  const col: number[] = [];
  for (const sh of g.shade) col.push(sh, sh, sh);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(g.index);
  return geo;
}

function buildView(kind: string, scene: THREE.Scene, base: string): View {
  {
    const root = new THREE.Group();
    const mats: THREE.MeshBasicMaterial[] = [];
    const limbs: View['limbs'] = [];
    const matFor = new Map<string, THREE.MeshBasicMaterial>();
    const material = (tex: TexName): THREE.MeshBasicMaterial => {
      const key = tex;
      let m = matFor.get(key);
      if (!m) {
        // a gyapjú és a lábak áttetsző pixeleket tartalmaznak: alphaTest
        m = new THREE.MeshBasicMaterial({ vertexColors: true, map: skin(base, tex), alphaTest: 0.5 });
        matFor.set(key, m); mats.push(m);
      }
      return m;
    };
    /** a rész a (pivot) csomóponton lóg, a doboz a közepénél van */
    const attach = (mesh: THREE.Mesh, p: V3, pivot: V3 | undefined, tilt: number | undefined, swing: number | undefined, flap: number | undefined, aim?: number): THREE.Group | undefined => {
      mesh.frustumCulled = false;
      if (pivot || tilt) {
        const pv = pivot ?? p;
        const g = new THREE.Group();
        g.position.set(...pv);
        mesh.position.set(p[0] - pv[0], p[1] - pv[1], p[2] - pv[2]);
        g.add(mesh);
        root.add(g);
        if (swing !== undefined || flap !== undefined || tilt) limbs.push({ g, swing: swing ?? 0, tilt: tilt ?? 0, flap: flap ?? 0, aim: aim ?? tilt ?? 0 });
        return g;
      }
      mesh.position.set(...p);
      root.add(mesh);
      return undefined;
    };
    let bow: THREE.Mesh | undefined;
    const k = 1 / 16;
    for (const part of TEXTURED[kind] ?? []) {
      const mesh = new THREE.Mesh(texturedGeo(part), material(part.tex));
      const g = attach(mesh, part.p.map((x) => x * k) as V3, part.pivot?.map((x) => x * k) as V3 | undefined, part.tilt, part.swing, part.flap, part.aim);
      // a csontváz jobb keze (az egyetlen 1.55-ös célzó kar) tartja az íjat
      if (kind === 'skeleton' && g && part.aim === 1.55) {
        const geo = new THREE.PlaneGeometry(0.8, 0.8);
        geo.rotateY(Math.PI / 2);
        geo.rotateX(-Math.PI / 2);
        bow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: itemTex(base, 'bow'), alphaTest: 0.5, side: THREE.DoubleSide }));
        bow.frustumCulled = false;
        bow.position.set(0.02, -0.62, -0.18);
        g.add(bow);
        mats.push(bow.material as THREE.MeshBasicMaterial);
      }
    }
    scene.add(root);
    return { root, mats, limbs, bow };
  }
}

const arrowMats = {
  shaft: new THREE.MeshBasicMaterial({ color: 0x8a6a3c }),
  head: new THREE.MeshBasicMaterial({ color: 0x9a9a9a }),
  fletch: new THREE.MeshBasicMaterial({ color: 0xe8e8e0 }),
};
/** Egy nyíl: szár, hegy elöl (−z) és tollazat hátul; a közepe a repülő pont */
function makeArrow(): THREE.Group {
  const g = new THREE.Group();
  const add = (s: V3, p: V3, m: THREE.MeshBasicMaterial) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...s), m);
    mesh.position.set(...p);
    mesh.frustumCulled = false;
    g.add(mesh);
  };
  add([0.03, 0.03, 0.6], [0, 0, 0], arrowMats.shaft);
  add([0.07, 0.07, 0.1], [0, 0, -0.33], arrowMats.head);
  add([0.1, 0.02, 0.14], [0, 0, 0.26], arrowMats.fletch);
  add([0.02, 0.1, 0.14], [0, 0, 0.26], arrowMats.fletch);
  return g;
}

export function createMobView(scene: THREE.Scene, base: string = import.meta.env.BASE_URL) {
  const views = new Map<number, View>();
  const build = (kind: MobKind): View => buildView(kind, scene, base);
  const arrowViews = new Map<number, THREE.Group>();
  const FWD = new THREE.Vector3(0, 0, -1);
  const dir = new THREE.Vector3();

  return {
    /**
     * A mobok és a képernyő szinkronja.
     * @param light a napszak fénye (RGB, 0..1); a mobok sosem lesznek teljesen feketék
     */
    sync(mobs: Mob[], light: [number, number, number], time: number): void {
      const alive = new Set<number>();
      for (const m of mobs) {
        alive.add(m.id);
        let v = views.get(m.id);
        if (!v) { v = build(m.kind); views.set(m.id, v); }
        v.root.position.set(m.x, m.y, m.z);
        v.root.rotation.y = m.yaw;

        // járás: a lábak a megtett úttal lendülnek, a szárnyak csapkodnak, ha a csirke a levegőben van
        const speed = Math.min(1, Math.hypot(m.vx, m.vz) / 2.5);
        const sw = Math.sin(m.walk * 3.2) * 0.85 * speed;
        for (const l of v.limbs) {
          l.g.rotation.x = (m.aim > 0 ? l.aim : l.tilt) + (m.aim > 0 ? 0 : sw * l.swing);
          if (l.flap) l.g.rotation.z = l.flap * (m.onGround ? 0.1 : 0.9 + Math.sin(time * 30) * 0.5);
        }

        // halál: oldalra dől; 
        if (m.dead) {
          const k = Math.min(1, m.deadT / 0.25);
          v.root.rotation.z = (Math.PI / 2) * k;
          v.root.position.y += 0.2 * k;
        } else v.root.rotation.z = 0;

        // szín: napszak szerinti fény; sebzéskor piros
        const base = m.exposed ? 1 : 0.55;
        let r = Math.max(light[0] * base, 0.3), g = Math.max(light[1] * base, 0.3), b = Math.max(light[2] * base, 0.34);
        if (m.hurtT > 0 || m.dead) { g *= 0.4; b *= 0.4; r = Math.min(1.2, r * 1.3 + 0.1); }
        for (const mt of v.mats) mt.color.setRGB(r, g, b);
      }
      for (const [id, v] of views) {
        if (alive.has(id)) continue;
        scene.remove(v.root);
        for (const mt of v.mats) mt.dispose();
        views.delete(id);
      }
    },
    /** a repülő és a beleállt nyilak */
    syncArrows(list: Arrow[]): void {
      const alive = new Set<number>();
      for (const a of list) {
        alive.add(a.id);
        let g = arrowViews.get(a.id);
        if (!g) { g = makeArrow(); scene.add(g); arrowViews.set(a.id, g); }
        g.position.set(a.x, a.y, a.z);
        const len = Math.hypot(a.vx, a.vy, a.vz);
        if (len > 0.01) g.quaternion.setFromUnitVectors(FWD, dir.set(a.vx / len, a.vy / len, a.vz / len));
      }
      for (const [id, g] of arrowViews) if (!alive.has(id)) { scene.remove(g); arrowViews.delete(id); }
    },
    clear(): void {
      for (const g of arrowViews.values()) scene.remove(g);
      arrowViews.clear();
      for (const v of views.values()) { scene.remove(v.root); for (const mt of v.mats) mt.dispose(); }
      views.clear();
    },
  };
}

/**
 * A játékos modellje (saját terv, public/textures/entity/player.png): a kamera mögötti nézethez és a későbbi társakhoz.
 * `set` állítja a helyét, az irányát és a járás-animációt.
 */
export function createPlayerView(scene: THREE.Scene, base: string = import.meta.env.BASE_URL) {
  const v = buildView('player', scene, base);
  v.root.visible = false;
  return {
    get visible() { return v.root.visible; },
    set visible(on: boolean) { v.root.visible = on; },
    /**
     * @param walk a megtett út fázisa (nő járás közben), @param speed 0..1 a járás üteme, @param light a napszak színe (RGB)
     * @param sneak lehajolás nincs, a paraméter a későbbi bővítésé
     */
    set(x: number, y: number, z: number, yaw: number, walk: number, speed: number, light: [number, number, number]): void {
      v.root.position.set(x, y, z);
      v.root.rotation.y = yaw;
      const sw = Math.sin(walk * 3.2) * 0.85 * Math.min(1, speed);
      for (const l of v.limbs) l.g.rotation.x = l.tilt + sw * l.swing;
      for (const mt of v.mats) mt.color.setRGB(Math.max(light[0], 0.35), Math.max(light[1], 0.35), Math.max(light[2], 0.4));
    },
    dispose(): void { scene.remove(v.root); for (const mt of v.mats) mt.dispose(); },
  };
}
