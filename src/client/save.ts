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
  /** a hotbar blokkjai (a régi mentésekben nincs) */
  hotbar?: number[];
  /** játékmód (a régi mentésekben nincs: kreatív) */
  mode?: 'survival' | 'creative';
  /** életerő, 0..20 */
  hp?: number;
  /** éhség 0..20 és telítettség (a régi mentésekben nincs: tele) */
  food?: number;
  sat?: number;
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

export const loadSave = () => read<SaveData>(SAVE_KEY);
export const writeSave = (d: SaveData) => write(SAVE_KEY, d);
export const clearSave = () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* nincs teendő */ }
};

export const loadSettings = (defaults: Settings): Settings => ({ ...defaults, ...(read<Settings>(SETTINGS_KEY) ?? {}) });
export const writeSettings = (s: Settings) => write(SETTINGS_KEY, s);
