import { mkdirSync, rmSync } from 'node:fs'; mkdirSync('.playtest-shots', { recursive: true });
import { execFileSync } from 'node:child_process';
import { launch } from './lib.mjs';
// Mobok közelről, oldalnézetben, egy kontaktlapon (modell- és skin-ellenőrzéshez).
// Használat: node scripts/playtest/mobsheet.mjs <out.png> kind[:variant][@yawdeg] ...   (yaw: 0 oldalnézet, 90 elölnézet...)
const out = process.argv[2] ?? '.playtest-shots/sheet.png';
const specs = process.argv.slice(3).map((s) => { const [a, y] = s.split('@'); const [k, v] = a.split(':'); return { k, v: v === undefined ? undefined : Number(v), yaw: ((y ? Number(y) : 0) * Math.PI) / 180 }; });
const t = await launch({ w: 800, h: 520 });
await t.newGame(20260, 'creative'); await t.settle(2500);
const p = await t.pos(); const X = Math.floor(p.x), Z = Math.floor(p.z), Y = 300;
await t.teleport(X + 0.5, Y + 3, Z + 0.5); await t.settle(1500);
for (let dx = -3; dx <= 10; dx++) for (let dz = -6; dz <= 6; dz++) await t.setBlock(X + dx, Y, Z + dz, 'stone');
const files = [];
for (let i = 0; i < specs.length; i++) {
  const s = specs[i];
  if (process.env.WATER) await t.page.evaluate(() => { window.__water = true; });
  const h = await t.page.evaluate(([s, X, Y, Z]) => {
    const v = window.__voxoria;
    for (const m of [...v.mobs.mobs]) v.mobs.mobs.splice(v.mobs.mobs.indexOf(m), 1);
    const m = v.mobs.spawn(s.k, X + 0.5, Y + 1, Z + 0.5);
    m.noAI = true; m.wanderT = 1e9; m.idle = true; m.hp = 999; m.yaw = s.yaw; if (s.v !== undefined) m.variant = s.v;
    if (m.kind === 'squid') { m.swPh = (s.v || 0) / 256; m.swCycle = 1e9; m.swSpd = 0; }
    if (window.__water) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy <= 3; dy++) v.setBlock(X + dx, Y + dy, Z + dz, 9);
    return m.def.h;
  }, [s, X, Y, Z]);
  const d = Number(process.env.DIST) || Math.min(10, 2.6 + h * 2.6);
  await t.teleport(X + 0.5 + d, Y + 1 + h / 2 - 1.62 + 0.0, Z + 0.5); await t.look(1.5708, 0); await t.settle(1800);
  const f = `.playtest-shots/_s${i}.png`; files.push(f);
  await t.page.screenshot({ path: f, clip: { x: 100, y: 60, width: 600, height: 400 } });
}
await t.close();
execFileSync('python3', ['-c', `
import sys
from PIL import Image
fs=sys.argv[2:]; cols=2; rows=(len(fs)+cols-1)//cols
im=Image.new('RGB',(600*cols,400*rows),(255,255,255))
for i,f in enumerate(fs): im.paste(Image.open(f),((i%cols)*600,(i//cols)*400))
im.save(sys.argv[1])`, out, ...files]);
for (const f of files) rmSync(f);
