import * as THREE from 'three';
import type { Mob, MobKind } from '../shared/mobs';
import { TEXTURED, partGeom, type TexName } from './mobmodels';

/**
 * A mobok megjelenítése: a háziállatok a Good Vibes csomag lény-skinjeivel textúrázott dobozmodellek (mobmodels.ts),
 * a zombi színes dobozokból épített saját terv,
 * járás-animációval, sebzés-villanással, és a halál utáni eldőléssel.
 * A koordináták a lábak alatti ponttól számítanak; az előre a −z irány (a mob yaw szögével forgatva).
 */

type V3 = [number, number, number];
interface Part {
  /** méret */
  s: V3;
  /** a doboz közepe */
  p: V3;
  /** szín (sRGB hex) */
  c: string;
  /** ha van: a doboz ezen pont körül lendül (pl. a láb csípője); a doboz közepe továbbra is `p` */
  pivot?: V3;
  /** lendítés iránya és mértéke (a láb/kar a járással mozog): 1 vagy −1 */
  swing?: number;
  /** állandó dőlés az x tengely körül (pl. a zombi előretartott karja) */
  tilt?: number;
  /** szárny: a z tengely körül csapkod */
  flap?: number;
}

const hex = (c: string): V3 => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
const FACE_SHADE = [0.8, 0.8, 1, 0.5, 0.65, 0.65]; // +x, −x, +y, −y, +z, −z (a BoxGeometry lapsorrendje)

const geoCache = new Map<string, THREE.BufferGeometry>();
function boxGeo(s: V3, c: string): THREE.BufferGeometry {
  const key = `${s.join(',')}|${c}`;
  let g = geoCache.get(key);
  if (g) return g;
  g = new THREE.BoxGeometry(s[0], s[1], s[2]);
  const [r, gr, b] = hex(c);
  const col: number[] = [];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) col.push(r * FACE_SHADE[f], gr * FACE_SHADE[f], b * FACE_SHADE[f]);
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geoCache.set(key, g);
  return g;
}

/** A színes dobozokból épített modellek (a textúrázottak a mobmodels.ts-ben vannak) */
const MODELS: Partial<Record<MobKind, Part[]>> = {
  // egy görnyedt, hosszú karú, rongyokba burkolt kísértet (saját terv, nem a kockajátékok megszokott zombija)
  zombie: [
    { s: [0.2, 0.7, 0.22], p: [-0.12, 0.35, 0], pivot: [-0.12, 0.7, 0], c: '#4a4238', swing: 1 },
    { s: [0.2, 0.7, 0.22], p: [0.12, 0.35, 0], pivot: [0.12, 0.7, 0], c: '#4a4238', swing: -1 },
    { s: [0.56, 0.7, 0.3], p: [0, 1.05, 0.04], c: '#5b5a3c' },
    { s: [0.6, 0.18, 0.34], p: [0, 0.78, 0.04], c: '#3d3a2a' },
    { s: [0.62, 0.14, 0.36], p: [0, 1.36, 0.02], c: '#6d6b4a' },
    { s: [0.44, 0.42, 0.44], p: [0, 1.62, -0.12], c: '#9aa38a' },
    { s: [0.5, 0.12, 0.5], p: [0, 1.86, -0.1], c: '#3a3328' },
    { s: [0.07, 0.05, 0.02], p: [-0.1, 1.64, -0.345], c: '#ffb020' },
    { s: [0.07, 0.05, 0.02], p: [0.1, 1.64, -0.345], c: '#ffb020' },
    { s: [0.2, 0.04, 0.02], p: [0, 1.5, -0.345], c: '#2a2a22' },
    { s: [0.18, 0.8, 0.18], p: [-0.38, 1.0, -0.05], pivot: [-0.38, 1.4, -0.05], c: '#8c9580', tilt: 1.2, swing: 0.15 },
    { s: [0.18, 0.8, 0.18], p: [0.38, 1.0, -0.05], pivot: [0.38, 1.4, -0.05], c: '#8c9580', tilt: 1.2, swing: -0.15 },
  ],
};

interface View {
  root: THREE.Group;
  /** a lény anyagai (a textúrázottak textúránként egy; a színes részeké `plain`); mind kapja a napszak-színezést */
  mats: THREE.MeshBasicMaterial[];
  limbs: { g: THREE.Group; swing: number; tilt: number; flap: number }[];
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
    const material = (tex?: TexName): THREE.MeshBasicMaterial => {
      const key = tex ?? 'plain';
      let m = matFor.get(key);
      if (!m) {
        // a gyapjú és a lábak áttetsző pixeleket tartalmaznak: alphaTest
        m = new THREE.MeshBasicMaterial(tex ? { vertexColors: true, map: skin(base, tex), alphaTest: 0.5 } : { vertexColors: true });
        matFor.set(key, m); mats.push(m);
      }
      return m;
    };
    /** a rész a (pivot) csomóponton lóg, a doboz a közepénél van */
    const attach = (mesh: THREE.Mesh, p: V3, pivot: V3 | undefined, tilt: number | undefined, swing: number | undefined, flap: number | undefined) => {
      mesh.frustumCulled = false;
      if (pivot || tilt) {
        const pv = pivot ?? p;
        const g = new THREE.Group();
        g.position.set(...pv);
        mesh.position.set(p[0] - pv[0], p[1] - pv[1], p[2] - pv[2]);
        g.add(mesh);
        root.add(g);
        if (swing !== undefined || flap !== undefined || tilt) limbs.push({ g, swing: swing ?? 0, tilt: tilt ?? 0, flap: flap ?? 0 });
      } else {
        mesh.position.set(...p);
        root.add(mesh);
      }
    };
    const textured = TEXTURED[kind];
    if (textured) {
      const k = 1 / 16;
      for (const part of textured) {
        const mesh = new THREE.Mesh(texturedGeo(part), material(part.tex));
        attach(mesh, part.p.map((x) => x * k) as V3, part.pivot?.map((x) => x * k) as V3 | undefined, part.tilt, part.swing, part.flap);
      }
    } else {
      for (const part of MODELS[kind as MobKind] ?? []) {
        attach(new THREE.Mesh(boxGeo(part.s, part.c), material()), part.p, part.pivot, part.tilt, part.swing, part.flap);
      }
    }
    scene.add(root);
    return { root, mats, limbs };
  }
}

export function createMobView(scene: THREE.Scene, base: string = import.meta.env.BASE_URL) {
  const views = new Map<number, View>();
  const build = (kind: MobKind): View => buildView(kind, scene, base);

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
          l.g.rotation.x = l.tilt + sw * l.swing;
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
    clear(): void {
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
