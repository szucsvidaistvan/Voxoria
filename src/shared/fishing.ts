import { EXTRA_ID, I } from './items';

/** Egy horgászat állapotgépe (nincs benne grafika, Node-ban tesztelhető): bedobás → várakozás → kapás → húzás */
export const BITE_WINDOW = 1.4;

/** Zsákmány: hal (85%) vagy szemét (15%) */
export function fishLoot(rand: () => number = Math.random): { id: number; n: number } {
  const r = rand();
  if (r < 0.6) return { id: EXTRA_ID.cod, n: 1 };
  if (r < 0.85) return { id: EXTRA_ID.salmon, n: 1 };
  const junk = [I.STICK, EXTRA_ID.string, EXTRA_ID.bone, EXTRA_ID.leather, EXTRA_ID.feather];
  return { id: junk[Math.min(junk.length - 1, Math.floor(rand() * junk.length))], n: 1 };
}

export class Fishing {
  active = false;
  /** a bóján a víz felszínén */
  x = 0; y = 0; z = 0;
  /** hátralévő várakozás a következő kapásig (mp) */
  wait = 0;
  /** > 0: a hal éppen kapott, ennyi ideig lehet berántani */
  bite = 0;
  private rand: () => number;
  constructor(rand: () => number = Math.random) { this.rand = rand; }

  cast(x: number, y: number, z: number): void {
    this.active = true;
    this.x = x; this.y = y; this.z = z;
    this.wait = 5 + this.rand() * 10;
    this.bite = 0;
  }

  cancel(): void { this.active = false; this.bite = 0; }

  /** Visszaadja: 'bite' (most kapott), 'miss' (elúszott a hal), különben null */
  update(dt: number): 'bite' | 'miss' | null {
    if (!this.active) return null;
    if (this.bite > 0) {
      this.bite -= dt;
      if (this.bite <= 0) { this.bite = 0; this.wait = 3 + this.rand() * 8; return 'miss'; }
      return null;
    }
    this.wait -= dt;
    if (this.wait <= 0) { this.wait = 0; this.bite = BITE_WINDOW; return 'bite'; }
    return null;
  }

  /** Behúzás: kapáskor zsákmány, különben semmi; mindkét esetben vége a horgászatnak */
  reel(): { id: number; n: number } | null {
    if (!this.active) return null;
    const caught = this.bite > 0 ? fishLoot(this.rand) : null;
    this.cancel();
    return caught;
  }
}
