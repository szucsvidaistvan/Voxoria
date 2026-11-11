const SAVE_KEY = 'kockavilag-save-v1';
const SETTINGS_KEY = 'kockavilag-settings-v1';

export interface SaveData {
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
}

export interface Settings {
  renderDistance: number;
  sensitivity: number;
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

// ---------- mentés: IndexedDB (nagy világokhoz), a régi localStorage-mentés átköltöztetésével ----------
// A játék a mentést szinkron kérdezi (menü, indulás), ezért induláskor egyszer betöltjük a memóriába (`initSave`),
// az írás pedig háttérben, összevonva történik. Ha az IndexedDB nem elérhető (pl. privát mód), marad a localStorage.

const DB_NAME = 'voxoria';
const STORE = 'saves';
const SLOT = 'main';

let cache: SaveData | null = null;
let idb: IDBDatabase | null = null;
let pending: { data: SaveData | null } | null = null;
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

function idbGet(db: IDBDatabase): Promise<SaveData | null> {
  return new Promise((ok) => {
    try {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(SLOT);
      r.onsuccess = () => ok((r.result as SaveData | undefined) ?? null);
      r.onerror = () => ok(null);
    } catch {
      ok(null);
    }
  });
}

function idbPut(db: IDBDatabase, data: SaveData | null): Promise<boolean> {
  return new Promise((ok) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      if (data) tx.objectStore(STORE).put(data, SLOT);
      else tx.objectStore(STORE).delete(SLOT);
      tx.oncomplete = () => ok(true);
      tx.onerror = () => ok(false);
      tx.onabort = () => ok(false);
    } catch {
      ok(false);
    }
  });
}

/** Induláskor egyszer: betölti a mentést (és átköltözteti a régi localStorage-mentést). Utána a loadSave szinkron. */
export async function initSave(): Promise<void> {
  idb = await openDb();
  const legacy = read<SaveData>(SAVE_KEY);
  if (idb) {
    cache = await idbGet(idb);
    if (!cache && legacy) {
      // átköltöztetés: csak akkor töröljük a régit, ha az újból visszaolvasva megvan
      if (await idbPut(idb, legacy) && (await idbGet(idb))) {
        cache = legacy;
        try { localStorage.removeItem(SAVE_KEY); } catch { /* nincs teendő */ }
      } else cache = legacy;
    }
  } else cache = legacy;
}

async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  while (pending) {
    const job = pending;
    pending = null;
    let done = false;
    if (idb) done = await idbPut(idb, job.data);
    if (!done) { // nincs IndexedDB (vagy hibázott): a régi módszer
      if (job.data) write(SAVE_KEY, job.data);
      else { try { localStorage.removeItem(SAVE_KEY); } catch { /* nincs teendő */ } }
    }
  }
  flushing = false;
}

export const loadSave = (): SaveData | null => cache;
export const writeSave = (d: SaveData): void => {
  cache = d;
  pending = { data: d }; // az újabb mentés felülírja a még nem írtat
  void flush();
  if (!persistAsked) {
    persistAsked = true;
    // kéri a böngészőt, hogy ne törölje a mentést tárhelyhiány esetén (nem mindenhol támogatott)
    try { void navigator.storage?.persist?.(); } catch { /* nincs teendő */ }
  }
};
export const clearSave = (): void => {
  cache = null;
  pending = { data: null };
  void flush();
};

export const loadSettings = (defaults: Settings): Settings => ({ ...defaults, ...(read<Settings>(SETTINGS_KEY) ?? {}) });
export const writeSettings = (s: Settings) => write(SETTINGS_KEY, s);
