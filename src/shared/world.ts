import { AIR, B } from './blocks';

export const CS = 16; // chunk szélesség (X és Z)
export const CH = 64; // világ magassága
export const SEA_LEVEL = 28; // a terep kb. 17%-át önti el a víz

function hash2(x: number, z: number, s: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, z: number, s: number): number {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = smooth(x - x0), fz = smooth(z - z0);
  const a = hash2(x0, z0, s), b = hash2(x0 + 1, z0, s);
  const c = hash2(x0, z0 + 1, s), d = hash2(x0 + 1, z0 + 1, s);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

function fbm(x: number, z: number, s: number): number {
  let v = 0, amp = 1, freq = 1, sum = 0;
  for (let i = 0; i < 4; i++) {
    v += valueNoise(x * freq, z * freq, s + i) * amp;
    sum += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return v / sum;
}

export class Chunk {
  data = new Uint8Array(CS * CH * CS);
  constructor(public cx: number, public cz: number) {}
  get(x: number, y: number, z: number): number {
    return this.data[(y * CS + z) * CS + x];
  }
  set(x: number, y: number, z: number, id: number): void {
    this.data[(y * CS + z) * CS + x] = id;
  }
}

/**
 * A világ logikája. Nem függ a rendereléstől (nincs benne three.js),
 * így később a szerver is ugyanezt használhatja.
 */
export class World {
  chunks = new Map<string, Chunk>();
  /** chunk kulcs -> (helyi index -> blokk id): a játékos módosításai */
  private edits = new Map<string, Map<number, number>>();

  constructor(public seed: number) {}

  static key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(World.key(cx, cz));
  }

  ensureChunk(cx: number, cz: number): Chunk {
    let c = this.getChunk(cx, cz);
    if (!c) {
      c = new Chunk(cx, cz);
      this.generate(c);
      this.chunks.set(World.key(cx, cz), c);
    }
    return c;
  }

  isLoaded(wx: number, wz: number): boolean {
    return this.chunks.has(World.key(Math.floor(wx / CS), Math.floor(wz / CS)));
  }

  heightAt(wx: number, wz: number): number {
    return Math.floor(18 + fbm(wx / 48, wz / 48, this.seed) * 28);
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return B.STONE;
    if (y >= CH) return AIR;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.getChunk(cx, cz);
    if (!c) return AIR;
    return c.get(x - cx * CS, y, z - cz * CS);
  }

  /** Blokk átírása és a módosítás megjegyzése (mentéshez). Igaz, ha sikerült. */
  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (y < 0 || y >= CH) return false;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.getChunk(cx, cz);
    if (!c) return false;
    const lx = x - cx * CS, lz = z - cz * CS;
    c.set(lx, y, lz, id);
    this.recordEdit(cx, cz, (y * CS + lz) * CS + lx, id);
    return true;
  }

  private recordEdit(cx: number, cz: number, index: number, id: number): void {
    const k = World.key(cx, cz);
    let m = this.edits.get(k);
    if (!m) this.edits.set(k, (m = new Map()));
    m.set(index, id);
  }

  /** [x, y, z, id, x, y, z, id, ...] */
  exportEdits(): number[] {
    const out: number[] = [];
    for (const [k, m] of this.edits) {
      const [cx, cz] = k.split(',').map(Number);
      for (const [i, id] of m) {
        out.push(cx * CS + (i % CS), Math.floor(i / (CS * CS)), cz * CS + (Math.floor(i / CS) % CS), id);
      }
    }
    return out;
  }

  importEdits(flat: number[]): void {
    for (let i = 0; i + 3 < flat.length; i += 4) {
      const x = flat[i], y = flat[i + 1], z = flat[i + 2], id = flat[i + 3];
      const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
      this.recordEdit(cx, cz, (y * CS + (z - cz * CS)) * CS + (x - cx * CS), id);
    }
  }

  private generate(c: Chunk): void {
    const ox = c.cx * CS, oz = c.cz * CS;
    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        const wx = ox + x, wz = oz + z;
        const h = Math.min(this.heightAt(wx, wz), CH - 12);
        const beach = h <= SEA_LEVEL;
        for (let y = 0; y <= h; y++) {
          let id: number;
          if (y < h - 3) id = B.STONE;
          else if (y < h) id = beach ? B.SAND : B.DIRT;
          else id = beach ? B.SAND : B.GRASS;
          c.set(x, y, z, id);
        }
        // tenger és tavak: a tengerszint alatti oszlopokat víz tölti fel
        for (let y = h + 1; y <= SEA_LEVEL; y++) c.set(x, y, z, B.WATER);
        // fák: csak a chunk belsejében, hogy ne lógjanak át a szomszédba
        if (!beach && x >= 2 && x <= 13 && z >= 2 && z <= 13 && hash2(wx, wz, this.seed + 99) < 0.012) {
          this.placeTree(c, x, h + 1, z, 4 + Math.floor(hash2(wx, wz, this.seed + 7) * 2));
        }
      }
    }
    const edits = this.edits.get(World.key(c.cx, c.cz));
    if (edits) for (const [i, id] of edits) c.data[i] = id;
  }

  private placeTree(c: Chunk, x: number, y: number, z: number, trunk: number): void {
    for (let i = 0; i < trunk; i++) c.set(x, y + i, z, B.LOG);
    const top = y + trunk;
    for (let dy = -2; dy <= 1; dy++) {
      const r = dy >= 0 ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r && dy !== 0) continue;
          const yy = top + dy;
          if (yy < CH && c.get(x + dx, yy, z + dz) === AIR) c.set(x + dx, yy, z + dz, B.LEAVES);
        }
      }
    }
  }
}
