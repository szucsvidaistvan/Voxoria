import { B, isSolid } from '../shared/blocks';
import type { World } from '../shared/world';

const HALF_W = 0.3, HEIGHT = 1.8, EPS = 1e-3;
export const EYE = 1.62;
const GRAVITY = 28, JUMP_SPEED = 8.5, WALK_SPEED = 4.6, MAX_FALL = 50;
// vízben: lassabb mozgás, gyenge gravitáció, a szóköz felfelé úsztat
const WATER_GRAVITY = 7, WATER_SPEED = 0.6, MAX_SINK = 3.5, SWIM_UP = 3.5, SWIM_SURFACE = 6;

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

  constructor(private world: World) {}

  private collides(x: number, y: number, z: number): boolean {
    for (let ix = Math.floor(x - HALF_W + EPS); ix <= Math.floor(x + HALF_W - EPS); ix++) {
      for (let iy = Math.floor(y + EPS); iy <= Math.floor(y + HEIGHT - EPS); iy++) {
        for (let iz = Math.floor(z - HALF_W + EPS); iz <= Math.floor(z + HALF_W - EPS); iz++) {
          if (isSolid(this.world.getBlock(ix, iy, iz))) return true;
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
  update(dt: number, mx: number, mz: number, jump: boolean): void {
    const p = this.pos;
    if (!this.world.isLoaded(p.x, p.z)) return; // várjuk meg a terepet

    const bx = Math.floor(p.x), bz = Math.floor(p.z);
    this.inWater = this.world.getBlock(bx, Math.floor(p.y + 0.6), bz) === B.WATER;
    this.headUnderwater = this.world.getBlock(bx, Math.floor(p.y + EYE), bz) === B.WATER;

    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const speed = this.inWater ? WALK_SPEED * WATER_SPEED : WALK_SPEED;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    this.vel.x = (-sin * mz + cos * mx) * speed;
    this.vel.z = (-cos * mz - sin * mx) * speed;

    if (this.inWater) {
      if (jump) {
        // a felszín közelében erősebb a lökés, hogy ki lehessen mászni a partra
        this.vel.y = this.headUnderwater ? SWIM_UP : SWIM_SURFACE;
        this.onGround = false;
      }
    } else if (jump && this.onGround) {
      this.vel.y = JUMP_SPEED;
      this.onGround = false;
    }

    const steps = Math.max(1, Math.ceil(Math.min(dt, 0.1) / 0.016));
    const h = Math.min(dt, 0.1) / steps;
    for (let i = 0; i < steps; i++) {
      this.vel.y = this.inWater
        ? Math.max(this.vel.y - WATER_GRAVITY * h, -MAX_SINK)
        : Math.max(this.vel.y - GRAVITY * h, -MAX_FALL);

      p.x += this.vel.x * h;
      if (this.collides(p.x, p.y, p.z)) p.x -= this.vel.x * h;
      p.z += this.vel.z * h;
      if (this.collides(p.x, p.y, p.z)) p.z -= this.vel.z * h;

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
    if (p.y < -20) { p.y = 60; this.vel.y = 0; } // kiesett a világból
  }
}
