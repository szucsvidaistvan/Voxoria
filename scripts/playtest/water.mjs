// Példa/teszt: vízi növények és tavirózsa. Használat: node scripts/playtest/water.mjs [kimeneti-mappa]
import { launch } from './lib.mjs';
const outDir = process.argv[2] ?? '.playtest-shots';
import { mkdirSync } from 'node:fs';
mkdirSync(outDir, { recursive: true });
const t = await launch({ w: 1280, h: 720 });
for (const seed of [20260, 7, 99, 12345, 777]) {
  await t.newGame(seed, 'creative');
  await t.settle(2500);
  const lilies = await t.find('lily_pad', 3);
  const grass = await t.find('seagrass', 3);
  console.log('seed', seed, 'lily', lilies.length, 'seagrass', grass.length);
  if (lilies.length) {
    const [x, y, z] = lilies[0];
    const top = await t.surfaceAbove(x, y, z);
    await t.teleport(x + 0.5, top + 0.2, z + 4.5); // a víz fölött/part mellett: a kamera a felszín fölött van
    await t.look(0, -0.45);
    await t.settle(2500);
    await t.shot(`${outDir}/lily-${seed}.png`);
    // rá lehet-e állni? a játékos a levél fölé teszi magát, és megnézzük, hol áll meg
    await t.teleport(x + 0.5, y + 1.5, z + 0.5);
    await t.settle(1500);
    const p = await t.pos();
    console.log('állás a levélen: y =', p.y.toFixed(3), '(levél teteje', (y + 0.094).toFixed(3) + ')', Math.abs(p.y - (y + 0.094)) < 0.02 ? 'OK, rajta áll' : 'NEM áll rajta');
  }
  if (grass.length) {
    const [x, y, z] = grass[0];
    // vízalatti kép: a kamera a növénytől 2,5 blokkra, vízszintesen néz
    await t.teleport(x + 0.5, y + 0.1, z + 3);
    await t.look(0, -0.1);
    await t.settle(2500);
    await t.shot(`${outDir}/seagrass-${seed}.png`);
  }
  if (lilies.length && grass.length) break;
}
console.log(t.logs.slice(0, 5).join('\n') || 'nincs konzolhiba');
await t.close();
