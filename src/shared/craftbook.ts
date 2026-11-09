import { armorOf, ITEMS, itemName, maxStack } from './items';
import { getRecipes, tagMembers, type Recipe, type Stack } from './recipes';

/**
 * Receptkönyv: a receptek listája (mint egy RPG szakmamenüje). Nincs rács: ha nálad vannak az összetevők, a
 * recept kiválasztható, és néhány másodperc alatt elkészül. A címkés összetevők (pl. bármilyen deszka) fajtánként
 * külön változatot adnak; az eredmény ugyanaz a bejegyzés alatt gyűlik, és a kéznél lévő összetevőkkel készül.
 */
export interface Variant {
  /** [azonosító, darab] */
  need: [number, number][];
  out: Stack;
}
export interface BookEntry {
  key: string;
  out: Stack;
  name: string;
  cat: string;
  variants: Variant[];
  /** egy darab elkészítésének ideje másodpercben */
  seconds: number;
}

export const CATEGORIES = ['All', 'Building', 'Color', 'Food', 'Tools & Armor', 'Other'] as const;

function categoryOf(id: number): string {
  const it = ITEMS[id];
  if (it?.tool || it?.armor || armorOf(id)) return 'Tools & Armor';
  if (it?.food) return 'Food';
  const n = itemName(id).toLowerCase();
  if (/wool|carpet|concrete|stained|terracotta|dye|rose red|dandelion|cactus green|lapis lazuli/.test(n)) return 'Color';
  if (it) return 'Other';
  if (/stairs|slab|wall|fence|brick|planks|stone|sandstone|quartz|door|trapdoor|log|glass|pane|bars|ladder|block|cobble|diorite|granite|andesite|prismarine|purpur|chiseled|cut_|pillar/.test(n)) return 'Building';
  return 'Other';
}

/** Egy darab elkészítésének ideje: az összetevők számától függ (1–4 mp) */
export const craftSeconds = (ingredients: number): number => 1 + 0.25 * Math.min(12, ingredients);

function expand(r: Recipe): Variant[] {
  const slots: (number | string)[] = [];
  if (r.shape) {
    for (const row of r.shape) for (const ch of row) if (ch !== ' ') slots.push(r.keys![ch]);
  } else for (const s of r.shapeless ?? []) slots.push(s);
  const tags = [...new Set(slots.filter((s): s is string => typeof s === 'string'))];
  const lists = tags.map((t) => tagMembers(t));
  if (lists.some((l) => !l.length)) return [];
  const out: Variant[] = [];
  const pick: number[] = new Array(tags.length).fill(0);
  for (;;) {
    const ids = slots.map((s) => (typeof s === 'number' ? s : lists[tags.indexOf(s)][pick[tags.indexOf(s)]]));
    const res = typeof r.out === 'function' ? r.out(ids) : r.out;
    if (res) {
      const need = new Map<number, number>();
      for (const id of ids) need.set(id, (need.get(id) ?? 0) + 1);
      out.push({ need: [...need.entries()], out: { ...res } });
    }
    let i = pick.length - 1;
    while (i >= 0 && ++pick[i] >= lists[i].length) pick[i--] = 0;
    if (i < 0) break;
  }
  return out;
}

let book: BookEntry[] | null = null;

/** A receptkönyv összeállítása (a receptek elkészülte után; egyszer, aztán gyorsítótárból) */
export function getBook(): BookEntry[] {
  if (book) return book;
  const entries: BookEntry[] = [];
  getRecipes().forEach((r, ri) => {
    const byOut = new Map<number, BookEntry>();
    for (const v of expand(r)) {
      let e = byOut.get(v.out.id);
      if (!e) {
        const total = v.need.reduce((a, [, n]) => a + n, 0);
        e = { key: `${ri}:${v.out.id}`, out: v.out, name: itemName(v.out.id), cat: categoryOf(v.out.id), variants: [], seconds: craftSeconds(total) };
        byOut.set(v.out.id, e);
        entries.push(e);
      }
      e.variants.push(v);
    }
  });
  entries.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key, undefined, { numeric: true }));
  book = entries;
  return entries;
}
export const resetBook = (): void => { book = null; };

export interface Bag {
  slots: (Stack | null)[];
  add(id: number, n: number, d?: number): number;
}

export function countOf(inv: Bag, id: number): number {
  let n = 0;
  for (const s of inv.slots) if (s && s.id === id) n += s.n;
  return n;
}

/** Hány darab fér még be az adott tárgyból */
export function roomFor(inv: Bag, id: number): number {
  const max = maxStack(id);
  let n = 0;
  for (const s of inv.slots) n += !s ? max : s.id === id ? max - s.n : 0;
  return n;
}

/** Hányszor készíthető el a változat a jelenlegi készletből */
export function canMake(inv: Bag, v: Variant): number {
  let m = Infinity;
  for (const [id, n] of v.need) m = Math.min(m, Math.floor(countOf(inv, id) / n));
  return Number.isFinite(m) ? m : 0;
}

/** A bejegyzés legjobb változata: az, ami elkészíthető (a legtöbbször), különben az első */
export function bestVariant(inv: Bag, e: BookEntry): Variant {
  let best = e.variants[0], bm = canMake(inv, best);
  for (const v of e.variants) { const m = canMake(inv, v); if (m > bm) { best = v; bm = m; } }
  return best;
}

export function take(inv: Bag, id: number, n: number): void {
  for (const s of inv.slots) {
    if (n <= 0) break;
    if (s && s.id === id) { const m = Math.min(s.n, n); s.n -= m; n -= m; }
  }
  for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i] && inv.slots[i]!.n <= 0) inv.slots[i] = null;
}

/** Folyamatban lévő készítés: az összetevők a darab elején fogynak el, a kész dolog a végén kerül a zsákba */
export class CraftJob {
  entry: BookEntry | null = null;
  private variant: Variant | null = null;
  /** ennyi darab van még hátra (az éppen készülőt is beleértve) */
  left = 0;
  progress = 0; // 0..1
  /** utolsó üzenet (pl. „Inventory full") */
  message = '';

  constructor(private inv: Bag, private onDone: () => void = () => {}) {}

  get active(): boolean { return !!this.entry && this.left > 0; }

  start(e: BookEntry, qty: number): void {
    if (this.active) this.cancel();
    this.entry = e;
    this.left = qty;
    this.progress = 0;
    this.variant = null;
    this.message = '';
    if (!this.begin()) this.stop();
  }

  private begin(): boolean {
    const e = this.entry!;
    const v = bestVariant(this.inv, e);
    if (canMake(this.inv, v) < 1) { this.message = 'Missing ingredients'; return false; }
    if (roomFor(this.inv, v.out.id) < v.out.n) { this.message = 'Inventory full'; return false; }
    for (const [id, n] of v.need) take(this.inv, id, n);
    this.variant = v;
    this.progress = 0;
    return true;
  }

  /** Visszaadja az összetevőket és leállít */
  cancel(): void {
    if (this.variant && this.active) for (const [id, n] of this.variant.need) this.inv.add(id, n);
    this.stop();
  }

  private stop(): void { this.entry = null; this.variant = null; this.left = 0; this.progress = 0; }

  update(dt: number): void {
    if (!this.active || !this.variant) return;
    this.progress += dt / this.entry!.seconds;
    while (this.progress >= 1 && this.active) {
      const out = this.variant!.out;
      this.inv.add(out.id, out.n);
      this.left--;
      this.onDone();
      if (this.left <= 0) { this.stop(); return; }
      this.progress -= 1;
      if (!this.begin()) { this.stop(); return; }
    }
  }
}
