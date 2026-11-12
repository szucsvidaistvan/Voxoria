import { AIR, B } from './blocks';
import type { Biome } from './worldgen';
import { G, isCave } from './worldgen';
import { CH, CS, Y0, hash2 } from './noise';

/**
 * Érctelérek: a Minecraft 1.18+ érckonfigurációja (próbálkozás/chunk, telérméret, magasság-eloszlás, levegő-kitettség),
 * átszámolva a mi 64 blokk magas világunkra.
 *
 * A magasságokat a Minecraft Y skáláján adjuk meg (-64..319); a világunk ugyanilyen magas, `mapY` csak eltolja (Y0).
 * Egy telér nem egy blokk, hanem összefüggő csomó (kisebb 4–9, nagyobb 12–17 blokk).
 */

type Dist = 'uniform' | 'triangle';
interface OreFeature {
  ore: string;          // blokk neve
  size: number;         // telérméret (blokk)
  count: number;        // próbálkozás chunkonként (tört is lehet: ritka telér)
  dist: Dist;
  min: number;          // Minecraft Y
  max: number;
  discard: number;      // eldobás esélye, ha a blokk levegő mellett lenne
  biome?: Biome;        // csak ebben a biomban
}

const FEATURES: OreFeature[] = [
  // szén: felül sok (hegyek), lent kétszer is
  { ore: 'coal_ore', size: 17, count: 30, dist: 'uniform', min: 136, max: 319, discard: 0.5 },
  { ore: 'coal_ore', size: 17, count: 20, dist: 'triangle', min: 0, max: 192, discard: 0.5 },
  // vas: hegycsúcsokon nagy, középen és kis telérek
  { ore: 'iron_ore', size: 9, count: 90, dist: 'triangle', min: 80, max: 319, discard: 0 },
  { ore: 'iron_ore', size: 9, count: 10, dist: 'triangle', min: -24, max: 56, discard: 0 },
  { ore: 'iron_ore', size: 4, count: 10, dist: 'uniform', min: -64, max: 72, discard: 0 },
  // arany: mélyen, badlandsben a felszín közelében
  { ore: 'gold_ore', size: 9, count: 4, dist: 'triangle', min: -64, max: 32, discard: 0.5 },
  { ore: 'gold_ore', size: 9, count: 0.5, dist: 'uniform', min: -64, max: -48, discard: 0.5 },
  { ore: 'gold_ore', size: 9, count: 50, dist: 'uniform', min: 32, max: 256, discard: 0, biome: 'badlands' },
  // lazurit: csak teljesen eltemetve (0% levegő-kitettség)
  { ore: 'lapis_ore', size: 7, count: 2, dist: 'triangle', min: -32, max: 32, discard: 1 },
  { ore: 'lapis_ore', size: 7, count: 4, dist: 'uniform', min: -64, max: 64, discard: 1 },
  // gyémánt: apró (4), ritkán nagy (12), és eltemetett (8, nem érintkezhet levegővel)
  { ore: 'diamond_ore', size: 4, count: 7, dist: 'triangle', min: -144, max: 16, discard: 0.5 },
  { ore: 'diamond_ore', size: 12, count: 1 / 9, dist: 'triangle', min: -144, max: 16, discard: 0.7 },
  { ore: 'diamond_ore', size: 8, count: 4, dist: 'triangle', min: -144, max: 16, discard: 1 },
  // smaragd: csak hegyvidéken
  { ore: 'emerald_ore', size: 3, count: 100, dist: 'triangle', min: -16, max: 319, discard: 0, biome: 'mountains' },
];

const MC_MIN = -64;

/** Minecraft Y → a mi Y-unk (a világ ugyanolyan magas, csak eltolva) */
export const mapY = (mcY: number): number => Math.round(mcY) + Y0;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleY(r: () => number, f: OreFeature): number {
  if (f.dist === 'uniform') return f.min + r() * (f.max - f.min);
  return f.min + (r() + r()) * 0.5 * (f.max - f.min); // háromszög: két egyenletes átlaga, csúcs középen
}

const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

interface Target {
  cx: number; cz: number;
  get(x: number, y: number, z: number): number;
  set(x: number, y: number, z: number, id: number): void;
}

/**
 * Egy chunk érctelérei. A szomszédos chunkokban eredő telérek is behúznak, ezért a határon átnyúló erek épek maradnak;
 * a végeredmény csak a magtól és a koordinátáktól függ.
 */
export function placeOres(c: Target, seed: number, biomeAt: (wx: number, wz: number) => Biome): void {
  const ox = c.cx * CS, oz = c.cz * CS;
  const isStone = stoneLike();
  const oreIds = FEATURES.map((f) => G(f.ore, B.STONE));
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const sx = (c.cx + dx) * CS, sz = (c.cz + dz) * CS;
      FEATURES.forEach((f, fi) => {
        const r = rng(Math.imul(hash2(c.cx + dx, c.cz + dz, seed + 4000 + fi) * 4294967296 | 0, 1) ^ 0x9e3779b9);
        let n = Math.floor(f.count);
        if (r() < f.count - n) n++;
        for (let i = 0; i < n; i++) {
          const mcY = sampleY(r, f);
          const wx = sx + Math.floor(r() * CS), wz = sz + Math.floor(r() * CS);
          const rv = r;
          if (mcY < MC_MIN || mcY > 319) continue;
          if (f.biome && biomeAt(wx, wz) !== f.biome) continue;
          vein(c, ox, oz, wx, mapY(mcY), wz, f, oreIds[fi], isStone, rv, seed);
        }
      });
    }
  }
}

function stoneLike(): (id: number) => boolean {
  const ids = new Set<number>([B.STONE, G('granite'), G('diorite'), G('andesite')]);
  return (id) => ids.has(id);
}

function vein(
  c: Target, ox: number, oz: number, x0: number, y0: number, z0: number,
  f: OreFeature, id: number, isStone: (id: number) => boolean, r: () => number, seed: number,
): void {
  const cells: number[][] = [[x0, y0, z0]];
  const seen = new Set<string>([`${x0},${y0},${z0}`]);
  let guard = 0;
  while (cells.length < f.size && guard++ < f.size * 8) {
    const [x, y, z] = cells[Math.floor(r() * cells.length)];
    const d = FACES[Math.floor(r() * 6)];
    const nx = x + d[0], ny = y + d[1], nz = z + d[2], k = `${nx},${ny},${nz}`;
    if (seen.has(k)) continue;
    seen.add(k);
    cells.push([nx, ny, nz]);
  }
  for (const [x, y, z] of cells) {
    if (y < 1 || y >= CH - 1 || x < ox || x >= ox + CS || z < oz || z >= oz + CS) continue;
    const lx = x - ox, lz = z - oz;
    if (!isStone(c.get(lx, y, lz))) continue;
    if (f.discard > 0 && exposed(c, ox, oz, x, y, z, seed) && r() < f.discard) continue;
    c.set(lx, y, lz, id);
  }
}

/** Érintkezik-e levegővel (kihagyott barlangi üreg vagy nyílt felszín); a chunkon kívüli szomszédot a barlangzajból tippeljük */
function exposed(c: Target, ox: number, oz: number, x: number, y: number, z: number, seed: number): boolean {
  for (const d of FACES) {
    const nx = x + d[0], ny = y + d[1], nz = z + d[2];
    if (ny >= CH) return true;
    if (nx >= ox && nx < ox + CS && nz >= oz && nz < oz + CS) {
      if (c.get(nx - ox, ny, nz - oz) === AIR) return true;
    } else if (isCave(seed, nx, ny, nz)) return true;
  }
  return false;
}
