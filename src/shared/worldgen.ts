import { AIR, B, blockId } from './blocks';
import type { Chunk } from './world';
import { CH, CS, SEA_LEVEL, fbm, lvl, hash2, valueNoise, valueNoise3 } from './noise';

/**
 * Biomok, felszín, fák és növények. A hőmérséklet és a csapadék két lassú zajból jön, ebből dől el a biom.
 * Minden döntés a koordinátákból és a magból számolódik, így egy világ mindig ugyanúgy generálódik.
 */

export type Biome =
  | 'plains' | 'forest' | 'dark_forest' | 'taiga' | 'desert' | 'savanna' | 'jungle' | 'swamp' | 'badlands' | 'mountains' | 'ocean';

const cache = new Map<string, number>();
/** Blokk azonosítója a neve alapján (a generált blokkoké csak a betöltés után ismert); ha nincs, a tartalék */
export function G(key: string, fallback: number = B.STONE): number {
  let v = cache.get(key);
  if (v === undefined) {
    const id = blockId(key);
    if (id === undefined) return fallback;
    cache.set(key, id);
    v = id;
  }
  return v;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** A zaj középre húzódik; ezzel széthúzzuk, hogy a szélső értékek is előforduljanak */
const stretch = (v: number) => clamp01((v - 0.5) * 2.4 + 0.5);

export const temperature = (seed: number, wx: number, wz: number) => stretch(fbm(wx / 170, wz / 170, seed + 300));
export const humidity = (seed: number, wx: number, wz: number) => stretch(fbm(wx / 140, wz / 140, seed + 400));

/** Hegyek: lassú zaj, ami a terepet helyenként megemeli */
export function mountainBump(seed: number, wx: number, wz: number): number {
  const m = valueNoise(wx / 120, wz / 120, seed + 700);
  return m > 0.64 ? (m - 0.64) * 100 : 0;
}

export function biomeAt(seed: number, wx: number, wz: number, h: number): Biome {
  if (h <= SEA_LEVEL) return 'ocean';
  if (h >= lvl(38)) return 'mountains';
  const t = temperature(seed, wx, wz), hu = humidity(seed, wx, wz);
  if (t < 0.25) return 'taiga';
  if (t > 0.66) {
    if (hu < 0.28) return 'badlands';
    if (hu < 0.45) return 'desert';
    if (hu < 0.65) return 'savanna';
    return 'jungle';
  }
  if (hu > 0.62) return h <= SEA_LEVEL + 7 ? 'swamp' : 'dark_forest';
  if (hu > 0.45) return 'forest';
  return 'plains';
}

/** A hideg tengerek teteje befagy */
export const freezes = (seed: number, wx: number, wz: number) => temperature(seed, wx, wz) < 0.22;

const BANDS = ['terracotta', 'orange_terracotta', 'terracotta', 'yellow_terracotta', 'brown_terracotta', 'white_terracotta', 'red_terracotta'];

/** Hány réteg a felszín alatt nem kő */
export function soilDepth(b: Biome): number {
  return b === 'badlands' ? 8 : b === 'desert' ? 5 : b === 'mountains' ? 2 : 3;
}

/** A felszín blokkja (y == h) vagy az alatta lévő réteg (y < h) */
export function surfaceOf(b: Biome, seed: number, wx: number, wz: number, y: number, h: number): number {
  const top = y === h;
  switch (b) {
    case 'ocean': {
      if (h < SEA_LEVEL - 1) {
        if (valueNoise(wx / 6, wz / 6, seed + 31) > 0.6) return B.GRAVEL;
        if (valueNoise(wx / 5, wz / 5, seed + 41) > 0.7) return G('clay', B.DIRT);
      }
      return top || y === h - 0 ? B.SAND : y < h - 1 ? B.SANDSTONE : B.SAND;
    }
    case 'desert': return y < h - 2 ? B.SANDSTONE : B.SAND;
    case 'badlands': return top ? G('red_sand', B.SAND) : G(BANDS[(y + 3) % BANDS.length], B.DIRT);
    case 'mountains': {
      if (h >= lvl(46)) return top ? G('snow_block', B.STONE) : B.STONE;
      if (valueNoise(wx / 8, wz / 8, seed + 55) > 0.62) return top ? B.GRAVEL : B.STONE;
      if (h >= lvl(42)) return B.STONE;
      return top ? B.GRASS : B.DIRT;
    }
    case 'taiga':
      if (valueNoise(wx / 7, wz / 7, seed + 61) > 0.6) return G('podzol', top ? B.GRASS : B.DIRT);
      return top ? B.GRASS : B.DIRT;
    case 'forest': case 'dark_forest':
      if (top && valueNoise(wx / 9, wz / 9, seed + 63) > 0.74) return G('coarse_dirt', B.DIRT);
      return top ? B.GRASS : B.DIRT;
    case 'swamp':
      if (valueNoise(wx / 5, wz / 5, seed + 65) > 0.72) return top ? G('clay', B.DIRT) : B.DIRT;
      return top ? B.GRASS : B.DIRT;
    case 'plains':
      if (top && valueNoise(wx / 12, wz / 12, seed + 67) > 0.83) return G('mycelium', B.GRASS);
      return top ? B.GRASS : B.DIRT;
    default: return top ? B.GRASS : B.DIRT;
  }
}

/** Kő helyett néha gránit, diorit vagy andezit foltok; mélyen lazurit, a hegyekben smaragd */
export function stoneVariant(seed: number, wx: number, y: number, wz: number, mountain: boolean): number {
  const n = valueNoise(wx / 9 + y * 0.13, wz / 9 - y * 0.17, seed + 810);
  if (n > 0.83) return G('granite');
  if (n < 0.16) return G('diorite');
  if (valueNoise(wx / 9 - y * 0.11, wz / 9 + y * 0.15, seed + 820) > 0.83) return G('andesite');
  const r = hash2(wx, wz + y * 40503, seed + 777);
  return B.STONE;
}

// ---------- fák ----------

type Wood = 'oak' | 'birch' | 'spruce' | 'jungle' | 'acacia' | 'dark_oak';

function put(c: Chunk, x: number, y: number, z: number, id: number, onlyAir: boolean): void {
  if (x < 0 || x >= CS || z < 0 || z >= CS || y < 0 || y >= CH) return;
  if (onlyAir && c.get(x, y, z) !== AIR) return;
  c.set(x, y, z, id);
}

function disc(c: Chunk, x: number, y: number, z: number, r: number, leaf: number, cut: boolean): void {
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (cut && r > 0 && Math.abs(dx) === r && Math.abs(dz) === r) continue;
      put(c, x + dx, y, z + dz, leaf, true);
    }
  }
}

/** Mekkora szabad sáv kell a fa körül a chunk szélétől (hogy ne lógjon át a szomszédba) */
export const TREE_MARGIN: Record<Wood, number> = { oak: 2, birch: 2, spruce: 2, jungle: 3, dark_oak: 3, acacia: 4 };

export function placeTreeOf(wood: Wood, c: Chunk, x: number, y: number, z: number, rnd: number): void {
  const log = G(`${wood}_log`, B.LOG), leaf = G(`${wood}_leaves`, B.LEAVES);
  switch (wood) {
    case 'oak': case 'birch': {
      const trunk = (wood === 'birch' ? 5 : 4) + Math.floor(rnd * 2);
      for (let i = 0; i < trunk; i++) put(c, x, y + i, z, log, false);
      const top = y + trunk;
      for (let dy = -2; dy <= 1; dy++) disc(c, x, top + dy, z, dy >= 0 ? 1 : 2, leaf, dy !== 0);
      break;
    }
    case 'spruce': {
      const trunk = 6 + Math.floor(rnd * 3);
      for (let i = 0; i < trunk; i++) put(c, x, y + i, z, log, false);
      const top = y + trunk;
      const radii = [0, 1, 1, 2, 2, 2, 2, 2];
      for (let k = 0; k < radii.length && top + 1 - k > y + 1; k++) disc(c, x, top + 1 - k, z, radii[k], leaf, radii[k] === 2);
      break;
    }
    case 'dark_oak': {
      const trunk = 5 + Math.floor(rnd * 2);
      for (let i = 0; i < trunk; i++) put(c, x, y + i, z, log, false);
      const top = y + trunk;
      disc(c, x, top - 2, z, 3, leaf, true);
      disc(c, x, top - 1, z, 3, leaf, true);
      disc(c, x, top, z, 2, leaf, true);
      disc(c, x, top + 1, z, 1, leaf, true);
      break;
    }
    case 'jungle': {
      const trunk = 8 + Math.floor(rnd * 4);
      for (let i = 0; i < trunk; i++) put(c, x, y + i, z, log, false);
      const top = y + trunk;
      disc(c, x, top - 2, z, 3, leaf, true);
      disc(c, x, top - 1, z, 3, leaf, true);
      disc(c, x, top, z, 2, leaf, true);
      disc(c, x, top + 1, z, 1, leaf, true);
      break;
    }
    case 'acacia': {
      const trunk = 4 + Math.floor(rnd * 2);
      const dir = Math.floor(rnd * 40) % 4;
      const dx = [1, -1, 0, 0][dir], dz = [0, 0, 1, -1][dir];
      let cx = x, cz = z, cy = y;
      for (let i = 0; i < trunk; i++) {
        put(c, cx, cy, cz, log, false);
        cy++;
        if (i >= trunk - 3 && i < trunk - 1) { cx += dx; cz += dz; }
      }
      cy--;
      disc(c, cx, cy + 1, cz, 2, leaf, true);
      disc(c, cx, cy, cz, 2, leaf, true);
      disc(c, cx, cy + 2, cz, 1, leaf, false);
      break;
    }
  }
}

// ---------- növények és fák elhelyezése egy oszlopon ----------

const FLOWERS_PLAINS = ['dandelion', 'poppy', 'azure_bluet', 'oxeye_daisy', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip'];
const FLOWERS_FOREST = ['dandelion', 'poppy', 'allium', 'oxeye_daisy'];

const pick = <T,>(arr: T[], r: number): T => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

function plant(c: Chunk, x: number, y: number, z: number, key: string): void {
  const id = G(key, AIR);
  if (id !== AIR && y < CH && c.get(x, y, z) === AIR) c.set(x, y, z, id);
}

/**
 * Egy szárazföldi oszlop díszítése: fák, virágok, fű, gombák, kaktusz, nád, hó.
 * (x, z) az oszlop helye a chunkban, y a felszín feletti első cella, `top` a felszín blokkja.
 */
export function decorate(c: Chunk, seed: number, b: Biome, x: number, z: number, wx: number, wz: number, y: number, top: number): void {
  const r = hash2(wx, wz, seed + 99);   // fa
  const r2 = hash2(wx, wz, seed + 123); // növény
  const r3 = hash2(wx, wz, seed + 7);   // változatosság

  let wood: Wood | null = null;
  switch (b) {
    case 'plains': if (r < 0.002) wood = 'oak'; break;
    case 'forest': if (r < 0.032) wood = r3 < 0.4 ? 'birch' : 'oak'; break;
    case 'dark_forest': if (r < 0.045) wood = 'dark_oak'; break;
    case 'taiga': if (r < 0.03) wood = 'spruce'; break;
    case 'savanna': if (r < 0.006) wood = 'acacia'; break;
    case 'jungle': if (r < 0.05) wood = 'jungle'; break;
    case 'swamp': if (r < 0.012) wood = 'oak'; break;
    case 'mountains': if (r < 0.004 && y < lvl(44)) wood = 'spruce'; break;
  }
  if (wood) {
    const m = TREE_MARGIN[wood];
    if (x >= m && x <= CS - 1 - m && z >= m && z <= CS - 1 - m && top === B.GRASS) {
      placeTreeOf(wood, c, x, y, z, r3);
      return;
    }
  }

  if (top === G('clay', -1) || top === B.GRAVEL || top === G('snow_block', -1) || top === B.STONE) return;
  switch (b) {
    case 'plains':
      if (r2 < 0.14) plant(c, x, y, z, 'short_grass');
      else if (r2 < 0.17) plant(c, x, y, z, pick(FLOWERS_PLAINS, r3));
      else if (r2 < 0.1715) plant(c, x, y, z, 'pumpkin');
      break;
    case 'forest':
      if (r2 < 0.08) plant(c, x, y, z, 'short_grass');
      else if (r2 < 0.095) plant(c, x, y, z, pick(FLOWERS_FOREST, r3));
      else if (r2 < 0.115) plant(c, x, y, z, 'fern');
      else if (r2 < 0.118) plant(c, x, y, z, r3 < 0.5 ? 'brown_mushroom' : 'red_mushroom');
      break;
    case 'dark_forest':
      if (r2 < 0.04) plant(c, x, y, z, 'short_grass');
      else if (r2 < 0.07) plant(c, x, y, z, 'fern');
      else if (r2 < 0.085) plant(c, x, y, z, r3 < 0.5 ? 'brown_mushroom' : 'red_mushroom');
      break;
    case 'taiga':
      if (r2 < 0.06) plant(c, x, y, z, 'fern');
      else if (r2 < 0.09) plant(c, x, y, z, 'short_grass');
      // a fák alatt és a talaj felett hóréteg
      if (c.get(x, y, z) === AIR) plant(c, x, y, z, 'snow');
      break;
    case 'savanna':
      if (r2 < 0.2) plant(c, x, y, z, 'short_grass');
      else if (r2 < 0.205) plant(c, x, y, z, 'dandelion');
      break;
    case 'jungle':
      if (r2 < 0.1) plant(c, x, y, z, 'short_grass');
      else if (r2 < 0.18) plant(c, x, y, z, 'fern');
      else if (r2 < 0.1825) plant(c, x, y, z, 'melon');
      break;
    case 'swamp':
      if (r2 < 0.08) plant(c, x, y, z, 'short_grass');
      else if (r2 < 0.1) plant(c, x, y, z, 'blue_orchid');
      else if (r2 < 0.11) plant(c, x, y, z, r3 < 0.5 ? 'brown_mushroom' : 'red_mushroom');
      break;
    case 'desert':
      if (r2 < 0.01) plant(c, x, y, z, 'dead_bush');
      else if (r2 < 0.018) for (let i = 0, n = 1 + Math.floor(r3 * 3); i < n; i++) plant(c, x, y + i, z, 'cactus');
      break;
    case 'badlands':
      if (r2 < 0.01) plant(c, x, y, z, 'dead_bush');
      break;
    case 'mountains':
      if (r2 < 0.04 && top === B.GRASS) plant(c, x, y, z, 'short_grass');
      break;
  }
}

/** Nád a víz mellett: a tengerszint feletti első sáv, ha a szomszéd oszlop már víz */
let caneSoil: Set<number> | undefined;
/** Amin cukornád megáll: homok, föld, fű és rokonaik */
const CANE_SOIL = (): Set<number> =>
  (caneSoil ??= new Set([B.SAND, B.DIRT, B.GRASS, G('red_sand', B.SAND), G('coarse_dirt', B.DIRT), G('podzol', B.DIRT), G('mycelium', B.DIRT), G('clay', B.DIRT)]));

export function sugarCane(c: Chunk, seed: number, x: number, z: number, wx: number, wz: number, y: number, nearWater: boolean): void {
  if (!nearWater || hash2(wx, wz, seed + 131) > 0.18) return;
  // csak üres cellába, megfelelő talajra: ha a fű/virág már elfoglalta a helyet, nem nő rajta (és fölötte sem) cukornád
  if (c.get(x, y, z) !== AIR || !CANE_SOIL().has(c.get(x, y - 1, z))) return;
  const n = 1 + Math.floor(hash2(wx, wz, seed + 132) * 3);
  for (let i = 0; i < n; i++) plant(c, x, y + i, z, 'sugar_cane');
}

// ---------- barlangok ----------

/**
 * Barlang-e a (wx, y, wz) pont? Két 3D zaj közel nulla (0,5 körüli) sávjának metszete adja a kanyargó „spagetti" járatot,
 * egy lassabb zaj nagy üregeket nyit. Mélyen (y ≤ 7) a barlang aljára láva kerül, lásd `caveFill`.
 */
export function isCave(seed: number, wx: number, y: number, wz: number): boolean {
  if (y < 2) return false;
  const a = valueNoise3(wx / 14, y / 9, wz / 14, seed + 910) - 0.5;
  const b = valueNoise3(wx / 14, y / 9, wz / 14, seed + 920) - 0.5;
  const w = 0.026 + 0.018 * Math.min(1, y / 20); // lent szűkebb, feljebb tágasabb járat
  if (a * a + b * b < w * w) return true;
  // nagy üregek: ritka, lapos kamrák
  return valueNoise3(wx / 22, y / 7, wz / 22, seed + 930) > 0.82 && valueNoise3(wx / 9, y / 5, wz / 9, seed + 940) > 0.5;
}

/** Felszíni bejárat: a kő feletti talajréteg is kivágható ott, ahol ez a lassú zaj magas */
export function caveEntrance(seed: number, wx: number, wz: number): boolean {
  return valueNoise(wx / 18, wz / 18, seed + 950) > 0.84;
}

/** Mit tegyünk a kivájt helyre: mélyen láva, különben levegő */
export function caveFill(y: number): number {
  return y <= 10 ? B.LAVA : AIR;
}
