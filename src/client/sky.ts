import * as THREE from 'three';

/** Kör alakú nap és hold (fázisokkal): kis vászonra rajzolt textúrák, hogy ne kelljen képfájl */

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

const tex = (c: HTMLCanvasElement): THREE.CanvasTexture => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

/** A nap: éles, sárgásfehér korong puha, meleg fénykoszorúval */
export function createSunTexture(): THREE.CanvasTexture {
  const S = 128, r = S / 2;
  const [c, ctx] = canvas(S);
  const glow = ctx.createRadialGradient(r, r, S * 0.16, r, r, r);
  glow.addColorStop(0, 'rgba(255,236,160,0.75)');
  glow.addColorStop(0.45, 'rgba(255,214,120,0.22)');
  glow.addColorStop(1, 'rgba(255,200,100,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#fff4c0';
  ctx.beginPath();
  ctx.arc(r, r, S * 0.17, 0, Math.PI * 2);
  ctx.fill();
  return tex(c);
}

/** A hold egy adott fázisban (0 újhold ... 4 telihold ... 7 fogyó sarló) */
export function createMoonTexture(phase: number): THREE.CanvasTexture {
  const S = 96, r = S / 2, R = S * 0.36;
  const [c, ctx] = canvas(S);
  // a sötét oldal halványan látszik (hamuszürke fény)
  ctx.fillStyle = 'rgba(48,58,92,0.55)';
  ctx.beginPath();
  ctx.arc(r, r, R, 0, Math.PI * 2);
  ctx.fill();

  const a = (phase / 8) * Math.PI * 2;
  const k = Math.cos(a); // 1 újhold, -1 telihold
  const waxing = phase < 4;
  if (phase !== 0) {
    ctx.save();
    if (!waxing) { ctx.translate(S, 0); ctx.scale(-1, 1); } // fogyó holdnál a bal oldal világít
    ctx.beginPath();
    ctx.arc(r, r, R, -Math.PI / 2, Math.PI / 2, false); // a jobb oldali félkör
    // a terminátor: félellipszis, ami a fázistól függően jobbra (sarló) vagy balra (növő/fogyó hold) domborodik
    ctx.ellipse(r, r, Math.abs(R * k), R, 0, Math.PI / 2, k > 0 ? -Math.PI / 2 : (3 * Math.PI) / 2, k > 0);
    ctx.closePath();
    ctx.fillStyle = '#eef2ff';
    ctx.fill();
    ctx.clip();
    // kráterek
    ctx.fillStyle = 'rgba(150,160,195,0.55)';
    for (const [cx, cy, cr] of [[0.42, 0.4, 0.09], [0.62, 0.58, 0.12], [0.5, 0.72, 0.06], [0.64, 0.34, 0.05], [0.36, 0.6, 0.07]]) {
      ctx.beginPath();
      ctx.arc(S * cx, S * cy, S * cr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  return tex(c);
}
