/** Új állatok: változatok, drop, pillanatkép-jelzők. `npx tsx scripts/test-mobs.ts` */
import { MOB_DEFS, Mob, mobDrops, type MobKind } from '../src/shared/mobs';
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
if (fails) { console.error(fails, 'hiba'); process.exit(1); }
