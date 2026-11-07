import { AIR, blockKey, fluidKind } from './blocks';
import { isReplaceable } from './fluids';
import { CH, type World } from './world';

/**
 * Eső blokkok (homok, vörös homok, kavics, betonpor): ha nincs alattuk támaszték, lefelé esnek,
 * mint a Minecraftban. Egy cellányit esnek tickenként (20 tick = 1 s), vízbe esve elmossák a vizet,
 * a növényeket és fáklyákat összetörik.
 */
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

  constructor(
    private world: World,
    /** minden megváltozott blokkra (újrameshelés, folyadék értesítés) */
    private onChange: (x: number, y: number, z: number, id: number) => void = () => {},
  ) {}

  clear(): void {
    this.due.clear();
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

  private run(x: number, y: number, z: number): void {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    if (!isGravityBlock(id) || y <= 0) return;
    if (!canFallInto(w.getBlock(x, y - 1, z))) return; // megvan a támaszték
    if (!w.setBlock(x, y - 1, z, id)) return;
    w.setBlock(x, y, z, AIR);
    this.onChange(x, y - 1, z, id);
    this.onChange(x, y, z, AIR);
    this.notify(x, y, z); // a fölötte lévő oszlop is esik tovább
    this.sched(x, y - 1, z); // és ő maga is, amíg meg nem áll
  }
}
