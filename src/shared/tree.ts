import { AIR, blockKey } from './blocks';
import { isReplaceable } from './fluids';
import type { World } from './world';

export interface TreeCell { x: number; y: number; z: number; id: number }
export interface Tree {
  /** a kibontott rönk és az összes hozzá kapcsolódó rönk felette (a törzs és az ágak) */
  logs: TreeCell[];
  /** a rönkök körüli lomb */
  leaves: TreeCell[];
}

const isLog = (id: number) => /(_log|_wood)$/.test(blockKey(id));
const isLeaf = (id: number) => /leaves$/.test(blockKey(id));
export const isLogBlock = isLog;

/** Ennyi rönk fölött már nem tekintjük fának (óvatosság: nagy rönkházak ne dőljenek ki egyben) */
const MAX_LOGS = 160;
/** Legalább ennyi lombblokk kell, hogy természetes fának számítson (az építményeket békén hagyjuk) */
const MIN_LEAVES = 4;

/**
 * A (x, y, z) rönkhöz tartozó fa: a rönk és az összes vele (oldalról és átlósan is) összefüggő, nála nem alacsonyabban
 * lévő rönk, valamint a lombjuk. Null, ha nem természetes fa (kevés lomb, túl nagy építmény).
 */
export function findTree(world: World, x: number, y: number, z: number): Tree | null {
  const first = world.getBlock(x, y, z);
  if (!isLog(first)) return null;
  const seen = new Set<string>([`${x},${y},${z}`]);
  const logs: TreeCell[] = [{ x, y, z, id: first }];
  for (let i = 0; i < logs.length; i++) {
    const c = logs[i];
    for (let dy = 0; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy && !dz) continue;
      const nx = c.x + dx, ny = c.y + dy, nz = c.z + dz;
      const k = `${nx},${ny},${nz}`;
      if (seen.has(k) || ny < y) continue;
      const id = world.getBlock(nx, ny, nz);
      if (!isLog(id)) continue;
      seen.add(k);
      logs.push({ x: nx, y: ny, z: nz, id });
      if (logs.length > MAX_LOGS) return null;
    }
  }
  const leaves: TreeCell[] = [];
  const lseen = new Set<string>();
  for (const c of logs) {
    for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const nx = c.x + dx, ny = c.y + dy, nz = c.z + dz;
      if (ny < y - 1) continue;
      const k = `${nx},${ny},${nz}`;
      if (lseen.has(k)) continue;
      const id = world.getBlock(nx, ny, nz);
      if (!isLeaf(id)) continue;
      lseen.add(k);
      leaves.push({ x: nx, y: ny, z: nz, id });
    }
  }
  return leaves.length >= MIN_LEAVES ? { logs, leaves } : null;
}

/** A ledőlés iránya (0 kelet, 1 dél, 2 nyugat, 3 észak): a játékostól elfelé */
export function fallDirection(treeX: number, treeZ: number, playerX: number, playerZ: number): number {
  const dx = treeX + 0.5 - playerX, dz = treeZ + 0.5 - playerZ;
  return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 0 : 2) : dz > 0 ? 1 : 3;
}
const STEP: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/**
 * Ahová egy rönk leérkezik: a törzs a ledőlés irányába fekszik, a töve mellett kezdve (a rönk magassága szerint
 * távolabb). Az y a talaj: az első szabad hely a kidöntés alsó rönkjének szintjén vagy fölötte (legfeljebb 3 blokkal),
 * lyuk fölött lejjebb. Null, ha nincs szabad hely (akkor a rönk a tövénél esik le).
 */
export function landingCell(world: World, base: { x: number; y: number; z: number }, dir: number, c: TreeCell): [number, number, number] | null {
  const [dx, dz] = STEP[dir];
  const h = c.y - base.y;
  // az irány szerinti és az arra merőleges eltolás a törzs tengelyéhez képest
  const along = (c.x - base.x) * dx + (c.z - base.z) * dz;
  const side = dir % 2 === 0 ? c.z - base.z : c.x - base.x;
  const lx = base.x + dx * (h + 1 + Math.max(0, along)) + (dir % 2 === 0 ? 0 : side);
  const lz = base.z + dz * (h + 1 + Math.max(0, along)) + (dir % 2 === 0 ? side : 0);
  let y = base.y;
  const free = (yy: number) => { const id = world.getBlock(lx, yy, lz); return id === AIR || isReplaceable(id); };
  for (let up = 0; up <= 3; up++) if (free(y + up) && !free(y + up - 1)) return [lx, y + up, lz];
  // lyuk a föld alatt: lejjebb esik, amíg talajt nem talál
  for (let yy = y - 1; yy >= Math.max(1, y - 12); yy--) if (free(yy) && !free(yy - 1)) return [lx, yy, lz];
  return null;
}
