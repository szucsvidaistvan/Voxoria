import * as THREE from 'three';
import type { Mob } from '../shared/mobs';

/**
 * Névtáblák a mobok feje fölött: név és mini életerő-sáv. A megcélzott mobnál és a 14 blokkon belüli sérült mobnál látszik.
 * A táblák DOM-elemek (éles szöveg), a mob fejének pozícióját a kamerával vetítjük a képernyőre; kis elempool-ból dolgozunk.
 */
const MAX = 8; // legfeljebb ennyi tábla egyszerre
const NEAR = 14; // a sérült mobok táblája eddig a távolságig látszik

export function createNameplates(root: HTMLElement, occluded: (m: Mob) => boolean) {
  const pool: { el: HTMLElement; name: HTMLElement; fill: HTMLElement; kind: string }[] = [];
  for (let i = 0; i < MAX; i++) {
    const el = document.createElement('div');
    el.className = 'nameplate';
    el.hidden = true;
    const name = document.createElement('div');
    name.className = 'np-name';
    const bar = document.createElement('div');
    bar.className = 'np-bar';
    const fill = document.createElement('div');
    fill.className = 'np-fill';
    bar.appendChild(fill);
    el.append(name, bar);
    root.appendChild(el);
    pool.push({ el, name, fill, kind: '' });
  }
  const v = new THREE.Vector3();

  return {
    update(mobs: readonly Mob[], target: Mob | null, camera: THREE.Camera, w: number, h: number): void {
      camera.updateMatrixWorld();
      const cp = camera.position;
      // jelöltek: a megcélzott mob mindig, mellette a közeli sérültek (a legközelebbiek elöl)
      const cand: { m: Mob; d: number }[] = [];
      for (const m of mobs) {
        if (m.dead) continue;
        const d = Math.hypot(m.x - cp.x, m.y - cp.y, m.z - cp.z);
        if (m === target || (m.hp < m.def.hp && d < NEAR)) cand.push({ m, d });
      }
      cand.sort((a, b) => (a.m === target ? -1 : b.m === target ? 1 : a.d - b.d));
      let used = 0;
      for (const { m, d } of cand) {
        if (used >= MAX) break;
        v.set(m.x, m.y + m.def.h + 0.35, m.z).project(camera);
        if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue; // a kamera mögött vagy képernyőn kívül
        if (m !== target && occluded(m)) continue; // blokk takarja
        const p = pool[used++];
        p.el.hidden = false;
        if (p.kind !== m.kind) { p.name.textContent = m.def.name; p.kind = m.kind; }
        p.el.classList.toggle('hostile', m.def.hostile);
        p.fill.style.width = `${Math.max(0, Math.min(1, m.hp / m.def.hp)) * 100}%`;
        const s = Math.max(0.6, Math.min(1.15, 9 / Math.max(d, 1)));
        p.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%) scale(${s})`;
      }
      for (let i = used; i < MAX; i++) { pool[i].el.hidden = true; pool[i].kind = ''; }
    },
  };
}
