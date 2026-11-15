/**
 * A világ szimulációja egy helyen: folyadékok és tűz, hulló blokkok, növények (mobok: lásd MobManager).
 * Nem függ a böngészőtől és a three-től, így az egyjátékos kliens és a későbbi szerver (Node) is ugyanezt hívja.
 * Lásd docs/MULTIPLAYER.md, 2. lépés.
 */
import { CropSim } from './farming';
import { FluidSim } from './fluids';
import { GravitySim } from './gravity';
import type { World } from './world';

/** A szimuláció kimenete: ezeket a hívó köti be (kliensen újramesh és tárgyak, szerveren szétküldés). */
export interface SimHooks {
  /** egy blokk megváltozott a szimuláció miatt (folyadék, hulló blokk) */
  changed(x: number, y: number, z: number): void;
  /** a növények (nő, elszárad, kakaó) blokkot írtak */
  setBlock(x: number, y: number, z: number, id: number): void;
  /** egy hulló blokk nem tudott visszakerülni a világba: a hívó tárgyat dobhat belőle */
  drop(x: number, y: number, z: number, id: number): void;
}

/** a szimuláció fix lépése (20 tick/s) */
export const SIM_STEP = 0.05;

export class Sim {
  readonly fluids: FluidSim;
  readonly gravity: GravitySim;
  readonly crops: CropSim;
  /** a fix lépésből még hátralévő idő (a hulló blokkok interpolálásához) */
  acc = 0;

  constructor(private world: World, hooks: SimHooks) {
    this.fluids = new FluidSim(world, (x, y, z) => hooks.changed(x, y, z));
    this.crops = new CropSim(world, (x, y, z, id) => hooks.setBlock(x, y, z, id));
    this.gravity = new GravitySim(
      world,
      (x, y, z) => { hooks.changed(x, y, z); this.fluids.notify(x, y, z); },
      (x, y, z, id) => hooks.drop(x, y, z, id),
    );
  }

  /** egy blokk megváltozott (játékos vagy más ok): a szomszédos folyadék / hulló blokk újraszámolása */
  notify(x: number, y: number, z: number): void {
    this.fluids.notify(x, y, z);
    this.gravity.notify(x, y, z);
  }

  /**
   * Előrelépés `dt` másodperccel. A `points` a játékosok helyei: a növények csak körülöttük nőnek.
   * Az `active` hamis (pl. menü): nem történik semmi.
   */
  step(dt: number, points: { x: number; z: number }[], active = true): void {
    if (!active) return;
    const w = this.world;
    for (let i = 0; i < w.dynamic.length; i += 3) this.fluids.sched(w.dynamic[i], w.dynamic[i + 1], w.dynamic[i + 2], Math.floor(Math.random() * 10));
    w.dynamic.length = 0;
    this.acc = Math.min(this.acc + dt, 0.25);
    while (this.acc >= SIM_STEP) { this.acc -= SIM_STEP; this.fluids.update(); this.gravity.update(); }
    if (points.length) this.crops.updateAround(dt, points);
  }
}
