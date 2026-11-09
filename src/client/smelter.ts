import { itemName } from '../shared/items';
import { HEAT_CAP, SMELT_SECONDS, fuelList, smeltRecipes, type Furnace } from '../shared/smelting';
import { countOf, roomFor, take } from '../shared/craftbook';
import type { Inventory } from './inventory';
import { SlotView } from './inventory';

type Painter = (c: HTMLCanvasElement, id: number) => void;

/**
 * Olvasztó-panel: nincsenek foglalatok. Bal oldalt az olvasztási receptek listája (amihez van alapanyagod, az világos),
 * jobb oldalt: a kiválasztott recept betöltése, a hő (tüzelő elégetése hőt ad), és a kész termék átvétele.
 * Az olvasztó a háttérben tovább dolgozik, amíg van benne alapanyag és hő.
 */
export class SmelterUI {
  readonly el = document.getElementById('smelter')!;
  private search = document.getElementById('sm-search') as HTMLInputElement;
  private listEl = document.getElementById('sm-list')!;
  private detail = document.getElementById('sm-detail')!;
  private furnace: Furnace | null = null;
  private selected: number | null = null;
  private qty = 10;
  private msg = '';
  // tick-ben frissülő elemek
  private heatBar!: HTMLElement;
  private heatTxt!: HTMLElement;
  private cookBar!: HTMLElement;
  private cookTxt!: HTMLElement;
  private outSlot!: HTMLElement;
  private sig = '';

  constructor(private inv: Inventory, private paint: Painter, private onChange: () => void) {
    this.search.addEventListener('input', () => this.rebuildList());
    this.search.addEventListener('keydown', (e) => e.stopPropagation());
  }

  show(f: Furnace): void {
    this.furnace = f;
    this.msg = '';
    this.rebuildList();
    this.renderDetail();
  }

  hide(): void { this.furnace = null; }

  invalidate(): void { this.rebuildList(); this.renderDetail(); }

  private rebuildList(): void {
    this.listEl.replaceChildren();
    const q = this.search.value.trim().toLowerCase();
    const rows = smeltRecipes()
      .map((r) => ({ ...r, have: countOf(this.inv, r.inp), name: itemName(r.inp) }))
      .filter((r) => !q || r.name.toLowerCase().includes(q) || itemName(r.out.id).toLowerCase().includes(q))
      .sort((a, b) => Number(b.have > 0) - Number(a.have > 0) || a.name.localeCompare(b.name));
    for (const r of rows) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'book-row' + (r.have < 1 ? ' no' : '') + (r.inp === this.selected ? ' sel' : '');
      const icon = new SlotView(this.paint);
      icon.set({ id: r.inp, n: 1 }, true);
      const text = document.createElement('span');
      text.className = 'br-text';
      const nm = document.createElement('b');
      nm.textContent = r.name;
      const sm = document.createElement('small');
      sm.textContent = `→ ${r.out.n > 1 ? r.out.n + '× ' : ''}${itemName(r.out.id)}${r.have ? ` · you have ${r.have}` : ''}`;
      text.append(nm, sm);
      row.append(icon.el, text);
      row.addEventListener('click', () => { this.selected = r.inp; this.msg = ''; this.rebuildList(); this.renderDetail(); });
      this.listEl.appendChild(row);
    }
  }

  private section(title: string): HTMLElement {
    const d = document.createElement('div');
    d.className = 'sm-sec';
    const h = document.createElement('p');
    h.className = 'bd-label';
    h.textContent = title;
    d.appendChild(h);
    this.detail.appendChild(d);
    return d;
  }

  private btn(label: string, fn: () => void, cls = '', disabled = false): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn sm-btn ' + cls;
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener('click', fn);
    return b;
  }

  private renderDetail(): void {
    const f = this.furnace;
    this.detail.replaceChildren();
    if (!f) return;

    // 1) a kiválasztott recept betöltése
    const rec = this.section('Smelt');
    const sel = this.selected !== null ? smeltRecipes().find((r) => r.inp === this.selected) : undefined;
    if (!sel) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'Pick something on the left to smelt.';
      rec.appendChild(p);
    } else {
      const have = countOf(this.inv, sel.inp);
      const head = document.createElement('div');
      head.className = 'bd-head sm-head';
      const a = new SlotView(this.paint); a.set({ id: sel.inp, n: 1 }, true);
      const arrow = document.createElement('span'); arrow.className = 'sm-arrow'; arrow.textContent = '→';
      const b = new SlotView(this.paint, 'islot out'); b.set({ id: sel.out.id, n: sel.out.n });
      const t = document.createElement('div');
      const h = document.createElement('h3'); h.textContent = `${itemName(sel.inp)} → ${itemName(sel.out.id)}`;
      const small = document.createElement('small'); small.textContent = `${SMELT_SECONDS} s each, you carry ${have}`;
      t.append(h, small);
      head.append(a.el, arrow, b.el, t);
      rec.appendChild(head);
      const q = document.createElement('div');
      q.className = 'bd-qty';
      for (const n of [1, 10, 0]) {
        const val = n === 0 ? Math.max(1, have) : n;
        const qb = document.createElement('button');
        qb.type = 'button';
        qb.textContent = n === 0 ? 'All' : `×${n}`;
        qb.classList.toggle('on', this.qty === val);
        qb.addEventListener('click', () => { this.qty = val; this.renderDetail(); });
        q.appendChild(qb);
      }
      rec.appendChild(q);
      rec.appendChild(this.btn(`Load ×${Math.min(this.qty, Math.max(have, 1))}`, () => this.load(sel.inp), 'bd-craft', have < 1));
    }
    const loaded = f.input;
    const cook = this.section('Smelting now');
    this.cookTxt = document.createElement('p');
    this.cookTxt.className = 'sm-line';
    this.cookBar = document.createElement('div');
    const bar = document.createElement('div');
    bar.className = 'bd-bar';
    bar.appendChild(this.cookBar);
    cook.append(this.cookTxt, bar);
    if (loaded) cook.appendChild(this.btn('Take back the rest', () => this.unload(), 'sm-small'));

    // 2) hő: a tüzelő elégetése hőt ad
    const fuel = this.section('Heat');
    this.heatTxt = document.createElement('p');
    this.heatTxt.className = 'sm-line';
    this.heatBar = document.createElement('div');
    const hb = document.createElement('div');
    hb.className = 'bd-bar sm-heat';
    hb.appendChild(this.heatBar);
    fuel.append(this.heatTxt, hb);
    const fl = fuelList().map((x) => ({ ...x, have: countOf(this.inv, x.id) })).filter((x) => x.have > 0);
    if (!fl.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'Carry coal, charcoal, wood or sticks to heat it.';
      fuel.appendChild(p);
    }
    for (const x of fl) {
      const row = document.createElement('div');
      row.className = 'bd-ing-row';
      const ic = new SlotView(this.paint); ic.set({ id: x.id, n: x.have }, true);
      const nm = document.createElement('span'); nm.textContent = `${itemName(x.id)} (+${x.seconds} s)`;
      const one = this.btn('+1', () => this.burn(x.id, x.seconds, 1), 'sm-small');
      const all = this.btn('All', () => this.burn(x.id, x.seconds, x.have), 'sm-small');
      row.append(ic.el, nm, one, all);
      fuel.appendChild(row);
    }

    // 3) kimenet
    const out = this.section('Output');
    this.outSlot = document.createElement('div');
    this.outSlot.className = 'sm-line';
    out.appendChild(this.outSlot);
    out.appendChild(this.btn('Collect', () => this.collect(), 'bd-craft', !f.out));
    const m = document.createElement('p');
    m.className = 'hint';
    m.textContent = this.msg;
    this.detail.appendChild(m);
    this.updateBars();
  }

  private load(id: number): void {
    const f = this.furnace!;
    const have = countOf(this.inv, id);
    const want = Math.min(this.qty, have);
    if (f.input && f.input.id !== id) { this.msg = 'The smelter is busy with something else; take it back first.'; this.renderDetail(); return; }
    const n = f.load(id, want);
    if (n <= 0) this.msg = 'It cannot hold more of that.';
    else { take(this.inv, id, n); this.msg = ''; this.onChange(); }
    this.invalidate();
  }

  private unload(): void {
    const f = this.furnace!;
    const s = f.input;
    if (!s) return;
    const n = Math.min(s.n, roomFor(this.inv, s.id));
    if (n <= 0) { this.msg = 'Inventory full.'; this.renderDetail(); return; }
    this.inv.add(s.id, n);
    s.n -= n;
    if (s.n <= 0) f.slots[0] = null;
    f.cook = 0;
    this.onChange();
    this.invalidate();
  }

  private burn(id: number, seconds: number, n: number): void {
    const f = this.furnace!;
    let used = 0;
    for (let i = 0; i < n; i++) {
      if (!f.addHeat(seconds) ) break;
      used++;
    }
    if (used <= 0) this.msg = 'It is as hot as it gets.';
    else { take(this.inv, id, used); this.msg = ''; this.onChange(); }
    this.invalidate();
  }

  private collect(): void {
    const f = this.furnace!;
    const o = f.out;
    if (!o) return;
    const n = Math.min(o.n, roomFor(this.inv, o.id));
    if (n <= 0) { this.msg = 'Inventory full.'; this.renderDetail(); return; }
    this.inv.add(o.id, n);
    o.n -= n;
    if (o.n <= 0) f.out = null;
    this.onChange();
    this.invalidate();
  }

  /** Minden képkockán: a haladás és a mennyiségek frissítése; a gombok akkor épülnek újra, ha a tartalom változott */
  tick(): void {
    const f = this.furnace;
    if (!f) return;
    const sig = `${f.input?.id ?? 0}:${f.input?.n ?? 0}:${f.out?.id ?? 0}:${f.out?.n ?? 0}:${f.heat > 0}`;
    if (sig !== this.sig) { this.sig = sig; this.renderDetail(); return; }
    this.updateBars();
  }

  private updateBars(): void {
    const f = this.furnace;
    if (!f || !this.heatBar) return;
    this.heatBar.style.width = `${Math.round((f.heat / HEAT_CAP) * 100)}%`;
    const items = Math.floor(f.heat / SMELT_SECONDS);
    this.heatTxt.textContent = f.heat > 0 ? `${Math.ceil(f.heat)} s of heat (about ${items} item${items === 1 ? '' : 's'})` : 'Cold';
    const inp = f.input;
    this.cookBar.style.width = `${Math.round(Math.min(1, f.cook / SMELT_SECONDS) * 100)}%`;
    this.cookTxt.textContent = inp
      ? `${inp.n}× ${itemName(inp.id)}${f.lit ? '' : f.heat > 0 ? '' : ' (needs heat)'}`
      : 'Nothing loaded';
    this.outSlot.textContent = f.out ? `${f.out.n}× ${itemName(f.out.id)}` : 'Empty';
  }
}
