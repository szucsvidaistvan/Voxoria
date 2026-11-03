/** Életerő: 20 pont = 10 szív (egy szív két pont). Sebzés, gyógyulás, fulladás, égés; éhség (20 pont = 10 húscomb). */
export interface Env {
  inLava: boolean;
  inFire: boolean;
  inWater: boolean;
  headUnderwater: boolean;
  /** kreatív módban nincs sebzés */
  creative: boolean;
}

const MAX_AIR = 15; // másodperc a víz alatt, mielőtt fulladni kezdünk

export class Health {
  readonly max = 20;
  hp = 20;
  /** hátralévő levegő másodpercben */
  air = MAX_AIR;
  readonly maxAir = MAX_AIR;
  /** ennyi másodpercig ég még a játékos */
  burn = 0;
  /** éhség 0..20 (10 húscomb); a telítettség és a kimerültség a Minecraftéhoz hasonló rejtett számláló */
  food = 20;
  saturation = 5;
  private exhaustion = 0;
  private foodT = 0;
  private starveT = 0;
  dead = false;
  /** a legutóbbi sebzés óta eltelt idő */
  private since = 99;
  private lavaT = 0;
  private fireT = 0;
  private burnT = 0;
  private drownT = 0;
  private regenT = 0;

  /** sebzéskor hívódik (a képernyő felvillanásához) */
  onHurt: (amount: number) => void = () => {};

  reset(): void {
    this.hp = this.max;
    this.air = MAX_AIR;
    this.burn = 0;
    this.food = 20;
    this.saturation = 5;
    this.exhaustion = this.foodT = this.starveT = 0;
    this.dead = false;
    this.since = 99;
    this.lavaT = this.fireT = this.burnT = this.drownT = this.regenT = 0;
  }

  /**
   * Kimerültség: mozgás, ugrás, bontás, harc növeli. 4 fölött először a telítettségből, majd az éhségből vesz el egy pontot.
   * Kreatívban nincs éhség.
   */
  exhaust(n: number): void {
    if (this.dead) return;
    this.exhaustion += n;
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.food = Math.max(0, this.food - 1);
    }
  }

  /** Evés: éhség és telítettség visszatöltése. Igaz, ha ettünk (tele éhséggel nem lehet enni). */
  eat(hunger: number, sat: number): boolean {
    if (this.dead || this.food >= 20) return false;
    this.food = Math.min(20, this.food + hunger);
    this.saturation = Math.min(this.food, this.saturation + sat);
    return true;
  }

  damage(n: number): void {
    if (this.dead || n <= 0) return;
    this.hp = Math.max(0, this.hp - n);
    this.since = 0;
    this.exhaust(0.1);
    this.onHurt(n);
    if (this.hp <= 0) this.dead = true;
  }

  heal(n: number): void {
    if (!this.dead) this.hp = Math.min(this.max, this.hp + n);
  }

  /** Esés: 3 blokk fölött a magasság mínusz 3 pont a sebzés */
  fall(distance: number): void {
    const d = Math.ceil(distance - 3);
    if (d > 0) this.damage(d);
  }

  update(dt: number, env: Env): void {
    if (this.dead) return;
    if (env.creative) {
      this.air = MAX_AIR;
      this.burn = 0;
      return;
    }
    this.since += dt;

    // láva: erős sebzés félmásodpercenként, és meggyullad
    if (env.inLava) {
      this.burn = 15;
      this.lavaT += dt;
      if (this.lavaT >= 0.5) { this.lavaT -= 0.5; this.damage(4); }
    } else this.lavaT = 0;
    // tűz: gyengébb sebzés, és meggyullad
    if (env.inFire) {
      this.burn = Math.max(this.burn, 6);
      this.fireT += dt;
      if (this.fireT >= 0.5) { this.fireT -= 0.5; this.damage(1); }
    } else this.fireT = 0;

    // égés: másodpercenként 1 pont; a víz eloltja
    if (this.burn > 0) {
      if (env.inWater && !env.inLava) this.burn = 0;
      else {
        this.burn -= dt;
        this.burnT += dt;
        if (this.burnT >= 1) { this.burnT -= 1; this.damage(1); }
      }
    } else this.burnT = 0;

    // fulladás
    if (env.headUnderwater) {
      this.air = Math.max(0, this.air - dt);
      if (this.air <= 0) {
        this.drownT += dt;
        if (this.drownT >= 1) { this.drownT -= 1; this.damage(2); }
      }
    } else {
      this.air = Math.min(MAX_AIR, this.air + dt * 5);
      this.drownT = 0;
    }

    // természetes gyógyulás az éhségtől függ: 18 fölött 4 másodpercenként egy pont; tele éhséggel és telítettséggel gyorsabb;
    // gyógyuláskor kimerül a játékos. Éhezés (0 éhség): 4 másodpercenként egy pont sebzés, de 1 pont életerőnél megáll.
    if (this.food >= 18 && this.hp < this.max && this.burn <= 0) {
      const fast = this.food >= 20 && this.saturation > 0;
      this.foodT += dt;
      if (this.foodT >= (fast ? 0.5 : 4)) {
        this.foodT = 0;
        this.heal(1);
        this.exhaust(fast ? 3 : 6);
      }
      this.starveT = 0;
    } else if (this.food <= 0) {
      this.foodT = 0;
      this.starveT += dt;
      if (this.starveT >= 4) { this.starveT = 0; if (this.hp > 1) this.damage(1); }
    } else this.foodT = this.starveT = 0;
  }
}

// ---------- megjelenítés (szívek és buborékok) ----------

const HEART = [
  '.OO...OO.',
  'OHXO.OXXO',
  'OXXXOXXXO',
  'OXXXXXXXO',
  '.OXXXXXO.',
  '..OXXXO..',
  '...OXO...',
  '....O....',
];
const DRUMSTICK = [
  '.....OOO.',
  '...OOXXXO',
  '..OXXHXXO',
  '..OXXXXXO',
  '..OXXXXO.',
  '.OBOXXO..',
  'OBWBOO...',
  'OWBO.....',
  '.OO......',
];
const BUBBLE = [
  '..BBBBB..',
  '.BWWwwwB.',
  'BWw....wB',
  'Bw.....wB',
  'B.......B',
  'B......wB',
  '.B....wB.',
  '..BBBBB..',
];

/** Pixeles ikon készítése egy mintából; a `fill` a töltés színe (a bal oldali félig is lehet) */
function sprite(rows: string[], colors: Record<string, string>, fillTo = 9): string {
  const c = document.createElement('canvas');
  c.width = 9;
  c.height = rows.length;
  const ctx = c.getContext('2d')!;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      let col = colors[ch];
      if (ch === 'X' && x >= fillTo) col = colors.E;
      if (ch === 'H' && x >= fillTo) col = colors.E;
      if (!col) return;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  return c.toDataURL();
}

export function createVitals(heartsEl: HTMLElement, airEl: HTMLElement, foodEl: HTMLElement) {
  const heartColors = { O: '#2a0b0b', X: '#e0302a', H: '#ff9a8f', E: '#4b1a1a' };
  const urls = {
    full: sprite(HEART, heartColors),
    half: sprite(HEART, heartColors, 5),
    empty: sprite(HEART, heartColors, 0),
    burn: sprite(HEART, { ...heartColors, X: '#f59a1b', H: '#ffe08a' }),
    air: sprite(BUBBLE, { B: '#1d4a8a', W: '#e8f4ff', w: '#8fc4ff', E: '#8fc4ff' }),
  };
  const meat = { O: '#3a1e0e', X: '#c9702f', H: '#f0a45a', B: '#cfc6b0', W: '#f3efe0', E: '#4a2d17' };
  const food = {
    full: sprite(DRUMSTICK, meat),
    half: sprite(DRUMSTICK, meat, 5),
    empty: sprite(DRUMSTICK, meat, 0),
  };
  const drums: HTMLElement[] = [];
  const hearts: HTMLElement[] = [];
  const bubbles: HTMLElement[] = [];
  for (let i = 0; i < 10; i++) {
    const h = document.createElement('span');
    h.className = 'vital';
    heartsEl.appendChild(h);
    hearts.push(h);
    const b = document.createElement('span');
    b.className = 'vital';
    b.style.backgroundImage = `url(${urls.air})`;
    airEl.appendChild(b);
    bubbles.push(b);
    const d = document.createElement('span');
    d.className = 'vital';
    foodEl.appendChild(d);
    drums.push(d);
  }
  let last = '';
  return (hp: Health, shake: boolean) => {
    const sig = `${hp.hp}|${hp.burn > 0}|${Math.ceil((hp.air / hp.maxAir) * 10)}|${shake}|${hp.food}|${hp.saturation > 0}`;
    if (sig === last) return;
    last = sig;
    hearts.forEach((el, i) => {
      const v = hp.hp - i * 2;
      el.style.backgroundImage = `url(${hp.burn > 0 && v > 0 ? urls.burn : v >= 2 ? urls.full : v === 1 ? urls.half : urls.empty})`;
      el.classList.toggle('shake', shake && hp.hp <= 6);
    });
    // éhség: a húscombok balról jobbra ürülnek (a jobb szélső tölt utoljára, mint a Minecraftban); a rázkódás jelzi, ha nincs telítettség és éhes a játékos
    drums.forEach((el, i) => {
      const v = hp.food - i * 2; // a sor jobbról balra épül (row-reverse), az első húscomb a jobb szélső
      el.style.backgroundImage = `url(${v >= 2 ? food.full : v === 1 ? food.half : food.empty})`;
      el.classList.toggle('shake', shake && hp.food <= 6 && hp.saturation <= 0);
    });
    const shown = hp.air < hp.maxAir;
    airEl.hidden = !shown;
    const n = Math.ceil((hp.air / hp.maxAir) * 10);
    bubbles.forEach((el, i) => { el.style.visibility = i < n ? 'visible' : 'hidden'; });
  };
}
