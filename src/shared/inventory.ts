import { ITEMS, armorOf, isItem, itemName, maxStack, ARMOR_SLOTS } from './items';
import { matchRecipe, type Stack } from './recipes';
import { BLOCKS } from './blocks';

export const HOTBAR_SIZE = 9;
export const TOTAL_SLOTS = 36;

/** A játékos tárolója: az első 9 hely a hotbar, a többi 27 a hátizsák */
export class Inventory {
  slots: (Stack | null)[] = new Array(TOTAL_SLOTS).fill(null);
  /** a viselt páncél: sisak, mellvért, nadrág, csizma */
  armor: (Stack | null)[] = [null, null, null, null];

  /** a páncél mentése: [id, kopás, ...] (0, 0: üres) */
  armorFlat(): number[] { return this.armor.flatMap((s) => (s ? [s.id, s.d ?? 0] : [0, 0])); }
  setArmorFlat(flat: number[] | undefined): void {
    this.armor = [0, 1, 2, 3].map((i) => {
      const id = flat?.[i * 2] ?? 0, d = flat?.[i * 2 + 1] ?? 0;
      return id && armorOf(id)?.slot === i ? { id, n: 1, ...(d ? { d } : {}) } : null;
    });
  }

  /** Hozzáadás; visszaadja, hány darab nem fért el. A `d` az eszköz kopása (csak az 1-es stackeknél). */
  add(id: number, n: number, d?: number): number {
    const max = maxStack(id);
    for (const s of this.slots) {
      if (n <= 0) break;
      if (s && s.id === id && s.n < max) {
        const m = Math.min(max - s.n, n);
        s.n += m;
        n -= m;
      }
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

  /** Egy darab elvétele a megadott helyről */
  takeOne(i: number): void {
    const s = this.slots[i];
    if (!s) return;
    if (--s.n <= 0) this.slots[i] = null;
  }

  /** [id, n, id, n, ...] a mentéshez (0, 0: üres hely) */
  toFlat(): number[] {
    // az eszköz kopása a darabszám fölött tárolódik (n + d * 1000), így a régi mentések is betöltődnek
    return this.slots.flatMap((s) => (s ? [s.id, s.n + (s.d ?? 0) * 1000] : [0, 0]));
  }

  fromFlat(flat: number[]): void {
    this.slots.fill(null);
    for (let i = 0; i < TOTAL_SLOTS && i * 2 + 1 < flat.length; i++) {
      const id = flat[i * 2], raw = flat[i * 2 + 1];
      const n = raw % 1000, d = Math.floor(raw / 1000);
      // csak a most is ismert blokkokat és elemeket töltjük vissza
      if (id && n > 0 && (BLOCKS[id] || ITEMS[id])) this.slots[i] = { id, n: Math.min(n, maxStack(id)), ...(d ? { d } : {}) };
    }
  }
}
