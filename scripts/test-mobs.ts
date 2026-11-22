/** Új állatok: változatok, drop, pillanatkép-jelzők. `npx tsx scripts/test-mobs.ts` */
import { MOB_DEFS, Mob, MobManager, mobDrops, type MobKind } from '../src/shared/mobs';
import { World } from '../src/shared/world';
import { B } from '../src/shared/blocks';
import { EXTRA_ID } from '../src/shared/items';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.error('HIBA:', m); } else console.log('ok  ', m); };

for (const k of ['rabbit', 'cat', 'parrot', 'llama', 'donkey', 'mule', 'turtle', 'horse'] as MobKind[]) ok(!!MOB_DEFS[k], `${k} létezik`);
for (const k of ['rabbit', 'cat', 'parrot', 'llama', 'horse'] as MobKind[]) {
  const n = MOB_DEFS[k].variants!;
  const seen = new Set<number>();
  for (let i = 0; i < 400; i++) { const m = new Mob(k, 0, 0, 0); if (m.variant < 0 || m.variant >= n) ok(false, `${k} változata tartományon kívül`); seen.add(m.variant); }
  ok(seen.size === n, `${k}: mind a ${n} változat előfordul`);
  // a flags-ben a 8. bittől utazik: a kis jelzők nem keverednek vele
  const m = new Mob(k, 0, 0, 0); m.variant = n - 1;
  const flags = 5 | (m.variant << 8);
  ok((flags >> 8) === n - 1 && (flags & 255) === 5, `${k}: a változat sértetlenül átmegy a jelzőkön`);
}
const leather = (k: MobKind) => mobDrops(k, () => 0.99).some((d) => d.id === EXTRA_ID.leather);
for (const k of ['llama', 'donkey', 'mule', 'rabbit'] as MobKind[]) ok(leather(k), `${k} bőrt ejthet`);
ok(mobDrops('parrot', () => 0).some((d) => d.id === EXTRA_ID.feather), 'a papagáj tollat ejt');
ok(mobDrops('cat', () => 0.99).some((d) => d.id === EXTRA_ID.string), 'a macska cérnát ejt');
ok(mobDrops('rabbit', () => 0.99).some((d) => d.id === EXTRA_ID.rabbit), 'a nyúl nyúlhúst ejt');

// ---- lebegő mobok: denevér (levegőben), polip (vízben) ----
{
  const w = new World(1);
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) w.ensureChunk(cx, cz);
  // sík kő padló y=100 alatt, fölötte 10 magas üres „barlang"; egy 6 mély víztartály
  for (let x = -20; x < 20; x++) for (let z = -20; z < 20; z++) {
    for (let y = 90; y <= 120; y++) w.setBlock(x, y, z, y < 100 ? B.STONE : y > 110 ? B.STONE : 0);
  }
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) for (let y = 100; y < 105; y++) w.setBlock(x, y, z, y === 100 ? B.STONE : 9);
  const mm = new MobManager(w);
  const ctx = { players: [], day: true, onDie: () => {} };
  const bat = mm.spawn('bat', 12.5, 105, 12.5), squid = mm.spawn('squid', 0.5, 102, 0.5);
  let minBy = 999, maxBy = -999, minSy = 999, maxSy = -999, sqOut = 0;
  for (let i = 0; i < 60 * 30; i++) {
    mm.update(1 / 60, ctx);
    minBy = Math.min(minBy, bat.y); maxBy = Math.max(maxBy, bat.y);
    minSy = Math.min(minSy, squid.y); maxSy = Math.max(maxSy, squid.y);
    if (!squid.inWater) sqOut++;
  }
  ok(!bat.dead && minBy > 100 && maxBy < 111, `a denevér a levegőben marad (${minBy.toFixed(1)}..${maxBy.toFixed(1)})`);
  ok(Math.abs(bat.x - 12.5) + Math.abs(bat.z - 12.5) > 0.5, 'a denevér mozog');
  ok(!squid.dead && minSy >= 100.9 && maxSy < 105 && sqOut < 30, `a polip a vízben marad (${minSy.toFixed(1)}..${maxSy.toFixed(1)}, kint: ${sqOut} tick)`);
  ok(Math.abs(squid.x) <= 7 && Math.abs(squid.z) <= 7, 'a polip nem hagyja el a tartályt');
  // szárazon a polip elpusztul
  const dry = mm.spawn('squid', 12.5, 101, 12.5);
  for (let i = 0; i < 60 * 8; i++) mm.update(1 / 60, ctx);
  ok(dry.hp < dry.def.hp, 'a szárazra vetett polip sérül');
  ok(mm.count(false) === 0, 'a lebegő mobok nem számítanak a szárazföldi állatok közé');
  // polip: lüktetve úszik (lökések és szinte megállás váltják egymást), a fázis a variantban van
  const sq2 = mm.spawn('squid', 0, 103, 0);
  let vMax = 0, vMin = 99, phMin = 999, phMax = -1;
  for (let i = 0; i < 60 * 40; i++) {
    mm.update(1 / 60, ctx);
    if (i > 60 * 8) { const v = Math.hypot(sq2.vx, sq2.vz); vMax = Math.max(vMax, v); vMin = Math.min(vMin, v); }
    phMin = Math.min(phMin, sq2.variant); phMax = Math.max(phMax, sq2.variant);
  }
  ok(vMax > 2 && vMin < 0.6, `a polip lüktetve úszik (sebesség ${vMin.toFixed(2)}..${vMax.toFixed(2)} b/s)`);
  ok(phMax > 200 && phMin < 20, 'a lüktetés fázisa a variantban halad');
  // teknős: vízben úszik (nem a felszínre lebeg), szárazon jár
  const tu = mm.spawn('turtle', -3, 102, 3);
  let ty0 = 999, ty1 = -999, tmoved = 0;
  for (let i = 0; i < 60 * 30; i++) {
    mm.update(1 / 60, ctx);
    ty0 = Math.min(ty0, tu.y); ty1 = Math.max(ty1, tu.y); tmoved = Math.max(tmoved, Math.hypot(tu.x + 3, tu.z - 3));
  }
  ok(!tu.dead && tmoved > 2, `a teknős vízben mozog (${tmoved.toFixed(1)} blokk)`);
  ok(tu.inWater || tu.y > 100, 'a teknős a víztartályban vagy a parton marad');
}

// ---- ellenségek: nyálka ugrál és szétesik, szellem üldöz és csap, husk/fulladt/tarantula létezik ----
{
  for (const k of ['husk', 'drowned', 'tarantula', 'ghost', 'slime', 'slimelet'] as MobKind[]) ok(MOB_DEFS[k].hostile, `${k} ellenséges`);
  ok(mobDrops('husk', () => 0.99).length > 0 && mobDrops('tarantula', () => 0.99).length > 0, 'husk és tarantula ejt');
  const w = new World(1);
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) w.ensureChunk(cx, cz);
  for (let x = -20; x < 20; x++) for (let z = -20; z < 20; z++) for (let y = 90; y <= 120; y++) w.setBlock(x, y, z, y < 100 ? B.STONE : 0);
  const mm = new MobManager(w);
  let hits = 0;
  const player = { x: 8.5, y: 100, z: 0.5, target: true, hurt: () => { hits++; } };
  const ctx = { players: [player], day: false, onDie: () => {} };
  const sl = mm.spawn('slime', 0.5, 100, 0.5);
  let airT = 0;
  for (let i = 0; i < 60 * 12; i++) { mm.update(1 / 60, ctx); if (!sl.onGround) airT++; }
  ok(sl.x > 3, `a nyálka a játékos felé ugrál (x=${sl.x.toFixed(1)})`);
  ok(airT > 60 && airT < 60 * 10, `a nyálka ugrál, nem folyamatosan a levegőben (${airT} tick)`);
  ok(hits > 0, 'a nyálka megüti a játékost');
  sl.hurt(100, 0, 0);
  for (let i = 0; i < 60 * 2; i++) mm.update(1 / 60, ctx);
  ok(mm.countKind('slimelet') >= 2 && mm.countKind('slime') === 0, `a nagy nyálka kis nyálkákra esik szét (${mm.countKind('slimelet')})`);
  const g = mm.spawn('ghost', 0.5, 104, 0.5);
  hits = 0;
  for (let i = 0; i < 60 * 10; i++) mm.update(1 / 60, ctx);
  ok(Math.hypot(g.x - player.x, g.z - player.z) < 3 && hits > 0, `a szellem a játékoshoz száll és csap (${hits} találat)`);
  const w2 = mm.spawn('ghost', 0.5, 104, 0.5);
  w2.hp = 100;
  ctx.day = true; player.target = false;
  for (let i = 0; i < 60 * 3; i++) mm.update(1 / 60, ctx);
  ok(w2.hp < 100, 'a szellem napfényben ég');
}
if (fails) { console.error(fails, 'hiba'); process.exit(1); }
