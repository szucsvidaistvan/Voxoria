/** Új állatok: változatok, drop, pillanatkép-jelzők. `npx tsx scripts/test-mobs.ts` */
import { MOB_DEFS, Mob, MobManager, mobDrops, catOf, type MobKind } from '../src/shared/mobs';
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
  // halak: kószálnak a vízben, a csalihoz úsznak, a játékos elől menekülnek, szárazon elpusztulnak; a halak nem szárazföldi állatok
  {
    const fishes = [mm.spawn('cod', -4, 102, -4), mm.spawn('salmon', 4, 102, 4), mm.spawn('pufferfish', -4, 102, 4)];
    ok(MOB_DEFS.cod.fish && MOB_DEFS.salmon.fish && MOB_DEFS.pufferfish.fish, 'a halak fish jelzésűek');
    for (let i = 0; i < 60 * 20; i++) mm.update(1 / 60, ctx);
    ok(fishes.every((f) => !f.dead && f.inWater), 'a halak a vízben maradnak');
    ok(fishes.some((f) => Math.hypot(f.x + (f.kind === 'salmon' ? -4 : f.kind === 'cod' ? 4 : 4), f.z) > 1), 'a halak mozognak');
    const lure = { x: 0.5, y: 103.2, z: 0.5 };
    const c2 = { ...ctx, lure };
    for (let i = 0; i < 60 * 25; i++) mm.update(1 / 60, c2);
    ok(fishes.every((f) => Math.hypot(f.x - lure.x, f.z - lure.z) < 1.5), `a halak a csalihoz úsznak (${fishes.map((f) => Math.hypot(f.x - lure.x, f.z - lure.z).toFixed(1)).join(', ')})`);
    // a játékos elől elúsznak
    const f0 = fishes[0];
    f0.x = 0; f0.z = 0; f0.y = 102;
    const near = { players: [{ x: 1, y: 102, z: 0, target: true, hurt: () => {} }], day: true, onDie: () => {} };
    let d0 = 0;
    for (let i = 0; i < 60 * 3; i++) { mm.update(1 / 60, near); d0 = Math.max(d0, Math.hypot(f0.x - 1, f0.z)); }
    ok(d0 > 2.5, `a hal elmenekül a játékos elől (${d0.toFixed(1)} blokk)`);
    ok(mobDrops('cod', () => 0).some((d) => d.n > 0) && mobDrops('salmon', () => 0).length === 1, 'a halak ejtenek (hal)');
    ok(mm.count(false) === 0 && mm.countFish() >= 3, 'a halak nem számítanak a szárazföldi állatok közé');
    // gömbhal: ha ember vagy más hal a közelében van, felfúvódik (variant=1) és érintésre sebez; távolabb visszafogy
    const savedMobs = mm.mobs; mm.mobs = []; // a többi mob ne zavarja a gömbhal tesztjét (véletlenül a közelbe úszhatnának)
    const pf = mm.spawn('pufferfish', 0.5, 102, 0.5);
    const far = { players: [{ x: 10, y: 102, z: 10, target: true, hurt: () => {} }], day: true, onDie: () => {} };
    for (let i = 0; i < 60; i++) mm.update(1 / 60, far);
    ok(pf.variant === 0, 'a gömbhal nyugodtan kicsi, ha nincs a közelben senki');
    let pdmg = 0;
    const pl1 = { x: pf.x + 1.2, y: 101.1, z: pf.z, target: true, hurt: () => { pdmg++; } };
    mm.update(1 / 60, { players: [pl1], day: true, onDie: () => {} });
    ok(pf.variant === 1, 'a gömbhal felfúvódik az ember közelében');
    const pl2 = { x: pf.x + 0.4, y: 101.1, z: pf.z, target: true, hurt: () => { pdmg++; } };
    mm.update(1 / 60, { players: [pl2], day: true, onDie: () => {} });
    ok(pdmg >= 1 && pdmg <= 2, 'a felfúvódott gömbhal érintésre sebez (nem minden tickben)');
    for (let i = 0; i < 60 * 6; i++) mm.update(1 / 60, far);
    ok(pf.variant === 0, 'a veszély elmúltával a gömbhal visszafogy');
    const other = mm.spawn('cod', pf.x + 1, pf.y, pf.z);
    for (let i = 0; i < 5; i++) mm.update(1 / 60, far);
    ok(pf.variant === 1, 'a gömbhal más hal közelében is felfúvódik');
    mm.mobs = savedMobs;
    // fal mellett nem vibrál: a fal felé néző hal ritkán fordul (nem minden tickben új irány)
    const wf = mm.spawn('cod', 5.2, 102, 0);
    wf.yaw = -Math.PI / 2; // +x felé néz, a tartály fala x=6.5-nél van
    let turns = 0, last = wf.yaw;
    const chase = { players: [{ x: 3.7, y: 102, z: 0, target: true, hurt: () => {} }], day: true, onDie: () => {} }; // a játékos a fal felé hajtja
    for (let i = 0; i < 60 * 10; i++) {
      mm.update(1 / 60, chase);
      if (Math.abs(wf.yaw - last) > 0.15) turns++;
      last = wf.yaw;
    }
    ok(turns < 40 && !wf.dead, `a fal mellett nem vibrál a hal (${turns} irányváltás 10 mp alatt)`);
    mm.mobs.splice(mm.mobs.indexOf(wf), 1);
    for (const f of fishes) mm.mobs.splice(mm.mobs.indexOf(f), 1);
  }
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

// ---- spawn/perzisztencia rework: távoli mobok ritkított frissítése, tartós mobok, mentés ----
{
  const w = new World(1);
  for (let cx = -8; cx <= 8; cx++) for (let cz = -8; cz <= 8; cz++) w.ensureChunk(cx, cz);
  const mm = new MobManager(w);
  const top = w.heightAt(0, 0) + 1;
  const player = { x: 0, y: top, z: 0, target: true, hurt: () => {} };
  const ctx = { players: [player], day: true, onDie: () => {} };
  const near = mm.spawn('pig', 4.5, top, 4.5), far = mm.spawn('pig', 50.5, top, 0.5);
  const farStart = [far.x, far.z];
  let farUpdates = 0;
  for (let i = 0; i < 60 * 20; i++) {
    mm.update(1 / 60, ctx);
    if (far.lodT === 0) farUpdates++;
  }
  ok(farUpdates > 60 * 20 / 9 && farUpdates < 60 * 20 / 3, `a távoli mob ritkítva frissül (${farUpdates} / 1200 tick)`);
  ok(Math.hypot(far.x - farStart[0], far.z - farStart[1]) > 0.5 || far.idle || far.wanderT > 0, 'a távoli mob így is él és mozog');
  ok(near.lodT === 0, 'a közeli mob minden tickben frissül');
  // szárazföldi állat soha nem tűnik el; a szörny messziről igen; a tartós nem számít a létszámba
  const pers = mm.spawn('wolf', 100.5, top, 0.5); pers.persistent = true;
  const pig2 = mm.spawn('pig', 100.5, top, 2.5);
  const zom = mm.spawn('zombie', 100.5, top, 4.5);
  for (let i = 0; i < 60; i++) mm.update(1 / 60, ctx);
  ok(mm.mobs.includes(pers) && mm.mobs.includes(pig2) && !mm.mobs.includes(zom), 'állat és tartós mob messziről sem tűnik el, a szörny igen (80+ blokk)');
  const t0 = (mm as any).tally();
  ok(t0.cat.creature === 2 && t0.of('wolf') === 0, 'a távoli (96+) állat és a tartós mob nem számít a létszámba');
  // véletlen eltűnés: 30 mp élet és 32+ blokk után lassan
  const z2 = mm.spawn('zombie', 50.5, top, 6.5);
  for (let i = 0; i < 60 * 20; i++) mm.update(1 / 60, ctx);
  ok(mm.mobs.includes(z2), '30 mp előtt a távoli szörny nem tűnik el');
  for (let i = 0; i < 60 * 400 && mm.mobs.includes(z2); i++) mm.update(1 / 30, ctx);
  ok(!mm.mobs.includes(z2), '30 mp után a távoli szörny idővel eltűnik');
  // mentés-visszatöltés (a tartós és az állatok maradnak, a szörnyek nem)
  pers.hp = 5; pers.variant = 1; pers.yaw = 1.5;
  const saved = JSON.parse(JSON.stringify(mm.exportPersistent()));
  const mm2 = new MobManager(w);
  mm2.importPersistent([...saved, { k: 'nincs_ilyen', x: 0, y: 0, z: 0, yaw: 0, hp: 1, v: 0 }], ['1,2']);
  const back = mm2.mobs.find((m) => m.kind === 'wolf');
  ok(!!back && back.persistent && back.hp === 5 && back.variant === 1 && Math.abs(back.x - 100.5) < 0.01, 'a tartós mob mentésből visszatöltődik (ismeretlen fajt kihagy)');
  ok(mm2.mobs.every((m) => catOf(m.kind) === 'creature') && mm2.mobs.length === saved.length && mm2.populated.has('1,2'), 'csak állatok mentődnek, a populált chunkok is');
  // létszámkeret a betöltött chunkok számával nő
  ok(mm.capFor('monster') > mm.capFor('creature') && new MobManager(new World(2)).capFor('creature') === 1, 'a létszámkeret a chunkok számával skálázódik');
  // chunk-populálás: egyszer, ~10% eséllyel; újratöltéskor nem újra
  const w3 = new World(7); const mm3 = new MobManager(w3);
  w3.onChunkLoad = (cx, cz) => mm3.chunkLoaded(cx, cz);
  for (let cx = 0; cx < 14; cx++) for (let cz = 0; cz < 14; cz++) w3.ensureChunk(cx, cz);
  const n1 = mm3.mobs.length;
  const groups = n1 / 2.5;
  ok(mm3.populated.size === 196 && groups > 4 && groups < 60 && mm3.mobs.every((m) => catOf(m.kind) === 'creature'), `a chunkok létrejöttekor állatcsoportok születnek (${n1} állat 196 chunkon)`);
  w3.chunks.clear();
  for (let cx = 0; cx < 14; cx++) for (let cz = 0; cz < 14; cz++) w3.ensureChunk(cx, cz);
  ok(mm3.mobs.length === n1, 'a már benépesített chunk újratöltéskor nem szül újra');
}
if (fails) { console.error(fails, 'hiba'); process.exit(1); }
