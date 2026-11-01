import { BLOCKS } from '../shared/blocks';
import { ITEMS, isItem, itemName, maxStack } from '../shared/items';
import { matchRecipe, type Stack } from '../shared/recipes';

export const HOTBAR_SIZE = 9;
export const TOTAL_SLOTS = 36;

/** A játékos tárolója: az első 9 hely a hotbar, a többi 27 a hátizsák */
export class Inventory {
  slots: (Stack | null)[] = new Array(TOTAL_SLOTS).fill(null);

  /** Hozzáadás; visszaadja, hány darab nem fért el */
  add(id: number, n: number): number {
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
        this.slots[i] = { id, n: m };
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
    return this.slots.flatMap((s) => (s ? [s.id, s.n] : [0, 0]));
  }

  fromFlat(flat: number[]): void {
    this.slots.fill(null);
    for (let i = 0; i < TOTAL_SLOTS && i * 2 + 1 < flat.length; i++) {
      const id = flat[i * 2], n = flat[i * 2 + 1];
      // csak a most is ismert blokkokat és elemeket töltjük vissza
      if (id && n > 0 && (BLOCKS[id] || ITEMS[id])) this.slots[i] = { id, n: Math.min(n, maxStack(id)) };
    }
  }
}

type Painter = (c: HTMLCanvasElement, id: number) => void;

/** Egy hely megjelenítése: ikon és darabszám */
export class SlotView {
  readonly el = document.createElement('div');
  private canvas = document.createElement('canvas');
  private count = document.createElement('span');
  private lastId = -1;

  constructor(private paint: Painter, className = 'islot') {
    this.el.className = className;
    this.canvas.width = this.canvas.height = 64;
    this.count.className = 'cnt';
    this.el.append(this.canvas, this.count);
  }

  set(s: Stack | null, hideCount = false): void {
    const id = s ? s.id : 0;
    if (id !== this.lastId) {
      this.lastId = id;
      const ctx = this.canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 64, 64);
      if (id) this.paint(this.canvas, id);
      this.el.title = id ? itemName(id) : '';
    }
    this.count.textContent = s && s.n > 1 && !hideCount ? String(s.n) : '';
  }

  /** Kényszerített újrarajzolás (pl. ha az elem textúrája később töltődött be) */
  invalidate(): void {
    this.lastId = -1;
  }
}

/** Elem textúrák betöltése és rajzolása */
export function createItemPainter(base: string, onLoad: () => void): Painter {
  const cache = new Map<string, HTMLImageElement | null>();
  const load = (tex: string) => {
    if (cache.has(tex)) return cache.get(tex) ?? null;
    cache.set(tex, null);
    const img = new Image();
    img.onload = () => { cache.set(tex, img); onLoad(); };
    img.src = `${base}textures/item/${tex}.png`;
    return null;
  };
  return (c, id) => {
    const def = ITEMS[id];
    if (!def) return;
    const ctx = c.getContext('2d')!;
    const img = load(def.tex);
    if (img && img.width > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, img.width, img.width, 0, 0, c.width, c.height);
    } else {
      // amíg nincs textúra (vagy hiányzik a csomagból): színes négyzet és a név első betűje
      ctx.fillStyle = def.color;
      ctx.fillRect(10, 10, 44, 44);
      ctx.fillStyle = '#fff';
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(def.name.charAt(0), 32, 42);
    }
  };
}

/** Az inventory-panel: hátizsák, hotbar, barkácsrács (2x2 vagy 3x3), eredmény, egérrel és érintéssel is */
export class BagUI {
  private root = document.getElementById('bag')!;
  private craftEl = document.getElementById('craft-grid')!;
  private outEl = document.getElementById('craft-out')!;
  private mainEl = document.getElementById('bag-main')!;
  private hotEl = document.getElementById('bag-hot')!;
  private cursorEl = document.getElementById('bag-cursor')!;
  private titleEl = document.getElementById('bag-title')!;
  private splitBtn = document.getElementById('bag-split') as HTMLButtonElement;

  private invViews: SlotView[] = [];
  private craftViews: SlotView[] = [];
  private outView: SlotView;
  private cursorView: SlotView;
  private craft: (Stack | null)[] = [];
  private size = 2;
  private cursor: Stack | null = null;
  private result: Stack | null = null;
  /** érintésnél: a koppintás jobb gombot helyettesít (egyesével lerak, felét felveszi) */
  private split = false;

  /** a tartalom változott (a HUD hotbarját frissíteni kell) */
  onChange: () => void = () => {};
  onClose: () => void = () => {};

  constructor(private inv: Inventory, private paint: Painter) {
    this.outView = new SlotView(paint, 'islot out');
    this.cursorView = new SlotView(paint, 'islot');
    this.outEl.appendChild(this.outView.el);
    this.cursorEl.appendChild(this.cursorView.el);

    const mk = (parent: HTMLElement, area: 'inv' | 'craft', i: number, list: SlotView[]) => {
      const v = new SlotView(paint);
      v.el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.click(area, i, e.button === 2 || this.split ? 2 : 0, e.shiftKey); });
      v.el.addEventListener('contextmenu', (e) => e.preventDefault());
      parent.appendChild(v.el);
      list.push(v);
    };
    // sorrend a képernyőn: hátizsák (9..35), alatta a hotbar (0..8)
    for (let i = 9; i < TOTAL_SLOTS; i++) mk(this.mainEl, 'inv', i, this.invViews);
    for (let i = 0; i < HOTBAR_SIZE; i++) mk(this.hotEl, 'inv', i, this.invViews);

    this.outView.el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.takeResult(e.shiftKey); });
    document.getElementById('bag-close')!.addEventListener('click', () => this.onClose());
    this.splitBtn.addEventListener('click', () => {
      this.split = !this.split;
      this.splitBtn.classList.toggle('on', this.split);
    });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointermove', (e) => this.moveCursor(e.clientX, e.clientY));
    this.root.addEventListener('pointerdown', (e) => this.moveCursor(e.clientX, e.clientY), true);
  }

  private moveCursor(x: number, y: number): void {
    this.cursorEl.style.transform = `translate(${x - 22}px, ${y - 22}px)`;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Megnyitás: 2 = a saját 2x2-es rács, 3 = munkapad */
  open(size: 2 | 3): void {
    this.size = size;
    this.craft = new Array(size * size).fill(null);
    this.craftEl.style.setProperty('--n', String(size));
    this.craftEl.replaceChildren();
    this.craftViews = [];
    for (let i = 0; i < size * size; i++) {
      const v = new SlotView(this.paint);
      v.el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.click('craft', i, e.button === 2 || this.split ? 2 : 0, e.shiftKey); });
      v.el.addEventListener('contextmenu', (e) => e.preventDefault());
      this.craftEl.appendChild(v.el);
      this.craftViews.push(v);
    }
    this.titleEl.textContent = size === 3 ? 'Munkapad' : 'Inventory';
    this.cursor = null;
    this.root.hidden = false;
    this.render();
  }

  /** Bezárás: a kézben és a rácson lévő dolgok visszakerülnek a tárolóba */
  close(): void {
    if (this.root.hidden) return;
    const back = [this.cursor, ...this.craft];
    this.cursor = null;
    this.craft = [];
    for (const s of back) if (s) this.inv.add(s.id, s.n); // ami nem fér el, elvész
    this.root.hidden = true;
    this.onChange();
  }

  /** Újrarajzolás (pl. elem textúra betöltése után) */
  invalidate(): void {
    [...this.invViews, ...this.craftViews, this.outView, this.cursorView].forEach((v) => v.invalidate());
    if (this.isOpen) this.render();
  }

  /** a tároló-nézetek sorrendje a képernyőn: hátizsák (9..35), alatta a hotbar (0..8) */
  private order = [...Array(TOTAL_SLOTS - HOTBAR_SIZE).keys()].map((i) => i + HOTBAR_SIZE).concat([...Array(HOTBAR_SIZE).keys()]);

  private render(): void {
    this.invViews.forEach((v, k) => v.set(this.inv.slots[this.order[k]]));
    this.craftViews.forEach((v, i) => v.set(this.craft[i]));
    this.result = matchRecipe(this.craft, this.size, this.size);
    this.outView.set(this.result);
    this.cursorView.set(this.cursor);
    this.cursorEl.hidden = !this.cursor;
  }

  private list(area: 'inv' | 'craft'): (Stack | null)[] {
    return area === 'inv' ? this.inv.slots : this.craft;
  }

  /** idx: a tároló (vagy a rács) helye */
  private click(area: 'inv' | 'craft', idx: number, button: 0 | 2, shift: boolean): void {
    const list = this.list(area);
    const ref = list[idx];

    if (shift && ref) {
      // gyorsmozgatás: hotbar <-> hátizsák, rácsból a tárolóba
      const from = ref;
      list[idx] = null;
      let left = from.n;
      const tryRange = (a: number, b: number) => {
        for (let i = a; i < b && left > 0; i++) {
          const s = this.inv.slots[i];
          if (s && s.id === from.id && s.n < maxStack(from.id)) { const m = Math.min(maxStack(from.id) - s.n, left); s.n += m; left -= m; }
        }
        for (let i = a; i < b && left > 0; i++) {
          if (!this.inv.slots[i]) { const m = Math.min(maxStack(from.id), left); this.inv.slots[i] = { id: from.id, n: m }; left -= m; }
        }
      };
      if (area === 'craft') tryRange(0, TOTAL_SLOTS);
      else if (idx < HOTBAR_SIZE) tryRange(HOTBAR_SIZE, TOTAL_SLOTS);
      else tryRange(0, HOTBAR_SIZE);
      if (left > 0) list[idx] = { id: from.id, n: left };
    } else if (button === 0) {
      const c = this.cursor;
      if (!c) { if (ref) { this.cursor = ref; list[idx] = null; } }
      else if (!ref) { list[idx] = c; this.cursor = null; }
      else if (ref.id === c.id) {
        const m = Math.min(maxStack(ref.id) - ref.n, c.n);
        ref.n += m;
        c.n -= m;
        if (c.n <= 0) this.cursor = null;
      } else { list[idx] = c; this.cursor = ref; }
    } else {
      const c = this.cursor;
      if (!c) {
        if (ref) {
          const half = Math.ceil(ref.n / 2);
          this.cursor = { id: ref.id, n: half };
          ref.n -= half;
          if (ref.n <= 0) list[idx] = null;
        }
      } else if (!ref) {
        list[idx] = { id: c.id, n: 1 };
        if (--c.n <= 0) this.cursor = null;
      } else if (ref.id === c.id && ref.n < maxStack(ref.id)) {
        ref.n++;
        if (--c.n <= 0) this.cursor = null;
      }
    }
    this.render();
    this.onChange();
  }

  /** Az eredmény elvétele (shifttel: addig készít, amíg fér a tárolóba és van alapanyag) */
  private takeResult(shift: boolean): void {
    const take = () => {
      const r = matchRecipe(this.craft, this.size, this.size);
      if (!r) return false;
      if (shift) { if (this.inv.add(r.id, r.n) > 0) return false; }
      else {
        const c = this.cursor;
        if (c && (c.id !== r.id || c.n + r.n > maxStack(r.id))) return false;
        this.cursor = { id: r.id, n: (c?.n ?? 0) + r.n };
      }
      this.craft = this.craft.map((s) => (s && s.n > 1 ? { id: s.id, n: s.n - 1 } : null));
      return true;
    };
    if (shift) { for (let i = 0; i < 64 && take(); i++); } else take();
    this.render();
    this.onChange();
  }
}

export { isItem };
