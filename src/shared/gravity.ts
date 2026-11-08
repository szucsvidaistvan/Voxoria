import { AIR, blockKey, fluidKind } from './blocks';
import { isReplaceable } from './fluids';
import { CH, type World } from './world';

/**
 * Eső blokkok (homok, vörös homok, kavics, betonpor): ha nincs alattuk támaszték, a blokk kikerül a világból,
 * és eső entitás lesz belőle (gyorsuló mozgással esik, a kliens kirajzolja), majd földet éréskor visszakerül
 * a világba. Vízbe esve elmossa a vizet, a növényeket és fáklyákat összetöri.
 */
export interface Faller {
  id: number;
  x: number;
  z: number;
  /** a blokk alja, és az előző tickben ugyanez (a kirajzolás ebből simít) */
  y: number;
  py: number;
  vy: number;
}

/** blokk/tick² és a tickenkénti légellenállás (mint a Minecraftban) */
const GRAVITY = 0.04;
const DRAG = 0.98;
const FALL_DELAY = 2;

const cache = new Map<number, boolean>();
export function isGravityBlock(id: number): boolean {
  let r = cache.get(id);
  if (r === undefined) {
    const k = id > 0 ? blockKey(id) : '';
    r = k === 'sand' || k === 'red_sand' || k === 'gravel' || k.endsWith('_concrete_powder');
    cache.set(id, r);
  }
  return r;
}

/** Ide eshet a blokk: levegő, folyadék vagy elmosható (növény, fáklya, tűz) */
const canFallInto = (id: number) => id === AIR || fluidKind(id) !== 0 || isReplaceable(id);

const OFF = 1 << 20;
const keyOf = (x: number, y: number, z: number) => ((x + OFF) * 2097152 + (z + OFF)) * 64 + y;
const unkey = (k: number): [number, number, number] => {
  const y = k % 64;
  const rest = (k - y) / 64;
  const zz = rest % 2097152;
  return [(rest - zz) / 2097152 - OFF, y, zz - OFF];
};

const AROUND: [number, number, number][] = [[0, 0, 0], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

export class GravitySim {
  tick = 0;
  private due = new Map<number, number>();
  /** a levegőben lévő blokkok */
  readonly fallers: Faller[] = [];

  constructor(
    private world: World,
    /** minden megváltozott blokkra (újrameshelés, folyadék értesítés) */
    private onChange: (x: number, y: number, z: number, id: number) => void = () => {},
    /** a blokk nem tudott visszakerülni a világba: a hívó tárgyat dobhat belőle */
    private onDrop: (x: number, y: number, z: number, id: number) => void = () => {},
  ) {}

  clear(): void {
    this.due.clear();
    this.fallers.length = 0;
  }

  get pending(): number {
    return this.due.size;
  }

  /** Egy blokk megváltozott: ő és a szomszédai esetleg esni kezdenek */
  notify(x: number, y: number, z: number): void {
    for (const [dx, dy, dz] of AROUND) this.sched(x + dx, y + dy, z + dz);
  }

  sched(x: number, y: number, z: number): void {
    if (y < 0 || y >= CH) return;
    if (!isGravityBlock(this.world.getBlock(x, y, z))) return;
    const k = keyOf(x, y, z);
    if (!this.due.has(k)) this.due.set(k, this.tick + FALL_DELAY);
  }

  update(maxOps = 400): void {
    this.tick++;
    this.moveFallers();
    let ops = 0;
    for (const [k, t] of this.due) {
      if (t > this.tick) continue;
      this.due.delete(k);
      const [x, y, z] = unkey(k);
      if (!this.world.isLoaded(x, z)) continue;
      this.run(x, y, z);
      if (++ops >= maxOps) break;
    }
  }

  private moveFallers(): void {
    const w = this.world;
    // alulról felfelé: az alsó blokk előbb ér földet, a fölötte lévő rá kerül
    for (let i = 0; i < this.fallers.length; i++) {
      const f = this.fallers[i];
      f.py = f.y;
      f.vy = (f.vy - GRAVITY) * DRAG;
      let remaining = -f.vy;
      let landed = false;
      // kis lépésekben, hogy egy tick alatt se essen át semmin
      while (remaining > 1e-6) {
        const step = Math.min(remaining, 0.25);
        remaining -= step;
        f.y -= step;
        const cy = Math.floor(f.y);
        if (cy < 0 || !canFallInto(w.getBlock(f.x, cy, f.z))) { landed = true; break; }
      }
      if (!landed && f.y > 0) continue;
      this.fallers.splice(i--, 1);
      let ly = Math.max(Math.floor(f.y) + 1, 1);
      // ha a hely foglalt (pl. a másik eső blokk már odaért), feljebb halmozódik
      while (ly < CH && w.isLoaded(f.x, f.z) && !canFallInto(w.getBlock(f.x, ly, f.z))) ly++;
      if (!w.isLoaded(f.x, f.z)) continue;
      if (ly < CH && canFallInto(w.getBlock(f.x, ly, f.z)) && w.setBlock(f.x, ly, f.z, f.id)) {
        this.onChange(f.x, ly, f.z, f.id);
        this.notify(f.x, ly, f.z);
      } else this.onDrop(f.x, ly, f.z, f.id);
    }
  }

  private run(x: number, y: number, z: number): void {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    if (!isGravityBlock(id) || y <= 0) return;
    if (!canFallInto(w.getBlock(x, y - 1, z))) return; // megvan a támaszték
    // a blokk kikerül a világból, és esni kezd
    if (!w.setBlock(x, y, z, AIR)) return;
    this.onChange(x, y, z, AIR);
    this.fallers.push({ id, x, z, y, py: y, vy: 0 });
    this.notify(x, y, z); // a fölötte lévő oszlop is elindul
  }
}
