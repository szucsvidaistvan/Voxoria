import type { SaveData, Settings } from './save';

/**
 * A főmenü ablakai: világok (lista, létrehozás, törlés) és beállítások. Csak a DOM-mal dolgozik, a játékot
 * a visszahívásokon át éri el.
 */
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/** nyitható / zárható ablak: az Esc-et a main kezeli (`closeTopOverlay`) */
export const openOverlay = (el: HTMLElement): void => { el.hidden = false; el.scrollTop = 0; };
export const closeTopOverlay = (): boolean => {
  const open = [...document.querySelectorAll<HTMLElement>('.overlay:not([hidden])')];
  if (!open.length) return false;
  open[open.length - 1].querySelector<HTMLElement>('.ov-close')?.click();
  return true;
};

const ago = (t: number): string => {
  if (!t) return 'never played';
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

/** A szöveges seedből szám: számnál maga a szám, egyébként hash; üresnél véletlen */
export function parseSeed(text: string): number {
  const t = text.trim();
  if (!t) return (Math.random() * 2 ** 31) | 0;
  if (/^-?\d{1,9}$/.test(t)) return Number(t);
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return h | 0;
}

export interface WorldsHooks {
  list(): SaveData[];
  open(id: string): void;
  create(name: string, mode: 'survival' | 'creative', seed: number): void;
  remove(id: string): void;
}

export function initWorldsUi(hooks: WorldsHooks): { open(): void; close(): void; refresh(): void } {
  const panel = $('worlds'), listView = $('worlds-list-view'), form = $<HTMLFormElement>('worlds-form');
  const listEl = $('worlds-list'), empty = $('worlds-empty'), title = $('worlds-title'), closeBtn = $('worlds-close');
  const nameEl = $<HTMLInputElement>('wf-name'), seedEl = $<HTMLInputElement>('wf-seed');
  let mode: 'survival' | 'creative' = 'survival';

  const showList = () => {
    form.hidden = true;
    listView.hidden = false;
    title.textContent = 'Select World';
    closeBtn.textContent = 'Back';
  };
  const showForm = () => {
    const n = hooks.list().length;
    nameEl.value = n ? `New World ${n + 1}` : 'New World';
    seedEl.value = '';
    setMode('survival');
    listView.hidden = true;
    form.hidden = false;
    title.textContent = 'Create New World';
    closeBtn.textContent = 'Back';
  };
  const setMode = (m: 'survival' | 'creative') => {
    mode = m;
    for (const b of form.querySelectorAll<HTMLElement>('[data-mode]')) b.setAttribute('aria-checked', String(b.dataset.mode === m));
  };
  for (const b of form.querySelectorAll<HTMLElement>('[data-mode]')) b.addEventListener('click', () => setMode(b.dataset.mode as typeof mode));

  const refresh = () => {
    listEl.textContent = '';
    const worlds = hooks.list();
    empty.hidden = worlds.length > 0;
    for (const w of worlds) {
      const row = document.createElement('div');
      row.className = 'world';
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'btn play';
      const b = document.createElement('b');
      b.textContent = w.name ?? 'World';
      const small = document.createElement('small');
      small.textContent = `${w.mode === 'creative' ? 'Creative' : 'Survival'} · Day ${w.day ?? 1} · ${ago(w.played ?? 0)}`;
      play.append(b, small);
      play.addEventListener('click', () => { panel.hidden = true; hooks.open(w.id!); });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn del';
      del.textContent = 'Delete';
      let timer = 0;
      del.addEventListener('click', () => {
        // két lépés: az első érintés rákérdez, a második töröl (3 mp-ig él)
        if (del.classList.contains('sure')) { clearTimeout(timer); hooks.remove(w.id!); refresh(); return; }
        del.classList.add('sure');
        del.textContent = 'Really?';
        timer = window.setTimeout(() => { del.classList.remove('sure'); del.textContent = 'Delete'; }, 3000);
      });
      row.append(play, del);
      listEl.appendChild(row);
    }
  };

  $('worlds-create').addEventListener('click', showForm);
  $('wf-cancel').addEventListener('click', showList);
  closeBtn.addEventListener('click', () => { if (!form.hidden) showList(); else panel.hidden = true; });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameEl.value.trim().slice(0, 24) || 'New World';
    panel.hidden = true;
    hooks.create(name, mode, parseSeed(seedEl.value));
  });
  $('btn-worlds').addEventListener('click', () => {
    refresh();
    // még nincs világ: rögtön a létrehozás
    if (!hooks.list().length) showForm(); else showList();
    openOverlay(panel);
  });
  return { open: () => { refresh(); showList(); openOverlay(panel); }, close: () => { panel.hidden = true; }, refresh };
}

export interface SettingsHooks {
  /** a beállítás megváltozott (a játék alkalmazza és menti) */
  changed(key: keyof Settings): void;
}

export function initSettingsUi(settings: Settings, hooks: SettingsHooks): void {
  const panel = $('settings');
  $('btn-settings').addEventListener('click', () => openOverlay(panel));
  $('settings-close').addEventListener('click', () => { panel.hidden = true; });

  const range = (id: string, key: 'renderDistance' | 'fov' | 'sensitivity', fmt: (v: number) => string) => {
    const el = $<HTMLInputElement>(id), out = $(`${id}-val`);
    el.value = String(settings[key]);
    out.textContent = fmt(settings[key]);
    el.addEventListener('input', () => {
      settings[key] = Number(el.value);
      out.textContent = fmt(settings[key]);
      hooks.changed(key);
    });
  };
  range('set-dist', 'renderDistance', (v) => `${v} chunks`);
  range('set-fov', 'fov', (v) => `${v}°`);
  range('set-sens', 'sensitivity', (v) => `${v.toFixed(1)}x`);

  const check = (id: string, key: 'invertY' | 'showClock' | 'showCoords') => {
    const el = $<HTMLInputElement>(id);
    el.checked = settings[key];
    el.addEventListener('change', () => { settings[key] = el.checked; hooks.changed(key); });
  };
  check('set-invert', 'invertY');
  check('set-clock', 'showClock');
  check('set-coords', 'showCoords');

  const select = <K extends 'resolution' | 'mobs'>(id: string, key: K) => {
    const el = $<HTMLSelectElement>(id);
    el.value = settings[key];
    el.addEventListener('change', () => { settings[key] = el.value as Settings[K]; el.blur(); hooks.changed(key); });
  };
  select('set-res', 'resolution');
  select('set-mobs', 'mobs');
}
