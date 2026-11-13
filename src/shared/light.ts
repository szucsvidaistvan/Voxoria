import { LIGHT, isOpaque } from './blocks';
import { CH, CS, type Chunk, type World } from './world';

/**
 * Fényszámítás: két csatorna, mindkettő 0..15.
 *  - napfény: ahol az oszlop fölött nincs átlátszatlan blokk, ott 15; barlangba, tető alá oldalról szivárog be
 *  - blokkfény: a világító blokkoktól (fáklya, láva, tűz, izzókő) terjed, blokkonként eggyel gyengül
 * A számítás egy chunkra és a nyolc szomszédjára készül (a fény legfeljebb 14 blokkra jut el), és csak a meshelés
 * idejére érvényes: a belső tömbök újrahasznosulnak.
 */
export const MAX_LIGHT = 15;
// az indexelés biteltolásokat használ: a chunk szélessége 16 kell legyen
if (CS !== 16) throw new Error('light.ts: CS must be 16');

const W = CS * 3; // a régió szélessége blokkban
const skyF = new Uint8Array(W * CH * W);
const blkF = new Uint8Array(W * CH * W);
/** oszloponként az első szabad (nem átlátszatlan fölötti) magasság; ettől felfelé szabad az ég */
const top = new Int16Array(W * W);
const buckets: number[][] = Array.from({ length: MAX_LIGHT + 1 }, () => []);

const opq = new Int8Array(65536); // 0: még nem néztük, 1: átlátszó, 2: átlátszatlan
function opaque(id: number): boolean {
  let v = opq[id];
  if (!v) opq[id] = v = isOpaque(id) ? 2 : 1;
  return v === 2;
}
/** A blokkok újraregisztrálása után kell hívni (a gyorsítótár kiürítése) */
export const resetLightCache = (): void => { opq.fill(0); };

/** A fényerő -> a rajzolásnál használt szorzó (gamma-szerű, hogy a távoli fény ne tűnjön el túl hamar) */
export const SKY_CURVE: number[] = Array.from({ length: 16 }, (_, l) => Math.pow(l / MAX_LIGHT, 1.5));
export const BLOCK_CURVE: number[] = Array.from({ length: 16 }, (_, l) => (l ? Math.pow(l / MAX_LIGHT, 1.6) : 0));

export interface LightField {
  /** (napfény << 4) | blokkfény a világkoordinátás cellában */
  get(wx: number, y: number, wz: number): number;
}

/** Szinten haladó szétterjedés: a nagyobb szintektől a kisebbek felé, így minden cella egyszer dolgozódik fel */
function propagate(f: Uint8Array, sky: boolean, chunks: (Chunk | undefined)[], from: number): void {
  for (let L = from; L >= 2; L--) {
    const list = buckets[L];
    const nl = L - 1;
    for (let q = 0; q < list.length; q++) {
      const idx = list[q];
      if (f[idx] !== L) continue; // közben nagyobb értéket kapott
      const rx = idx % W;
      const t = (idx - rx) / W;
      const rz = t % W;
      const y = (t - rz) / W;
      for (let k = 0; k < 6; k++) {
        let nx = rx, ny = y, nz = rz;
        if (k === 0) nx--; else if (k === 1) nx++; else if (k === 2) nz--; else if (k === 3) nz++; else if (k === 4) ny--; else ny++;
        if (nx < 0 || nx >= W || nz < 0 || nz >= W || ny < 0 || ny >= CH) continue;
        const ni = (ny * W + nz) * W + nx;
        if (f[ni] >= nl) continue;
        if (sky && ny >= top[nz * W + nx]) continue; // szabad ég: a napfény ott eleve 15
        const c = chunks[(nz >> 4) * 3 + (nx >> 4)];
        if (!c || opaque(c.data[(ny << 8) | ((nz & 15) << 4) | (nx & 15)])) continue;
        f[ni] = nl;
        buckets[nl].push(ni);
      }
    }
    list.length = 0;
  }
}

/** A (cx, cz) chunk és szomszédai fénye. A visszaadott mező csak a következő hívásig érvényes. */
export function computeLight(world: World, cx: number, cz: number): LightField {
  const chunks: (Chunk | undefined)[] = [];
  let emitters = false;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const c = world.getChunk(cx + dx, cz + dz);
    chunks.push(c);
    if (c && c.emit.size) emitters = true;
  }
  for (const b of buckets) b.length = 0;

  // az ég felé szabad oszlopok: a legfelső átlátszatlan blokk fölött szabad az ég
  for (let rz = 0; rz < W; rz++) {
    for (let rx = 0; rx < W; rx++) {
      const c = chunks[(rz >> 4) * 3 + (rx >> 4)];
      if (!c) { top[rz * W + rx] = CH; continue; } // betöltetlen oszlop: nem forrása a napfénynek
      const base = ((rz & 15) << 4) | (rx & 15);
      let y = Math.min(CH - 1, c.top);
      while (y >= 0 && !opaque(c.data[(y << 8) | base])) y--;
      top[rz * W + rx] = y + 1;
    }
  }

  // napfény: a szabad oszlopok oldalán lévő, fedett üres cellák kapják az első fényt (14)
  skyF.fill(0);
  for (let rz = 0; rz < W; rz++) {
    for (let rx = 0; rx < W; rx++) {
      const tc = top[rz * W + rx];
      if (tc >= CH) continue;
      for (let k = 0; k < 4; k++) {
        const nx = k === 0 ? rx - 1 : k === 1 ? rx + 1 : rx;
        const nz = k === 2 ? rz - 1 : k === 3 ? rz + 1 : rz;
        if (nx < 0 || nx >= W || nz < 0 || nz >= W) continue;
        const tn = top[nz * W + nx];
        if (tn <= tc) continue;
        const c = chunks[(nz >> 4) * 3 + (nx >> 4)];
        if (!c) continue;
        const base = ((nz & 15) << 4) | (nx & 15);
        for (let y = tc; y < tn && y < CH; y++) {
          if (opaque(c.data[(y << 8) | base])) continue;
          const ni = (y * W + nz) * W + nx;
          if (skyF[ni] < MAX_LIGHT - 1) { skyF[ni] = MAX_LIGHT - 1; buckets[MAX_LIGHT - 1].push(ni); }
        }
      }
    }
  }
  propagate(skyF, true, chunks, MAX_LIGHT - 1);

  // blokkfény a világító blokkoktól (ha van a környéken)
  if (emitters) {
    blkF.fill(0);
    for (let k = 0; k < 9; k++) {
      const c = chunks[k];
      if (!c) continue;
      const ox = (k % 3) * CS, oz = Math.floor(k / 3) * CS;
      for (const i of c.emit) {
        const lvl = LIGHT[c.data[i]];
        if (!lvl) continue;
        const idx = ((i >> 8) * W + oz + ((i >> 4) & 15)) * W + ox + (i & 15);
        if (lvl > blkF[idx]) { blkF[idx] = lvl; buckets[lvl].push(idx); }
      }
    }
    propagate(blkF, false, chunks, MAX_LIGHT);
  }

  const bx = (cx - 1) * CS, bz = (cz - 1) * CS;
  return {
    get(wx, y, wz) {
      if (y >= CH) return MAX_LIGHT << 4;
      const rx = wx - bx, rz = wz - bz;
      if (y < 0 || rx < 0 || rx >= W || rz < 0 || rz >= W) return 0;
      const i = (y * W + rz) * W + rx;
      const s = y >= top[rz * W + rx] ? MAX_LIGHT : skyF[i];
      return (s << 4) | (emitters ? blkF[i] : 0);
    },
  };
}
