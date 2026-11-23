import { EXTRA_ID, I } from './items';

/** Egy horgászat állapotgépe (nincs benne grafika, Node-ban tesztelhető): bedobás → várakozás → kapás → húzás */
export const BITE_WINDOW = 1.4;
/** Ha a csali közelében nincs hal, ennyi idő után mégis kap valami (általános zsákmány), hogy üres vízen is lehessen horgászni */
export const FALLBACK_WAIT = 30;

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
  /** a cast óta eltelt idő (mp) */
  private t = 0;
  /** a kapó hal azonosítója (valódi hal módban), különben null */
  hooked: number | null = null;
  private rand: () => number;
  constructor(rand: () => number = Math.random) { this.rand = rand; }

  cast(x: number, y: number, z: number): void {
    this.active = true;
    this.x = x; this.y = y; this.z = z;
    this.wait = 5 + this.rand() * 10;
    this.bite = 0;
    this.t = 0;
    this.hooked = null;
  }

  cancel(): void { this.active = false; this.bite = 0; this.hooked = null; }

  /**
   * Visszaadja: 'bite' (most kapott), 'miss' (elúszott a hal), különben null.
   * @param fish a csalinál lévő hal azonosítója: szám = ez a hal kap; null = nincs hal a közelben (csak a tartalék idő után kap valami);
   *   undefined = nincs valódi hal mód (a régi, véletlenszerű kapás)
   */
  update(dt: number, fish?: number | null): 'bite' | 'miss' | null {
    if (!this.active) return null;
    if (this.bite > 0) {
      this.bite -= dt;
      if (this.bite <= 0) { this.bite = 0; this.wait = 3 + this.rand() * 8; return 'miss'; }
      return null;
    }
    this.t += dt;
    this.wait -= dt;
    if (this.wait <= 0) {
      if (fish === undefined || fish !== null || this.t >= FALLBACK_WAIT) {
        this.wait = 0; this.bite = BITE_WINDOW; this.hooked = fish ?? null;
        return 'bite';
      }
      this.wait = 0.4; // még nincs hal a csalinál: újra megnézi
    }
    return null;
  }

  /** Behúzás: kapáskor zsákmány, különben semmi; mindkét esetben vége a horgászatnak */
  reel(): { id: number; n: number; fish: number | null } | null {
    if (!this.active) return null;
    const loot = this.bite > 0 ? fishLoot(this.rand) : null;
    const fish = this.hooked;
    this.cancel();
    return loot ? { ...loot, fish } : null;
  }
}
