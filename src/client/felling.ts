import * as THREE from 'three';
import { BLOCKS, type FaceKind } from '../shared/blocks';
import type { Atlas } from './atlas';

/** Egy kidöntött fa egy blokkja, a kidöntés kiindulópontjához (a kibontott rönkhöz) képest */
export interface FellCell {
  /** világkoordináta */
  x: number; y: number; z: number;
  id: number;
}

/** A négy ledőlési irány: kelet, dél, nyugat, észak (x, z lépés) */
export const FALL_DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** Ez a hat lap: irány, a lap fajtája, árnyalat és a négy csúcs (a mesher.ts FACES-ével egyező sorrend) */
const FACES: { dir: [number, number, number]; kind: FaceKind; shade: number; v: [number, number, number][] }[] = [
  { dir: [0, 1, 0], kind: 'top', shade: 1.0, v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], kind: 'bottom', shade: 0.5, v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [1, 0, 0], kind: 'side', shade: 0.8, v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { dir: [-1, 0, 0], kind: 'side', shade: 0.8, v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { dir: [0, 0, 1], kind: 'side', shade: 0.65, v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], kind: 'side', shade: 0.65, v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

/** A ledőlés időtartama másodpercben */
export const FALL_SECONDS = 1.5;

interface Falling {
  mesh: THREE.Mesh;
  t: number;
  dir: number;
  onLand: () => void;
}

/**
 * Kidőlő fák: a fa blokkjai egyetlen merev testté állnak össze, ami a töve (a ledőlés irányába eső alsó éle) körül
 * egyre gyorsulva ledől, és a végén egy kicsit visszarezeg. Az ütközés (a föld) a hívó dolga: a `onLand` jelzi a becsapódást.
 */
export function createFelling(scene: THREE.Scene, atlas: Atlas, material: THREE.Material) {
  const active: Falling[] = [];

  /** A blokkok lapjai a forgáspont körül (a belső, két átlátszatlan blokk közötti lapok kimaradnak) */
  const buildGeometry = (cells: FellCell[], pivot: [number, number, number]): THREE.BufferGeometry => {
    const at = new Map<string, FellCell>();
    for (const c of cells) at.set(`${c.x},${c.y},${c.z}`, c);
    const pos: number[] = [], uvs: number[] = [], col: number[] = [], idx: number[] = [];
    for (const c of cells) {
      const def = BLOCKS[c.id];
      if (!def) continue;
      for (const f of FACES) {
        const n = at.get(`${c.x + f.dir[0]},${c.y + f.dir[1]},${c.z + f.dir[2]}`);
        // a szomszéd rönk eltakarja a lapot (a lomb átlátszik, ott a lapokat megtartjuk)
        if (n && BLOCKS[n.id]?.opaque !== false) continue;
        const [u0, v0, u1, v1] = atlas.uv(def[f.kind]);
        const tint = def.tint?.[f.kind] ?? [1, 1, 1];
        const base = pos.length / 3;
        for (const v of f.v) {
          pos.push(c.x + v[0] - pivot[0], c.y + v[1] - pivot[1], c.z + v[2] - pivot[2]);
          col.push(f.shade * tint[0], f.shade * tint[1], f.shade * tint[2]);
        }
        uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  };

  /** A forgatás beállítása: a fa a `dir` irányba dől `theta` radiánnal (0: áll, PI/2: fekszik) */
  const setAngle = (mesh: THREE.Mesh, dir: number, theta: number) => {
    mesh.rotation.set(0, 0, 0);
    // kelet (+x): a z tengely körül negatív irányba; nyugat: pozitív; dél (+z): az x tengely körül pozitív; észak: negatív
    if (dir === 0) mesh.rotation.z = -theta;
    else if (dir === 2) mesh.rotation.z = theta;
    else if (dir === 1) mesh.rotation.x = theta;
    else mesh.rotation.x = -theta;
  };

  return {
    get busy() { return active.length > 0; },

    /**
     * A fa ledőlésének elindítása. A blokkokat a hívó már kivette a világból.
     * @param base a kibontott legalsó rönk helye; a forgáspont ennek a ledőlési oldali alsó éle
     */
    start(cells: FellCell[], base: { x: number; y: number; z: number }, dir: number, onLand: () => void): void {
      const [dx, dz] = FALL_DIRS[dir];
      const pivot: [number, number, number] = [base.x + 0.5 + dx * 0.5, base.y, base.z + 0.5 + dz * 0.5];
      const mesh = new THREE.Mesh(buildGeometry(cells, pivot), material);
      mesh.position.set(...pivot);
      mesh.frustumCulled = false;
      scene.add(mesh);
      active.push({ mesh, t: 0, dir, onLand });
    },

    update(dt: number): void {
      for (let i = active.length - 1; i >= 0; i--) {
        const a = active[i];
        a.t += dt;
        const k = Math.min(1, a.t / FALL_SECONDS);
        // lassan indul, aztán egyre gyorsabban dől (a gravitáció): theta ~ t^2.4
        let theta = (Math.PI / 2) * Math.pow(k, 2.4);
        // becsapódás után egy kis visszarezgés
        if (a.t > FALL_SECONDS) {
          const r = a.t - FALL_SECONDS;
          theta -= Math.max(0, 0.09 * Math.sin(r * 18) * Math.exp(-r * 9));
        }
        setAngle(a.mesh, a.dir, theta);
        if (a.t >= FALL_SECONDS + 0.25) {
          // a rezgés végén a fa eltűnik, és ugyanabban a pillanatban jelennek meg a tárgyak vagy a lefektetett blokkok
          scene.remove(a.mesh);
          a.mesh.geometry.dispose();
          active.splice(i, 1);
          a.onLand();
        }
      }
    },
  };
}
