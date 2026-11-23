import { BLOCKS, B, FLUID_LAVA, FLUID_WATER, LIGHT, blockId, dynamicBoxes, fluidKind, isOpaque, isSolid } from './blocks';
import { EXTRA_ID, I } from './items';
import { SEA_LEVEL } from './noise';
import { CH, type World } from './world';
import { biomeAt } from './worldgen';

/**
 * Mobok: logika, fizika és AI. Nem függ a rendereléstől (nincs benne three.js), így a szerver is használhatja.
 * A megjelenítés a client/mobview.ts-ben van.
 */

export type MobKind = 'pig' | 'cow' | 'sheep' | 'chicken' | 'zombie' | 'skeleton' | 'wolf' | 'polarbear' | 'horse' | 'spider'
  | 'rabbit' | 'cat' | 'parrot' | 'llama' | 'donkey' | 'mule' | 'turtle' | 'bat' | 'squid'
  | 'husk' | 'drowned' | 'tarantula' | 'ghost' | 'slime' | 'slimelet' | 'cod' | 'salmon' | 'pufferfish';

export interface MobDef {
  name: string;
  hostile: boolean;
  /** életerő (fél szív) */
  hp: number;
  /** sétasebesség blokk/mp */
  speed: number;
  /** a test félszélessége és magassága (ütközési doboz) */
  hw: number;
  h: number;
  /** semleges: csak akkor támad, ha megsebezték */
  neutral?: boolean;
  /** egy ütés sebzése a játékosnak (fél szív); alapértelmezés 3 */
  dmg?: number;
  /** hány megjelenés (skin) közül sorsol a mob; a változat a Mob.variant */
  variants?: number;
  /** repülő: nem hat rá a gravitáció, a magasságát maga tartja (denevér) */
  fly?: boolean;
  /** vízi: csak vízben él, ott lebeg; szárazon fuldoklik (polip) */
  swim?: boolean;
  /** kétéltű: szárazon jár, vízben úszik (teknős) */
  amph?: boolean;
  /** ugrálva halad (nyálka) */
  hop?: boolean;
  /** hal: csoportban úszik, a horgászcsalihoz úszik, a játékos elől elmenekül */
  fish?: boolean;
}

export const MOB_DEFS: Record<MobKind, MobDef> = {
  pig: { name: 'Pig', hostile: false, hp: 10, speed: 1.6, hw: 0.4, h: 0.9 },
  cow: { name: 'Cow', hostile: false, hp: 10, speed: 1.4, hw: 0.45, h: 1.4 },
  sheep: { name: 'Sheep', hostile: false, hp: 8, speed: 1.5, hw: 0.4, h: 1.3 },
  chicken: { name: 'Chicken', hostile: false, hp: 4, speed: 1.4, hw: 0.2, h: 0.7 },
  zombie: { name: 'Zombie', hostile: true, hp: 20, speed: 2.6, hw: 0.3, h: 1.95 },
  skeleton: { name: 'Skeleton', hostile: true, hp: 20, speed: 2.2, hw: 0.3, h: 1.95 },
  wolf: { name: 'Wolf', hostile: false, neutral: true, hp: 16, speed: 2.4, hw: 0.3, h: 0.85, dmg: 3 },
  polarbear: { name: 'Polar Bear', hostile: false, neutral: true, hp: 30, speed: 2.2, hw: 0.65, h: 1.4, dmg: 6 },
  horse: { name: 'Horse', hostile: false, hp: 24, speed: 2.2, hw: 0.65, h: 1.6 },
  spider: { name: 'Spider', hostile: true, hp: 16, speed: 3, hw: 0.6, h: 0.9, dmg: 2 },
  rabbit: { name: 'Rabbit', hostile: false, hp: 6, speed: 2.6, hw: 0.25, h: 0.5, variants: 7 },
  cat: { name: 'Cat', hostile: false, hp: 10, speed: 2.4, hw: 0.3, h: 0.7, variants: 4 },
  parrot: { name: 'Parrot', hostile: false, hp: 6, speed: 1.6, hw: 0.2, h: 0.6, variants: 5 },
  llama: { name: 'Llama', hostile: false, hp: 22, speed: 1.8, hw: 0.45, h: 1.9, variants: 3 },
  donkey: { name: 'Donkey', hostile: false, hp: 20, speed: 2.0, hw: 0.6, h: 1.45 },
  mule: { name: 'Mule', hostile: false, hp: 24, speed: 2.1, hw: 0.6, h: 1.5 },
  turtle: { name: 'Turtle', hostile: false, hp: 6, speed: 0.7, hw: 0.5, h: 0.45, amph: true },
  bat: { name: 'Bat', hostile: false, hp: 6, speed: 3, hw: 0.25, h: 0.6, fly: true },
  husk: { name: 'Husk', hostile: true, hp: 20, speed: 2.4, hw: 0.3, h: 1.95 },
  drowned: { name: 'Drowned', hostile: true, hp: 20, speed: 2.2, hw: 0.3, h: 1.95 },
  tarantula: { name: 'Tarantula', hostile: true, hp: 10, speed: 3.4, hw: 0.4, h: 0.6, dmg: 2 },
  ghost: { name: 'Ghost', hostile: true, hp: 12, speed: 3.2, hw: 0.45, h: 0.5, dmg: 3, fly: true },
  slime: { name: 'Slime', hostile: true, hp: 16, speed: 2.6, hw: 0.4, h: 0.8, dmg: 3, hop: true },
  slimelet: { name: 'Slimelet', hostile: true, hp: 4, speed: 2.8, hw: 0.2, h: 0.4, dmg: 1, hop: true },
  cod: { name: 'Cod', hostile: false, hp: 3, speed: 1.6, hw: 0.25, h: 0.3, swim: true, fish: true },
  salmon: { name: 'Salmon', hostile: false, hp: 3, speed: 1.8, hw: 0.3, h: 0.35, swim: true, fish: true },
  pufferfish: { name: 'Pufferfish', hostile: false, hp: 3, speed: 1.0, hw: 0.25, h: 0.3, swim: true, fish: true },
  squid: { name: 'Squid', hostile: false, hp: 10, speed: 1.2, hw: 0.45, h: 0.95, swim: true },
};
// a lóból több színváltozat van
MOB_DEFS.horse.variants = 8;

/** Lebegő mobok (denevér, polip): saját létszámkerettel, nem számítanak a szárazföldi állatok közé */
export const isFloater = (d: MobDef): boolean => !!(d.fly || d.swim);

/** Pók-e (falat mászik, nappal nem támad)? */
export const isSpider = (k: MobKind): boolean => k === 'spider' || k === 'tarantula';

export const PASSIVE_KINDS: MobKind[] = ['pig', 'cow', 'sheep', 'chicken'];

/** Biomonként melyik semleges/háziállat jelenhet meg a fenti alap-négy mellett (valószínűséggel) */
const BIOME_FAUNA: Partial<Record<string, MobKind[]>> = {
  plains: ['horse', 'horse', 'donkey', 'rabbit', 'cat', 'mule'], savanna: ['horse', 'donkey', 'llama', 'rabbit'],
  forest: ['wolf', 'rabbit', 'cat'], dark_forest: ['wolf'], taiga: ['wolf', 'polarbear', 'rabbit'], mountains: ['polarbear', 'llama'],
  jungle: ['parrot', 'parrot', 'cat'], swamp: ['turtle'], desert: ['rabbit'],
};

/** Mit ejt a mob, ha meghal (véletlen darabszámmal). A gyapjú azonosítója a blokkok regisztrálása után ismert. */
export function mobDrops(kind: MobKind, rand: () => number = Math.random): { id: number; n: number }[] {
  const r = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const out: { id: number; n: number }[] = [];
  const add = (id: number | undefined, n: number) => { if (id !== undefined && n > 0) out.push({ id, n }); };
  switch (kind) {
    case 'pig': add(I.RAW_PORK, r(1, 3)); add(EXTRA_ID.leather, r(0, 1)); break;
    case 'cow': add(I.RAW_BEEF, r(1, 3)); add(EXTRA_ID.leather, r(0, 2)); break;
    case 'chicken': add(I.RAW_CHICKEN, 1); add(EXTRA_ID.feather, r(0, 2)); add(EXTRA_ID.egg, r(0, 1)); break;
    case 'sheep': add(blockId('white_wool'), 1); add(I.RAW_MUTTON, r(1, 2)); add(EXTRA_ID.leather, r(0, 1)); break;
    case 'husk': case 'drowned': add(I.ROTTEN_FLESH, r(0, 2)); break;
    case 'tarantula': add(EXTRA_ID.string, r(0, 2)); break;
    case 'zombie': add(I.ROTTEN_FLESH, r(0, 2)); add(EXTRA_ID.carrot, r(0, 39) === 0 ? 1 : 0); add(EXTRA_ID.potato, r(0, 39) === 0 ? 1 : 0); break; // ritkán murok/krumpli is (2,5%)
    case 'spider': add(EXTRA_ID.string, r(0, 2)); break;
    case 'cod': add(EXTRA_ID.cod, 1); break;
    case 'salmon': add(EXTRA_ID.salmon, 1); break;
    case 'pufferfish': add(EXTRA_ID.bone, r(0, 1)); break;
    case 'horse': case 'donkey': case 'mule': case 'llama': add(EXTRA_ID.leather, r(0, 2)); break;
    case 'rabbit': add(EXTRA_ID.rabbit, r(0, 1)); add(EXTRA_ID.leather, r(0, 1)); break;
    case 'cat': add(EXTRA_ID.string, r(0, 2)); break;
    case 'parrot': add(EXTRA_ID.feather, r(1, 2)); break;
    case 'wolf': add(EXTRA_ID.leather, r(0, 1)); break;
    case 'polarbear': add(EXTRA_ID.cod, r(0, 2)); add(EXTRA_ID.leather, r(1, 2)); break;
    case 'skeleton': add(EXTRA_ID.bone, r(0, 2)); add(I.GUNPOWDER, r(0, 2)); add(EXTRA_ID.string, r(0, 1)); break;
  }
  return out;
}

/** A csontváz nyílvesszeje: gravitációval repül, a blokkokban megakad, a játékost eltalálhatja (kitérni lehet előle) */
export interface Arrow {
  id: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number;
  /** −1: repül; különben ennyi másodperce áll a blokkban */
  stuck: number;
}
const ARROW_SPEED = 15;
const ARROW_GRAVITY = 12;
let nextArrowId = 1;

/** Nyíl kilövése az (x, y, z) pontból a (tx, ty, tz) felé: a gravitáció és egy kis pontatlanság figyelembevételével */
function fireArrow(arrows: Arrow[], x: number, y: number, z: number, tx: number, ty: number, tz: number): void {
  const err = 0.05;
  const dx = tx - x + (Math.random() - 0.5) * err * 2 * Math.hypot(tx - x, tz - z);
  const dy = ty - y + (Math.random() - 0.5) * err * 2 * 4;
  const dz = tz - z + (Math.random() - 0.5) * err * 2 * Math.hypot(tx - x, tz - z);
  const d = Math.hypot(dx, dy, dz) || 1;
  const t = d / ARROW_SPEED;
  arrows.push({ id: nextArrowId++, x, y, z, vx: dx / t, vy: dy / t + 0.5 * ARROW_GRAVITY * t, vz: dz / t, age: 0, stuck: -1 });
}

let nextId = 1;

export class Mob {
  readonly id = nextId++;
  readonly def: MobDef;
  hp: number;
  x: number; y: number; z: number;
  vx = 0; vy = 0; vz = 0;
  /** nézési irány (radián); előre = (-sin, -cos), mint a játékosnál */
  yaw = Math.random() * Math.PI * 2;
  onGround = false;
  inWater = false;
  /** sebzés utáni piros villanás hátralévő ideje */
  hurtT = 0;
  /** halál utáni idő (a megjelenítés ledönti); -1: él */
  deadT = -1;
  /** a járás animációjának fázisa (a megtett úttal nő) */
  walk = 0;
  /** a pók éppen falat mászik (felfelé halad, nem hat rá a gravitáció) */
  climb = false;
  /** nyílt ég alatt áll-e (a zombi csak ott ég napfényben) */
  exposed = true;
  // AI-állapot (a mobs.ts belső használatára)
  wx = 0; wz = 0; // a kívánt sebesség
  wanderT = 0;
  idle = true;
  panicT = 0;
  panicYaw = 0;
  atkCd = 0;
  burnT = 0;
  expT = 0;
  /** megsebezték: a semleges mob mostantól üldöz és támad */
  angry = false;
  /** a csontváz célzása: 0: nem céloz, különben eltelt másodperc a lövésig */
  aim = 0;
  /** melyik megjelenés (skin) a def.variants közül */
  variant = 0;
  /** lebegő mobnál a kívánt magasság (a ténylegesen tartott y) */
  wy = 0;
  /** polip: a lüktetés fázisa (0..1), ciklushossza (mp), pillanatnyi tolóereje (0..1) és az úszás iránya */
  swPh = 0; swCycle = 4; swSpd = 0; swX = 1; swY = 0; swZ = 0;
  /** nyálka: ugrás utáni várakozás és az ugrás iránya */
  hopT = 0; hx = 0; hz = 0;
  /** tartós mob (szelídített, elnevezett): nem tűnik el, nem számít a létszámkeretbe, mentésben megmarad */
  persistent = false;
  /** hány másodperce él (a véletlen eltűnés csak 30 mp után indul) */
  lived = 0;
  /** a legközelebbi játékostól mért távolság az utolsó frissítéskor */
  far = 0;
  /** távoli mobok ritkított frissítése: a két frissítés között összegyűlt idő */
  lodT = 0;

  constructor(readonly kind: MobKind, x: number, y: number, z: number) {
    this.def = MOB_DEFS[kind];
    this.hp = this.def.hp;
    this.x = x; this.y = y; this.z = z;
    if (this.def.variants) this.variant = Math.floor(Math.random() * this.def.variants);
  }

  get dead(): boolean { return this.deadT >= 0; }

  /** Sebzés: a (fx, fz) pontból érkezik (a lökés iránya a tőle elfelé mutat). Igaz, ha ez a halálos ütés. */
  hurt(dmg: number, fx: number, fz: number): boolean {
    if (this.dead) return false;
    this.hp -= dmg;
    this.hurtT = 0.4;
    const d = Math.hypot(this.x - fx, this.z - fz) || 1;
    this.vx = ((this.x - fx) / d) * 5;
    this.vz = ((this.z - fz) / d) * 5;
    if (this.onGround) this.vy = 5;
    if (this.def.neutral) this.angry = true;
    else if (!this.def.hostile) {
      this.panicT = 4;
      this.panicYaw = Math.atan2(-(this.x - fx), -(this.z - fz)); // a sebzőtől elfelé
    }
    if (this.hp <= 0) { this.deadT = 0; return true; }
    return false;
  }
}

// ---------- ütközés ----------

const EPS = 1e-3;
/** Ütközik-e a hw félszélességű, h magas doboz a (x, y, z) lábpozícióban a világgal? (mint a Player.collides) */
export function boxBlocked(world: World, x: number, y: number, z: number, hw: number, h: number): boolean {
  const y0 = Math.floor(y + EPS);
  for (let ix = Math.floor(x - hw + EPS); ix <= Math.floor(x + hw - EPS); ix++) {
    for (let iy = y0 - 1; iy <= Math.floor(y + h - EPS); iy++) {
      for (let iz = Math.floor(z - hw + EPS); iz <= Math.floor(z + hw - EPS); iz++) {
        const id = world.getBlock(ix, iy, iz);
        if (!isSolid(id)) continue;
        const def = BLOCKS[id];
        const boxes = def?.conn ? dynamicBoxes(def, (dx, dz) => world.getBlock(ix + dx, iy, iz + dz), 'boxes') : def?.boxes;
        if (!boxes) {
          if (iy < y0) continue;
          return true;
        }
        for (const b of boxes) {
          if (
            x + hw > ix + b[0] + EPS && x - hw < ix + b[3] - EPS &&
            y + h > iy + b[1] + EPS && y < iy + b[4] - EPS &&
            z + hw > iz + b[2] + EPS && z - hw < iz + b[5] - EPS
          ) return true;
        }
      }
    }
  }
  return false;
}

const GRAVITY = 28, JUMP = 8.4, CLIMB = 3.2;

/** A fizika egy lépése: a kívánt sebesség felé gyorsul, gravitáció, ütközés, akadály előtt ugrik */
function physics(world: World, m: Mob, dt: number): void {
  const { hw, h } = m.def;
  const body = world.getBlock(Math.floor(m.x), Math.floor(m.y + h * 0.4), Math.floor(m.z));
  m.inWater = fluidKind(body) === FLUID_WATER;
  if (fluidKind(body) === FLUID_LAVA) m.hp -= 4 * dt; // a láva árt

  // a vízszintes sebesség a kívánt felé tart (a lökés így fokozatosan elhal)
  const a = Math.min(1, dt * (m.onGround ? 9 : m.def.swim || (m.def.amph && m.inWater) ? 5 : 2.5));
  m.vx += (m.wx - m.vx) * a;
  m.vz += (m.wz - m.vz) * a;

  const steps = Math.max(1, Math.ceil(Math.min(dt, 0.1) / 0.02));
  const hh = Math.min(dt, 0.1) / steps;
  let wall = false;
  for (let i = 0; i < steps; i++) {
    if (m.def.fly) m.vy += (m.wy - m.vy) * Math.min(1, hh * 4);
    else if (m.def.swim) {
      if (m.inWater) m.vy += (m.wy - m.vy) * Math.min(1, hh * 3);
      else m.vy = Math.max(m.vy - GRAVITY * hh, -50); // szárazon leesik
    } else if (m.inWater && m.def.amph) m.vy += (m.wy - m.vy) * Math.min(1, hh * 3); // a teknős úszik
    else if (m.inWater) m.vy = Math.max(m.vy - 6 * hh, -2) + (m.vy < 1.2 ? 14 * hh : 0); // lassan feljön a felszínre
    else if (m.climb) m.vy = CLIMB; // a pók a falon felmászik (a gravitáció nem húzza vissza)
    else m.vy = Math.max(m.vy - GRAVITY * hh, m.kind === 'chicken' || m.kind === 'parrot' ? -2.2 : -50);
    const nx = m.x + m.vx * hh;
    if (boxBlocked(world, nx, m.y, m.z, hw, h)) { wall = true; m.vx = 0; } else m.x = nx;
    const nz = m.z + m.vz * hh;
    if (boxBlocked(world, m.x, m.y, nz, hw, h)) { wall = true; m.vz = 0; } else m.z = nz;
    const ny = m.y + m.vy * hh;
    if (boxBlocked(world, m.x, ny, m.z, hw, h)) {
      m.onGround = m.vy < 0;
      m.vy = 0;
    } else {
      m.y = ny;
      m.onGround = false;
    }
  }
  // akadály (egy blokk magas lépcső, fal) előtt: ha akar menni, ugrik
  const want = Math.hypot(m.wx, m.wz) > 0.1;
  // a pók a fal felé haladva mászik (a következő lépésben nincs gravitáció), mások ugranak
  m.climb = isSpider(m.kind) && wall && want;
  if (wall && want && m.onGround && !m.climb) m.vy = JUMP;
  if (m.def.swim && !m.inWater && m.onGround) m.hp -= 2 * dt; // a partra vetett polip lassan elpusztul
  if (m.y < -20) m.hp = 0; // kiesett a világból
  m.walk += Math.hypot(m.vx, m.vz, m.climb ? m.vy : 0) * dt * 1.6;
}

// ---------- AI ----------

/** Egy játékos a mobok szemszögéből (egyjátékosnál egy elem, co-opban mindenki). */
/** Egy mentett tartós mob */
export interface SavedMob { k: string; x: number; y: number; z: number; yaw: number; hp: number; v: number; p?: 1 }

export interface MobPlayer {
  /** a lábpozíció */
  x: number; y: number; z: number;
  /** támadható-e (túlélő módban igen) */
  target: boolean;
  hurt(dmg: number, fromX: number, fromZ: number): void;
}

export interface MobCtx {
  players: MobPlayer[];
  /** süt a nap (a zombik égnek) */
  day: boolean;
  onDie(m: Mob): void;
  /** a vízbe dobott horgászcsali (a halak odaúsznak) */
  lure?: { x: number; y: number; z: number } | null;
}

/** A mobhoz legközelebbi támadható játékos (vagy null) és a vízszintes távolsága. */
function nearestTarget(players: MobPlayer[], x: number, z: number): { p: MobPlayer; dist: number } | null {
  let best: { p: MobPlayer; dist: number } | null = null;
  for (const p of players) {
    if (!p.target) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (!best || d < best.dist) best = { p, dist: d };
  }
  return best;
}

const lookAt = (m: Mob, tx: number, tz: number) => { m.yaw = Math.atan2(-(tx - m.x), -(tz - m.z)); };
const forward = (yaw: number): [number, number] => [-Math.sin(yaw), -Math.cos(yaw)];

/** Van-e szabad rálátás a két pont között (nincs átlátszatlan blokk az úton)? */
function clearShot(world: World, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0, z1 - z0) * 2);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (isSolid(world.getBlock(Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t), Math.floor(z0 + (z1 - z0) * t)))) return false;
  }
  return true;
}

function aiStep(world: World, m: Mob, dt: number, ctx: MobCtx, arrows: Arrow[]): void {
  const priv = m;
  const def = m.def;
  priv.atkCd = Math.max(0, priv.atkCd - dt);
  let speed = 0;

  // a legközelebbi támadható játékos a célpont
  const near = nearestTarget(ctx.players, m.x, m.z);
  const pl = near?.p ?? null;
  const dist = near?.dist ?? Infinity;
  const dy = pl ? pl.y - m.y : 0;

  if (isFloater(def)) { floatStep(world, m, dt, pl, dist, ctx.lure ?? null); return; }
  if (def.amph && m.inWater) { turtleSwim(world, m, dt); return; }

  const aggressive = m.angry || (def.hostile && !(isSpider(m.kind) && ctx.day));
  if (aggressive && pl && dist < 24 && Math.abs(dy) < 12) {
    // üldözés
    lookAt(m, pl.x, pl.z);
    if (m.kind === 'skeleton') {
      // a csontváz távolról lő: 7 blokknál közelebb megáll; szabad rálátással megáll célozni, majd nyilat lő (kitérni lehet)
      const canShoot = dist < 16 && Math.abs(dy) < 8 && clearShot(world, m.x, m.y + 1.5, m.z, pl.x, pl.y + 1.3, pl.z);
      if (canShoot && priv.atkCd <= 0) {
        m.aim += dt;
        speed = 0;
        if (m.aim >= 0.8) {
          m.aim = 0;
          priv.atkCd = 2;
          fireArrow(arrows, m.x, m.y + 1.5, m.z, pl.x, pl.y + 1.3, pl.z);
        }
      } else {
        m.aim = 0;
        speed = dist > 7 || !canShoot ? def.speed : 0;
      }
    } else {
      speed = dist > 0.9 ? def.speed : 0;
      if (dist < 1.4 && Math.abs(dy) < 1.8 && priv.atkCd <= 0) {
        priv.atkCd = 1;
        pl.hurt(def.dmg ?? 3, m.x, m.z);
      }
    }
  } else {
    if (priv.panicT > 0) {
      // menekülés: a sebzőtől elfelé, gyorsabban
      priv.panicT -= dt;
      m.yaw = priv.panicYaw;
      speed = def.speed * 1.7;
    } else {
      // kóborlás: néha megáll, néha új irányba indul
      priv.wanderT -= dt;
      if (priv.wanderT <= 0) {
        priv.idle = Math.random() < 0.4;
        priv.wanderT = priv.idle ? 1.5 + Math.random() * 4 : 1 + Math.random() * 3;
        if (!priv.idle) m.yaw = Math.random() * Math.PI * 2;
      }
      speed = priv.idle ? 0 : def.speed * 0.6;
    }
  }

  if (speed > 0) {
    const [fx, fz] = forward(m.yaw);
    // ne sétáljon le egy mély szakadékba a kóborló állat (csak üldözés/menekülés közben engedjük)
    const free = aggressive || priv.panicT > 0 || !dropAhead(world, m, fx, fz);
    priv.wx = free ? fx * speed : 0;
    priv.wz = free ? fz * speed : 0;
    if (!free) { priv.wanderT = 0; }
  } else { priv.wx = 0; priv.wz = 0; }

  if (def.hop) {
    // a nyálka ugrálva halad: a földön áll és vár, ugráskor a levegőben viszi a lendület
    priv.hopT -= dt;
    if (m.onGround) {
      if (speed > 0 && priv.hopT <= 0) { m.vy = 7.5; priv.hopT = 0.6 + Math.random() * 0.5; priv.hx = priv.wx; priv.hz = priv.wz; }
      priv.wx = 0; priv.wz = 0;
    } else { priv.wx = priv.hx; priv.wz = priv.hz; }
  }
}

/**
 * A polip úszása: Minecraft-szerű lüktetés. Egy ciklus első felében a csápok kinyílnak, a nyitás végén (a ciklus 37–50%-ánál)
 * sugárhajtás-lökés jön a választott irányba (tolóerő 1), utána a tolóerő gyorsan elhal; közben lassan süllyed.
 * A ciklus fázisát a `variant` mezőben küldjük a vendégeknek (0..255), a csápok animációja ebből számolódik.
 */
function squidStep(world: World, m: Mob, dt: number): void {
  if (m.panicT > 0) {
    m.panicT -= dt;
    const [fx, fz] = forward(m.panicYaw);
    m.swX = fx; m.swZ = fz; m.swY = 0.1; m.swSpd = 1;
  } else {
    m.swPh += dt / m.swCycle;
    if (m.swPh >= 1) {
      m.swPh -= 1;
      m.swCycle = 3 + Math.random() * 3;
      const a = Math.random() * Math.PI * 2;
      m.swX = Math.cos(a); m.swZ = Math.sin(a); m.swY = Math.random() - 0.5;
    }
    const f = m.swPh * 2;
    if (f > 0.75 && f < 1) m.swSpd = 1;
    else m.swSpd *= Math.pow(0.9, dt * 20);
  }
  m.variant = Math.min(255, Math.floor(m.swPh * 256));
  // ha a haladási irányban nincs víz, megfordul (a lökés a másik irányba visz)
  const nb = world.getBlock(Math.floor(m.x + m.swX * 1.0), Math.floor(m.y + m.def.h * 0.5), Math.floor(m.z + m.swZ * 1.0));
  if (fluidKind(nb) !== FLUID_WATER) { m.swX = -m.swX; m.swZ = -m.swZ; }
  const k = m.panicT > 0 ? 6 : 4;
  m.wx = m.swX * k * m.swSpd;
  m.wz = m.swZ * k * m.swSpd;
  m.wy = m.swY * k * m.swSpd - 0.3 * (1 - m.swSpd);
  const above = world.getBlock(Math.floor(m.x), Math.floor(m.y + m.def.h + 0.4), Math.floor(m.z));
  if (fluidKind(above) !== FLUID_WATER && m.wy > 0) m.wy = -0.3;
  if (m.swSpd > 0.15) {
    // a test a haladás irányába fordul
    const target = Math.atan2(-m.swX, -m.swZ);
    let d = target - m.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    m.yaw += d * Math.min(1, dt * 4);
  }
}

/** A teknős úszása vízben: lassú, egyenletes 3D-s kószálás, a víz alatt marad (a felszínt és a partot kerüli) */
function turtleSwim(world: World, m: Mob, dt: number): void {
  const def = m.def;
  if (m.panicT > 0) { m.panicT -= dt; m.yaw = m.panicYaw; }
  else {
    m.wanderT -= dt;
    if (m.wanderT <= 0) {
      m.wanderT = 2 + Math.random() * 4;
      m.idle = Math.random() < 0.2;
      m.yaw = Math.random() * Math.PI * 2;
      m.wy = (Math.random() - 0.55) * 0.9;
    }
  }
  const sp = def.speed * (m.panicT > 0 ? 1.8 : 1.2);
  const [fx, fz] = forward(m.yaw);
  const nb = world.getBlock(Math.floor(m.x + fx * 0.9), Math.floor(m.y + def.h * 0.5), Math.floor(m.z + fz * 0.9));
  if (fluidKind(nb) !== FLUID_WATER) { m.yaw += Math.PI * (0.6 + Math.random() * 0.8); m.wanderT = 1.5; m.wx = 0; m.wz = 0; return; }
  m.wx = m.idle && m.panicT <= 0 ? 0 : fx * sp;
  m.wz = m.idle && m.panicT <= 0 ? 0 : fz * sp;
  const above = world.getBlock(Math.floor(m.x), Math.floor(m.y + def.h + 0.5), Math.floor(m.z));
  if (fluidKind(above) !== FLUID_WATER && m.wy > 0) m.wy = -0.3;
}

/**
 * A hal AI-ja: a csalihoz úszik (ha a közelben, 10 blokkon belül van, és vízben), különben kószál; a játékos elől elmenekül.
 * A csali körül lebeg (a horgászat ezt veszi észre).
 */
function fishStep(world: World, m: Mob, dt: number, pl: MobPlayer | null, dist: number, lure: { x: number; y: number; z: number } | null): void {
  const def = m.def;
  const lureD = lure ? Math.hypot(lure.x - m.x, lure.y - (m.y + def.h * 0.5), lure.z - m.z) : Infinity;
  const toLure = !!lure && lureD < 10;
  let sp = def.speed * 0.6;
  // hopT: ütközés utáni „elfordulás” ideje: közben nem dönt újra (különben egy helyben ide-oda forogna)
  if (m.hopT > 0) {
    m.hopT -= dt;
  } else if (toLure) {
    if (lureD > 0.5) {
      lookAt(m, lure!.x, lure!.z);
      m.wy = Math.max(-1.2, Math.min(1.2, (lure!.y - 0.3 - (m.y + def.h * 0.5)) * 1.5));
      sp = def.speed * 0.8;
    } else { sp = 0; m.wy = 0; }
  } else if (m.panicT > 0) {
    m.panicT -= dt;
    m.yaw = m.panicYaw;
    sp = def.speed * 1.8;
  } else if (pl && dist < 3.5) {
    m.panicT = 0.8;
    m.panicYaw = Math.atan2(m.x - pl.x, m.z - pl.z) + Math.PI + (Math.random() - 0.5) * 0.8;
  } else {
    m.wanderT -= dt;
    if (m.wanderT <= 0) {
      m.wanderT = 1.5 + Math.random() * 3.5;
      m.idle = Math.random() < 0.15;
      m.yaw = Math.random() * Math.PI * 2;
      m.wy = (Math.random() - 0.5) * 0.9;
    }
    if (m.idle) sp = 0;
  }
  const [fx, fz] = forward(m.yaw);
  // a haladási irányban (a testméretnél kicsit előrébb) víz kell, különben megáll/elfordul
  const ax = m.x + fx * (def.hw + 0.5), az = m.z + fz * (def.hw + 0.5);
  const ay = Math.floor(m.y + def.h * 0.5);
  const clear = fluidKind(world.getBlock(Math.floor(ax), ay, Math.floor(az))) === FLUID_WATER;
  if (!clear && sp > 0) {
    m.wx = 0; m.wz = 0;
    if (!toLure && m.hopT <= 0) {
      // fal: elfordul egy új irányba és ~1 mp-ig tartja (nem dönt újra, nem vibrál); a hal addig is mozog a szabad irányba
      m.yaw += Math.PI * (0.6 + Math.random() * 0.8);
      m.hopT = 0.8 + Math.random() * 0.8;
      m.panicT = 0;
      m.wanderT = m.hopT + 0.5;
    }
    return;
  }
  m.wx = fx * sp;
  m.wz = fz * sp;
  const above = world.getBlock(Math.floor(m.x), Math.floor(m.y + def.h + 0.3), Math.floor(m.z));
  if (fluidKind(above) !== FLUID_WATER && m.wy > 0) m.wy = -0.3;
}

/** Lebegő mobok (denevér, polip) AI-ja: lassan kószál, közben magasságot vált; sebzéskor menekül. A kívánt irányt és magasságot (wx, wz, wy) adja. */
function floatStep(world: World, m: Mob, dt: number, pl: MobPlayer | null, dist: number, lure: { x: number; y: number; z: number } | null = null): void {
  const def = m.def;
  const swim = !!def.swim;
  if (def.fish) { fishStep(world, m, dt, pl, dist, lure); return; }
  if (m.kind === 'squid') { squidStep(world, m, dt); return; }
  if (def.hostile && pl && dist < 28 && Math.abs(pl.y - m.y) < 24) {
    // a szellem a játékos felé száll (3D-ben), közel érve csap
    lookAt(m, pl.x, pl.z);
    m.wy = Math.max(-3, Math.min(3, pl.y + 1.0 - m.y)) * 1.2;
    const near = dist < 1.1;
    m.wx = near ? 0 : -Math.sin(m.yaw) * def.speed;
    m.wz = near ? 0 : -Math.cos(m.yaw) * def.speed;
    if (dist < 1.5 && Math.abs(pl.y + 0.9 - m.y) < 1.8 && m.atkCd <= 0) { m.atkCd = 1; pl.hurt(def.dmg ?? 3, m.x, m.z); }
    return;
  }
  if (m.panicT > 0) {
    m.panicT -= dt;
    m.yaw = m.panicYaw;
  } else {
    m.wanderT -= dt;
    if (m.wanderT <= 0) {
      m.wanderT = 1 + Math.random() * 3;
      m.idle = !swim && Math.random() < 0.15;
      m.yaw = Math.random() * Math.PI * 2;
      // a denevér a játékos közelében kering, a polip lassan fel-le úszik
      if (!swim && pl && dist > 14) m.yaw = Math.atan2(-(pl.x - m.x), -(pl.z - m.z)) + (Math.random() - 0.5);
      m.wy = (Math.random() - 0.5) * (swim ? 1.2 : 3.5);
    }
  }
  const sp = def.speed * (m.panicT > 0 ? 1.6 : swim ? 0.7 : 0.8);
  const [fx, fz] = forward(m.yaw);
  // a következő cellában szabad-e a hely (denevér: levegő, polip: víz)? Ha nem, új irányt választ
  const nx = Math.floor(m.x + fx * 0.9), nz = Math.floor(m.z + fz * 0.9), ny = Math.floor(m.y + def.h * 0.5);
  const nb = world.getBlock(nx, ny, nz);
  const blocked = swim ? fluidKind(nb) !== FLUID_WATER : isSolid(nb);
  if (blocked) { m.wanderT = 0; m.wx = 0; m.wz = 0; return; }
  m.wx = m.idle ? 0 : fx * sp;
  m.wz = m.idle ? 0 : fz * sp;
  if (swim) {
    // ne hagyja el a vizet: ha a feje fölött már nincs víz, süllyed; ha az alatta lévő szilárd, emelkedik
    const above = world.getBlock(Math.floor(m.x), Math.floor(m.y + def.h + 0.6), Math.floor(m.z));
    if (fluidKind(above) !== FLUID_WATER && m.wy > 0) m.wy = -0.4;
  } else {
    // a denevér nem megy a padló/plafon közelébe: pár blokk szabad tér kell fölötte és alatta
    const up = world.getBlock(Math.floor(m.x), Math.floor(m.y + def.h + 1), Math.floor(m.z));
    const dn = world.getBlock(Math.floor(m.x), Math.floor(m.y - 1), Math.floor(m.z));
    if (isSolid(up) && m.wy > 0) m.wy = -1;
    if (isSolid(dn) && m.wy < 0) m.wy = 1;
  }
}

/** Van-e a mob előtt 3 blokknál mélyebb lyuk vagy víz/láva? */
function dropAhead(world: World, m: Mob, fx: number, fz: number): boolean {
  const x = Math.floor(m.x + fx * 0.9), z = Math.floor(m.z + fz * 0.9);
  const y = Math.floor(m.y);
  for (let d = 0; d <= 3; d++) {
    const id = world.getBlock(x, y - d, z);
    if (isSolid(id)) return false;
    if (fluidKind(id) === FLUID_LAVA) return true;
    if (fluidKind(id) === FLUID_WATER) return !m.def.amph; // a teknős bemegy a vízbe
  }
  return true;
}

// ---------- kezelő ----------

/** ennél távolabbi mobok ritkítva frissülnek (blokk, mp) */
export const LOD_DIST = 36;
export const LOD_STEP = 0.1;

/** Létszámkategóriák (a szerint, ahogy a hasonló sandbox játékok csinálják) */
export type MobCat = 'monster' | 'creature' | 'ambient' | 'water' | 'waterAmbient';

/**
 * Kategóriánkénti alap-létszámkeret egy 17×17 chunkos (289) betöltött területre; a tényleges keret
 * = alap × betöltött chunkok / 289 × MOB_PERF. Több játékos → több betöltött chunk → nagyobb keret.
 */
export const MOB_CAP_BASE: Record<MobCat, number> = { monster: 70, creature: 10, ambient: 15, water: 5, waterAmbient: 20 };
/** teljesítmény-szorzó (telefonon kevesebb mob fér el): 1 = az alapértékek */
export const MOB_PERF = 0.6;
/** ennél messzebb eltűnik minden, ami eltűnhet (blokk) */
export const DESPAWN_FAR = 80;
/** ettől a távolságtól (blokk) és 30 mp élet után véletlenszerűen eltűnhet (átlag ~40 mp alatt) */
export const DESPAWN_NEAR = 32;
/** a szárazföldi állatok csak ennyi blokkon belül számítanak bele a létszámkeretbe */
export const COUNT_RANGE = 96;
/** szárazföldi állatok (creature) újraszületési ciklusa, mp */
export const CREATURE_CYCLE = 20;
/** egy chunk keletkezésekor ekkora eséllyel kap állatcsoportot */
export const CHUNK_POP_CHANCE = 0.1;
/** legfeljebb ennyi mobot ment el a világgal (a tartósak előnyben) */
export const SAVE_MOB_LIMIT = 500;

/** Melyik létszámkategóriába tartozik a faj? */
export function catOf(kind: MobKind): MobCat {
  const d = MOB_DEFS[kind];
  if (d.hostile) return 'monster';
  if (d.fish) return 'waterAmbient';
  if (kind === 'squid') return 'water';
  if (kind === 'bat') return 'ambient';
  return 'creature';
}

/** Egy csoport mérete fajonként [min, max] (ismert arányok szerint: a rajhalak, lovak, farkasok, lámák csoportban élnek) */
const PACK: Partial<Record<MobKind, [number, number]>> = {
  pig: [2, 4], cow: [2, 4], sheep: [2, 4], chicken: [3, 4], horse: [2, 6], donkey: [1, 3], mule: [1, 1], llama: [4, 6],
  wolf: [3, 5], rabbit: [2, 3], cat: [1, 1], parrot: [1, 2], turtle: [2, 5], polarbear: [1, 2],
  cod: [3, 6], salmon: [2, 5], pufferfish: [1, 3], squid: [1, 4], bat: [1, 3],
};
function packSize(kind: MobKind): number {
  const [a, b] = PACK[kind] ?? [1, 1];
  return a + Math.floor(Math.random() * (b - a + 1));
}
/** háromszög-eloszlású eltolás (−r..r, a közép felé sűrűsödve): a csoport tagjai egymás közelében jelennek meg */
const tri = (r: number): number => (Math.random() - Math.random()) * r;

export class MobManager {
  mobs: Mob[] = [];
  private spawnT = 0;
  private creatureT = CREATURE_CYCLE;
  /** a már benépesített chunkok (a mentéssel együtt marad, hogy újratöltéskor ne szülessenek újra az állatok) */
  populated = new Set<string>();

  constructor(private world: World) {}

  clear(): void { this.mobs = []; }

  count(hostile: boolean): number {
    let n = 0;
    for (const m of this.mobs) if (m.def.hostile === hostile && !m.dead && !m.persistent && !isFloater(m.def)) n++;
    return n;
  }

  /** Hány élő hal van? */
  countFish(): number {
    let n = 0;
    for (const m of this.mobs) if (m.def.fish && !m.dead && !m.persistent) n++;
    return n;
  }

  /** Hány élő mob van ebből a fajtából? */
  countKind(kind: MobKind): number {
    let n = 0;
    for (const m of this.mobs) if (m.kind === kind && !m.dead && !m.persistent) n++;
    return n;
  }

  /** a repülő és a blokkokba állt nyilak */
  arrows: Arrow[] = [];

  /** A nyilak repülése: gravitáció, megakadás a blokkokban, találat a játékoson */
  private updateArrows(dt: number, ctx: MobCtx): void {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.age += dt;
      if (a.stuck >= 0) {
        a.stuck += dt;
        if (a.stuck > 5) this.arrows.splice(i, 1);
        continue;
      }
      let gone = false;
      const n = Math.max(1, Math.ceil((Math.hypot(a.vx, a.vy, a.vz) * dt) / 0.25));
      const h = dt / n;
      for (let k = 0; k < n && !gone && a.stuck < 0; k++) {
        a.x += a.vx * h; a.y += a.vy * h; a.z += a.vz * h;
        a.vy -= ARROW_GRAVITY * h;
        if (isSolid(this.world.getBlock(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z)))) {
          a.stuck = 0;
        } else {
          const hitP = ctx.players.find((p) => p.target && Math.abs(a.x - p.x) < 0.45 && Math.abs(a.z - p.z) < 0.45 && a.y > p.y - 0.1 && a.y < p.y + 1.85);
          if (hitP) {
            hitP.hurt(3, a.x - a.vx * 0.05, a.z - a.vz * 0.05);
            gone = true;
          }
        }
      }
      if (gone || a.age > 12) this.arrows.splice(i, 1);
    }
  }

  spawn(kind: MobKind, x: number, y: number, z: number): Mob {
    const m = new Mob(kind, x, y, z);
    this.mobs.push(m);
    return m;
  }

  update(dt: number, ctx: MobCtx): void {
    this.updateArrows(dt, ctx);
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      // a legközelebbi játékostól mért távolság (játékos nélkül nem tűnik el semmi)
      let far = ctx.players.length ? Infinity : 0;
      for (const p of ctx.players) far = Math.min(far, Math.hypot(m.x - p.x, m.z - p.z));
      m.far = far;
      // a szárazföldi állatok soha nem tűnnek el (a tartósak sem); a többi messze azonnal, közelebb 30 mp után lassan
      if (!m.dead && !m.persistent && catOf(m.kind) !== 'creature') {
        if (far > DESPAWN_FAR) { this.mobs.splice(i, 1); continue; }
        if (far > DESPAWN_NEAR && m.lived > 30 && Math.random() < dt * 0.025) { this.mobs.splice(i, 1); continue; }
      }
      if (!this.world.isLoaded(m.x, m.z)) continue; // betöltetlen terepen megállnak
      // a távoli (36+ blokk) élő mobok csak 10 Hz-en frissülnek (az összegyűlt idővel): a kamera messze van, a számítás hatoda
      if (!m.dead && far > LOD_DIST && ctx.players.length) {
        m.lodT += dt;
        if (m.lodT < LOD_STEP) continue;
        dt = Math.min(m.lodT, 0.25);
        m.lodT = 0;
      }
      m.hurtT = Math.max(0, m.hurtT - dt);
      m.lived += dt;

      if (m.dead) {
        m.deadT += dt;
        if (m.deadT > 0.8) {
          this.mobs.splice(i, 1);
          // a nagy nyálka szétesik két-három kicsire
          if (m.kind === 'slime') for (let k = 0, n = 2 + Math.floor(Math.random() * 2); k < n; k++) {
            const c = this.spawn('slimelet', m.x + (Math.random() - 0.5) * 0.6, m.y + 0.1, m.z + (Math.random() - 0.5) * 0.6);
            c.vx = (Math.random() - 0.5) * 4; c.vz = (Math.random() - 0.5) * 4; c.vy = 4;
          }
        }
        continue;
      }
      const priv = m;
      // nyílt ég alatt áll-e (félmásodpercenként újraszámolva)
      priv.expT -= dt;
      if (priv.expT <= 0) {
        priv.expT = 0.5;
        m.exposed = true;
        for (let y = Math.floor(m.y + m.def.h) + 1; y < CH; y++) {
          if (isOpaque(this.world.getBlock(Math.floor(m.x), y, Math.floor(m.z)))) { m.exposed = false; break; }
        }
      }
      // a zombi napfényben ég
      if ((m.kind === 'zombie' || m.kind === 'skeleton' || m.kind === 'ghost') && ctx.day && m.exposed && !m.inWater) {
        priv.burnT += dt;
        if (priv.burnT >= 1) { priv.burnT -= 1; m.hp -= 2; m.hurtT = 0.3; }
      }

      aiStep(this.world, m, dt, ctx, this.arrows);
      if (m.dead) { this.mobs.splice(i, 1); continue; } // felrobbant
      physics(this.world, m, dt);
      if (m.hp <= 0 && !m.dead) { m.deadT = 0; ctx.onDie(m); }
    }
  }

  /** A létszámok egy menetben: kategóriánként és fajonként (tartós, elpusztult és túl messzi mob nélkül) */
  private tally(): { cat: Record<MobCat, number>; of: (k: MobKind) => number } {
    const by = new Map<MobKind, number>();
    const cat: Record<MobCat, number> = { monster: 0, creature: 0, ambient: 0, water: 0, waterAmbient: 0 };
    for (const m of this.mobs) {
      if (m.dead || m.persistent || m.far > COUNT_RANGE) continue;
      by.set(m.kind, (by.get(m.kind) ?? 0) + 1);
      cat[catOf(m.kind)]++;
    }
    return { cat, of: (k) => by.get(k) ?? 0 };
  }

  /** Létszámkeret egy kategóriára a betöltött chunkok száma szerint */
  capFor(c: MobCat): number {
    return Math.max(1, Math.round((MOB_CAP_BASE[c] * Math.min(this.world.chunks.size, 600) * MOB_PERF) / 289));
  }

  /** A világgal mentett mobok: a tartósak (megszelídítettek) és a szárazföldi állatok; a többi úgyis újra születik */
  exportPersistent(): SavedMob[] {
    const keep = this.mobs.filter((m) => !m.dead && (m.persistent || catOf(m.kind) === 'creature'));
    keep.sort((a, b) => Number(b.persistent) - Number(a.persistent));
    return keep.slice(0, SAVE_MOB_LIMIT).map((m) => {
      const e: SavedMob = { k: m.kind, x: +m.x.toFixed(2), y: +m.y.toFixed(2), z: +m.z.toFixed(2), yaw: +m.yaw.toFixed(2), hp: m.hp, v: m.variant };
      if (m.persistent) e.p = 1;
      return e;
    });
  }

  /** A mentett mobok visszatöltése (ismeretlen fajt kihagy) */
  importPersistent(list: SavedMob[] | undefined, populated?: string[]): void {
    for (const k of populated ?? []) this.populated.add(k);
    for (const e of list ?? []) {
      if (!(e.k in MOB_DEFS)) continue;
      const m = this.spawn(e.k as MobKind, e.x, e.y, e.z);
      m.yaw = e.yaw; m.hp = Math.min(e.hp, m.def.hp); m.variant = e.v; m.persistent = !!e.p;
    }
  }

  /**
   * Egy chunk betöltődött: ha még sosem volt benépesítve, kis eséllyel állatcsoport kerül bele
   * (a szárazföldi állatok így a terep létrejöttekor születnek, nem a játékos szeme láttára).
   */
  chunkLoaded(cx: number, cz: number): void {
    const key = `${cx},${cz}`;
    if (this.populated.has(key)) return;
    this.populated.add(key);
    if (Math.random() >= CHUNK_POP_CHANCE) return;
    const x = cx * 16 + 2 + Math.floor(Math.random() * 12), z = cz * 16 + 2 + Math.floor(Math.random() * 12);
    const kind = this.pickLandKind(x, z);
    if (kind) this.trySpawn([], 0, 0, kind, 0, 0, 'surface', NaN, { x, z });
  }

  /** Szárazföldi állatfaj a (x, z) biomjához */
  private pickLandKind(x: number, z: number): MobKind | null {
    const w = this.world;
    const list = BIOME_FAUNA[biomeAt(w.seed, x, z, w.heightAt(x, z))];
    const pool: MobKind[] = [...PASSIVE_KINDS, ...(list ?? [])];
    const kind = pool[Math.floor(Math.random() * pool.length)];
    if ((kind === 'polarbear' || kind === 'mule') && Math.random() < 0.6) return null; // ritka
    return kind;
  }

  /** Új mobok a játékosok környékén (kategóriák, létszámkeretek és csoportok). `night`: sötét van a felszínen. */
  spawnTick(dt: number, players: { x: number; y: number; z: number }[], night: boolean, hostileAllowed: boolean): void {
    if (!players.length) return;
    this.creatureT -= dt;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 0.5;
    const t = this.tally();
    const cap = (c: MobCat) => this.capFor(c);
    const pick = () => players[Math.floor(Math.random() * players.length)];

    // szárazföldi állatok: csak 20 mp-enként (és a chunk keletkezésekor), legfeljebb 3 csoport egy ciklusban
    if (this.creatureT <= 0) {
      this.creatureT = CREATURE_CYCLE;
      let n = t.cat.creature;
      for (let i = 0; i < 3 && n < cap('creature'); i++) {
        const p = pick(), a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 20;
        const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
        if (!this.world.isLoaded(x, z)) continue;
        const kind = this.pickLandKind(x, z);
        if (!kind) continue;
        const before = this.mobs.length;
        this.trySpawn(players, p.x, p.z, kind, 24, 44, 'surface', NaN, { x, z });
        n += this.mobs.length - before;
      }
    }
    const pp = pick(), px = pp.x, py = pp.y, pz = pp.z;
    // denevér a barlangokban, polip a tengerben, halak (a játékostól 64 blokkon belül)
    if (t.cat.ambient < cap('ambient') && Math.random() < 0.3) this.trySpawn(players, px, pz, 'bat', 24, 36, 'cave', py);
    if (t.cat.water < cap('water') && Math.random() < 0.3) this.trySpawn(players, px, pz, 'squid', 24, 40, 'water');
    if (t.cat.waterAmbient < cap('waterAmbient') && Math.random() < 0.4) this.trySpawn(players, px, pz, 'fish', 24, 40, 'water');
    if (!hostileAllowed) return;
    const sub = Math.max(1, Math.round(cap('monster') / 4));
    if (night) {
      // éjjel: szellemek az égből, fulladtak a vízből
      if (t.of('ghost') < sub && Math.random() < 0.12) this.trySpawn(players, px, pz, 'ghost', 24, 40, 'surface', py);
      if (t.of('drowned') < sub && Math.random() < 0.2) this.trySpawn(players, px, pz, 'drowned', 24, 44, 'water');
    }
    if (t.cat.monster < cap('monster') && Math.random() < 0.5) {
      const roll = Math.random();
      const kind: MobKind = roll < 0.35 ? 'zombie' : roll < 0.6 ? 'skeleton' : roll < 0.75 ? 'spider' : roll < 0.87 ? 'tarantula' : 'slime';
      if (night) this.trySpawn(players, px, pz, kind, 24, 44, 'surface', py);
      else if (Math.random() < 0.35) this.trySpawn(players, px, pz, kind, 24, 36, 'cave', py); // barlangokban nappal is
    }
  }

  /**
   * Elég sötét van-e az (x, y, z) cellában a szörnyekhez? A lomb nem takar (a fa alatt napfény szűrődik át),
   * ezért barlangi helynek csak az számít, ami fölött legalább 3 átlátszatlan blokk van; a fáklya/láva fénye (7 fölött) kizárja.
   * @param needCover igaz: csak fedett (barlangi) hely jó, éjjel a szabad ég is elég sötét
   */
  private dark(x: number, y: number, z: number, needCover: boolean): boolean {
    const w = this.world;
    if (needCover) {
      let roof = 0;
      for (let yy = y + 2; yy < y + 40 && roof < 3; yy++) if (isOpaque(w.getBlock(x, yy, z))) roof++;
      if (roof < 3) return false;
    }
    if (w.hasEmittersNear(x, z)) {
      for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) for (let dy = -6; dy <= 6; dy++) {
        const l = LIGHT[w.getBlock(x + dx, y + dy, z + dz)];
        if (l && l - Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) > 7) return false;
      }
    }
    return true;
  }

  /** Egy csoport (passzív: 1–3) leszállítása a játékostól minRange..maxRange távolságra */
  private trySpawn(players: { x: number; y: number; z: number }[], px: number, pz: number, want: MobKind | 'fauna' | 'fish', minR: number, maxR: number, where: 'surface' | 'cave' | 'water', py = NaN, at?: { x: number; z: number }): void {
    const w = this.world;
    const a = Math.random() * Math.PI * 2, r = minR + Math.random() * (maxR - minR);
    const x = at ? at.x : Math.floor(px + Math.cos(a) * r), z = at ? at.z : Math.floor(pz + Math.sin(a) * r);
    if (!w.isLoaded(x, z)) return;
    let y: number;
    if (where === 'surface') y = w.heightAt(x, z) + 1 + (want === 'ghost' ? 8 + Math.floor(Math.random() * 10) : 0);
    else if (where === 'water') {
      // tengerben: a talaj a tengerszint alatt, a polip a vízoszlop közepén, a fulladt a felszínen
      const floor = w.heightAt(x, z);
      if (floor > SEA_LEVEL - (want === 'drowned' || want === 'fish' ? 2 : 4)) return;
      if (want === 'drowned') y = SEA_LEVEL - 1;
      else if (want === 'fish') y = floor + 1 + Math.floor(Math.random() * (SEA_LEVEL - floor - 2));
      else y = floor + 2 + Math.floor(Math.random() * (SEA_LEVEL - floor - 3));
    } else {
      const top = w.heightAt(x, z);
      if (top < 14) return;
      // csak a játékos magasságának közelében (±16), különben a világ egész oszlopából választana
      const lo = Math.max(4, Math.floor(py) - 16), hi = Math.min(top - 5, Math.floor(py) + 16);
      if (!(hi > lo)) return;
      y = lo + Math.floor(Math.random() * (hi - lo));
    }
    let kind: MobKind;
    if (want === 'fauna') {
      const list = BIOME_FAUNA[biomeAt(w.seed, x, z, w.heightAt(x, z))];
      if (!list) return;
      kind = list[Math.floor(Math.random() * list.length)];
      if ((kind === 'polarbear' || kind === 'mule') && Math.random() < 0.6) return; // ritka
    } else if (want === 'fish') {
      const r = Math.random();
      kind = r < 0.4 ? 'cod' : r < 0.75 ? 'salmon' : 'pufferfish';
      // egyik faj sem szaporodhat el a többi rovására: ha ebből már sok van, a legritkábbat választja
      const cap = 5;
      if (this.countKind(kind) >= cap) {
        const kinds: MobKind[] = ['cod', 'salmon', 'pufferfish'];
        kind = kinds.reduce((best, k) => (this.countKind(k) < this.countKind(best) ? k : best), kinds[0]);
      }
    } else kind = want;
    if (kind === 'zombie' && biomeAt(w.seed, x, z, w.heightAt(x, z)) === 'desert') kind = 'husk';
    if (kind === 'slime' && where === 'surface' && biomeAt(w.seed, x, z, w.heightAt(x, z)) !== 'swamp') return; // a felszínen csak mocsárban
    if (where === 'water') {
      if (fluidKind(w.getBlock(x, y, z)) !== FLUID_WATER || fluidKind(w.getBlock(x, y + 1, z)) !== FLUID_WATER) return;
      if (players.some((q) => Math.hypot(q.x - (x + 0.5), q.z - (z + 0.5)) < minR)) return;
      if (MOB_DEFS[kind].hostile && !this.dark(x, y, z, false)) return;
      const group = MOB_DEFS[kind].hostile ? 1 : packSize(kind); // a halak rajban
      for (let i = 0; i < group; i++) {
        const sx = x + 0.5 + (i ? tri(5) : 0), sz = z + 0.5 + (i ? tri(5) : 0);
        if (fluidKind(w.getBlock(Math.floor(sx), y, Math.floor(sz))) === FLUID_WATER && !boxBlocked(w, sx, y, sz, MOB_DEFS[kind].hw, MOB_DEFS[kind].h)) this.spawn(kind, sx, y, sz).wy = 0;
      }
      return;
    }
    if (kind === 'bat' || kind === 'ghost') {
      // a denevér a barlang üres terében, a szellem a nyílt ég alatt lebeg (nem kell talaj)
      if (w.getBlock(x, y, z) !== 0 || w.getBlock(x, y + 1, z) !== 0 || (kind === 'bat' && w.heightAt(x, z) - y < 5)) return;
      if (players.some((q) => Math.hypot(q.x - (x + 0.5), q.z - (z + 0.5)) < minR)) return;
      for (let i = 0, n = kind === 'ghost' ? 1 : packSize(kind); i < n; i++) {
        const sx = x + 0.5 + (i ? tri(3) : 0), sz = z + 0.5 + (i ? tri(3) : 0);
        if (!boxBlocked(w, sx, y, sz, MOB_DEFS[kind].hw, MOB_DEFS[kind].h)) this.spawn(kind, sx, y, sz);
      }
      return;
    }
    const below = w.getBlock(x, y - 1, z);
    if (!(isSolid(below) && fluidKind(below) === 0 && w.getBlock(x, y, z) === 0 && w.getBlock(x, y + 1, z) === 0)) return;
    // barlangban csak fedett helyre (legalább néhány blokk kő van fölötte)
    if (where === 'cave' && w.heightAt(x, z) - y < 5) return;
    // ellenséges mob nem jelenhet meg a játékos látóterében (szabad rálátás 40 blokkon belül)
    if (MOB_DEFS[kind].hostile && !isNaN(py) && players.some((q) => clearShot(w, q.x, q.y + 1.6, q.z, x + 0.5, y + 1, z + 0.5))) return;
    // egyik játékoshoz sem jöhet túl közel (a többiek közelében sem)
    if (players.some((q) => Math.hypot(q.x - (x + 0.5), q.z - (z + 0.5)) < minR)) return;
    // szörny csak sötétben: fedett barlangban (fa lombja alatt nem), vagy éjjel a szabadban, és nem fáklya mellett
    if (MOB_DEFS[kind].hostile && !this.dark(x, y, z, where === 'cave')) return;
    // állatok csak füvön; a felszíni szörnyek bárhol, ahol szilárd a talaj
    const sandy = (kind === 'rabbit' || kind === 'turtle') && below === B.SAND; // a nyúl a sivatagban, a teknős a partokon is megél
    if (!MOB_DEFS[kind].hostile && below !== B.GRASS && !sandy && !(kind === 'polarbear' && fluidKind(below) === 0)) return;
    const n = MOB_DEFS[kind].hostile ? 1 : packSize(kind);
    for (let i = 0; i < n; i++) {
      // a csoport tagjai az első körül ±5 blokkon belül, mindegyik a saját oszlopa talajára (és ugyanolyan talajra)
      const sx = x + 0.5 + (i ? tri(5) : 0), sz = z + 0.5 + (i ? tri(5) : 0);
      const cx = Math.floor(sx), cz = Math.floor(sz);
      if (!w.isLoaded(cx, cz)) continue;
      const sy = i === 0 || where !== 'surface' ? y : w.heightAt(cx, cz) + 1;
      const under = w.getBlock(cx, sy - 1, cz);
      if (i && !(under === below || (under === B.GRASS && !MOB_DEFS[kind].hostile))) continue;
      if (boxBlocked(w, sx, sy, sz, MOB_DEFS[kind].hw, MOB_DEFS[kind].h)) continue;
      this.spawn(kind, sx, sy, sz);
    }
  }

  /** A sugár által elsőként eltalált élő mob és a távolság (a sugár iránya egységvektor) */
  pick(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): { mob: Mob; t: number } | null {
    let best: { mob: Mob; t: number } | null = null;
    for (const m of this.mobs) {
      if (m.dead) continue;
      const hw = m.def.hw, h = m.def.h;
      const o = [ox - m.x, oy - m.y, oz - m.z], d = [dx, dy, dz];
      const lo = [-hw, 0, -hw], hi = [hw, h, hw];
      let tmin = 0, tmax = maxDist, hit = true;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) { hit = false; break; } continue; }
        let t1 = (lo[k] - o[k]) / d[k], t2 = (hi[k] - o[k]) / d[k];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) { hit = false; break; }
      }
      if (hit && (!best || tmin < best.t)) best = { mob: m, t: tmin };
    }
    return best;
  }
}
