import { AIR, B, LIGHT, fluidKind } from './blocks';
import { CH, CS, SEA_LEVEL, fbm, hash2, valueNoise } from './noise';
import { G, biomeAt, caveEntrance, caveFill, decorate, isCave, freezes, mountainBump, soilDepth, stoneVariant, sugarCane, surfaceOf, temperature } from './worldgen';

export { CS, CH, SEA_LEVEL };

export class Chunk {
  /** két bájtos blokkazonosítók (65535 különböző blokk) */
  data = new Uint16Array(CS * CH * CS);
  /** a világító blokkok helyei (az `data` indexei): ebből tudja a fényszámítás, hol kell kezdeni */
  emit = new Set<number>();
  constructor(public cx: number, public cz: number) {}
  get(x: number, y: number, z: number): number {
    return this.data[(y * CS + z) * CS + x];
  }
  set(x: number, y: number, z: number, id: number): void {
    this.setIndex((y * CS + z) * CS + x, id);
  }
  setIndex(i: number, id: number): void {
    this.data[i] = id;
    if (LIGHT[id]) this.emit.add(i);
    else if (this.emit.size) this.emit.delete(i);
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
  /** [x, y, z, ...]: a most betöltött chunkokban lévő folyadékok és tűz, amiket a szimulációnak ütemezni kell */
  dynamic: number[] = [];

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

  /** Van-e világító blokk a (wx, wz) körüli 3x3 chunkban? (ha nincs, a fény számítása kihagyható) */
  hasEmittersNear(wx: number, wz: number): boolean {
    const cx = Math.floor(wx / CS), cz = Math.floor(wz / CS);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (this.getChunk(cx + dx, cz + dz)?.emit.size) return true;
    }
    return false;
  }

  heightAt(wx: number, wz: number): number {
    return Math.floor(18 + fbm(wx / 48, wz / 48, this.seed) * 28 + mountainBump(this.seed, wx, wz));
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
    const seed = this.seed;
    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        const wx = ox + x, wz = oz + z;
        const h = Math.min(this.heightAt(wx, wz), CH - 12);
        const biome = biomeAt(seed, wx, wz, h);
        const depth = soilDepth(biome);
        const mountain = biome === 'mountains';
        // barlang a tenger alatt is lehet (ott vízzel telik meg); bejáratnál a talajon át is kivág
        const caveTop = h < 6 ? -1 : caveEntrance(seed, wx, wz) ? h - 1 : h - depth - 3;
        const flooded = h < SEA_LEVEL;
        for (let y = 0; y <= h; y++) {
          let id: number;
          if (y === 0) id = B.BEDROCK;
          else if (y <= caveTop && isCave(seed, wx, y, wz)) id = caveFill(y, flooded);
          else if (y < h - depth) {
            id = this.stoneOrOre(wx, y, wz);
            if (id === B.STONE) id = stoneVariant(seed, wx, y, wz, mountain);
          } else id = surfaceOf(biome, seed, wx, wz, y, h);
          c.set(x, y, z, id);
        }
        // tenger és tavak: a tengerszint alatti oszlopokat víz tölti fel (hidegben befagy a teteje)
        for (let y = h + 1; y <= SEA_LEVEL; y++) c.set(x, y, z, B.WATER);
        if (h < SEA_LEVEL) {
          if (freezes(seed, wx, wz)) c.set(x, SEA_LEVEL, z, G('ice', B.WATER));
          else if (biome === 'ocean' && h < SEA_LEVEL - 1 && this.oceanFloor(c, x, z, wx, wz, h)) { /* tengerfenék díszei */ }
          else if (biome === 'ocean' && h >= SEA_LEVEL - 2 && hash2(wx, wz, seed + 141) < 0.06 && temperature(seed, wx, wz) > 0.4) {
            c.set(x, SEA_LEVEL + 1, z, G('lily_pad', AIR));
          }
        } else if (biome !== 'ocean') {
          const top = c.get(x, h, z);
          if (top !== AIR) decorate(c, seed, biome, x, z, wx, wz, h + 1, top);
          if (h === SEA_LEVEL + 1 && (biome === 'plains' || biome === 'forest' || biome === 'swamp' || biome === 'jungle')) {
            const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.heightAt(wx + dx, wz + dz) <= SEA_LEVEL);
            sugarCane(c, seed, x, z, wx, wz, h + 1, near);
          }
        } else if (h === SEA_LEVEL) {
          // a part menti homokon nád
          const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.heightAt(wx + dx, wz + dz) < SEA_LEVEL);
          sugarCane(c, seed, x, z, wx, wz, h + 1, near);
        }
      }
    }
    const edits = this.edits.get(World.key(c.cx, c.cz));
    if (edits) {
      for (const [i, id] of edits) {
        c.setIndex(i, id);
        if (id === B.FIRE || fluidKind(id) !== 0) {
          this.dynamic.push(ox + (i % CS), Math.floor(i / (CS * CS)), oz + (Math.floor(i / CS) % CS));
        }
      }
    }
  }

  /** Kő, vagy ritkán érc. Minél mélyebben vagyunk, annál értékesebb érc fordul elő (egy blokkos telérek). */
  /** Tengerfenék: tengeri fű, korallblokkok és szivacs foltokban; igaz, ha tett valamit */
  private oceanFloor(c: Chunk, x: number, z: number, wx: number, wz: number, h: number): boolean {
    const r = hash2(wx, wz, this.seed + 733);
    const warm = temperature(this.seed, wx, wz) > 0.4;
    if (r < 0.10) { c.set(x, h + 1, z, G('seagrass', B.WATER)); return true; }
    if (warm && r > 0.985) {
      const corals = ['tube', 'brain', 'bubble', 'fire', 'horn'];
      c.set(x, h, z, G(`${corals[Math.floor(hash2(wx, wz, this.seed + 734) * 5)]}_coral_block`, B.SAND));
      return true;
    }
    if (r > 0.9965) { c.set(x, h, z, G('wet_sponge', B.SAND)); return true; }
    return false;
  }

  private stoneOrOre(wx: number, y: number, wz: number): number {
    const r = hash2(wx, wz + y * 40503, this.seed + 500);
    if (y < 10 && r < 0.0015) return B.DIAMOND_ORE;
    // mélyen: obszidián, magma és kvarcér (a kvarc nyersanyag a kvarc blokkokhoz)
    if (y < 12 && r > 0.9985) return B.OBSIDIAN;
    if (y < 14 && r > 0.996 && r <= 0.9985) return G('magma');
    if (y < 24 && r > 0.992 && r <= 0.996) return G('quartz_block');
    if (y < 18 && r < 0.004) return B.GOLD_ORE;
    if (y < 30 && r < 0.010) return B.IRON_ORE;
    if (r < 0.020) return B.COAL_ORE;
    return B.STONE;
  }
}
