import * as THREE from 'three';
import type { Faller } from '../shared/gravity';
import type { Atlas } from './atlas';
import { buildCubeGeo } from './blockgeo';

/** Az eső blokkok (homok, kavics, betonpor) kirajzolása: egy-egy kocka, amit a tickek között simítunk */
export function createFallingView(scene: THREE.Scene, atlas: Atlas, material: THREE.Material) {
  const geos = new Map<number, THREE.BufferGeometry>();
  const meshes = new Map<Faller, THREE.Mesh>();
  const seen = new Set<Faller>();

  return {
    /** @param alpha hol tartunk a két sim tick között (0..1) */
    update(fallers: readonly Faller[], alpha: number): void {
      seen.clear();
      for (const f of fallers) {
        seen.add(f);
        let m = meshes.get(f);
        if (!m) {
          let g = geos.get(f.id);
          if (!g) { g = buildCubeGeo(atlas, f.id); geos.set(f.id, g); }
          m = new THREE.Mesh(g, material);
          m.frustumCulled = false;
          scene.add(m);
          meshes.set(f, m);
        }
        m.position.set(f.x + 0.5, f.py + (f.y - f.py) * alpha + 0.5, f.z + 0.5);
      }
      for (const [f, m] of meshes) {
        if (!seen.has(f)) { scene.remove(m); meshes.delete(f); }
      }
    },
  };
}
