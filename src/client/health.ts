/** Az életerő logikája a src/shared/health.ts-ben van (böngésző nélkül is fut); itt a megjelenítés. */
export { Health, type Env } from '../shared/health';
import type { Health } from '../shared/health';

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

/** mellvért-ikon a páncélponthoz */
const ARMOR_ICON = [
  '.OO...OO.',
  'OXXO.OXXO',
  'OXXXOXXXO',
  'OXHXXXHXO',
  '.OXXXXXO.',
  '.OXXXXXO.',
  '.OXXXXXO.',
  '..OOOOO..',
];

/**
 * RPG-HUD: a játékos portréja mellett piros életerő- és zöld éhségsáv számmal, a hotbar fölött kék oxigénsáv,
 * balra a páncélpont ikonnal. A visszahívás ugyanaz, mint a régi szívsoré: (állapot, rázkódás, páncélpont).
 */
export function createStatBars(base: string) {
  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  const root = $('hud-stats');
  const face = $('hud-face') as HTMLCanvasElement;
  const fctx = face.getContext('2d')!;
  fctx.imageSmoothingEnabled = false;
  const img = new Image();
  img.onload = () => { fctx.drawImage(img, 8, 8, 8, 8, 0, 0, face.width, face.height); };
  img.src = `${base}textures/entity/player.png`;

  const bar = (id: string) => {
    const el = $(id);
    return { el, fill: el.querySelector('.fill') as HTMLElement, trail: el.querySelector('.trail') as HTMLElement | null, txt: el.querySelector('span') as HTMLElement | null, shown: 1 };
  };
  const hpBar = bar('bar-hp'), foodBar = bar('bar-food'), airBar = bar('bar-air');
  const airWrap = $('airbar');
  const armorEl = $('armor-pts');
  const armorNum = $('armor-num');
  ($('armor-icon') as HTMLElement).style.backgroundImage = `url(${sprite(ARMOR_ICON, { O: '#1c2330', X: '#aab4c4', H: '#e6edf7', E: '#6b7585' })})`;

  const set = (b: ReturnType<typeof bar>, v: number, max: number, text: string) => {
    const r = Math.max(0, Math.min(1, v / max));
    b.fill.style.width = `${r * 100}%`;
    if (b.trail) {
      // a lemaradó halvány csík mutatja a veszteséget, és lassan beéri a sávot
      b.shown = b.shown > r ? Math.max(r, b.shown - 0.02) : r;
      b.trail.style.width = `${b.shown * 100}%`;
    }
    if (b.txt && b.txt.textContent !== text) b.txt.textContent = text;
  };
  let last = '';
  let anim = 0;
  return (hp: Health, shake: boolean, armor = 0) => {
    const sig = `${hp.hp}|${hp.burn > 0}|${Math.ceil(hp.air * 4)}|${hp.air < hp.maxAir}|${shake}|${hp.food}|${armor}`;
    if (sig === last) return;
    last = sig;
    set(hpBar, hp.hp, hp.max, `${Math.ceil(hp.hp)} / ${hp.max}`);
    set(foodBar, hp.food, 20, `${Math.ceil(hp.food)} / 20`);
    hpBar.el.classList.toggle('burn', hp.burn > 0);
    hpBar.el.classList.toggle('low', shake && hp.hp <= 6);
    foodBar.el.classList.toggle('low', shake && hp.food <= 6 && hp.saturation <= 0);
    const showAir = hp.air < hp.maxAir;
    airWrap.hidden = !showAir;
    if (showAir) set(airBar, hp.air, hp.maxAir, '');
    armorEl.hidden = armor <= 0;
    armorNum.textContent = String(armor);
    // a trail lassú követéséhez néhány képkockán át frissítünk (a sig nem változik, de a csík még mozog)
    cancelAnimationFrame(anim);
    let n = 0;
    const tick = () => {
      if (hpBar.shown !== hp.hp / hp.max || foodBar.shown !== hp.food / 20) {
        set(hpBar, hp.hp, hp.max, hpBar.txt?.textContent ?? '');
        set(foodBar, hp.food, 20, foodBar.txt?.textContent ?? '');
      }
      if (++n < 60) anim = requestAnimationFrame(tick);
    };
    anim = requestAnimationFrame(tick);
  };
}
