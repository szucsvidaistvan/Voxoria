// Példa/teszt: a magas (384 blokkos) világ. Használat: node scripts/playtest/tall.mjs [kimeneti-mappa]
import { launch } from './lib.mjs';
import { mkdirSync } from 'node:fs';
const outDir = process.argv[2] ?? '.playtest-shots';
mkdirSync(outDir, { recursive: true });
const t = await launch({ w: 1280, h: 720 });
await t.newGame(20260, 'creative');
await t.settle(4000);
let p = await t.pos();
console.log('kezdőpont', p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1));
await t.look(0.6, -0.1);
await t.shot(`${outDir}/tall-spawn.png`);
// fent: a hegy fölé teleportálunk, és körbenézünk
await t.teleport(p.x, p.y + 60, p.z);
await t.look(0.6, -0.5);
await t.settle(3000);
await t.shot(`${outDir}/tall-high.png`);
const fps = await t.page.evaluate(() => new Promise((ok) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) ok(n / 2); else requestAnimationFrame(f); }; f(); }));
console.log('képkocka/mp (szoftveres GL, csak viszonyításnak):', fps.toFixed(1));
await t.close();
