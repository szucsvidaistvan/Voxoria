import { CH } from '../shared/noise';

const SAVE_KEY = 'kockavilag-save-v1';
const SETTINGS_KEY = 'kockavilag-settings-v1';

export interface SaveData {
  /** a világ azonosítója és neve, létrehozása / utolsó mentése (ms) */
  id?: string;
  name?: string;
  created?: number;
  played?: number;
  /** a világ magassága a mentéskor (hiányzik: régi, 64 magas világ) */
  ch?: number;
  seed: number;
  edits: number[];
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  /** napszak 0..1 (a régi mentésekben nincs) */
  time?: number;
  /** hányadik nap (a hold fázisa ebből jön; a régi mentésekben nincs: 1) */
  day?: number;
  /** a tűzhelyek: [x, y, z, ...Furnace.toFlat()] (a régi mentésekben nincs) */
  furnaces?: number[][];
  /** a ládák: [x, y, z, ...Chest.toFlat()] (a régi mentésekben nincs) */
  chests?: number[][];
  /** a hotbar blokkjai (a régi mentésekben nincs) */
  hotbar?: number[];
  /** játékmód (a régi mentésekben nincs: kreatív) */
  mode?: 'survival' | 'creative';
  /** életerő, 0..20 */
  hp?: number;
  /** éhség 0..20 és telítettség (a régi mentésekben nincs: tele) */
  food?: number;
  sat?: number;
  /** a viselt páncél: [id, kopás] x 4 (a régi mentésekben nincs) */
  arm?: number[];
  /** a tároló: [id, darab, id, darab, ...] 36 helyre */
  inv?: number[];
  /** a tartós mobok (szelídített, elnevezett), a régi mentésekben nincs */
  mobs?: { k: string; x: number; y: number; z: number; yaw: number; hp: number; v: number; p?: 1 }[];
  /** a már benépesített chunkok ("cx,cz"), hogy újratöltéskor ne szülessenek újra az állatok */
  pop?: string[];
}

export interface Settings {
  renderDistance: number;
  sensitivity: number;
  /** látómező fokban (futáskor +8) */
  fov: number;
  /** a kép felbontása: alacsony (gyors), közepes, magas */
  resolution: 'low' | 'medium' | 'high';
  /** az egér/érintés függőleges irányának megfordítása */
  invertY: boolean;
  showClock: boolean;
  /** koordináták kijelzése (F3-szerű) */
  showCoords: boolean;
  /** mobok: mind, csak békés (állatok), vagy semmi */
  mobs: 'on' | 'peaceful' | 'off';
}

function read<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* tele a tárhely, vagy le van tiltva: a játék attól még megy */
  }
}

// ---------- mentés: IndexedDB (nagy világokhoz), több világ egymás mellett ----------
// A játék a mentéseket szinkron kérdezi (menü), ezért induláskor egyszer betöltjük őket a memóriába (`initSave`),
// az írás pedig háttérben, összevonva történik. Ha az IndexedDB nem elérhető (pl. privát mód), marad a localStorage.
// Egy világ = egy bejegyzés, a kulcsa a világ azonosítója. A régi egyetlen mentés ('main' hely) "My World" néven megmarad.

const DB_NAME = 'voxoria';
const STORE = 'saves';
const LEGACY_ID = 'main';
const FALLBACK_KEY = 'voxoria-worlds-v2';

const cache = new Map<string, SaveData>();
let idb: IDBDatabase | null = null;
const pending = new Map<string, SaveData | null>();
let flushing = false;
let persistAsked = false;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((ok) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => ok(null);
      req.onblocked = () => ok(null);
    } catch {
      ok(null);
    }
  });
}

function idbAll(db: IDBDatabase): Promise<[string, SaveData][]> {
  return new Promise((ok) => {
    try {
      const store = db.transaction(STORE, 'readonly').objectStore(STORE);
      const keys = store.getAllKeys();
      const vals = store.getAll();
      vals.onsuccess = () => ok((keys.result as string[]).map((k, i) => [String(k), vals.result[i] as SaveData]));
      vals.onerror = () => ok([]);
    } catch {
      ok([]);
    }
  });
}

function idbPut(db: IDBDatabase, id: string, data: SaveData | null): Promise<boolean> {
  return new Promise((ok) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      if (data) tx.objectStore(STORE).put(data, id);
      else tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => ok(true);
      tx.onerror = () => ok(false);
      tx.onabort = () => ok(false);
    } catch {
      ok(false);
    }
  });
}

const prepare = (id: string, d: SaveData): SaveData => ({ ...d, id, name: d.name ?? 'My World', played: d.played ?? 0, created: d.created ?? d.played ?? 0 });

/** Induláskor egyszer: betölti az összes világot (és átköltözteti a régi localStorage-mentést). Utána a lista szinkron. */
export async function initSave(): Promise<void> {
  idb = await openDb();
  if (idb) for (const [id, d] of await idbAll(idb)) if (d && typeof d === 'object') cache.set(id, prepare(id, d));
  const fallback = read<Record<string, SaveData>>(FALLBACK_KEY);
  if (fallback) for (const [id, d] of Object.entries(fallback)) if (!cache.has(id)) cache.set(id, prepare(id, d));
  const legacy = read<SaveData>(SAVE_KEY);
  if (legacy && !cache.has(LEGACY_ID)) {
    const d = prepare(LEGACY_ID, legacy);
    cache.set(LEGACY_ID, d);
    // csak akkor töröljük a régit, ha az újból visszaolvasva megvan
    if (idb && await idbPut(idb, LEGACY_ID, d)) try { localStorage.removeItem(SAVE_KEY); } catch { /* nincs teendő */ }
  }
}

async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  while (pending.size) {
    const [id, data] = pending.entries().next().value as [string, SaveData | null];
    pending.delete(id);
    if (idb && await idbPut(idb, id, data)) continue;
    // nincs IndexedDB (vagy hibázott): localStorage (kis világokhoz elég)
    const all = read<Record<string, SaveData>>(FALLBACK_KEY) ?? {};
    if (data) all[id] = data; else delete all[id];
    write(FALLBACK_KEY, all);
  }
  flushing = false;
}

/** Más világmagasságnál készült (régi) mentés nem tölthető be: a koordináták nem stimmelnének. Marad a tárolóban. */
const compatible = (d: SaveData) => (d.ch ?? 64) === CH;

/** A betölthető világok, a legutóbb játszott elöl. */
export const listWorlds = (): SaveData[] => [...cache.values()].filter(compatible).sort((a, b) => (b.played ?? 0) - (a.played ?? 0));
export const loadWorld = (id: string): SaveData | null => {
  const d = cache.get(id);
  return d && compatible(d) ? d : null;
};
export const newWorldId = (): string => `w${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** Egy világ mentése (az `id` kötelező; a `played` a mentés ideje) */
export const writeSave = (id: string, d: SaveData): void => {
  const data: SaveData = { ...d, id, ch: CH, played: Date.now() };
  cache.set(id, data);
  pending.set(id, data); // az újabb mentés felülírja a még nem írtat
  void flush();
  if (!persistAsked) {
    persistAsked = true;
    // kéri a böngészőt, hogy ne törölje a mentést tárhelyhiány esetén (nem mindenhol támogatott)
    try { void navigator.storage?.persist?.(); } catch { /* nincs teendő */ }
  }
};
export const deleteWorld = (id: string): void => {
  cache.delete(id);
  pending.set(id, null);
  void flush();
};

export const loadSettings = (defaults: Settings): Settings => ({ ...defaults, ...(read<Settings>(SETTINGS_KEY) ?? {}) });
export const writeSettings = (s: Settings) => write(SETTINGS_KEY, s);
