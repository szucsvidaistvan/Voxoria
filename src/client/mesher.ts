import * as THREE from 'three';
import { AIR, B, BLOCKS, FLUID_LAVA, connectedParts, fluidHeight, fluidKind, fluidLevel, isOpaque, rotPoint, type BlockDef, type Dir, type FaceKind, type ShapeFace, type ShapePart, type Vec3 } from '../shared/blocks';
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

/** Egy geometria csúcsadatai, amíg épül */
class Buffers {
  pos: number[] = [];
  uvs: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  toGeometry(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export interface ChunkGeometry {
  solid: THREE.BufferGeometry | null;
  water: THREE.BufferGeometry | null;
  lava: THREE.BufferGeometry | null;
  /** tűz: animált, külön anyaggal */
  fire: THREE.BufferGeometry | null;
}


// ---------- nem kocka alakú blokkok ----------

const DIR_VEC: Record<Dir, Vec3> = {
  up: [0, 1, 0], down: [0, -1, 0], east: [1, 0, 0], west: [-1, 0, 0], south: [0, 0, 1], north: [0, 0, -1],
};
// a lap sarkai: bal alsó, jobb alsó, jobb felső, bal felső (kívülről nézve), a 0 a "from", az 1 a "to" koordináta
const CORNERS: Record<Dir, Vec3[]> = {
  up: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  down: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  east: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  west: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  south: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  north: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
};

const around = (p: Vec3, axis: 'x' | 'y' | 'z', deg: number): Vec3 => {
  const r = rotPoint([p[0] - 8, p[1] - 8, p[2] - 8], axis, deg);
  return [r[0] + 8, r[1] + 8, r[2] + 8];
};

/** Egy nem kocka alakú blokk lapjai: a modell elemei, az elemek és a blokk forgatásával */
function addShape(
  buf: Buffers, def: BlockDef, parts: ShapePart[], world: World, wx: number, y: number, wz: number, x: number, z: number,
  uvOf: (tex: string) => [number, number, number, number], bright = false,
): void {
  const rots = def.rots ?? [];
  for (const part of parts) {
    for (const [name, face] of Object.entries(part.faces) as [Dir, ShapeFace][]) {
      if (face.cull) {
        let c: Vec3 = DIR_VEC[face.cull];
        for (const [a, d] of rots) c = rotPoint(c, a, d);
        if (isOpaque(world.getBlock(wx + Math.round(c[0]), y + Math.round(c[1]), wz + Math.round(c[2])))) continue;
      }

      let verts: Vec3[] = CORNERS[name].map(([cx, cy, cz]) => [
        cx ? part.to[0] : part.from[0], cy ? part.to[1] : part.from[1], cz ? part.to[2] : part.from[2],
      ]);
      let n: Vec3 = DIR_VEC[name];
      if (part.rot) {
        const { o, a, g, s } = part.rot;
        const k = s ? 1 / Math.cos((g * Math.PI) / 180) : 1;
        verts = verts.map((v) => {
          const r = rotPoint([v[0] - o[0], v[1] - o[1], v[2] - o[2]], a, g);
          const sc: Vec3 = [a === 'x' ? 1 : k, a === 'y' ? 1 : k, a === 'z' ? 1 : k];
          return [r[0] * sc[0] + o[0], r[1] * sc[1] + o[1], r[2] * sc[2] + o[2]];
        });
        n = rotPoint(n, a, g);
      }
      for (const [a, d] of rots) {
        verts = verts.map((v) => around(v, a, d));
        n = rotPoint(n, a, d);
      }

      const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
      const shade = bright ? 1 : ay >= ax && ay >= az ? (n[1] > 0 ? 1 : 0.5) : ax >= az ? 0.8 : 0.65;
      const tint = face.tint && def.tintColor ? def.tintColor : ([1, 1, 1] as const);

      const [u0, v0, u1, v1] = uvOf(face.tex);
      const [a, b, c, d] = face.uv;
      const uvs = [[a, d], [c, d], [c, b], [a, b]];
      const rot = (((face.rot ?? 0) / 90) | 0) & 3;
      const base = buf.pos.length / 3;
      verts.forEach((v, i) => {
        buf.pos.push(x + v[0] / 16, y + v[1] / 16, z + v[2] / 16);
        buf.col.push(shade * tint[0], shade * tint[1], shade * tint[2]);
        const [u, vt] = uvs[(i + rot) & 3];
        buf.uvs.push(u0 + ((u1 - u0) * u) / 16, v1 - ((v1 - v0) * vt) / 16);
      });
      buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
}


// ---------- folyadékok ----------

/** A szomszéd folyadék felszínének magassága (0, ha nem ugyanaz a folyadék) */
function fluidTop(world: World, x: number, y: number, z: number, kind: number): number {
  const id = world.getBlock(x, y, z);
  if (fluidKind(id) !== kind) return 0;
  return fluidKind(world.getBlock(x, y + 1, z)) === kind ? 1 : fluidHeight(fluidLevel(id));
}

/** Egy víz- vagy lávablokk: a felszín a szint szerint alacsonyabb, a szomszédos azonos folyadékok között nincs lap */
function addFluid(
  buf: Buffers, def: BlockDef, id: number, kind: number, world: World, wx: number, y: number, wz: number, x: number, z: number, atlas: Atlas,
): void {
  const above = world.getBlock(wx, y + 1, wz);
  const h = fluidKind(above) === kind ? 1 : fluidHeight(fluidLevel(id));
  const lava = kind === FLUID_LAVA;
  const [u0, v0, u1, v1] = atlas.anim.uv(def.top);
  for (const f of FACES) {
    const nx = wx + f.dir[0], ny = y + f.dir[1], nz = wz + f.dir[2];
    const nid = world.getBlock(nx, ny, nz);
    let yb = 0;
    if (f.dir[1] === 1) {
      if (fluidKind(nid) === kind || isOpaque(nid)) continue;
    } else if (f.dir[1] === -1) {
      if (fluidKind(nid) === kind || isOpaque(nid)) continue;
    } else {
      if (isOpaque(nid)) continue;
      if (fluidKind(nid) === kind) {
        yb = fluidTop(world, nx, ny, nz, kind);
        if (yb >= h) continue; // a szomszéd magasabb vagy ugyanolyan: nincs mit mutatni
      }
    }
    const shade = lava ? 1 : f.shade;
    const base = buf.pos.length / 3;
    for (const v of f.v) {
      buf.pos.push(x + v[0], y + (v[1] ? h : yb), z + v[2]);
      buf.col.push(shade, shade, shade);
    }
    const vb = v0 + (v1 - v0) * yb, vt = v0 + (v1 - v0) * h;
    if (f.dir[1] === 0) buf.uvs.push(u0, vb, u1, vb, u1, vt, u0, vt);
    else buf.uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/** Egy chunk geometriája (a csúcsok chunk-helyi koordinátákban). Csak a látható lapokat rajzolja. */
export function buildChunkGeometry(world: World, chunk: Chunk, atlas: Atlas): ChunkGeometry {
  const solid = new Buffers();
  const water = new Buffers();
  const lava = new Buffers();
  const fire = new Buffers();
  const ox = chunk.cx * CS, oz = chunk.cz * CS;

  for (let y = 0; y < CH; y++) {
    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        const id = chunk.get(x, y, z);
        if (id === AIR) continue;
        const def = BLOCKS[id];
        if (!def) continue; // ismeretlen blokk: nem rajzoljuk
        if (def.parts) {
          const parts = def.conn ? connectedParts(def, (dx, dz) => world.getBlock(ox + x + dx, y, oz + z + dz)) : def.parts;
          if (id === B.FIRE) addShape(fire, def, parts, world, ox + x, y, oz + z, x, z, (t) => atlas.anim.uv(t), true);
          else addShape(solid, def, parts, world, ox + x, y, oz + z, x, z, (t) => atlas.uv(t));
          continue;
        }
        const kind = fluidKind(id);
        if (kind) {
          addFluid(kind === FLUID_LAVA ? lava : water, def, id, kind, world, ox + x, y, oz + z, x, z, atlas);
          continue;
        }
        for (const f of FACES) {
          const nid = world.getBlock(ox + x + f.dir[0], y + f.dir[1], oz + z + f.dir[2]);
          if (isOpaque(nid) || (!isOpaque(id) && nid === id)) continue;

          const [u0, v0, u1, v1] = atlas.uv(def[f.kind]);
          const tint = def.tint?.[f.kind] ?? [1, 1, 1];
          const base = solid.pos.length / 3;
          for (const v of f.v) {
            solid.pos.push(x + v[0], y + v[1], z + v[2]);
            solid.col.push(f.shade * tint[0], f.shade * tint[1], f.shade * tint[2]);
          }
          solid.uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
          solid.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  return { solid: solid.toGeometry(), water: water.toGeometry(), lava: lava.toGeometry(), fire: fire.toGeometry() };
}
