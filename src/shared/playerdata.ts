/**
 * Egy játékos tartós állapota (leltár, páncél, életerő, éhség, hely): a mentéshez és a szerverhez.
 * Böngésző nélkül is fut (lásd docs/MULTIPLAYER.md, 4. lépés). A szerver névvel kulcsolva tárolhatja.
 */
import type { Health } from './health';
import type { Inventory } from './inventory';

export interface PlayerData {
  name: string;
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  mode: 'survival' | 'creative';
  hp: number;
  food: number;
  sat: number;
  /** Inventory.toFlat() */
  inv: number[];
  /** Inventory.armorFlat() */
  arm: number[];
}

export function exportPlayer(
  name: string, pos: { x: number; y: number; z: number }, yaw: number, pitch: number,
  mode: 'survival' | 'creative', health: Health, inv: Inventory,
): PlayerData {
  return { name, pos: [pos.x, pos.y, pos.z], yaw, pitch, mode, hp: health.hp, food: health.food, sat: health.saturation, inv: inv.toFlat(), arm: inv.armorFlat() };
}

/** A tárolt állapot visszatöltése (érvénytelen / hiányzó értékek a megengedett tartományba kerülnek). */
export function importPlayer(d: Partial<PlayerData>, health: Health, inv: Inventory): void {
  inv.slots.fill(null);
  inv.setArmorFlat(d.arm);
  if (d.inv) inv.fromFlat(d.inv);
  health.reset();
  if (d.hp !== undefined) health.hp = Math.max(1, Math.min(health.max, d.hp));
  if (d.food !== undefined) { health.food = Math.max(0, Math.min(20, d.food)); health.saturation = Math.max(0, Math.min(health.food, d.sat ?? 5)); }
}
