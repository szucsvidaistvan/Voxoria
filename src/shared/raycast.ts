import { BLOCKS, isSolid, type Box } from './blocks';
import type { World } from './world';

export interface RayHit {
  x: number; y: number; z: number;   // a talált blokk
  px: number; py: number; pz: number; // az előtte lévő (üres) blokk
  /** a talált lap normálja (a kezdő blokkban 0, 0, 0) */
  nx: number; ny: number; nz: number;
  /** a találat pontja */
  hx: number; hy: number; hz: number;
  /** a talált doboz világkoordinátákban (a kiemeléshez): x0, y0, z0, x1, y1, z1 */
  box: Box;
}

const UNIT: Box[] = [[0, 0, 0, 1, 1, 1]];

/** Sugár és doboz metszése (slab módszer). Visszaadja a távolságot és a belépő lap normálját. */
function hitBox(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Box,
): { t: number; nx: number; ny: number; nz: number } | null {
  let tmin = -Infinity, tmax = Infinity;
  let nx = 0, ny = 0, nz = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < b[a] || o[a] > b[a + 3]) return null;
      continue;
    }
    let t1 = (b[a] - o[a]) / d[a], t2 = (b[a + 3] - o[a]) / d[a];
    let sign = -1; // a közelebbi lap a "mínusz" oldal, ha a sugár pozitív irányba halad
    if (t1 > t2) { [t1, t2] = [t2, t1]; sign = 1; }
    if (t1 > tmin) {
      tmin = t1;
      nx = a === 0 ? sign : 0; ny = a === 1 ? sign : 0; nz = a === 2 ? sign : 0;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(tmin, 0), nx, ny, nz };
}

/** Voxel bejárás (Amanatides–Woo). A (dx,dy,dz) irány legyen egységvektor. A nem kocka blokkoknál a dobozaikat is megvizsgálja. */
export function raycast(
  world: World,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist = 6,
): RayHit | null {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tmx = dx > 0 ? (x + 1 - ox) * tdx : dx < 0 ? (ox - x) * tdx : Infinity;
  let tmy = dy > 0 ? (y + 1 - oy) * tdy : dy < 0 ? (oy - y) * tdy : Infinity;
  let tmz = dz > 0 ? (z + 1 - oz) * tdz : dz < 0 ? (oz - z) * tdz : Infinity;
  let px = x, py = y, pz = z, t = 0;
  let nx = 0, ny = 0, nz = 0;

  while (t <= maxDist) {
    const id = world.getBlock(x, y, z);
    if (isSolid(id)) {
      const pick = BLOCKS[id]?.pick;
      if (!pick) {
        return {
          x, y, z, px, py, pz, nx, ny, nz,
          hx: ox + dx * t, hy: oy + dy * t, hz: oz + dz * t,
          box: [x, y, z, x + 1, y + 1, z + 1],
        };
      }
      // nem kocka alakú blokk: a dobozai közül a legközelebbi találat (üres lista: teljes kocka a célzáshoz)
      let best: { t: number; nx: number; ny: number; nz: number; b: Box } | null = null;
      for (const b of pick.length ? pick : UNIT) {
        const h = hitBox(ox - x, oy - y, oz - z, dx, dy, dz, b);
        if (h && h.t <= maxDist && (!best || h.t < best.t)) best = { ...h, b };
      }
      if (best) {
        return {
          x, y, z, px, py, pz, nx: best.nx, ny: best.ny, nz: best.nz,
          hx: ox + dx * best.t, hy: oy + dy * best.t, hz: oz + dz * best.t,
          box: [x + best.b[0], y + best.b[1], z + best.b[2], x + best.b[3], y + best.b[4], z + best.b[5]],
        };
      }
    }
    px = x; py = y; pz = z;
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = nz = 0; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; ny = -sy; nx = nz = 0; }
    else { z += sz; t = tmz; tmz += tdz; nz = -sz; nx = ny = 0; }
  }
  return null;
}
