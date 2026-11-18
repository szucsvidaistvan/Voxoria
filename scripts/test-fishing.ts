/** Horgászat + zsákmány + bőr-drop teszt: `npx tsx scripts/test-fishing.ts` */
import { Fishing, fishLoot, BITE_WINDOW } from '../src/shared/fishing';
import { EXTRA_ID, ITEMS, maxUses } from '../src/shared/items';
import { mobDrops } from '../src/shared/mobs';
import { getRecipes, initRecipes } from '../src/shared/recipes';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.error('HIBA:', m); } else console.log('ok  ', m); };

ok(ITEMS[EXTRA_ID.fishing_rod]?.stack === 1 && maxUses(EXTRA_ID.fishing_rod) === 64, 'a horgászbot 1-es stack, 64 használat');
const f = new Fishing(() => 0.5);
f.cast(1, 2, 3);
ok(f.active && f.wait === 10, 'bedobás: 10 mp várakozás (rand=0.5)');
ok(f.reel() === null && !f.active, 'kapás nélküli behúzás: semmi, vége');
f.cast(0, 0, 0);
ok(f.update(9.9) === null && f.bite === 0, 'még nincs kapás');
ok(f.update(0.2) === 'bite' && f.bite === BITE_WINDOW, 'kapás');
const c = f.reel();
ok(!!c && c.n === 1 && !f.active, 'kapáskor behúzva zsákmány');
f.cast(0, 0, 0); f.update(11);
ok(f.update(BITE_WINDOW + 0.1) === 'miss' && f.active && f.wait > 0, 'ha nem húzza be, a hal elúszik, a horgászat folytatódik');
// eloszlás
let cod = 0, salmon = 0, junk = 0, i = 0;
const seq = () => ((i++ * 0.6180339887) % 1);
for (let k = 0; k < 2000; k++) { const l = fishLoot(seq); if (l.id === EXTRA_ID.cod) cod++; else if (l.id === EXTRA_ID.salmon) salmon++; else junk++; }
ok(cod > 900 && salmon > 300 && junk > 150, `zsákmány-eloszlás: ${cod}/${salmon}/${junk}`);
// bőr
const leather = (k: Parameters<typeof mobDrops>[0], rv: number) => mobDrops(k, () => rv).filter((d) => d.id === EXTRA_ID.leather).reduce((a, d) => a + d.n, 0);
for (const k of ['cow', 'horse', 'pig', 'sheep', 'wolf', 'polarbear'] as const) ok(leather(k, 0.99) >= 1, `${k} bőrt ejthet`);
ok(leather('polarbear', 0) >= 1, 'a jegesmedve mindig ejt bőrt');
ok(leather('zombie', 0.99) === 0 && leather('chicken', 0.99) === 0, 'zombi és csirke nem ejt bőrt');
initRecipes();
ok(getRecipes().some((r) => typeof r.out !== 'function' && r.out.id === EXTRA_ID.fishing_rod), 'a horgászbotnak van receptje');
if (fails) { console.error(fails, 'hiba'); process.exit(1); }
