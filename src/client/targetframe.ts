import type { Mob } from '../shared/mobs';
import { TEXTURED } from './mobmodels';

/**
 * Célpont-keret (mint a WoW-ban): a megcélzott állat portréja, neve és életereje.
 * A portré a mob skinjéből kivágott fej-elöl lap. A keret a célzás megszűnése után még kis ideig látszik.
 */
const HOLD = 3; // ennyi ideig marad látható a célzás után (mp)
const SPEED = 6; // az életerő-sáv követési sebessége (1/mp)

export function createTargetFrame(base: string) {
  const root = document.getElementById('target') as HTMLElement;
  const face = document.getElementById('target-face') as HTMLCanvasElement;
  const nameEl = document.getElementById('target-name') as HTMLElement;
  const fill = document.getElementById('target-fill') as HTMLElement;
  const trail = document.getElementById('target-trail') as HTMLElement;
  const hpEl = document.getElementById('target-hp') as HTMLElement;
  const ctx = face.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const skins = new Map<string, HTMLImageElement | null>();
  const skin = (tex: string): HTMLImageElement | null => {
    if (skins.has(tex)) return skins.get(tex) ?? null;
    skins.set(tex, null);
    const img = new Image();
    img.onload = () => { skins.set(tex, img); shownKind = ''; }; // a portré újrarajzolása a betöltés után
    img.src = `${base}textures/entity/${tex}.png`;
    return null;
  };

  let mob: Mob | null = null;
  let left = 0;
  let shownKind = '';
  let shownText = '';
  let bar = 1; // a megjelenített (lassan követő) arány

  const drawFace = (kind: string) => {
    ctx.clearRect(0, 0, face.width, face.height);
    const head = TEXTURED[kind]?.[0];
    const img = head ? skin(head.tex) : null;
    if (!head || !img) return;
    const [w, h, d] = head.px;
    // a doboz előlapja a textúrán: (u + mélység, v + mélység), w × h
    const sw = w, sh = h;
    const k = Math.min(face.width / sw, face.height / sh);
    ctx.drawImage(img, head.uv[0] + d, head.uv[1] + d, sw, sh, (face.width - sw * k) / 2, (face.height - sh * k) / 2, sw * k, sh * k);
    shownKind = kind;
  };

  return {
    /** minden képkockán: a megcélzott mob (vagy null) és az eltelt idő */
    update(target: Mob | null, dt: number): void {
      if (target) { mob = target; left = HOLD; } else left -= dt;
      if (!mob || left <= 0) { root.hidden = true; mob = null; return; }
      const m = mob;
      if (root.hidden) { root.hidden = false; bar = m.hp / m.def.hp; }
      if (shownKind !== m.kind) {
        nameEl.textContent = m.def.name;
        root.classList.toggle('hostile', m.def.hostile);
        drawFace(m.kind);
      }
      const hp = Math.max(0, m.hp);
      const text = `${Math.ceil(hp)} / ${m.def.hp}`;
      if (text !== shownText) { hpEl.textContent = text; shownText = text; }
      const ratio = Math.max(0, Math.min(1, hp / m.def.hp));
      fill.style.width = `${ratio * 100}%`;
      // a lemaradó, halványabb sáv megmutatja, mennyit sebeztünk az utolsó ütéssel
      bar = bar > ratio ? Math.max(ratio, bar - SPEED * dt * 0.2) : ratio;
      trail.style.width = `${bar * 100}%`;
      root.classList.toggle('dead', m.dead);
    },
  };
}
