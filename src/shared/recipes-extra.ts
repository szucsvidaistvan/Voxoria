import { B, blockId } from './blocks';
import { EXTRA_ID as X, I } from './items';
import type { Ing, Recipe, Stack } from './recipes';

/**
 * Kiegészítő receptek, hogy minden blokk és tárgy megszerezhető legyen (festékek, színes blokkok, kő- és fafélék,
 * ételek, magvak). A játékban később átdolgozott barkácsrendszer (összetevők kiválasztása, várakozás) ezeket
 * ugyanígy használhatja. Csak azokat a recepteket adja hozzá, amelyeknek az eredménye létezik és még nincs recept rá.
 */
export const COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black',
];

/** Egy szín festéke: a hiányzó festékeket meglévő tárgyak helyettesítik (fehér: csontliszt, kék: lazurit, barna: kakaó, fekete: szén) */
export function dyeFor(color: string): Ing {
  switch (color) {
    case 'white': return X.bone_meal;
    case 'orange': return X.orange_dye;
    case 'magenta': return X.magenta_dye;
    case 'light_blue': return X.light_blue_dye;
    case 'yellow': return X.dandelion_yellow;
    case 'lime': return X.lime_dye;
    case 'pink': return X.pink_dye;
    case 'gray': return X.gray_dye;
    case 'light_gray': return X.light_gray_dye;
    case 'cyan': return X.cyan_dye;
    case 'purple': return X.purple_dye;
    case 'blue': return X.lapis_lazuli;
    case 'brown': return X.cocoa_beans;
    case 'green': return X.cactus_green;
    case 'red': return X.rose_red;
    default: return 'coal';
  }
}

export function extraRecipes(
  add: (r: Recipe) => void,
  has: (outId: number) => boolean,
): void {
  const id = (key: string) => blockId(key);
  const give = (r: Omit<Recipe, 'out'>, key: string | number, n = 1) => {
    const out = typeof key === 'number' ? key : id(key);
    if (out === undefined || has(out)) return;
    const used = [...Object.values(r.keys ?? {}), ...(r.shapeless ?? [])];
    if (used.some((u) => u === undefined || u === -1)) return;
    add({ ...r, out: { id: out, n } as Stack });
  };
  const b = (key: string) => id(key) ?? -1;

  // --- festékek: virágokból, kaktuszból (olvasztás), keverékek ---
  const dye = (flower: string, out: number, n = 1) => give({ shapeless: [b(flower)] }, out, n);
  dye('poppy', X.rose_red); dye('red_tulip', X.rose_red);
  dye('dandelion', X.dandelion_yellow);
  dye('orange_tulip', X.orange_dye);
  dye('pink_tulip', X.pink_dye);
  dye('allium', X.magenta_dye);
  dye('blue_orchid', X.light_blue_dye);
  for (const f of ['azure_bluet', 'white_tulip', 'oxeye_daisy']) dye(f, X.light_gray_dye);
  give({ shapeless: [X.cactus_green, X.bone_meal] }, X.lime_dye, 2);
  give({ shapeless: [X.lapis_lazuli, X.cactus_green] }, X.cyan_dye, 2);
  give({ shapeless: [X.lapis_lazuli, X.rose_red] }, X.purple_dye, 2);
  give({ shapeless: ['coal', X.bone_meal] }, X.gray_dye, 2);
  give({ shapeless: [X.gray_dye, X.bone_meal] }, X.light_gray_dye, 2);

  // --- alapanyagok ---
  give({ shapeless: [X.sugar_cane] }, X.sugar);
  give({ shapeless: [X.melon_slice] }, X.melon_seeds);
  give({ shapeless: [b('pumpkin')] }, X.pumpkin_seeds, 4);
  give({ shapeless: [b('quartz_block')] }, X.quartz, 4);
  give({ shapeless: [b('lapis_block')] }, X.lapis_lazuli, 9);
  give({ shapeless: [b('emerald_block')] }, X.emerald, 9);
  give({ shape: ['SS', 'SS'], keys: { S: X.string } }, b('white_wool'));
  give({ shape: ['SS', 'SS'], keys: { S: X.snowball } }, b('snow_block'));
  give({ shape: ['CC', 'CC'], keys: { C: X.clay_ball } }, b('clay'));
  give({ shape: ['BB', 'BB'], keys: { B: X.brick } }, b('bricks'));

  // --- színes blokkok ---
  const sand = B.SAND, gravel = B.GRAVEL;
  for (const c of COLORS) {
    const d = dyeFor(c);
    if (c !== 'white') give({ shapeless: ['wool', d] }, `${c}_wool`);
    give({ shapeless: [sand, sand, sand, sand, gravel, gravel, gravel, gravel, d] }, `${c}_concrete_powder`, 8);
    give({ shape: ['GGG', 'GDG', 'GGG'], keys: { G: b('glass'), D: d } }, `${c}_stained_glass`, 8);
    give({ shape: ['SSS', 'SSS'], keys: { S: b(`${c}_stained_glass`) } }, `${c}_stained_glass_pane`, 16);
    give({ shape: ['TTT', 'TDT', 'TTT'], keys: { T: b('terracotta'), D: d } }, `${c}_terracotta`, 8);
  }

  // --- fa és kő ---
  for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak']) give({ shapeless: [b(`${w}_log`)] }, `stripped_${w}_log`);
  give({ shape: ['II', 'II'], keys: { I: I.IRON_INGOT } }, 'iron_trapdoor');
  give({ shape: ['SS', 'SS'], keys: { S: b('red_sand') } }, 'red_sandstone');
  give({ shapeless: [b('cobblestone'), b('fern')] }, 'mossy_cobblestone');
  give({ shapeless: [b('stone_bricks'), b('fern')] }, 'mossy_stone_bricks');
  give({ shape: ['S', 'S'], keys: { S: b('stone_brick_slab') } }, 'chiseled_stone_bricks');
  give({ shape: ['S', 'S'], keys: { S: b('sandstone_slab') } }, 'chiseled_sandstone');
  give({ shape: ['S', 'S'], keys: { S: b('red_sandstone_slab') } }, 'chiseled_red_sandstone');
  give({ shape: ['QQ', 'QQ'], keys: { Q: X.quartz } }, 'quartz_block');
  give({ shape: ['Q', 'Q'], keys: { Q: b('quartz_block') } }, 'quartz_pillar', 2);
  give({ shape: ['S', 'S'], keys: { S: b('quartz_slab') } }, 'chiseled_quartz_block');
  give({ shape: ['III', 'III', 'III'], keys: { I: b('ice') } }, 'packed_ice');
  give({ shape: ['III', 'III', 'III'], keys: { I: b('packed_ice') } }, 'blue_ice');
  give({ shape: ['III', 'III', 'III'], keys: { I: X.wheat } }, 'hay_block');
  give({ shape: ['III', 'III', 'III'], keys: { I: X.bone_meal } }, 'bone_block');
  give({ shape: ['III', 'III', 'III'], keys: { I: X.lapis_lazuli } }, 'lapis_block');
  give({ shape: ['III', 'III', 'III'], keys: { I: X.emerald } }, 'emerald_block');
  give({ shape: ['MM', 'MM'], keys: { M: b('brown_mushroom') } }, 'brown_mushroom_block');
  give({ shape: ['MM', 'MM'], keys: { M: b('red_mushroom') } }, 'red_mushroom_block');
  give({ shape: ['S S', ' S ', 'S S'], keys: { S: X.string } }, 'cobweb');

  // --- egyéb blokkok ---
  give({ shape: ['PPP', 'BBB', 'PPP'], keys: { P: 'planks', B: X.book } }, 'bookshelf');
  give({ shape: ['PPP', 'PDP', 'PPP'], keys: { P: 'planks', D: I.DIAMOND } }, 'jukebox');
  give({ shape: ['GSG', 'SGS', 'GSG'], keys: { G: I.GUNPOWDER, S: B.SAND } }, 'tnt');
  give({ shape: ['I I', 'ISI', 'I I'], keys: { I: I.IRON_INGOT, S: I.STICK } }, 'rail', 16);
  give({ shapeless: [b('pumpkin')] }, 'carved_pumpkin');
  give({ shapeless: [b('carved_pumpkin'), b('torch')] }, 'jack_o_lantern');
  give({ shape: ['G', 'G'], keys: { G: b('grass_block') } }, 'dirt_path', 2);
  give({ shapeless: [B.DIRT, X.wheat_seeds] }, 'farmland');
  give({ shape: ['MMM', 'SES', 'WWW'], keys: { M: X.milk_bucket, S: X.sugar, E: X.egg, W: X.wheat } }, 'cake');

  // --- ételek ---
  give({ shapeless: [b('pumpkin'), X.sugar, X.egg] }, X.pumpkin_pie);
  give({ shapeless: [b('brown_mushroom'), b('red_mushroom'), X.bowl] }, X.mushroom_stew);
  give({ shape: ['BBB', 'BBB', ' W '], keys: { B: X.beetroot, W: X.bowl } }, X.beetroot_soup);
}
