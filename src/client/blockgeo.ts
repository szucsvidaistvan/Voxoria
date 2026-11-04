import * as THREE from 'three';
import { BLOCKS } from '../shared/blocks';
import type { Atlas } from './atlas';

/** Egy teljes méretű, a blokk textúrájával borított kocka (a közepén a nullpont, vertex-színekkel az oldalak árnyalásához) */
export function buildCubeGeo(atlas: Atlas, id: number): THREE.BufferGeometry {
    const def = BLOCKS[id];
    const h = 0.5;
    const faces = [
      { v: [[-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h]], shade: 1, name: def.top },
      { v: [[-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h]], shade: 0.5, name: def.bottom },
      { v: [[h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h]], shade: 0.8, name: def.side },
      { v: [[-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h]], shade: 0.8, name: def.side },
      { v: [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]], shade: 0.65, name: def.side },
      { v: [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]], shade: 0.65, name: def.side },
    ];
    const pos: number[] = [], uvs: number[] = [], cols: number[] = [], idx: number[] = [];
    for (const f of faces) {
      const [u0, v0, u1, v1] = atlas.uv(f.name);
      const tint = (f.name === def.top ? def.tint?.top : def.tint?.side) ?? [1, 1, 1];
      const base = pos.length / 3;
      for (const v of f.v) {
        pos.push(...v);
        cols.push(f.shade * tint[0], f.shade * tint[1], f.shade * tint[2]);
      }
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx);
    return g;
}
