import {
  AIR, B, BLOCKS, FLUID_LAVA, FLUID_WATER, fluidId, fluidKind, fluidLevel, flammability, isSolid,
} from './blocks';
import { CH, type World } from './world';

/**
 * Víz, láva és tűz szimulációja a Minecraft szabályai szerint (20 "tick" = 1 másodperc).
 * - A víz 5 tickenként (0,25 s) terjed, 7 blokk távolságig; két szomszédos forrás között új forrás születik.
 * - A láva 30 tickenként (1,5 s) terjed, 3 blokk távolságig.
 * - Láva + víz: a láva forrás obszidiánná, a folyó láva kaviccsá válik; ha a láva lefelé vízbe folyik, kő lesz.
 * - A tűz átterjed az éghető blokkokra, majd kialszik. A láva meggyújtja a közelében lévő éghető dolgokat.
 * A világon kívül semmit nem használ, így a szerver is ugyanezt futtathatja.
 */

export const TICKS_PER_SECOND = 20;
const WATER_DELAY = 5, LAVA_DELAY = 30, FIRE_DELAY = 30;
const MAX_LEVEL: Record<number, number> = { [FLUID_WATER]: 7, [FLUID_LAVA]: 3 };

const OFF = 1 << 20;
const keyOf = (x: number, y: number, z: number) => ((x + OFF) * 2097152 + (z + OFF)) * 64 + y;
const unkey = (k: number): [number, number, number] => {
  const y = k % 64;
  const rest = (k - y) / 64;
  const zz = rest % 2097152;
  return [(rest - zz) / 2097152 - OFF, y, zz - OFF];
};

const SIDES: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const AROUND: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];

/** Erősség: minél kisebb, annál erősebb a folyadék (a forrás és a zuhanó a legerősebb) */
const strength = (level: number) => (level === 8 ? 0 : level);

/** Átjárható, a folyadék által elmosható blokk (növény, fáklya, sín, tűz) */
export function isReplaceable(id: number): boolean {
  if (id === AIR || id === B.FIRE) return true;
  const def = BLOCKS[id];
  return !!def && !!def.parts && !!def.boxes && def.boxes.length === 0 && fluidKind(id) === 0;
}

export class FluidSim {
  tick = 0;
  private due = new Map<number, number>();

  /**
   * @param onChange minden megváltozott blokkra meghívódik (újrameshelés)
   * @param rand 0..1 véletlen (teszteléshez cserélhető)
   */
  constructor(
    private world: World,
    private onChange: (x: number, y: number, z: number) => void = () => {},
    private rand: () => number = Math.random,
  ) {}

  clear(): void {
    this.due.clear();
  }

  /** Egy blokk megváltozott (a játékos vagy a szimuláció módosította): a környezete frissítést kap. */
  notify(x: number, y: number, z: number): void {
    const w = this.world;
    if (fluidKind(w.getBlock(x, y, z)) === FLUID_LAVA) this.lavaReact(x, y, z);
    for (const [dx, dy, dz] of AROUND) {
      if (fluidKind(w.getBlock(x + dx, y + dy, z + dz)) === FLUID_LAVA) this.lavaReact(x + dx, y + dy, z + dz);
    }
    this.sched(x, y, z);
    for (const [dx, dy, dz] of AROUND) this.sched(x + dx, y + dy, z + dz);
  }

  /** Egy cella ütemezése a blokk fajtájának megfelelő késleltetéssel (ha folyadék vagy tűz) */
  sched(x: number, y: number, z: number, extra = 0): void {
    if (y < 0 || y >= CH) return;
    const id = this.world.getBlock(x, y, z);
    const kind = fluidKind(id);
    const delay = kind === FLUID_WATER ? WATER_DELAY : kind === FLUID_LAVA ? LAVA_DELAY : id === B.FIRE ? FIRE_DELAY : 0;
    if (!delay) return;
    const k = keyOf(x, y, z);
    const t = this.tick + delay + extra;
    const cur = this.due.get(k);
    if (cur === undefined || cur > t) this.due.set(k, t);
  }

  /** Egy tick: az esedékes cellák frissítése (legfeljebb maxOps darab) */
  update(maxOps = 600): void {
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

  get pending(): number {
    return this.due.size;
  }

  private set(x: number, y: number, z: number, id: number): boolean {
    if (!this.world.setBlock(x, y, z, id)) return false;
    this.onChange(x, y, z);
    this.notify(x, y, z);
    return true;
  }

  private run(x: number, y: number, z: number): void {
    const id = this.world.getBlock(x, y, z);
    if (id === B.FIRE) { this.fire(x, y, z); return; }
    const kind = fluidKind(id);
    if (kind) this.fluid(x, y, z, id, kind);
  }

  // ---------- folyadékok ----------

  private fluid(x: number, y: number, z: number, id: number, kind: number): void {
    const w = this.world;
    if (kind === FLUID_LAVA && this.lavaReact(x, y, z)) return;

    let level = fluidLevel(id);
    if (level !== 0) {
      // a folyó blokk szintje a táplálóitól függ; ha nincs tápláló, elapad
      const nl = this.feedLevel(x, y, z, kind);
      if (nl < 0) { this.set(x, y, z, AIR); return; }
      if (nl !== level) {
        if (!this.set(x, y, z, fluidId(kind, nl))) return;
        level = nl;
        if (kind === FLUID_LAVA && w.getBlock(x, y, z) !== fluidId(kind, nl)) return; // közben megkövült
      }
    }
    if (kind === FLUID_LAVA) this.lavaIgnite(x, y, z);

    // lefelé folyik, ha tud; oldalra csak a forrás, vagy ha alatta nincs mélyedés
    const hole = y > 0 && this.canFlow(w.getBlock(x, y - 1, z), kind, 8, true);
    if (hole) this.flowInto(x, y - 1, z, kind, 8, true);
    if (level === 0 || !hole) {
      const next = strength(level) + 1;
      if (next <= MAX_LEVEL[kind]) {
        for (const [dx, dz] of SIDES) {
          if (this.canFlow(w.getBlock(x + dx, y, z + dz), kind, next, false)) this.flowInto(x + dx, y, z + dz, kind, next, false);
        }
      }
    }
  }

  /** A folyó blokk új szintje: 1..7, 8 (fentről táplált), 0 (új forrás, csak víznél), vagy -1 (elapad) */
  private feedLevel(x: number, y: number, z: number, kind: number): number {
    const w = this.world;
    if (fluidKind(w.getBlock(x, y + 1, z)) === kind) return 8;
    let best = 99, sources = 0;
    for (const [dx, dz] of SIDES) {
      const nid = w.getBlock(x + dx, y, z + dz);
      if (fluidKind(nid) !== kind) continue;
      const nl = fluidLevel(nid);
      // a mélyedés fölött álló folyó blokk lefelé folyik, oldalra nem táplál
      if (nl !== 0 && y > 0 && this.canFlow(w.getBlock(x + dx, y - 1, z + dz), kind, 8, true)) continue;
      if (nl === 0) sources++;
      best = Math.min(best, strength(nl) + 1);
    }
    if (kind === FLUID_WATER && sources >= 2) {
      const below = w.getBlock(x, y - 1, z);
      if (y === 0 || isSolid(below) || (fluidKind(below) === FLUID_WATER && fluidLevel(below) === 0)) return 0;
    }
    return best <= MAX_LEVEL[kind] ? best : -1;
  }

  /** Befolyhat-e ide a folyadék az adott szinttel? */
  private canFlow(tid: number, kind: number, newLevel: number, down: boolean): boolean {
    if (tid === AIR) return true;
    const tk = fluidKind(tid);
    if (tk === kind) {
      const tl = fluidLevel(tid);
      return tl !== 0 && strength(newLevel) < strength(tl);
    }
    // a láva lefelé a vízbe folyva követ csinál, a víz a lávába nem folyik
    if (tk) return kind === FLUID_LAVA && down;
    return isReplaceable(tid);
  }

  private flowInto(x: number, y: number, z: number, kind: number, level: number, down: boolean): void {
    const tid = this.world.getBlock(x, y, z);
    const tk = fluidKind(tid);
    if (tk && tk !== kind) {
      if (down) this.set(x, y, z, B.STONE);
      return;
    }
    this.set(x, y, z, fluidId(kind, level));
  }

  /** A víz a láva felett vagy mellett: a forrás obszidiánná, a folyó láva kaviccsá válik. Igaz, ha átalakult. */
  private lavaReact(x: number, y: number, z: number): boolean {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    if (fluidKind(id) !== FLUID_LAVA) return false;
    for (const [dx, dy, dz] of AROUND) {
      if (dy < 0) continue; // a láva alatti víz nem hat rá
      if (fluidKind(w.getBlock(x + dx, y + dy, z + dz)) === FLUID_WATER) {
        this.set(x, y, z, fluidLevel(id) === 0 ? B.OBSIDIAN : B.COBBLE);
        return true;
      }
    }
    return false;
  }

  /** A láva meggyújtja a mellette lévő éghető dolgokat */
  private lavaIgnite(x: number, y: number, z: number): void {
    const w = this.world;
    for (const [dx, dy, dz] of AROUND) {
      if (dy < 0) continue;
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const nid = w.getBlock(nx, ny, nz);
      if (flammability(nid) > 0 && this.rand() < 0.3) this.set(nx, ny, nz, B.FIRE);
      else if (nid === AIR && this.rand() < 0.12 && this.nearFlammable(nx, ny, nz) && !this.nearWater(nx, ny, nz)) this.set(nx, ny, nz, B.FIRE);
    }
  }

  // ---------- tűz ----------

  private nearFlammable(x: number, y: number, z: number): boolean {
    for (const [dx, dy, dz] of AROUND) if (flammability(this.world.getBlock(x + dx, y + dy, z + dz)) > 0) return true;
    return false;
  }

  private nearWater(x: number, y: number, z: number): boolean {
    for (const [dx, dy, dz] of AROUND) if (fluidKind(this.world.getBlock(x + dx, y + dy, z + dz)) === FLUID_WATER) return true;
    return false;
  }

  private fire(x: number, y: number, z: number): void {
    const w = this.world;
    if (this.nearWater(x, y, z)) { this.set(x, y, z, AIR); return; }
    const burnable = this.nearFlammable(x, y, z);
    // alátámasztás nélkül (levegőben, éghető szomszéd nélkül) kialszik
    if (!burnable && !(y > 0 && isSolid(w.getBlock(x, y - 1, z)))) { this.set(x, y, z, AIR); return; }

    // elégeti az éghető szomszédokat
    for (const [dx, dy, dz] of AROUND) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const f = flammability(w.getBlock(nx, ny, nz));
      if (f > 0 && this.rand() < f) {
        this.set(nx, ny, nz, this.rand() < 0.7 && !this.nearWater(nx, ny, nz) ? B.FIRE : AIR);
      }
    }
    // átterjed a közeli, éghető dolgok mellé
    for (let i = 0; i < 3; i++) {
      const nx = x + Math.floor(this.rand() * 3) - 1, nz = z + Math.floor(this.rand() * 3) - 1;
      const ny = y + Math.floor(this.rand() * 6) - 1;
      if (ny < 0 || ny >= CH) continue;
      if (w.getBlock(nx, ny, nz) === AIR && this.nearFlammable(nx, ny, nz) && !this.nearWater(nx, ny, nz) && this.rand() < 0.35) {
        this.set(nx, ny, nz, B.FIRE);
      }
    }
    // elalszik, vagy tovább ég
    if (this.rand() < (burnable ? 0.1 : 0.35)) this.set(x, y, z, AIR);
    else this.sched(x, y, z, Math.floor(this.rand() * 10));
  }
}
