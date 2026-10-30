import * as THREE from 'three';
import { AIR, B, BLOCKS, isOpaque, type FaceKind } from '../shared/blocks';
import { CH, CS, type Chunk, type World } from '../shared/world';
import type { Atlas } from './atlas';

interface FaceDef {
  dir: [number, number, number];
  kind: FaceKind;
  shade: number;
  v: [number, number, number][];
}

// A csúcsok az óramutatóval ellentétes sorrendben vannak kívülről nézve.
const FACES: FaceDef[] = [
  { dir: [0, 1, 0], kind: 'top', shade: 1.0, v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], kind: 'bottom', shade: 0.5, v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [1, 0, 0], kind: 'side', shade: 0.8, v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { dir: [-1, 0, 0], kind: 'side', shade: 0.8, v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { dir: [0, 0, 1], kind: 'side', shade: 0.65, v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], kind: 'side', shade: 0.65, v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

/** Egy chunk geometriája (a csúcsok chunk-helyi koordinátákban). Csak a látható lapokat rajzolja. */
export function buildChunkGeometry(world: World, chunk: Chunk, atlas: Atlas): THREE.BufferGeometry | null {
  const pos: number[] = [], uvs: number[] = [], col: number[] = [], idx: number[] = [];
  const ox = chunk.cx * CS, oz = chunk.cz * CS;

  for (let y = 0; y < CH; y++) {
    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        const id = chunk.get(x, y, z);
        if (id === AIR) continue;
        const def = BLOCKS[id];
        for (const f of FACES) {
          const nid = world.getBlock(ox + x + f.dir[0], y + f.dir[1], oz + z + f.dir[2]);
          if (isOpaque(nid) || (id === B.LEAVES && nid === B.LEAVES)) continue;

          const [u0, v0, u1, v1] = atlas.uv(def[f.kind]);
          const tint = def.tint?.[f.kind] ?? [1, 1, 1];
          const base = pos.length / 3;
          for (const v of f.v) {
            pos.push(x + v[0], y + v[1], z + v[2]);
            col.push(f.shade * tint[0], f.shade * tint[1], f.shade * tint[2]);
          }
          uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
