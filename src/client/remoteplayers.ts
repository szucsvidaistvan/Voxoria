import * as THREE from 'three';
import type { PlayerState } from '../shared/protocol';
import type { Atlas } from './atlas';
import { createPlayerView } from './mobview';

/**
 * Távoli játékosok megjelenítése (host: a vendégek, vendég: a host és a többi vendég): egy-egy játékosmodell
 * simított mozgással és animációval, a fejük fölött névtáblával (DOM). A pillanatképek ~12 Hz-esek, a képkockák közt
 * a modell a legutóbbi állapot felé simul.
 */
interface Entry {
  view: ReturnType<typeof createPlayerView>;
  tag: HTMLElement;
  x: number; y: number; z: number; yaw: number;
  walk: number;
  /** a lendítés fázisa (a pillanatképek közt maga lépked tovább) és az utoljára kapott érték */
  sw: number; lastSw: number;
  eat: number; chew: number;
  armor: string;
  seen: boolean;
}

/** egy lendítés ideje (mint a saját kézé) */
const SWING_TIME = 0.3;
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function createRemotePlayers(scene: THREE.Scene, base: string, atlas: Atlas, tagRoot: HTMLElement) {
  const entries = new Map<number, Entry>();
  const v = new THREE.Vector3();

  const make = (s: PlayerState): Entry => {
    const view = createPlayerView(scene, base, atlas);
    view.visible = true;
    const tag = document.createElement('div');
    tag.className = 'nameplate player-tag';
    const name = document.createElement('div');
    name.className = 'np-name';
    name.textContent = s.name;
    tag.appendChild(name);
    tagRoot.appendChild(tag);
    return { view, tag, x: s.x, y: s.y, z: s.z, yaw: s.yaw, walk: 0, sw: 0, lastSw: 0, eat: 0, chew: 0, armor: '', seen: true };
  };

  const remove = (id: number) => {
    const e = entries.get(id);
    if (!e) return;
    e.view.dispose();
    e.tag.remove();
    entries.delete(id);
  };

  return {
    /** A játékosok friss állapota (a lista a hiányzókat eltávolítja). */
    sync(states: readonly PlayerState[], dt: number, light: [number, number, number], camera: THREE.Camera, w: number, h: number, visible: boolean): void {
      for (const e of entries.values()) e.seen = false;
      camera.updateMatrixWorld();
      for (const s of states) {
        let e = entries.get(s.id);
        if (!e) { e = make(s); entries.set(s.id, e); }
        e.seen = true;
        const k = 1 - Math.exp(-dt * 14);
        const px = e.x, pz = e.z;
        // nagy ugrásnál (teleport, első állapot) nem simítunk
        if (Math.hypot(s.x - e.x, s.z - e.z) > 6 || Math.abs(s.y - e.y) > 6) { e.x = s.x; e.y = s.y; e.z = s.z; }
        else { e.x += (s.x - e.x) * k; e.y += (s.y - e.y) * k; e.z += (s.z - e.z) * k; }
        e.yaw += angDiff(s.yaw, e.yaw) * k;
        e.walk += Math.hypot(e.x - px, e.z - pz);
        // üléskor a pillanatkép fázisához igazodunk, két pillanatkép közt magunk léptetjük (a kéz ugyanolyan gyorsan mozog)
        if (s.swing !== e.lastSw) { e.lastSw = s.swing; e.sw = s.swing; } else if (e.sw > 0) e.sw = Math.min(1, e.sw + dt / SWING_TIME);
        if (s.swing === 0) e.sw = 0;
        e.eat += ((s.eating ? 1 : 0) - e.eat) * Math.min(1, dt * 10);
        if (s.eating) e.chew += dt * 2;
        const armor = s.armor.join(',');
        if (armor !== e.armor) { e.armor = armor; e.view.setArmor([...s.armor]); }
        e.view.setHeld(s.held);
        e.view.visible = visible;
        e.view.set(e.x, e.y, e.z, e.yaw, e.walk, s.speed / 4, light, {
          swing: e.sw, eat: e.eat, chewPhase: e.chew, block: s.blocking, pitch: s.pitch, sprint: s.sprint ? 1 : 0,
        });
        // névtábla: a fej fölött, a képernyőre vetítve
        v.set(e.x, e.y + 2.1, e.z).project(camera);
        const behind = v.z > 1 || v.z < -1;
        e.tag.hidden = !visible || behind;
        if (!e.tag.hidden) {
          const d = Math.hypot(e.x - camera.position.x, e.y - camera.position.y, e.z - camera.position.z);
          const sc = Math.max(0.6, Math.min(1.15, 9 / Math.max(d, 1)));
          e.tag.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%) scale(${sc})`;
        }
      }
      for (const [id, e] of entries) if (!e.seen) remove(id);
    },
    clear(): void { for (const id of [...entries.keys()]) remove(id); },
  };
}
