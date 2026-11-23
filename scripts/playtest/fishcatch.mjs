import { launch } from './lib.mjs';
// Horgászat valódi hallal: tó, benne halak; bedobás, kapás, behúzás → a kapó hal eltűnik, az zsákmány a hal ejtése.
// Használat: node scripts/playtest/fishcatch.mjs
const t = await launch({ w: 800, h: 450 });
await t.newGame(20260, 'creative'); await t.settle(2500);
const p = await t.pos(); const X = Math.floor(p.x), Z = Math.floor(p.z), Y = 300;
await t.teleport(X + 0.5, Y + 3, Z + 0.5); await t.settle(1200);
await t.page.evaluate(([X, Y, Z]) => {
  const v = window.__voxoria;
  for (let dx = -6; dx <= 12; dx++) for (let dz = -8; dz <= 8; dz++) {
    v.setBlock(X + dx, Y - 3, Z + dz, v.blockId('stone'));
    for (let dy = -2; dy <= 0; dy++) v.setBlock(X + dx, Y + dy, Z + dz, dx >= 3 ? 9 : (dy < 0 ? v.blockId('stone') : 0));
  }
  v.inv.slots[0] = { id: v.EXTRA_ID.fishing_rod, n: 1 }; v.input.hotbar = 0;
}, [X, Y, Z]);
await t.teleport(X + 0.5, Y + 1, Z + 0.5);
await t.look(-1.5708, -0.2);
await t.settle(800);
const r = await t.page.evaluate(async ([X, Y, Z]) => {
  const v = window.__voxoria;
  v.mobs.mobs.splice(0);
  const fish = [v.mobs.spawn('cod', X + 8, Y - 1, Z + 3), v.mobs.spawn('salmon', X + 9, Y - 1, Z - 3), v.mobs.spawn('cod', X + 7, Y - 1, Z)];
  const before = fish.length;
  v.useAt(X + 5, Y - 1, Z); // bedobás
  const log = [];
  const t0 = performance.now();
  let bit = false;
  while (performance.now() - t0 < 60000) {
    await new Promise((r) => setTimeout(r, 200));
    if (v.fishing.bite > 0) { bit = true; break; }
  }
  const hooked = v.fishing.hooked;
  const nearest = Math.min(...fish.map((f) => Math.hypot(f.x - v.fishing.x, f.z - v.fishing.z)));
  const before2 = v.mobs.mobs.filter((m) => m.def.fish).length;
  v.useAt(X + 5, Y - 1, Z); // behúzás
  await new Promise((r) => setTimeout(r, 500));
  const after = v.mobs.mobs.filter((m) => m.def.fish).length;
  return { bit, hooked, nearest: +nearest.toFixed(2), before: before2, after, elapsed: ((performance.now() - t0) / 1000).toFixed(1), active: v.fishing.active };
}, [X, Y, Z]);
console.log(JSON.stringify(r));
await t.shot('.playtest-shots/fishcatch.png');
await t.close();
