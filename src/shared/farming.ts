import { AIR, B, blockId, blockKey } from './blocks';
import { CH, CS, SEA_LEVEL } from './noise';
import { fluidKind } from './blocks';
import type { World } from './world';

/** Növények: fajta -> fázisok száma */
export const CROP_STAGES: Record<string, number> = { wheat: 8, carrots: 4, potatoes: 4, beetroots: 4 };

/** Mag/vetőhagyma (tárgy kulcsa az EXTRA_ID-ban) -> a növény neve */
export const SEED_CROP: Record<string, string> = { wheat_seeds: 'wheat', carrot: 'carrots', potato: 'potatoes', beetroot_seeds: 'beetroots' };

const info = new Map<number, { crop: string; stage: number } | null>();
export function cropOf(id: number): { crop: string; stage: number } | null {
  let r = info.get(id);
  if (r === undefined) {
    const m = id > 0 ? /^(wheat|carrots|potatoes|beetroots)_stage(\d)$/.exec(blockKey(id)) : null;
    r = m ? { crop: m[1], stage: Number(m[2]) } : null;
    info.set(id, r);
  }
  return r;
}
export const isFarmland = (id: number): boolean => id > 0 && /^farmland(_moist)?$/.test(blockKey(id));
export const isTillable = (id: number): boolean => id > 0 && /^(grass_block|dirt|dirt_path|coarse_dirt)$/.test(blockKey(id));

/** A víz közelében (4 blokkon belül, a föld szintjén vagy eggyel fölötte) nedves a szántóföld */
function hydrated(w: World, x: number, y: number, z: number): boolean {
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) for (let dy = 0; dy <= 1; dy++) {
    if (fluidKind(w.getBlock(x + dx, y + dy, z + dz)) === 1) return true;
  }
  return false;
}

/**
 * Növekedés: mint a véletlen tick: a játékos körüli betöltött chunkokban minden fél másodpercben néhány véletlen
 * oszlopot nézünk meg. A növény fázisa nő (nedves földön gyorsabban), a szántóföld a víztől nedves lesz, kiszáradva
 * pedig, ha nincs rajta növény, visszaváltozik földdé. A növény szántóföld nélkül nem marad meg.
 */
export class CropSim {
  private acc = 0;
  constructor(private world: World, private set: (x: number, y: number, z: number, id: number) => void) {}

  update(dt: number, px: number, pz: number, radius = 3, samples = 6, rand: () => number = Math.random): void {
    this.acc += dt;
    if (this.acc < 0.5) return;
    this.acc = 0;
    const cx0 = Math.floor(px / CS), cz0 = Math.floor(pz / CS);
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      const ox = (cx0 + dx) * CS, oz = (cz0 + dz) * CS;
      if (!this.world.isLoaded(ox, oz)) continue;
      for (let s = 0; s < samples; s++) this.column(ox + Math.floor(rand() * CS), oz + Math.floor(rand() * CS), rand);
    }
  }

  column(x: number, z: number, rand: () => number): void {
    const w = this.world;
    const moistId = blockId('farmland_moist'), dryId = blockId('farmland');
    if (moistId === undefined || dryId === undefined) return;
    const top = Math.min(CH - 1, (w.getChunk(Math.floor(x / CS), Math.floor(z / CS))?.top ?? 0) + 1);
    for (let y = SEA_LEVEL - 6; y < top; y++) {
      const id = w.getBlock(x, y, z);
      const c = cropOf(id);
      if (c) {
        const below = w.getBlock(x, y - 1, z);
        if (!isFarmland(below)) { this.set(x, y, z, AIR); continue; }
        const max = CROP_STAGES[c.crop] - 1;
        if (c.stage < max && rand() < (below === moistId ? 0.6 : 0.3)) {
          const next = blockId(`${c.crop}_stage${c.stage + 1}`);
          if (next !== undefined) this.set(x, y, z, next);
        }
      } else if (id === moistId || id === dryId) {
        const wet = hydrated(w, x, y, z);
        const hasCrop = !!cropOf(w.getBlock(x, y + 1, z));
        if (wet && id === dryId) this.set(x, y, z, moistId);
        else if (!wet && id === moistId) this.set(x, y, z, dryId);
        else if (!wet && !hasCrop && rand() < 0.25) this.set(x, y, z, B.DIRT);
      }
    }
  }
}
