import { itemName } from '../shared/items';
import { CATEGORIES, CraftJob, bestVariant, canMake, countOf, getBook, type BookEntry } from '../shared/craftbook';
import type { Inventory } from './inventory';
import { SlotView } from './inventory';

type Painter = (c: HTMLCanvasElement, id: number) => void;

/**
 * Receptkönyv-panel (lista + részletek): a kiválasztott recept elkészül, ha megvannak az összetevők;
 * a készítés néhány másodpercig tart (folyamatjelzővel), a darabszám állítható, megszakítható.
 */
export class BookUI {
  readonly el = document.getElementById('book')!;
  private search = document.getElementById('book-search') as HTMLInputElement;
  private tabsEl = document.getElementById('book-tabs')!;
  private listEl = document.getElementById('book-list')!;
  private detail = document.getElementById('book-detail')!;
  private cat = 'All';
  private selected: BookEntry | null = null;
  private qty = 1;
  private rows = new Map<string, { row: HTMLElement; icon: SlotView }>();
  private job: CraftJob;
  private bar!: HTMLElement;
  private status!: HTMLElement;
  private btn!: HTMLButtonElement;
  private only = false;
  /** munkapadnál nyílt meg (a nagy receptek is készíthetők) */
  private atTable = false;

  constructor(private inv: Inventory, private paint: Painter, private onChange: () => void) {
    this.job = new CraftJob(inv, () => { this.onChange(); this.refresh(); });
    for (const c of CATEGORIES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = c;
      b.dataset.cat = c;
      b.addEventListener('click', () => { this.cat = c; this.rebuildList(); });
      this.tabsEl.appendChild(b);
    }
    const only = document.getElementById('book-only') as HTMLInputElement;
    only.addEventListener('change', () => { this.only = only.checked; this.rebuildList(); });
    this.search.addEventListener('input', () => this.rebuildList());
    this.search.addEventListener('keydown', (e) => e.stopPropagation());
  }

  get busy(): boolean { return this.job.active; }

  show(atTable = false): void {
    this.atTable = atTable;
    this.el.classList.remove('mode-detail');
    this.rebuildList();
    this.renderDetail();
  }

  /** keskeny képernyőn (telefon) a lista és a részletek külön „oldal": a CSS csak ott használja */
  private setDetail(on: boolean): void { this.el.classList.toggle('mode-detail', on); }

  private backButton(label: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bd-back';
    b.textContent = label;
    b.addEventListener('click', () => { if (!this.job.active) this.setDetail(false); });
    return b;
  }

  /** Bezárás / váltás: a félbemaradt készítés megszakad, az összetevők visszakerülnek */
  cancel(): void {
    if (this.job.active) { this.job.cancel(); this.onChange(); }
    this.renderDetail();
  }

  tick(dt: number): void {
    if (!this.job.active) return;
    this.job.update(dt);
    this.updateProgress();
  }

  invalidate(): void {
    for (const { icon } of this.rows.values()) icon.invalidate();
    this.rebuildList();
    this.renderDetail();
  }

  private matches(e: BookEntry): boolean {
    if (this.cat !== 'All' && e.cat !== this.cat) return false;
    const q = this.search.value.trim().toLowerCase();
    if (q && !e.name.toLowerCase().includes(q) && !e.variants.some((v) => v.need.some(([id]) => itemName(id).toLowerCase().includes(q)))) return false;
    if (this.only && (!this.can(e) || canMake(this.inv, bestVariant(this.inv, e)) < 1)) return false;
    return true;
  }

  /** itt elkészíthető-e (a nagy recepthez munkapad kell) */
  private can(e: BookEntry): boolean { return !e.big || this.atTable; }

  private summary(e: BookEntry): string {
    const v = bestVariant(this.inv, e);
    return (this.can(e) ? '' : 'Needs a crafting table · ') + v.need.map(([id, n]) => `${n}× ${itemName(id)}`).join(', ') + (e.variants.length > 1 ? ' …' : '');
  }

  private rebuildList(): void {
    for (const b of this.tabsEl.children) (b as HTMLElement).classList.toggle('on', (b as HTMLElement).dataset.cat === this.cat);
    this.listEl.replaceChildren();
    this.rows.clear();
    let shown = 0;
    // az elkészíthető receptek előre kerülnek (a sorrend egyébként marad)
    const list = getBook().filter((e) => this.matches(e));
    const ok = (e: BookEntry): number => (this.can(e) && canMake(this.inv, bestVariant(this.inv, e)) >= 1 ? 0 : 1);
    list.sort((a, b) => ok(a) - ok(b));
    for (const e of list) {
      if (++shown > 400) break;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'book-row';
      const icon = new SlotView(this.paint);
      icon.set({ id: e.out.id, n: e.out.n }, e.out.n === 1);
      const text = document.createElement('span');
      text.className = 'br-text';
      const nm = document.createElement('b');
      nm.textContent = e.name;
      const sm = document.createElement('small');
      sm.textContent = this.summary(e);
      text.append(nm, sm);
      row.append(icon.el, text);
      row.addEventListener('click', () => { if (!this.job.active) { this.selected = e; this.qty = 1; this.setDetail(true); this.renderDetail(); this.markSelected(); } });
      this.listEl.appendChild(row);
      this.rows.set(e.key, { row, icon });
    }
    if (!shown) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'No recipe found.';
      this.listEl.appendChild(p);
    }
    this.refresh();
    this.markSelected();
  }

  /** a lista sorainak „elkészíthető" jelzése és a részletek frissítése (a készlet változása után) */
  private refresh(): void {
    for (const e of getBook()) {
      const r = this.rows.get(e.key);
      if (r) r.row.classList.toggle('no', !this.can(e) || canMake(this.inv, bestVariant(this.inv, e)) < 1);
    }
    if (this.selected) this.renderDetail();
  }

  private markSelected(): void {
    for (const [k, r] of this.rows) r.row.classList.toggle('sel', k === this.selected?.key);
  }

  private renderDetail(): void {
    const d = this.detail;
    d.replaceChildren();
    const e = this.selected;
    if (!e) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'Pick a recipe on the left. If you carry the ingredients, it is crafted in a few seconds, a 2×2 recipe works anywhere; bigger ones need a crafting table.';
      d.appendChild(p);
      return;
    }
    const v = bestVariant(this.inv, e);
    d.appendChild(this.backButton('← Back to recipes'));
    const head = document.createElement('div');
    head.className = 'bd-head';
    const icon = new SlotView(this.paint, 'islot out');
    icon.set({ id: e.out.id, n: e.out.n });
    const t = document.createElement('div');
    const h = document.createElement('h3');
    h.textContent = e.name + (e.out.n > 1 ? ` ×${e.out.n}` : '');
    const s = document.createElement('small');
    s.textContent = `Takes ${e.seconds.toFixed(1)} s`;
    t.append(h, s);
    head.append(icon.el, t);
    d.appendChild(head);

    const lab = document.createElement('p');
    lab.className = 'bd-label';
    lab.textContent = 'Ingredients';
    d.appendChild(lab);
    const ing = document.createElement('div');
    ing.className = 'bd-ing';
    for (const [id, n] of v.need) {
      const have = countOf(this.inv, id);
      const row = document.createElement('div');
      row.className = 'bd-ing-row' + (have < n ? ' lack' : '');
      const ic = new SlotView(this.paint);
      ic.set({ id, n }, true);
      const nm = document.createElement('span');
      nm.textContent = itemName(id);
      const cnt = document.createElement('b');
      cnt.textContent = `${have} / ${n}`;
      row.append(ic.el, nm, cnt);
      ing.appendChild(row);
    }
    d.appendChild(ing);
    if (e.variants.length > 1) {
      const alt = document.createElement('p');
      alt.className = 'hint';
      alt.textContent = 'Works with several kinds of this ingredient: the one you carry is used.';
      d.appendChild(alt);
    }

    const max = Math.max(0, canMake(this.inv, v));
    if (!this.can(e)) {
      const need = document.createElement('p');
      need.className = 'bd-need';
      need.textContent = 'Needs a crafting table. Place one (4 planks) and use it.';
      d.appendChild(need);
    }
    const q = document.createElement('div');
    q.className = 'bd-qty';
    for (const n of [1, 5, 10, 0]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = n === 0 ? 'Max' : `×${n}`;
      const val = n === 0 ? Math.max(1, max) : n;
      b.classList.toggle('on', this.qty === val);
      b.addEventListener('click', () => { this.qty = val; this.renderDetail(); });
      q.appendChild(b);
    }
    d.appendChild(q);

    const foot = document.createElement('div');
    foot.className = 'bd-foot';
    this.btn = document.createElement('button');
    this.btn.type = 'button';
    this.btn.className = 'btn bd-craft';
    this.btn.addEventListener('click', () => this.job.active ? this.cancel() : this.start());
    foot.appendChild(this.btn);
    const bar = document.createElement('div');
    bar.className = 'bd-bar';
    this.bar = document.createElement('div');
    bar.appendChild(this.bar);
    foot.appendChild(bar);
    this.status = document.createElement('p');
    this.status.className = 'hint';
    foot.appendChild(this.status);
    d.appendChild(foot);
    this.updateProgress();
    this.btn.disabled = !this.job.active && (max < 1 || !this.can(e));
  }

  private start(): void {
    if (!this.selected || !this.can(this.selected)) return;
    const max = canMake(this.inv, bestVariant(this.inv, this.selected));
    this.job.start(this.selected, Math.max(1, Math.min(this.qty, max)));
    this.onChange();
    this.renderDetail();
  }

  private updateProgress(): void {
    if (!this.btn) return;
    const j = this.job;
    this.btn.classList.toggle('cancel', j.active);
    this.btn.textContent = j.active ? `Cancel (${j.left} left)` : `Craft${this.qty > 1 ? ` ×${this.qty}` : ''}`;
    this.bar.style.width = `${j.active ? Math.round(j.progress * 100) : 0}%`;
    this.status.textContent = j.active ? 'Crafting…' : j.message;
  }
}
