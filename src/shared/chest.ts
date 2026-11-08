import { BLOCKS } from './blocks';
import { ITEMS, maxStack } from './items';
import type { Stack } from './recipes';

export const CHEST_SLOTS = 27;

/** Egy láda tartalma (27 hely). A mentésben [id, n + kopás*1000, ...] párok. */
export class Chest {
  slots: (Stack | null)[] = new Array(CHEST_SLOTS).fill(null);

  contents(): Stack[] {
    return this.slots.filter((s): s is Stack => !!s);
  }

  get empty(): boolean {
    return this.slots.every((s) => !s);
  }

  /** Hozzáadás; visszaadja, hány darab nem fért el */
  add(id: number, n: number, d?: number): number {
    const max = maxStack(id);
    for (const s of this.slots) {
      if (n <= 0) break;
      if (s && s.id === id && s.n < max && !d) { const m = Math.min(max - s.n, n); s.n += m; n -= m; }
    }
    for (let i = 0; i < this.slots.length && n > 0; i++) {
      if (!this.slots[i]) {
        const m = Math.min(max, n);
        this.slots[i] = d ? { id, n: m, d } : { id, n: m };
        n -= m;
      }
    }
    return n;
  }

  toFlat(): number[] {
    return this.slots.flatMap((s) => (s ? [s.id, s.n + (s.d ?? 0) * 1000] : [0, 0]));
  }

  static fromFlat(flat: number[]): Chest {
    const c = new Chest();
    for (let i = 0; i < CHEST_SLOTS && i * 2 + 1 < flat.length; i++) {
      const id = flat[i * 2], raw = flat[i * 2 + 1];
      const n = raw % 1000, d = Math.floor(raw / 1000);
      if (id && n > 0 && (BLOCKS[id] || ITEMS[id])) c.slots[i] = { id, n: Math.min(n, maxStack(id)), ...(d ? { d } : {}) };
    }
    return c;
  }
}
