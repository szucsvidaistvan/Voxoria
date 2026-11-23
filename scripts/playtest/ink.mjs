import { mkdirSync } from 'node:fs'; mkdirSync('.playtest-shots', { recursive: true });
import { launch } from './lib.mjs';
// A megütött polip tintafelhője. Használat: node scripts/playtest/ink.mjs <out.png>
const out = process.argv[2] ?? '.playtest-shots/ink.png';
const t = await launch({ w: 900, h: 600 });
await t.newGame(20260, 'creative'); await t.settle(2500);
const p = await t.pos(); const X = Math.floor(p.x), Z = Math.floor(p.z), Y = 300;
await t.teleport(X + 0.5, Y + 3, Z + 0.5); await t.settle(1500);
for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
  await t.setBlock(X + dx, Y, Z + dz, 'stone');
  for (let dy = 1; dy <= 4; dy++) await t.setBlock(X + dx, Y + dy, Z + dz, 9);
}
await t.teleport(X + 0.5, Y + 6, Z + 5.5); await t.look(0, -0.6); await t.settle(1200);
await t.page.evaluate(([x, y, z]) => { const v = window.__voxoria; const m = v.mobs.spawn('squid', x, y, z); window.__m = m; }, [X + 0.5, Y + 2, Z + 0.5]);
await t.settle(500);
await t.page.evaluate(() => { window.__m.hurt(1, window.__voxoria.camera.position.x, window.__voxoria.camera.position.z); });
await t.settle(900);
await t.shot(out); await t.close();
