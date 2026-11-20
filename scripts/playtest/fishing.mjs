import { mkdirSync } from 'node:fs'; mkdirSync('.playtest-shots', { recursive: true });
import { launch } from './lib.mjs';
// Horgászat harmadik személyben: a bot iránya és a zsinór a bot hegyétől a bójáig.
// Használat: node scripts/playtest/fishing.mjs <out.png> [view 0|1|2]
const out = process.argv[2] ?? '.playtest-shots/fishing.png';
const view = Number(process.argv[3] ?? 1);
const t = await launch({ w: 1000, h: 520 });
await t.newGame(20260, 'creative'); await t.settle(2500);
const p = await t.pos(); const X = Math.floor(p.x), Z = Math.floor(p.z), Y = 300;
await t.teleport(X + 0.5, Y + 3, Z + 0.5); await t.settle(1200);
for (let dx = -6; dx <= 10; dx++) for (let dz = -8; dz <= 8; dz++) {
  await t.page.evaluate(([x, y, z, w]) => window.__voxoria.setBlock(x, y, z, w ? 9 : window.__voxoria.blockId('stone')), [X + dx, Y, Z + dz, dx >= 3]);
  await t.setBlock(X + dx, Y - 1, Z + dz, 'stone');
}
await t.teleport(X + 0.5, Y + 1, Z + 0.5);
await t.page.evaluate(() => { const v = window.__voxoria; v.inv.slots[0] = { id: v.EXTRA_ID.fishing_rod, n: 1 }; v.input.hotbar = 0; v.setView(Number(window.__view)); });
await t.page.evaluate((vw) => window.__voxoria.setView(vw), view);
await t.look(-1.5708, -0.2); // +x felé (a víz)
await t.settle(800);
await t.page.evaluate(([x, y, z]) => window.__voxoria.useAt(x, y, z), [X + 5, Y, Z]);
await t.settle(1500);
const info = await t.page.evaluate(() => {
  const v = window.__voxoria, T = v.playerView; const THREE_V = v.camera.position.constructor; const a = new THREE_V();
  const ok = T.rodTip(a); const p = v.player;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  return { ok, tip: [a.x - p.pos.x, a.y - p.pos.y, a.z - p.pos.z].map((n) => +n.toFixed(2)), fwd: +(((a.x - p.pos.x) * fx + (a.z - p.pos.z) * fz)).toFixed(2), yaw: p.yaw };
});
if (process.argv[4] === 'side') await t.page.evaluate(([x, y, z]) => window.__voxoria.setCam([x + 0.5, y + 2.2, z + 3.2, x + 1.5, y + 1.6, z + 0.3]), [X, Y, Z]);
console.log('rodTip', JSON.stringify(info));
await t.shot(out); await t.close();
