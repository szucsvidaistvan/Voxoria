import * as THREE from 'three';
import type { Mob, MobKind } from '../shared/mobs';

/**
 * A mobok megjelenítése: színes dobozokból épített modellek (a textúracsomagban nincsenek lényekhez képek),
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

const eyes = (y: number, z: number, dx = 0.12, size = 0.07, c = '#141414'): Part[] => [
  { s: [size, size, 0.02], p: [-dx, y, z], c },
  { s: [size, size, 0.02], p: [dx, y, z], c },
];
/** négy láb: az első pár (z < 0) és a hátsó; átlósan lendülnek */
const quadLegs = (x: number, zFront: number, zBack: number, h: number, w: number, c: string): Part[] => [
  { s: [w, h, w], p: [-x, h / 2, zFront], pivot: [-x, h, zFront], c, swing: 1 },
  { s: [w, h, w], p: [x, h / 2, zFront], pivot: [x, h, zFront], c, swing: -1 },
  { s: [w, h, w], p: [-x, h / 2, zBack], pivot: [-x, h, zBack], c, swing: -1 },
  { s: [w, h, w], p: [x, h / 2, zBack], pivot: [x, h, zBack], c, swing: 1 },
];

const MODELS: Record<MobKind, Part[]> = {
  pig: [
    { s: [0.62, 0.5, 0.9], p: [0, 0.62, 0.05], c: '#eea0a8' },
    { s: [0.5, 0.45, 0.45], p: [0, 0.7, -0.6], c: '#eea0a8' },
    { s: [0.26, 0.18, 0.12], p: [0, 0.62, -0.87], c: '#f6bcc2' },
    { s: [0.05, 0.06, 0.02], p: [-0.06, 0.62, -0.93], c: '#8a4a52' },
    { s: [0.05, 0.06, 0.02], p: [0.06, 0.62, -0.93], c: '#8a4a52' },
    ...eyes(0.77, -0.835, 0.16),
    ...quadLegs(0.19, -0.3, 0.38, 0.38, 0.2, '#dc8d96'),
  ],
  cow: [
    { s: [0.7, 0.6, 1.1], p: [0, 0.97, 0.1], c: '#4a3322' },
    { s: [0.704, 0.3, 0.4], p: [0, 1.0, 0.22], c: '#e9e6df' },
    { s: [0.2, 0.604, 0.3], p: [0.2, 0.97, -0.3], c: '#e9e6df' },
    { s: [0.5, 0.5, 0.45], p: [0, 1.27, -0.75], c: '#4a3322' },
    { s: [0.32, 0.2, 0.1], p: [0, 1.15, -1.0], c: '#cdb89c' },
    { s: [0.08, 0.14, 0.08], p: [-0.28, 1.56, -0.72], c: '#e8dcc0' },
    { s: [0.08, 0.14, 0.08], p: [0.28, 1.56, -0.72], c: '#e8dcc0' },
    ...eyes(1.33, -0.975, 0.17),
    ...quadLegs(0.22, -0.4, 0.62, 0.67, 0.22, '#3a2818'),
  ],
  sheep: [
    { s: [0.8, 0.7, 1.0], p: [0, 0.92, 0.1], c: '#f0eee8' },
    { s: [0.4, 0.42, 0.42], p: [0, 1.06, -0.68], c: '#b8a88f' },
    { s: [0.46, 0.14, 0.46], p: [0, 1.32, -0.62], c: '#f0eee8' },
    ...eyes(1.1, -0.895, 0.1, 0.06),
    ...quadLegs(0.22, -0.32, 0.5, 0.57, 0.2, '#8a7a68'),
  ],
  chicken: [
    { s: [0.32, 0.3, 0.42], p: [0, 0.4, 0.02], c: '#f2f2ee' },
    { s: [0.2, 0.24, 0.2], p: [0, 0.63, -0.22], c: '#f2f2ee' },
    { s: [0.1, 0.07, 0.1], p: [0, 0.6, -0.36], c: '#e8b030' },
    { s: [0.06, 0.1, 0.12], p: [0, 0.79, -0.24], c: '#d03030' },
    { s: [0.04, 0.07, 0.04], p: [0, 0.52, -0.34], c: '#d03030' },
    ...eyes(0.66, -0.325, 0.07, 0.04),
    { s: [0.05, 0.25, 0.05], p: [-0.08, 0.125, 0.02], pivot: [-0.08, 0.25, 0.02], c: '#e8b030', swing: 1 },
    { s: [0.05, 0.25, 0.05], p: [0.08, 0.125, 0.02], pivot: [0.08, 0.25, 0.02], c: '#e8b030', swing: -1 },
    { s: [0.05, 0.2, 0.3], p: [-0.19, 0.42, 0.02], pivot: [-0.19, 0.52, 0.02], c: '#e4e4de', flap: 1 },
    { s: [0.05, 0.2, 0.3], p: [0.19, 0.42, 0.02], pivot: [0.19, 0.52, 0.02], c: '#e4e4de', flap: -1 },
  ],
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
  mat: THREE.MeshBasicMaterial;
  limbs: { g: THREE.Group; swing: number; tilt: number; flap: number }[];
}

export function createMobView(scene: THREE.Scene) {
  const views = new Map<number, View>();

  const build = (kind: MobKind): View => {
    const root = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const limbs: View['limbs'] = [];
    for (const part of MODELS[kind]) {
      const mesh = new THREE.Mesh(boxGeo(part.s, part.c), mat);
      mesh.frustumCulled = false;
      if (part.pivot || part.tilt) {
        const pv = part.pivot ?? part.p;
        const g = new THREE.Group();
        g.position.set(...pv);
        mesh.position.set(part.p[0] - pv[0], part.p[1] - pv[1], part.p[2] - pv[2]);
        g.add(mesh);
        root.add(g);
        if (part.swing !== undefined || part.flap !== undefined || part.tilt) {
          limbs.push({ g, swing: part.swing ?? 0, tilt: part.tilt ?? 0, flap: part.flap ?? 0 });
        }
      } else {
        mesh.position.set(...part.p);
        root.add(mesh);
      }
    }
    scene.add(root);
    return { root, mat, limbs };
  };

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
        v.mat.color.setRGB(r, g, b);
      }
      for (const [id, v] of views) {
        if (alive.has(id)) continue;
        scene.remove(v.root);
        v.mat.dispose();
        views.delete(id);
      }
    },
    clear(): void {
      for (const v of views.values()) { scene.remove(v.root); v.mat.dispose(); }
      views.clear();
    },
  };
}
