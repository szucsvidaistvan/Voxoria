import { BLOCKS, B, FLUID_LAVA, FLUID_WATER, LIGHT, blockId, dynamicBoxes, fluidKind, isOpaque, isSolid } from './blocks';
import { EXTRA_ID, I } from './items';
import { CH, type World } from './world';
import { biomeAt } from './worldgen';

/**
 * Mobok: logika, fizika és AI. Nem függ a rendereléstől (nincs benne three.js), így a szerver is használhatja.
 * A megjelenítés a client/mobview.ts-ben van.
 */

export type MobKind = 'pig' | 'cow' | 'sheep' | 'chicken' | 'zombie' | 'skeleton' | 'wolf' | 'polarbear' | 'horse' | 'spider';

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
};

export const PASSIVE_KINDS: MobKind[] = ['pig', 'cow', 'sheep', 'chicken'];

/** Biomonként melyik semleges/háziállat jelenhet meg a fenti alap-négy mellett (valószínűséggel) */
const BIOME_FAUNA: Partial<Record<string, MobKind[]>> = {
  plains: ['horse'], savanna: ['horse'], forest: ['wolf'], dark_forest: ['wolf'], taiga: ['wolf', 'polarbear'], mountains: ['polarbear'],
};

/** Mit ejt a mob, ha meghal (véletlen darabszámmal). A gyapjú azonosítója a blokkok regisztrálása után ismert. */
export function mobDrops(kind: MobKind, rand: () => number = Math.random): { id: number; n: number }[] {
  const r = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const out: { id: number; n: number }[] = [];
  const add = (id: number | undefined, n: number) => { if (id !== undefined && n > 0) out.push({ id, n }); };
  switch (kind) {
    case 'pig': add(I.RAW_PORK, r(1, 3)); break;
    case 'cow': add(I.RAW_BEEF, r(1, 3)); add(EXTRA_ID.leather, r(0, 2)); break;
    case 'chicken': add(I.RAW_CHICKEN, 1); add(EXTRA_ID.feather, r(0, 2)); add(EXTRA_ID.egg, r(0, 1)); break;
    case 'sheep': add(blockId('white_wool'), 1); add(I.RAW_MUTTON, r(1, 2)); break;
    case 'zombie': add(I.ROTTEN_FLESH, r(0, 2)); break;
    case 'spider': add(EXTRA_ID.string, r(0, 2)); break;
    case 'horse': add(EXTRA_ID.leather, r(0, 2)); break;
    case 'polarbear': add(EXTRA_ID.cod, r(0, 2)); break;
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

  constructor(readonly kind: MobKind, x: number, y: number, z: number) {
    this.def = MOB_DEFS[kind];
    this.hp = this.def.hp;
    this.x = x; this.y = y; this.z = z;
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
  const a = Math.min(1, dt * (m.onGround ? 9 : 2.5));
  m.vx += (m.wx - m.vx) * a;
  m.vz += (m.wz - m.vz) * a;

  const steps = Math.max(1, Math.ceil(Math.min(dt, 0.1) / 0.02));
  const hh = Math.min(dt, 0.1) / steps;
  let wall = false;
  for (let i = 0; i < steps; i++) {
    if (m.inWater) m.vy = Math.max(m.vy - 6 * hh, -2) + (m.vy < 1.2 ? 14 * hh : 0); // lassan feljön a felszínre
    else if (m.climb) m.vy = CLIMB; // a pók a falon felmászik (a gravitáció nem húzza vissza)
    else m.vy = Math.max(m.vy - GRAVITY * hh, m.kind === 'chicken' ? -2.2 : -50);
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
  m.climb = m.kind === 'spider' && wall && want;
  if (wall && want && m.onGround && !m.climb) m.vy = JUMP;
  if (m.y < -20) m.hp = 0; // kiesett a világból
  m.walk += Math.hypot(m.vx, m.vz, m.climb ? m.vy : 0) * dt * 1.6;
}

// ---------- AI ----------

export interface MobCtx {
  /** a játékos lábpozíciója */
  px: number; py: number; pz: number;
  /** támadható-e a játékos (túlélő módban igen) */
  target: boolean;
  /** süt a nap (a zombik égnek) */
  day: boolean;
  hurtPlayer(dmg: number, fromX: number, fromZ: number): void;
  onDie(m: Mob): void;
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

  const dx = ctx.px - m.x, dz = ctx.pz - m.z, dy = ctx.py - m.y;
  const dist = Math.hypot(dx, dz);

  const aggressive = m.angry || (def.hostile && !(m.kind === 'spider' && ctx.day));
  if (aggressive && ctx.target && dist < 24 && Math.abs(dy) < 12) {
    // üldözés
    lookAt(m, ctx.px, ctx.pz);
    if (m.kind === 'skeleton') {
      // a csontváz távolról lő: 7 blokknál közelebb megáll; szabad rálátással megáll célozni, majd nyilat lő (kitérni lehet)
      const canShoot = dist < 16 && Math.abs(dy) < 8 && clearShot(world, m.x, m.y + 1.5, m.z, ctx.px, ctx.py + 1.3, ctx.pz);
      if (canShoot && priv.atkCd <= 0) {
        m.aim += dt;
        speed = 0;
        if (m.aim >= 0.8) {
          m.aim = 0;
          priv.atkCd = 2;
          fireArrow(arrows, m.x, m.y + 1.5, m.z, ctx.px, ctx.py + 1.3, ctx.pz);
        }
      } else {
        m.aim = 0;
        speed = dist > 7 || !canShoot ? def.speed : 0;
      }
    } else {
      speed = dist > 0.9 ? def.speed : 0;
      if (dist < 1.4 && Math.abs(dy) < 1.8 && priv.atkCd <= 0) {
        priv.atkCd = 1;
        ctx.hurtPlayer(def.dmg ?? 3, m.x, m.z);
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
}

/** Van-e a mob előtt 3 blokknál mélyebb lyuk vagy víz/láva? */
function dropAhead(world: World, m: Mob, fx: number, fz: number): boolean {
  const x = Math.floor(m.x + fx * 0.9), z = Math.floor(m.z + fz * 0.9);
  const y = Math.floor(m.y);
  for (let d = 0; d <= 3; d++) {
    const id = world.getBlock(x, y - d, z);
    if (isSolid(id)) return false;
    if (fluidKind(id) === FLUID_LAVA) return true;
    if (fluidKind(id) === FLUID_WATER) return true;
  }
  return true;
}

// ---------- kezelő ----------

export const MOB_CAP_PASSIVE = 14;
export const MOB_CAP_HOSTILE = 8;

export class MobManager {
  mobs: Mob[] = [];
  private spawnT = 0;

  constructor(private world: World) {}

  clear(): void { this.mobs = []; }

  count(hostile: boolean): number {
    let n = 0;
    for (const m of this.mobs) if (m.def.hostile === hostile && !m.dead) n++;
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
        } else if (ctx.target && Math.abs(a.x - ctx.px) < 0.45 && Math.abs(a.z - ctx.pz) < 0.45 && a.y > ctx.py - 0.1 && a.y < ctx.py + 1.85) {
          ctx.hurtPlayer(3, a.x - a.vx * 0.05, a.z - a.vz * 0.05);
          gone = true;
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
      const far = Math.hypot(m.x - ctx.px, m.z - ctx.pz);
      if (far > 80 && !m.dead) { this.mobs.splice(i, 1); continue; }
      // a messze maradt ellenséges mobok lassan eltűnnek (nem torlaszolják el a létszámkeretet)
      if (m.def.hostile && !m.dead && far > 40 && Math.random() < dt * 0.1) { this.mobs.splice(i, 1); continue; }
      if (!this.world.isLoaded(m.x, m.z)) continue; // betöltetlen terepen megállnak
      m.hurtT = Math.max(0, m.hurtT - dt);

      if (m.dead) {
        m.deadT += dt;
        if (m.deadT > 0.8) this.mobs.splice(i, 1);
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
      if ((m.kind === 'zombie' || m.kind === 'skeleton') && ctx.day && m.exposed && !m.inWater) {
        priv.burnT += dt;
        if (priv.burnT >= 1) { priv.burnT -= 1; m.hp -= 2; m.hurtT = 0.3; }
      }

      aiStep(this.world, m, dt, ctx, this.arrows);
      if (m.dead) { this.mobs.splice(i, 1); continue; } // felrobbant
      physics(this.world, m, dt);
      if (m.hp <= 0 && !m.dead) { m.deadT = 0; ctx.onDie(m); }
    }
  }

  /** Új mobok a játékos környékén. `night`: sötét van a felszínen (ilyenkor jönnek a szörnyek). */
  spawnTick(dt: number, px: number, py: number, pz: number, night: boolean, hostileAllowed: boolean): void {
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    const passiveN = this.count(false);
    this.spawnT = passiveN < MOB_CAP_PASSIVE / 2 ? 0.4 : 2.5;

    if (passiveN < MOB_CAP_PASSIVE) this.trySpawn(px, pz, PASSIVE_KINDS[Math.floor(Math.random() * PASSIVE_KINDS.length)], 20, 44, 'surface');
    // a biomhoz illő állatok (ló, farkas, jegesmedve): ritkábban, a játékostól távolabb
    if (passiveN < MOB_CAP_PASSIVE && Math.random() < 0.3) this.trySpawn(px, pz, 'fauna', 24, 48, 'surface');
    if (hostileAllowed && this.count(true) < MOB_CAP_HOSTILE) {
      const roll = Math.random();
      const kind: MobKind = roll < 0.45 ? 'zombie' : roll < 0.75 ? 'skeleton' : 'spider';
      // a szörnyek a játékostól legalább 24 blokkra jönnek elő (nem a szeme előtt), és ritkán
      if (Math.random() < 0.5) {
        if (night) this.trySpawn(px, pz, kind, 24, 44, 'surface', py);
        else if (Math.random() < 0.35) this.trySpawn(px, pz, kind, 24, 36, 'cave', py); // barlangokban nappal is
      }
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
  private trySpawn(px: number, pz: number, want: MobKind | 'fauna', minR: number, maxR: number, where: 'surface' | 'cave', py = NaN): void {
    const w = this.world;
    const a = Math.random() * Math.PI * 2, r = minR + Math.random() * (maxR - minR);
    const x = Math.floor(px + Math.cos(a) * r), z = Math.floor(pz + Math.sin(a) * r);
    if (!w.isLoaded(x, z)) return;
    let y: number;
    if (where === 'surface') y = w.heightAt(x, z) + 1;
    else {
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
      if (kind === 'polarbear' && Math.random() < 0.6) return; // ritka
    } else kind = want;
    const below = w.getBlock(x, y - 1, z);
    if (!(isSolid(below) && fluidKind(below) === 0 && w.getBlock(x, y, z) === 0 && w.getBlock(x, y + 1, z) === 0)) return;
    // barlangban csak fedett helyre (legalább néhány blokk kő van fölötte)
    if (where === 'cave' && w.heightAt(x, z) - y < 5) return;
    // ellenséges mob nem jelenhet meg a játékos látóterében (szabad rálátás 40 blokkon belül)
    if (MOB_DEFS[kind].hostile && !isNaN(py) && clearShot(w, px, py + 1.6, pz, x + 0.5, y + 1, z + 0.5)) return;
    // szörny csak sötétben: fedett barlangban (fa lombja alatt nem), vagy éjjel a szabadban, és nem fáklya mellett
    if (MOB_DEFS[kind].hostile && !this.dark(x, y, z, where === 'cave')) return;
    // állatok csak füvön; a felszíni szörnyek bárhol, ahol szilárd a talaj
    if (!MOB_DEFS[kind].hostile && below !== B.GRASS && !(kind === 'polarbear' && fluidKind(below) === 0)) return;
    const n = MOB_DEFS[kind].hostile ? 1 : 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const sx = x + 0.5 + (Math.random() - 0.5) * 3, sz = z + 0.5 + (Math.random() - 0.5) * 3;
      if (boxBlocked(w, sx, y, sz, MOB_DEFS[kind].hw, MOB_DEFS[kind].h)) continue;
      this.spawn(kind, sx, y, sz);
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
