import { BLOCKS } from '../shared/blocks';
import { ARMOR_SLOTS, ITEMS, armorOf, isItem, itemName, maxStack } from '../shared/items';
import { matchRecipe, type Stack } from '../shared/recipes';
import { SMELT_SECONDS, type Furnace } from '../shared/smelting';
import { CHEST_SLOTS, type Chest } from '../shared/chest';
import { BookUI } from './book';
import { SmelterUI } from './smelter';

export const HOTBAR_SIZE = 9;
export const TOTAL_SLOTS = 36;
type Area = 'inv' | 'craft' | 'armor' | 'chest';

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

type Painter = (c: HTMLCanvasElement, id: number) => void;

/** Egy hely megjelenítése: ikon és darabszám */
export class SlotView {
  readonly el = document.createElement('div');
  private canvas = document.createElement('canvas');
  private count = document.createElement('span');
  private bar = document.createElement('div');
  private barFill = document.createElement('i');
  private lastId = -1;

  constructor(private paint: Painter, className = 'islot') {
    this.el.className = className;
    this.canvas.width = this.canvas.height = 64;
    this.count.className = 'cnt';
    this.bar.className = 'dur';
    this.bar.hidden = true;
    this.bar.appendChild(this.barFill);
    this.el.append(this.canvas, this.count, this.bar);
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
    // tartósságcsík: csak a megkopott eszközön látszik, zöldtől pirosig
    const max = s ? ITEMS[s.id]?.tool?.durability : undefined;
    if (max && s!.d) {
      const f = Math.max(0, 1 - s!.d! / max);
      this.bar.hidden = false;
      this.barFill.style.width = `${Math.max(6, f * 100)}%`;
      this.barFill.style.background = `hsl(${Math.round(f * 120)}, 85%, 50%)`;
    } else this.bar.hidden = true;
  }

  /** Kényszerített újrarajzolás (pl. ha az elem textúrája később töltődött be) */
  invalidate(): void {
    this.lastId = -1;
  }
}

/** Elem textúrák betöltése és rajzolása */
export function createItemPainter(base: string, onLoad: () => void): Painter & { preload(): Promise<void> } {
  const cache = new Map<string, HTMLImageElement | null>();
  const pending = new Map<string, Promise<void>>();
  const load = (tex: string) => {
    if (cache.has(tex)) return cache.get(tex) ?? null;
    cache.set(tex, null);
    const img = new Image();
    pending.set(tex, new Promise<void>((done) => {
      img.onload = () => { cache.set(tex, img); onLoad(); done(); };
      img.onerror = () => done();
    }));
    img.src = `${base}textures/item/${tex}.png`;
    return null;
  };
  const paint: Painter = (c, id) => {
    const def = ITEMS[id];
    if (!def) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    // amíg a textúra nem töltődött be, az ikon üres marad (nincs helyettesítő betű), betöltéskor újrarajzolódik
    const img = load(def.tex);
    if (img && img.width > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, img.width, img.width, 0, 0, c.width, c.height);
    }
  };
  return Object.assign(paint, {
    /** az összes tárgy textúrájának betöltése (indításkor), hogy az első rajzolásnál már minden ikon kész legyen */
    preload: async (): Promise<void> => {
      for (const def of Object.values(ITEMS)) load(def.tex);
      await Promise.race([Promise.all([...pending.values()]), new Promise<void>((r) => setTimeout(r, 4000))]);
    },
  });
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

  private invViews: SlotView[] = [];
  private craftViews: SlotView[] = [];
  private armorViews: SlotView[] = [];
  private armorEl = document.getElementById('armor-slots')!;
  private outView: SlotView;
  private cursorView: SlotView;
  private craft: (Stack | null)[] = [];
  private size = 2;
  private cursor: Stack | null = null;
  private result: Stack | null = null;
  /** nyitva lévő tűzhely: a bemenet és az üzemanyag a `craft` rács két helye, a kimenet a tűzhelyé */
  private furnace: Furnace | null = null;
  /** nyitva lévő láda (a hely a láda saját tárolója, nem másolat) */
  private chest: Chest | null = null;
  private chestEl = document.getElementById('chest-grid')!;
  private chestViews: SlotView[] = [];
  /** receptkönyv (barkácslista) */
  private book: BookUI;
  private smelter: SmelterUI;
  private bookMode = false;

  /** a tartalom változott (a HUD hotbarját frissíteni kell) */
  onChange: () => void = () => {};
  onClose: () => void = () => {};

  constructor(private inv: Inventory, private paint: Painter) {
    this.smelter = new SmelterUI(inv, paint, () => { this.render(); this.onChange(); });
    this.book = new BookUI(inv, paint, () => { this.render(); this.onChange(); });
    document.getElementById('bag-toggle')!.addEventListener('click', () => this.toggleBook());
    this.outView = new SlotView(paint, 'islot out');
    this.cursorView = new SlotView(paint, 'islot');
    this.outEl.appendChild(this.outView.el);
    this.cursorEl.appendChild(this.cursorView.el);

    const mk = (parent: HTMLElement, area: Area, i: number, list: SlotView[]) => {
      const v = new SlotView(paint);
      this.bindSlot(v.el, area, i);
      parent.appendChild(v.el);
      list.push(v);
    };
    // sorrend a képernyőn: hátizsák (9..35), alatta a hotbar (0..8)
    for (let i = 9; i < TOTAL_SLOTS; i++) mk(this.mainEl, 'inv', i, this.invViews);
    for (let i = 0; i < HOTBAR_SIZE; i++) mk(this.hotEl, 'inv', i, this.invViews);
    for (let i = 0; i < 4; i++) {
      mk(this.armorEl, 'armor', i, this.armorViews);
      const el = this.armorViews[i].el;
      el.classList.add('aslot');
      el.style.setProperty('--ph', `url(${import.meta.env.BASE_URL}textures/item/empty_slot_${ARMOR_SLOTS[i].toLowerCase()}.png)`);
      el.title = ARMOR_SLOTS[i];
    }

    this.outView.el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.takeResult(e.shiftKey); });
    document.getElementById('bag-close')!.addEventListener('click', () => this.onClose());
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    // a sötét háttérre koppintva bezárul a panel (a kézben lévő dolog visszakerül a tárolóba)
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.onClose(); });
    document.addEventListener('pointermove', (e) => this.moveCursor(e.clientX, e.clientY));
    this.root.addEventListener('pointerdown', (e) => this.moveCursor(e.clientX, e.clientY), true);
  }

  /**
   * Kezelés (érintéssel és egérrel is):
   *  - üres kézzel: koppintás / bal kattintás = a teljes stack felvétele; hosszan nyomva / jobb kattintás = a fele;
   *    ujjal húzva a stack vonszolása a másik helyre
   *  - tele kézzel: koppintás = lerak; hosszan nyomva / jobb kattintás = egy darab;
   *    SZÉTOSZTÁS: a nyomva tartott ujjal (vagy egérrel) végighúzva több helyen a kézben lévő stack egyenlően
   *    szétoszlik a érintett helyek között (jobb gombbal húzva helyenként egy darab)
   */
  private bindSlot(el: HTMLElement, area: Area, idx: number): void {
    el.dataset.area = area;
    el.dataset.idx = String(idx);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const touch = e.pointerType !== 'mouse';
      const button: 0 | 2 = e.button === 2 ? 2 : 0;
      if (this.cursor) { this.holdGesture(e, area, idx, button, touch); return; }
      if (!touch) { this.click(area, idx, button, e.shiftKey); return; }
      const sx = e.clientX, sy = e.clientY;
      let mode: 'pending' | 'long' | 'drag' | 'ignore' = 'pending';
      const timer = window.setTimeout(() => {
        if (mode !== 'pending') return;
        mode = 'long';
        this.click(area, idx, 2, false);
      }, 450);
      const move = (ev: PointerEvent) => {
        this.moveCursor(ev.clientX, ev.clientY);
        if (mode !== 'pending' || Math.hypot(ev.clientX - sx, ev.clientY - sy) < 10) return;
        window.clearTimeout(timer);
        if (this.list(area)[idx]) {
          mode = 'drag';
          this.click(area, idx, 0, false); // felveszi a stacket, és követi az ujjat
          this.moveCursor(ev.clientX, ev.clientY);
        } else mode = 'ignore';
      };
      const end = (ev: PointerEvent) => {
        window.clearTimeout(timer);
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', end);
        document.removeEventListener('pointercancel', end);
        if (ev.type === 'pointercancel') return;
        if (mode === 'pending') this.click(area, idx, 0, false);
        else if (mode === 'drag') {
          // a vonszolt stack oda kerül, ahol az ujjat felengedték; ha nincs ott hely, visszamegy
          const t = this.slotAt(ev.clientX, ev.clientY);
          if (t) this.click(t.area, t.idx, 0, false);
          if (this.cursor && !this.list(area)[idx]) {
            this.list(area)[idx] = this.cursor;
            this.cursor = null;
            this.render();
            this.onChange();
          }
        }
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', end);
      document.addEventListener('pointercancel', end);
    });
  }

  /** A (x, y) képpont alatti hely (hátizsák vagy rács), ha van */
  private slotAt(x: number, y: number): { area: Area; idx: number } | null {
    const t = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-area]') as HTMLElement | null;
    return t && t.dataset.area ? { area: t.dataset.area as Area, idx: Number(t.dataset.idx) } : null;
  }

  /** Befogadja-e a hely a kézben lévő stacket (üres, vagy ugyanaz és van benne hely)? */
  private accepts(area: Area, idx: number): boolean {
    if (area === 'armor') return false; // a páncél-helyekre nem lehet szétosztani
    const c = this.cursor, r = this.list(area)[idx];
    return !!c && (!r || (r.id === c.id && r.n < maxStack(r.id)));
  }

  /** A szétosztás terve: hány darab kerül az egyes helyekre, és mennyi marad a kézben */
  private planSpread(slots: { area: Area; idx: number }[], one: boolean): { counts: number[]; left: number } {
    const c = this.cursor!;
    let left = c.n;
    const per = one ? 1 : Math.max(1, Math.floor(c.n / slots.length));
    const counts = slots.map((sl) => {
      const r = this.list(sl.area)[sl.idx];
      const room = maxStack(c.id) - (r?.n ?? 0);
      const m = Math.min(per, room, left);
      left -= m;
      return m;
    });
    return { counts, left };
  }

  /** Szétosztás előnézete: az érintett helyeken már a leendő darabszám látszik, a kézben a maradék */
  private previewSpread(slots: { area: Area; idx: number }[], one: boolean): void {
    this.render();
    if (slots.length < 2) return;
    const c = this.cursor!;
    const { counts, left } = this.planSpread(slots, one);
    slots.forEach((sl, i) => {
      const v = sl.area === 'inv' ? this.invViews[this.order.indexOf(sl.idx)] : this.craftViews[sl.idx];
      const r = this.list(sl.area)[sl.idx];
      v?.set({ id: c.id, n: (r?.n ?? 0) + counts[i], d: c.d });
    });
    this.cursorView.set(left > 0 ? { id: c.id, n: left, d: c.d } : null);
  }

  /** Tele kézzel indított mozdulat: koppintás (lerak), hosszan nyomva (egy darab) vagy végighúzás (szétosztás) */
  private holdGesture(e: PointerEvent, area: Area, idx: number, button: 0 | 2, touch: boolean): void {
    const slots: { area: Area; idx: number }[] = [{ area, idx }];
    let mode: 'pending' | 'long' | 'spread' = 'pending';
    const timer = touch ? window.setTimeout(() => {
      if (mode !== 'pending') return;
      mode = 'long';
      this.click(area, idx, 2, false);
    }, 450) : 0;
    const move = (ev: PointerEvent) => {
      this.moveCursor(ev.clientX, ev.clientY);
      if (mode === 'long') return;
      const t = this.slotAt(ev.clientX, ev.clientY);
      if (!t || slots.some((sl) => sl.area === t.area && sl.idx === t.idx) || !this.accepts(t.area, t.idx)) return;
      slots.push(t);
      if (slots.length >= 2) { mode = 'spread'; window.clearTimeout(timer); }
      this.previewSpread(slots, button === 2);
    };
    const end = (ev: PointerEvent) => {
      window.clearTimeout(timer);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      if (ev.type === 'pointercancel') { this.render(); return; }
      if (mode === 'pending') this.click(area, idx, button, e.shiftKey);
      else if (mode === 'spread') {
        const c = this.cursor!;
        const { counts, left } = this.planSpread(slots, button === 2);
        slots.forEach((sl, i) => {
          if (counts[i] <= 0) return;
          const list = this.list(sl.area);
          const r = list[sl.idx];
          if (r) r.n += counts[i];
          else list[sl.idx] = { id: c.id, n: counts[i], d: c.d };
        });
        this.cursor = left > 0 ? { id: c.id, n: left, d: c.d } : null;
        this.render();
        this.onChange();
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  }

  private moveCursor(x: number, y: number): void {
    this.cursorEl.style.transform = `translate(${x - 22}px, ${y - 22}px)`;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Megnyitás: 2 = a saját 2x2-es rács, 3 = munkapad */
  open(size: 2 | 3 | 'furnace' | 'chest' | 'book', furnace?: Furnace | Chest): void {
    this.book.cancel();
    // a munkapad és a „book" a receptkönyvet nyitja (nincs barkácsrács); a 2 a táska
    this.bookMode = size === 'book' || size === 3;
    if (this.bookMode) size = 2;
    this.root.classList.toggle('book', this.bookMode);
    document.getElementById('bag-toggle')!.textContent = this.bookMode ? 'Inventory' : 'Recipes';
    this.chest = size === 'chest' ? (furnace as Chest) ?? null : null;
    if (this.chest) furnace = undefined;
    this.root.classList.toggle('chest', !!this.chest);
    this.chestEl.replaceChildren();
    this.chestViews = [];
    if (this.chest) {
      for (let i = 0; i < CHEST_SLOTS; i++) {
        const v = new SlotView(this.paint);
        this.bindSlot(v.el, 'chest', i);
        this.chestEl.appendChild(v.el);
        this.chestViews.push(v);
      }
      size = 2;
    }
    this.furnace = size === 'furnace' ? (furnace as Furnace) ?? null : null;
    const cells = this.furnace ? 2 : (size as number) * (size as number);
    this.size = this.furnace ? 1 : (size as number);
    // a tűzhelynél a rács a tűzhely saját tárolója (nem másolat): amit ide teszel, ott marad bezárás után is
    this.craft = this.furnace ? this.furnace.slots : new Array(cells).fill(null);
    this.craftEl.style.setProperty('--n', this.furnace ? '1' : String(size));
    this.root.classList.toggle('furnace', !!this.furnace);
    this.root.classList.toggle('smelter', !!this.furnace);
    if (this.furnace) this.smelter.show(this.furnace);
    this.craftEl.replaceChildren();
    this.craftViews = [];
    for (let i = 0; i < cells; i++) {
      const v = new SlotView(this.paint);
      this.bindSlot(v.el, 'craft', i);
      this.craftEl.appendChild(v.el);
      this.craftViews.push(v);
    }
    this.titleEl.textContent = this.chest ? 'Chest' : this.furnace ? 'Smelter' : this.bookMode ? 'Crafting' : 'Inventory';
    this.cursor = null;
    this.root.hidden = false;
    this.render();
    if (this.bookMode) this.book.show();
  }

  /** Váltás a táska és a receptkönyv között (a kézben lévő dolog visszakerül a tárolóba) */
  toggleBook(): void {
    if (this.root.hidden || this.chest || this.furnace) return;
    if (this.cursor) { this.inv.add(this.cursor.id, this.cursor.n, this.cursor.d); this.cursor = null; }
    this.open(this.bookMode ? 2 : 'book');
    this.onChange();
  }

  get inBook(): boolean { return this.bookMode; }

  /** Bezárás: a kézben és a rácson lévő dolgok visszakerülnek a tárolóba */
  close(): void {
    if (this.root.hidden) return;
    // a tűzhely tartalma a tűzhelyben marad, csak a kézben lévő dolog kerül vissza
    this.book.cancel();
    const back = this.furnace || this.chest ? [this.cursor] : [this.cursor, ...this.craft];
    this.cursor = null;
    this.craft = [];
    this.furnace = null;
    this.chest = null;
    this.root.classList.remove('furnace', 'smelter', 'chest', 'book');
    this.smelter.hide();
    this.bookMode = false;
    for (const s of back) if (s) this.inv.add(s.id, s.n, s.d); // ami nem fér el, elvész
    this.root.hidden = true;
    this.onChange();
  }

  /** Az olvasztott dolgok elvétele a tűzhelyből */
  private takeFurnaceOut(shift: boolean): void {
    const f = this.furnace!;
    const o = f.out;
    if (!o) return;
    if (shift) {
      const left = this.inv.add(o.id, o.n);
      f.out = left > 0 ? { id: o.id, n: left } : null;
    } else if (!this.cursor) {
      this.cursor = o;
      f.out = null;
    } else if (this.cursor.id === o.id) {
      const m = Math.min(maxStack(o.id) - this.cursor.n, o.n);
      this.cursor.n += m;
      o.n -= m;
      if (o.n <= 0) f.out = null;
    }
    this.render();
    this.onChange();
  }

  /** Minden képkockán hívjuk, amíg a tűzhely nyitva van: a haladás és a kimenet frissül */
  tick(dt = 0): void {
    if (this.bookMode && this.isOpen) this.book.tick(dt);
    if (this.furnace && this.isOpen) { this.smelter.tick(); this.render(); }
  }

  /** Újrarajzolás (pl. elem textúra betöltése után) */
  invalidate(): void {
    [...this.invViews, ...this.chestViews, ...this.craftViews, ...this.armorViews, this.outView, this.cursorView].forEach((v) => v.invalidate());
    if (this.isOpen) this.render();
    if (this.bookMode) this.book.invalidate();
    if (this.furnace) this.smelter.invalidate();
  }

  /** a tároló-nézetek sorrendje a képernyőn: hátizsák (9..35), alatta a hotbar (0..8) */
  private order = [...Array(TOTAL_SLOTS - HOTBAR_SIZE).keys()].map((i) => i + HOTBAR_SIZE).concat([...Array(HOTBAR_SIZE).keys()]);

  private render(): void {
    this.invViews.forEach((v, k) => v.set(this.inv.slots[this.order[k]]));
    this.craftViews.forEach((v, i) => v.set(this.craft[i]));
    this.chestViews.forEach((v, i) => v.set(this.chest?.slots[i] ?? null));
    this.armorViews.forEach((v, i) => { v.set(this.inv.armor[i]); v.el.classList.toggle('empty-ph', !this.inv.armor[i]); });
    this.result = this.furnace ? this.furnace.out : matchRecipe(this.craft, this.size, this.size);
    this.outView.set(this.result);
    if (this.furnace) {
      const f = this.furnace;
      this.craftEl.parentElement!.style.setProperty('--p', String(Math.min(1, f.cook / SMELT_SECONDS)));
      this.craftEl.parentElement!.classList.toggle('lit', f.lit);
    }
    this.cursorView.set(this.cursor);
    this.cursorEl.hidden = !this.cursor;
  }

  private list(area: Area): (Stack | null)[] {
    return area === 'inv' ? this.inv.slots : area === 'armor' ? this.inv.armor : area === 'chest' ? this.chest!.slots : this.craft;
  }

  /** idx: a tároló (vagy a rács) helye */
  private click(area: Area, idx: number, button: 0 | 2, shift: boolean): void {
    const list = this.list(area);
    const ref = list[idx];

    // páncél-helyre csak a megfelelő darab kerülhet
    if (area === 'armor' && this.cursor && armorOf(this.cursor.id)?.slot !== idx) return;
    // Shift+kattintás egy páncéldarabon: felveszi a megfelelő (üres) helyre
    const eq = ref && shift && area === 'inv' ? armorOf(ref.id) : undefined;
    if (eq && !this.inv.armor[eq.slot]) {
      this.inv.armor[eq.slot] = { id: ref!.id, n: 1, ...(ref!.d ? { d: ref!.d } : {}) };
      list[idx] = null;
      this.render();
      this.onChange();
      return;
    }

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
          if (!this.inv.slots[i]) { const m = Math.min(maxStack(from.id), left); this.inv.slots[i] = { id: from.id, n: m, d: from.d }; left -= m; }
        }
      };
      if (this.chest && area === 'inv') {
        // nyitott ládánál a hátizsákból a ládába megy
        const cs = this.chest.slots;
        left = this.chest.add(from.id, left, from.d);
        void cs;
      } else if (area !== 'inv') tryRange(0, TOTAL_SLOTS);
      else if (idx < HOTBAR_SIZE) tryRange(HOTBAR_SIZE, TOTAL_SLOTS);
      else tryRange(0, HOTBAR_SIZE);
      if (left > 0) list[idx] = { id: from.id, n: left, d: from.d };
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
          this.cursor = { id: ref.id, n: half, d: ref.d };
          ref.n -= half;
          if (ref.n <= 0) list[idx] = null;
        }
      } else if (!ref) {
        list[idx] = { id: c.id, n: 1, d: c.d };
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
    if (this.furnace) { this.takeFurnaceOut(shift); return; }
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
    if (shift) { for (let i = 0; i < 256 && take(); i++); } else take();
    this.render();
    this.onChange();
  }
}

export { isItem };
