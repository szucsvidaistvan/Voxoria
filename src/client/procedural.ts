import type { Recipe } from '../shared/catalog';

/** A csempék 16×16 logikai pixelből állnak, ezt nagyítjuk a csempe méretére */
export const GRID = 16;

/** Csak azt kell tudnia, amit a vászon (és a tesztekben egy hamis vászon) tud */
export interface Painter {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/** Determinisztikus hash: (x, y, mag) -> 0..1 */
function h(x: number, y: number, s: number): number {
  let v = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 1274126177, 2246822519) ^ Math.imul(s + 3266489917, 1442695041);
  v = Math.imul(v ^ (v >>> 13), 1274126177);
  v ^= v >>> 16;
  return (v >>> 0) / 4294967296;
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** Egy szöveges mag a textúra nevéből, hogy minden csempe más mintázatú legyen */
export function seedOf(name: string): number {
  let s = 7;
  for (let i = 0; i < name.length; i++) s = Math.imul(s ^ name.charCodeAt(i), 16777619);
  return s >>> 0;
}

type Px = [number, number, number, number]; // r, g, b, alfa (0..1)

function pixel(r: Recipe, px: number, py: number, seed: number): Px {
  const [cr, cg, cb] = r.c;
  const amp = r.amp ?? 16;
  const n = (h(px, py, seed) - 0.5) * amp; // színingadozás
  const shade = (k: number): Px => [cr + k, cg + k, cb + k, 1];
  const c2 = r.c2 ?? r.c;

  switch (r.kind) {
    case 'noise':
      return shade(n);

    case 'cobble': {
      // szabálytalan kövek: 4×4-es mezők saját árnyalattal és sötét repedésekkel
      const cell = h(px >> 2, py >> 2, seed + 1);
      const edge = (px % 4 === 0 || py % 4 === 0) && h(px, py, seed + 2) > 0.3;
      return shade((cell - 0.5) * 30 + n * 0.6 - (edge ? 34 : 0));
    }

    case 'bricks': {
      const row = py >> 2;
      const off = (row & 1) * 4;
      const mortar = py % 4 === 3 || (px + off) % 8 === 7;
      if (mortar) return [c2[0], c2[1], c2[2], 1];
      return shade(n * 0.7 + (h(px >> 3, row, seed + 3) - 0.5) * 14);
    }

    case 'planks': {
      const line = py % 4 === 3;
      const joint = (px + (py >> 2) * 5) % 11 === 0;
      return shade(line ? -30 : n * 0.5 + (joint ? -14 : 0));
    }

    case 'log_side':
      return shade((h(px, 0, seed + 3) - 0.5) * 34 + n * 0.4);

    case 'log_top': {
      const d = Math.max(Math.abs(px - 7.5), Math.abs(py - 7.5));
      if (d > 6.5) return [c2[0] + n, c2[1] + n, c2[2] + n, 1]; // kéreg
      return shade(Math.floor(d) % 2 ? -22 : n * 0.5);
    }

    case 'leaves':
      if (h(px, py, seed + 4) > 0.84) return [0, 0, 0, 0]; // lyuk a lombban
      return shade(n - 10);

    case 'ore': {
      let blob = false;
      for (let k = 0; k < 4 && !blob; k++) {
        const bx = 2 + h(k, 1, seed) * 12, by = 2 + h(k, 2, seed) * 12;
        const d2 = (px - bx) ** 2 + (py - by) ** 2;
        blob = d2 < 3.4 && h(px, py, seed + 5) > 0.2;
      }
      if (blob) return [c2[0] + n * 0.5, c2[1] + n * 0.5, c2[2] + n * 0.5, 1];
      return shade((h(px, py, 99) - 0.5) * 18); // a kő mintája minden ércnél ugyanaz
    }

    case 'glass': {
      const border = px === 0 || py === 0 || px === GRID - 1 || py === GRID - 1;
      if (border) return [cr, cg, cb, 0.95];
      if (px === py && px > 2 && px < 7) return [255, 255, 255, 0.6];
      if (px === py + 1 && px > 3 && px < 6) return [255, 255, 255, 0.4];
      return [0, 0, 0, 0];
    }

    case 'tiles': {
      const line = px % 8 === 0 || py % 8 === 0;
      const hi = px % 8 === 1 && py % 8 === 1;
      return shade(line ? -34 : hi ? 22 : n * 0.4);
    }

    case 'grass_side': {
      const top = 3 + (h(px, 7, seed) > 0.55 ? 1 : 0);
      if (py < top) return [c2[0] + n, c2[1] + n, c2[2] + n, 1];
      return shade(n);
    }

    case 'bookshelf': {
      if (py < 3 || py >= 13) return shade(n * 0.5 + (py % 4 === 3 ? -24 : 0));
      if (py === 8) return shade(-40);
      const hue = h(px >> 1, py >> 3, seed + 6);
      const book: [number, number, number] =
        hue < 0.25 ? [150, 50, 50] : hue < 0.5 ? [60, 90, 150] : hue < 0.75 ? [60, 120, 70] : [150, 120, 60];
      const k = (h(px, py, seed) - 0.5) * 20;
      return [book[0] + k, book[1] + k, book[2] + k, 1];
    }

    case 'water': {
      const w = Math.sin(px * 1.7 + py * 0.9) + Math.cos(py * 1.3 - px * 0.6);
      return shade(w > 1.1 ? 24 : w < -1.1 ? -22 : 0);
    }
  }
}

/** Egy csempe kirajzolása a (x, y) bal felső sarokba, `tile` képpont oldalhosszal */
export function drawTile(ctx: Painter, x: number, y: number, tile: number, name: string, r: Recipe): void {
  const seed = seedOf(name);
  const s = tile / GRID;
  for (let py = 0; py < GRID; py++) {
    for (let px = 0; px < GRID; px++) {
      const [pr, pg, pb, pa] = pixel(r, px, py, seed);
      if (pa <= 0) continue; // átlátszó: a vászon üresen marad
      ctx.fillStyle = `rgba(${clamp(pr)},${clamp(pg)},${clamp(pb)},${pa})`;
      ctx.fillRect(x + px * s, y + py * s, s, s);
    }
  }
}
