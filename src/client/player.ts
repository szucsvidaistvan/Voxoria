import { B, BLOCKS, FLUID_LAVA, FLUID_WATER, dynamicBoxes, fluidKind, isSolid } from '../shared/blocks';
import type { World } from '../shared/world';

const HALF_W = 0.3, HEIGHT = 1.8, EPS = 1e-3;
export const EYE = 1.62;
const GRAVITY = 28, JUMP_SPEED = 8.5, WALK_SPEED = 4.6, MAX_FALL = 50;
// vízben: lassabb mozgás, gyenge gravitáció, a szóköz felfelé úsztat
const WATER_GRAVITY = 7, WATER_SPEED = 0.6, MAX_SINK = 3.5, SWIM_UP = 3.5, SWIM_SURFACE = 6;
// lávában: nagyon lassú mozgás, még a vízinél is lassabb úszás
const LAVA_GRAVITY = 4, LAVA_SPEED = 0.3, LAVA_SINK = 1.6, LAVA_UP = 2.2;

/** Ilyen magas lépcsőfokra (lap, lépcső, hóréteg) ugrás nélkül fellép (a teljes blokk nem) */
const STEP_HEIGHT = 0.6;

export class Player {
  pos = { x: 8.5, y: 40, z: 8.5 };
  vel = { x: 0, y: 0, z: 0 };
  yaw = 0;
  pitch = 0;
  onGround = false;
  /** a test közepe vízben van */
  inWater = false;
  /** a szem vízben van (a kamera víz alatt látja a világot) */
  headUnderwater = false;
  /** a test lávában van */
  inLava = false;
  /** a szem lávában van */
  headInLava = false;
  /** a tűz blokkjában áll */
  inFire = false;
  /** az utolsó leérkezés előtti esés magassága (blokk), amit a játék elvihet és nullázhat */
  landing = 0;
  /** lökés (blokk/mp): sebzéskor kapja, és gyorsan elhal; a mozgás mellé adódik */
  knock = { x: 0, z: 0 };
  private peak = 0;
  private airborne = false;

  constructor(private world: World) {}

  /**
   * Automatikus fellépés: ha földön járva egy alacsony akadálynak (hórétegnek, lapnak, lépcsőfoknak,
   * legfeljebb STEP_HEIGHT magas) megyünk neki, a játékos a legkisebb szükséges magassággal felemelkedik.
   * @returns igaz, ha sikerült (a p.y már az új magasságon van)
   */
  private stepUp(p: { x: number; y: number; z: number }, noStep: boolean): boolean {
    if (!this.onGround || noStep || this.vel.y > 0.01) return false;
    for (let lift = 0.0625; lift <= STEP_HEIGHT + 1e-6; lift += 0.0625) {
      if (!this.collides(p.x, p.y + lift + 0.002, p.z)) {
        p.y += lift + 0.002;
        return true;
      }
    }
    return false;
  }

  private collides(x: number, y: number, z: number): boolean {
    for (let ix = Math.floor(x - HALF_W + EPS); ix <= Math.floor(x + HALF_W - EPS); ix++) {
      // egy blokkal lejjebbről is indulunk: a kerítés és a fal doboza másfél blokk magas
      const y0 = Math.floor(y + EPS);
      for (let iy = y0 - 1; iy <= Math.floor(y + HEIGHT - EPS); iy++) {
        for (let iz = Math.floor(z - HALF_W + EPS); iz <= Math.floor(z + HALF_W - EPS); iz++) {
          const id = this.world.getBlock(ix, iy, iz);
          if (!isSolid(id)) continue;
          const def = BLOCKS[id];
          const boxes = def?.conn ? dynamicBoxes(def, (dx, dz) => this.world.getBlock(ix + dx, iy, iz + dz), 'boxes') : def?.boxes;
          if (!boxes) {
            if (iy < y0) continue; // a lenti teljes kocka csak akkor ütközik, ha a lábunk is benne van
            return true; // teljes kocka
          }
          // nem kocka alakú blokk: csak a tényleges dobozaival ütközik
          for (const b of boxes) {
            if (
              x + HALF_W > ix + b[0] + EPS && x - HALF_W < ix + b[3] - EPS &&
              y + HEIGHT > iy + b[1] + EPS && y < iy + b[4] - EPS &&
              z + HALF_W > iz + b[2] + EPS && z - HALF_W < iz + b[5] - EPS
            ) return true;
          }
        }
      }
    }
    return false;
  }

  /** Átfed-e a játékos a megadott blokkal? (lerakáskor kell) */
  intersectsBlock(bx: number, by: number, bz: number): boolean {
    const p = this.pos;
    return (
      p.x + HALF_W > bx && p.x - HALF_W < bx + 1 &&
      p.y + HEIGHT > by && p.y < by + 1 &&
      p.z + HALF_W > bz && p.z < bz + 1
    );
  }

  /** mx: jobbra (+) / balra (−), mz: előre (+) / hátra (−), mindkettő −1..1 */
  /** a mozgás szorzója (pl. kardos védekezés közben lassabb) */
  speedMul = 1;

  update(dt: number, mx: number, mz: number, jump: boolean): void {
    const p = this.pos;
    if (!this.world.isLoaded(p.x, p.z)) return; // várjuk meg a terepet

    const bx = Math.floor(p.x), bz = Math.floor(p.z);
    const body = this.world.getBlock(bx, Math.floor(p.y + 0.6), bz);
    const feet = this.world.getBlock(bx, Math.floor(p.y + 0.1), bz);
    const head = this.world.getBlock(bx, Math.floor(p.y + EYE), bz);
    this.inWater = fluidKind(body) === FLUID_WATER;
    this.headUnderwater = fluidKind(head) === FLUID_WATER;
    this.inLava = fluidKind(body) === FLUID_LAVA || fluidKind(feet) === FLUID_LAVA;
    this.headInLava = fluidKind(head) === FLUID_LAVA;
    this.inFire = body === B.FIRE || feet === B.FIRE;
    const swim = this.inWater || this.inLava;
    // létrán: lehet mászni (előre vagy ugrás: fel, hátra: le), nincs gravitáció
    const ladder = !swim && (BLOCKS[body]?.key === 'ladder' || BLOCKS[feet]?.key === 'ladder');

    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const speed = (this.inLava ? WALK_SPEED * LAVA_SPEED : this.inWater ? WALK_SPEED * WATER_SPEED : WALK_SPEED) * this.speedMul;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    this.vel.x = (-sin * mz + cos * mx) * speed;
    this.vel.z = (-cos * mz - sin * mx) * speed;
    this.vel.x += this.knock.x;
    this.vel.z += this.knock.z;
    const kd = Math.exp(-7 * Math.min(dt, 0.1));
    this.knock.x *= kd;
    this.knock.z *= kd;

    if (ladder) {
      this.vel.y = jump || mz > 0.1 ? 3.2 : mz < -0.1 ? -3.2 : -0.8;
      this.vel.x *= 0.6;
      this.vel.z *= 0.6;
      this.onGround = false;
    } else if (swim) {
      if (jump) {
        // a felszín közelében erősebb a lökés, hogy ki lehessen mászni a partra
        this.vel.y = this.inLava ? LAVA_UP : this.headUnderwater ? SWIM_UP : SWIM_SURFACE;
        this.onGround = false;
      }
    } else if (jump && this.onGround) {
      this.vel.y = JUMP_SPEED;
      this.onGround = false;
    }

    const steps = Math.max(1, Math.ceil(Math.min(dt, 0.1) / 0.016));
    const h = Math.min(dt, 0.1) / steps;
    for (let i = 0; i < steps; i++) {
      if (!ladder) this.vel.y = this.inLava
        ? Math.max(this.vel.y - LAVA_GRAVITY * h, -LAVA_SINK)
        : this.inWater
          ? Math.max(this.vel.y - WATER_GRAVITY * h, -MAX_SINK)
          : Math.max(this.vel.y - GRAVITY * h, -MAX_FALL);

      p.x += this.vel.x * h;
      if (this.collides(p.x, p.y, p.z) && !this.stepUp(p, swim || ladder)) p.x -= this.vel.x * h;
      p.z += this.vel.z * h;
      if (this.collides(p.x, p.y, p.z) && !this.stepUp(p, swim || ladder)) p.z -= this.vel.z * h;

      const dy = this.vel.y * h;
      p.y += dy;
      if (this.collides(p.x, p.y, p.z)) {
        p.y -= dy;
        this.onGround = dy < 0;
        this.vel.y = 0;
      } else {
        this.onGround = false;
      }
    }
    // esés követése: vízben vagy lávában nincs sebzés, a leérkezéskor az esés magasságát jegyezzük meg
    if (swim || ladder) { this.peak = p.y; this.airborne = false; }
    else if (this.onGround) {
      if (this.airborne) this.landing = Math.max(this.landing, this.peak - p.y);
      this.airborne = false;
      this.peak = p.y;
    } else {
      if (!this.airborne) this.peak = p.y;
      this.airborne = true;
      this.peak = Math.max(this.peak, p.y);
    }
    if (p.y < -20) { p.y = 60; this.vel.y = 0; } // kiesett a világból
  }
}
