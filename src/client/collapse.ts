import * as THREE from 'three';
import { AIR, BLOCKS, isSolid } from '../shared/blocks';
import type { World } from '../shared/world';
import type { Atlas } from './atlas';
import { buildCubeGeo } from './blockgeo';

/** Egy összeomló fa egy blokkja (a világból már kivéve) */
export interface Cell { x: number; y: number; z: number; id: number }

interface Piece {
  cell: Cell;
  mesh: THREE.Mesh;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** forgás sebessége (rad/mp) */
  wx: number; wz: number;
  /** ennyi másodperc múlva indul el (a fa fokozatosan hullik szét) */
  delay: number;
  /** a megállás óta eltelt idő; −1: még mozog */
  rest: number;
  bounced: boolean;
  age: number;
}

const GRAVITY = 24;
/** Ennyi idő után (földet érés) a darab eltűnik, és tárgy lesz belőle */
const SETTLE = 0.35;

/**
 * Az összeomló fa: a fa blokkjai egyenként, a helyükről indulva szétesnek, pörögve-pattogva a földre hullanak
 * (a törzs kevésbé szóródik, a lomb jobban), és a földet éréskor a `onLand` kapja őket (ott lesz belőlük tárgy).
 */
export function createCollapse(scene: THREE.Scene, atlas: Atlas, material: THREE.Material, getWorld: () => World) {
  const pieces: Piece[] = [];
  const geos = new Map<number, THREE.BufferGeometry>();

  /** Egy teljes méretű, a blokk textúrájával borított kocka (a közepén a nullpont) */
  const cubeGeo = (id: number): THREE.BufferGeometry => {
    let g = geos.get(id);
    if (!g) { g = buildCubeGeo(atlas, id); geos.set(id, g); }
    return g;
  };

  const solidAt = (x: number, y: number, z: number): boolean => {
    const id = getWorld().getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    return id !== AIR && isSolid(id) && BLOCKS[id]?.opaque !== false;
  };

  return {
    get busy() { return pieces.length > 0; },

    /**
     * @param cells a fa blokkjai (a hívó már kivette őket a világból)
     * @param origin a törzs töve: innen szóródnak szét a darabok
     * @param onLand a darab földet ért: a (x, y, z) a közepe
     */
    start(cells: Cell[], origin: { x: number; z: number }, onLand: (c: Cell, x: number, y: number, z: number) => void): void {
      this.onLand = onLand;
      const minY = Math.min(...cells.map((c) => c.y));
      for (const c of cells) {
        const log = /(_log|_wood)$/.test(BLOCKS[c.id]?.key ?? '');
        const mesh = new THREE.Mesh(cubeGeo(c.id), material);
        mesh.frustumCulled = false;
        const x = c.x + 0.5, y = c.y + 0.5, z = c.z + 0.5;
        mesh.position.set(x, y, z);
        scene.add(mesh);
        // kifelé a töves oldaltól: a törzs alig, a lomb és az ágak erősebben szóródnak
        let ox = x - (origin.x + 0.5), oz = z - (origin.z + 0.5);
        const od = Math.hypot(ox, oz) || 1;
        ox /= od; oz /= od;
        const spread = log ? 0.6 : 1.8;
        const out = Math.min(od, 3) * 0.5 * (log ? 0.5 : 1);
        pieces.push({
          cell: c, mesh, x, y, z,
          vx: ox * out + (Math.random() - 0.5) * spread,
          vz: oz * out + (Math.random() - 0.5) * spread,
          vy: Math.random() * (log ? 0.8 : 2.2),
          wx: (Math.random() - 0.5) * (log ? 3 : 7), wz: (Math.random() - 0.5) * (log ? 3 : 7),
          // a felső részek kicsit később indulnak: a fa lentről felfelé bomlik, "szétcsúszik"
          delay: (c.y - minY) * 0.012 + Math.random() * 0.25,
          rest: -1, bounced: false, age: 0,
        });
      }
    },
    onLand: (() => {}) as (c: Cell, x: number, y: number, z: number) => void,

    update(dt: number): void {
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        p.age += dt;
        if (p.delay > 0) { p.delay -= dt; continue; }
        if (p.rest < 0) {
          p.vy -= GRAVITY * dt;
          const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
          // oldalt a tömör blokkok megállítják
          if (!solidAt(nx, p.y, nz)) { p.x = nx; p.z = nz; } else { p.vx = p.vz = 0; }
          const ny = p.y + p.vy * dt;
          if (p.vy < 0 && solidAt(p.x, ny - 0.5, p.z)) {
            // földet ért: a talaj teteje fölé kerül; erős becsapódásnál egyet pattan, aztán megáll
            p.y = Math.floor(ny - 0.5) + 1.5;
            if (p.vy < -6 && !p.bounced) { p.bounced = true; p.vy = -p.vy * 0.22; p.vx *= 0.5; p.vz *= 0.5; }
            else { p.vy = p.vx = p.vz = p.wx = p.wz = 0; p.rest = 0; }
          } else p.y = ny;
          p.mesh.rotation.x += p.wx * dt;
          p.mesh.rotation.z += p.wz * dt;
          if (p.age > 8) p.rest = 0; // biztonsági határ: a kilógó darab is eltűnik
        } else p.rest += dt;
        p.mesh.position.set(p.x, p.y, p.z);
        if (p.rest >= SETTLE) {
          scene.remove(p.mesh);
          pieces.splice(i, 1);
          this.onLand(p.cell, p.x, p.y, p.z);
        }
      }
    },
  };
}
