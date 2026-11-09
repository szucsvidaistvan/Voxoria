import { B, BLOCKS, blockId, blockKey } from './blocks';
import { EXTRA_ID as X, I, maxStack } from './items';
import type { Stack } from './recipes';

/** Ennyi másodpercig tart egy tárgy megolvasztása */
export const SMELT_SECONDS = 10;

/** Olvasztási receptek: bemenet azonosító -> eredmény; a `initSmelting` tölti fel (a blokkok regisztrálása után) */
const SMELT = new Map<number, Stack>();
/** Üzemanyag: azonosító -> ennyi másodpercig ég */
const FUEL = new Map<number, number>();

export function initSmelting(): void {
  SMELT.clear();
  FUEL.clear();
  const add = (inKey: number | string | undefined, out: Stack | null) => {
    const id = typeof inKey === 'string' ? blockId(inKey) : inKey;
    if (id !== undefined && out) SMELT.set(id, out);
  };
  const blk = (key: string, n = 1): Stack | null => { const id = blockId(key); return id === undefined ? null : { id, n }; };
  add('iron_ore', { id: I.IRON_INGOT, n: 1 });
  add('gold_ore', { id: I.GOLD_INGOT, n: 1 });
  add('coal_ore', { id: I.COAL, n: 1 });
  // nyers hús: sütés
  add(I.RAW_BEEF, { id: I.COOKED_BEEF, n: 1 });
  add(I.RAW_PORK, { id: I.COOKED_PORK, n: 1 });
  add(I.RAW_CHICKEN, { id: I.COOKED_CHICKEN, n: 1 });
  add(I.RAW_MUTTON, { id: I.COOKED_MUTTON, n: 1 });
  add(X.cod, { id: X.cooked_cod, n: 1 });
  add(X.salmon, { id: X.cooked_salmon, n: 1 });
  add(X.rabbit, { id: X.cooked_rabbit, n: 1 });
  add(X.potato, { id: X.baked_potato, n: 1 });
  add(X.clay_ball, { id: X.brick, n: 1 });
  add('diamond_ore', { id: I.DIAMOND, n: 1 });
  add('sand', blk('glass'));
  add('red_sand', blk('glass'));
  add('cobblestone', { id: B.STONE, n: 1 });
  add('stone_bricks', blk('cracked_stone_bricks'));
  add('clay', blk('terracotta'));
  add('wet_sponge', blk('sponge'));
  add('sandstone', blk('cut_sandstone'));
  add('red_sandstone', blk('cut_red_sandstone'));
  add('quartz_block', blk('smooth_quartz'));
  add('cactus', { id: X.cactus_green, n: 1 });
  for (const c of ['white','orange','magenta','light_blue','yellow','lime','pink','gray','light_gray','cyan','purple','blue','brown','green','red','black']) add(`${c}_terracotta`, blk(`${c}_glazed_terracotta`));
  for (const c of ['tube','brain','bubble','fire','horn']) add(`${c}_coral_block`, blk(`dead_${c}_coral_block`));
  // minden rönk faszén lesz
  for (const id of Object.keys(blockIds())) if (/(_log|_wood)$/.test(blockKey(Number(id))) && !/^stripped_/.test(blockKey(Number(id)))) SMELT.set(Number(id), { id: I.CHARCOAL, n: 1 });

  FUEL.set(I.COAL, 80);
  FUEL.set(I.CHARCOAL, 80);
  FUEL.set(I.STICK, 5);
  for (const id of Object.keys(blockIds())) {
    const k = blockKey(Number(id));
    if (/(_log|_wood)$/.test(k) || /_planks$/.test(k) || k === 'crafting_table' || k === 'bookshelf') FUEL.set(Number(id), 15);
    else if (/_wool$/.test(k)) FUEL.set(Number(id), 5);
    else if (k === 'coal_block') FUEL.set(Number(id), 800);
    else if (/_(fence|trapdoor|door)$/.test(k) && !/iron/.test(k)) FUEL.set(Number(id), 15);
    else if (/_(slab)$/.test(k) && /(oak|spruce|birch|jungle|acacia|dark_oak)/.test(k)) FUEL.set(Number(id), 7);
    else if (/(sapling)$/.test(k)) FUEL.set(Number(id), 5);
    else if (k === 'ladder') FUEL.set(Number(id), 15);
  }
}

/** A már regisztrált blokkok azonosítói (a receptek kulcsok szerint keresnek, itt az összes id kell) */
function blockIds(): Record<number, true> {
  const o: Record<number, true> = {};
  for (const k of Object.keys(BLOCKS)) { const id = Number(k); if (!BLOCKS[id].hidden) o[id] = true; }
  return o;
}

export const smeltResult = (id: number): Stack | null => { const r = SMELT.get(id); return r ? { ...r } : null; };
export const fuelTime = (id: number): number => FUEL.get(id) ?? 0;

/** Az összes olvasztási recept (az olvasztó menühöz) */
export const smeltRecipes = (): { inp: number; out: Stack }[] => [...SMELT].map(([inp, out]) => ({ inp, out: { ...out } }));
/** Az összes üzemanyag: azonosító és az égési idő (mp) */
export const fuelList = (): { id: number; seconds: number }[] => [...FUEL].map(([id, seconds]) => ({ id, seconds }));

/** Ennyi másodpercnyi hőt tárol legfeljebb az olvasztó */
export const HEAT_CAP = 1200;

/**
 * Az olvasztó állapota. Nincsenek foglalatok: a betöltött alapanyag egyfajta (`slots[0]`), az üzemanyag nem tárgyként,
 * hanem tárolt hőként (`heat`, másodpercben) van jelen: a tüzelő elégetésekor a benne lévő idő hozzáadódik. A hő a
 * főzés alatt fogy; ha elfogy, az olvasztás megáll, amíg újabb tüzelőt nem adsz hozzá. A kész termék a kimenetben gyűlik.
 */
export class Furnace {
  /** [0] a betöltött alapanyag (a [1] csak a régi mentések átvételéhez van) */
  slots: (Stack | null)[] = [null, null];
  out: Stack | null = null;
  /** tárolt hő (mp) */
  heat = 0;
  cook = 0;

  get input(): Stack | null { return this.slots[0]; }
  get lit(): boolean { return this.heat > 0 && !!this.canSmelt(); }

  private canSmelt(): Stack | null {
    const inp = this.slots[0];
    if (!inp) return null;
    const r = smeltResult(inp.id);
    if (!r) return null;
    if (this.out && (this.out.id !== r.id || this.out.n + r.n > maxStack(r.id))) return null;
    return r;
  }

  /** Alapanyag betöltése (csak egyfajta lehet bent); visszaadja, mennyi fért be */
  load(id: number, n: number): number {
    if (!smeltResult(id) || n <= 0) return 0;
    const cur = this.slots[0];
    if (cur && cur.id !== id) return 0;
    const m = Math.min(n, maxStack(id) - (cur?.n ?? 0));
    if (m <= 0) return 0;
    this.slots[0] = cur ? { id, n: cur.n + m } : { id, n: m };
    return m;
  }

  /** Hő hozzáadása (mp); visszaadja, mennyit sikerült (a tároló korlátos) */
  addHeat(seconds: number): number {
    const m = Math.max(0, Math.min(seconds, HEAT_CAP - this.heat));
    this.heat += m;
    return m;
  }

  /** Teljes frissítés dt másodperccel; igaz, ha a tartalma változott (a kijelzést újra kell rajzolni) */
  update(dt: number): boolean {
    let changed = false;
    let left = Math.min(dt, 5);
    while (left > 1e-6) {
      const step = Math.min(left, 0.25);
      left -= step;
      const r = this.canSmelt();
      if (r && this.heat > 0) {
        const use = Math.min(step, this.heat);
        this.heat -= use;
        this.cook += use;
        if (this.cook >= SMELT_SECONDS) {
          this.cook -= SMELT_SECONDS;
          this.out = this.out ? { id: this.out.id, n: this.out.n + r.n } : { ...r };
          const inp = this.slots[0]!;
          if (--inp.n <= 0) this.slots[0] = null;
          changed = true;
        }
      } else if (this.cook > 0 && !r) this.cook = 0;
    }
    return changed;
  }

  /** [alapanyag id, n, 0, 0 (régi üzemanyag-hely), kimenet id, n, hő, 1, főzés] (a régi formátummal azonos hosszú) */
  toFlat(): number[] {
    const f = (s: Stack | null) => (s ? [s.id, s.n] : [0, 0]);
    return [...f(this.slots[0]), 0, 0, ...f(this.out), this.heat, 1, this.cook];
  }
  static fromFlat(a: number[]): Furnace {
    const f = new Furnace();
    const s = (i: number): Stack | null => (a[i] && a[i + 1] > 0 ? { id: a[i], n: a[i + 1] } : null);
    f.slots = [s(0), null];
    f.out = s(4);
    // régi mentés: a hátralévő égés és az üzemanyag-foglalat tartalma hővé alakul
    const oldFuel = s(2);
    f.heat = Math.min(HEAT_CAP, (a[6] ?? 0) + (oldFuel ? oldFuel.n * fuelTime(oldFuel.id) : 0));
    f.cook = a[8] ?? 0;
    return f;
  }
  /** Minden benne lévő tárgy (a tűzhely bontásakor a földre esik) */
  contents(): Stack[] {
    return [this.slots[0], this.out].filter((s): s is Stack => !!s);
  }
}
