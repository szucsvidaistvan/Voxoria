import type { RGB } from './blocks';

/**
 * A játék blokkjai és textúrái. A textúrákat a kliens kóddal rajzolja ki (client/procedural.ts),
 * képfájl nincs, így nincs licencprobléma, és a GitHub Pages alatt is működik.
 *
 * FONTOS: az EXTRA_BLOCKS sorrendje adja a blokkazonosítót (100-tól). A mentések ezekre hivatkoznak,
 * ezért új blokkot mindig a lista VÉGÉRE szabad csak felvenni.
 */

export type Kind =
  | 'noise' | 'cobble' | 'bricks' | 'planks' | 'log_side' | 'log_top' | 'leaves'
  | 'ore' | 'glass' | 'tiles' | 'grass_side' | 'water' | 'bookshelf';

export interface Recipe {
  kind: Kind;
  /** alapszín (0..255) */
  c: RGB;
  /** másodlagos szín: habarcs, ércfolt, kéreg, fű */
  c2?: RGB;
  /** a pixelenkénti színingadozás erőssége */
  amp?: number;
}

export interface CatalogBlock {
  name: string;
  top: string;
  bottom: string;
  side: string;
  /** false: átlátszó vagy lyukas (üveg, jég) */
  opaque?: boolean;
}

/** textúra neve -> hogyan kell kirajzolni (az alapblokkoké is ide tartozik) */
export const RECIPES: Record<string, Recipe> = {};
/** az alapblokkok (1..99) utáni blokkok, a sorrend adja az azonosítót */
export const EXTRA_BLOCKS: CatalogBlock[] = [];

const tex = (name: string, r: Recipe): string => {
  RECIPES[name] = r;
  return name;
};
const cube = (name: string, t: string, opaque = true) =>
  EXTRA_BLOCKS.push({ name, top: t, bottom: t, side: t, opaque });
const column = (name: string, top: string, side: string) =>
  EXTRA_BLOCKS.push({ name, top, bottom: top, side });

const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

const STONE: RGB = [125, 125, 125];
const DIRT: RGB = [121, 85, 58];

// ---------- alapblokkok textúrái (a terepgenerálás ezeket használja) ----------
tex('grass_top', { kind: 'noise', c: [190, 190, 190], amp: 26 }); // szürke, a kliens zöldre színezi
tex('grass_side', { kind: 'grass_side', c: DIRT, c2: [95, 159, 53], amp: 20 });
tex('dirt', { kind: 'noise', c: DIRT, amp: 20 });
tex('stone', { kind: 'noise', c: STONE, amp: 18 });
tex('sand', { kind: 'noise', c: [219, 207, 163], amp: 12 });
tex('log_side', { kind: 'log_side', c: [102, 81, 50] });
tex('log_top', { kind: 'log_top', c: [162, 130, 78], c2: [102, 81, 50] });
tex('planks', { kind: 'planks', c: [162, 130, 78] });
tex('leaves', { kind: 'leaves', c: [190, 190, 190], amp: 30 }); // szürke, a kliens zöldre színezi
tex('cobblestone', { kind: 'cobble', c: [118, 118, 118] });
tex('water', { kind: 'water', c: [59, 104, 212] });
tex('bedrock', { kind: 'noise', c: [60, 60, 60], amp: 44 });
tex('gravel', { kind: 'cobble', c: [131, 127, 126], amp: 34 });
tex('sandstone', { kind: 'noise', c: [216, 203, 155], amp: 8 });
tex('sandstone_top', { kind: 'noise', c: [219, 207, 163], amp: 8 });
tex('sandstone_bottom', { kind: 'noise', c: [200, 187, 140], amp: 8 });
tex('coal_ore', { kind: 'ore', c: STONE, c2: [30, 30, 30] });
tex('iron_ore', { kind: 'ore', c: STONE, c2: [216, 175, 147] });
tex('gold_ore', { kind: 'ore', c: STONE, c2: [252, 238, 75] });
tex('diamond_ore', { kind: 'ore', c: STONE, c2: [92, 219, 213] });

// ---------- extra blokkok (az azonosítók 100-tól) ----------

// színes blokkok: gyapjú, beton, terrakotta
const COLORS: [string, string, RGB][] = [
  ['white', 'fehér', [233, 236, 236]], ['orange', 'narancs', [240, 118, 19]],
  ['magenta', 'bíbor', [189, 68, 179]], ['light_blue', 'világoskék', [58, 175, 217]],
  ['yellow', 'sárga', [248, 197, 39]], ['lime', 'lime', [112, 185, 25]],
  ['pink', 'rózsaszín', [237, 141, 172]], ['gray', 'szürke', [62, 68, 71]],
  ['light_gray', 'világosszürke', [142, 142, 134]], ['cyan', 'ciánkék', [21, 137, 145]],
  ['purple', 'lila', [121, 42, 172]], ['blue', 'kék', [53, 57, 157]],
  ['brown', 'barna', [114, 71, 40]], ['green', 'zöld', [84, 109, 27]],
  ['red', 'piros', [160, 39, 34]], ['black', 'fekete', [20, 21, 25]],
];
for (const [id, hu, c] of COLORS) cube(`${hu} gyapjú`, tex(`wool_${id}`, { kind: 'noise', c, amp: 16 }));
for (const [id, hu, c] of COLORS) cube(`${hu} beton`, tex(`concrete_${id}`, { kind: 'noise', c, amp: 6 }));
for (const [id, hu, c] of COLORS) {
  cube(`${hu} terrakotta`, tex(`terracotta_${id}`, { kind: 'noise', c: mix(c, [150, 92, 66], 0.55), amp: 8 }));
}

// fafajták (a tölgy az alapblokk)
const WOODS: [string, string, RGB, RGB][] = [
  ['birch', 'nyír', [196, 179, 123], [216, 215, 210]],
  ['spruce', 'lucfenyő', [114, 84, 48], [58, 37, 16]],
  ['jungle', 'dzsungel', [160, 115, 81], [85, 68, 25]],
  ['acacia', 'akác', [168, 90, 50], [103, 96, 86]],
  ['dark_oak', 'sötéttölgy', [66, 43, 20], [60, 46, 26]],
];
for (const [id, hu, plank, bark] of WOODS) {
  cube(`${hu} deszka`, tex(`planks_${id}`, { kind: 'planks', c: plank }));
  column(`${hu} fatörzs`, tex(`log_${id}_top`, { kind: 'log_top', c: plank, c2: bark }), tex(`log_${id}_side`, { kind: 'log_side', c: bark }));
}

// kő és társai
const plain = (hu: string, id: string, c: RGB, amp = 16, opaque = true) =>
  cube(hu, tex(id, { kind: 'noise', c, amp }), opaque);
plain('Andezit', 'andesite', [136, 136, 136]);
plain('Diorit', 'diorite', [189, 188, 189], 22);
plain('Gránit', 'granite', [149, 103, 85], 20);
plain('Mélykő', 'deepslate', [77, 77, 81], 14);
plain('Tufa', 'tuff', [108, 109, 102], 14);
plain('Kalcit', 'calcite', [223, 224, 220], 8);
plain('Bazalt', 'basalt', [80, 81, 86], 12);
plain('Sima kő', 'smooth_stone', [158, 158, 158], 6);
cube('Kőtégla', tex('stone_bricks', { kind: 'bricks', c: [122, 121, 122], c2: [96, 96, 96] }));
cube('Mohás kavics', tex('mossy_cobblestone', { kind: 'cobble', c: [100, 118, 90] }));
cube('Tégla', tex('bricks', { kind: 'bricks', c: [150, 97, 83], c2: [177, 170, 160] }));
plain('Vörös homok', 'red_sand', [190, 102, 33], 12);
plain('Vörös homokkő', 'red_sandstone', [186, 99, 29], 8);
plain('Agyag', 'clay', [160, 166, 179], 8);
plain('Hó', 'snow', [249, 254, 254], 4);
plain('Jég', 'ice', [145, 183, 253], 6, false);
plain('Tömör jég', 'packed_ice', [141, 180, 250], 8);
plain('Obszidián', 'obsidian', [21, 18, 30], 10);
plain('Netherrack', 'netherrack', [97, 38, 38], 22);
plain('Végkő', 'end_stone', [219, 222, 158], 12);
plain('Fénykő', 'glowstone', [171, 131, 84], 56);
plain('Iszap', 'mud', [60, 57, 60], 8);
plain('Moha', 'moss_block', [89, 109, 45], 20);
plain('Durva föld', 'coarse_dirt', [119, 85, 59], 26);
cube('Üveg', tex('glass', { kind: 'glass', c: [200, 230, 240] }), false);
tex('bookshelf_side', { kind: 'bookshelf', c: [162, 130, 78] });
EXTRA_BLOCKS.push({ name: 'Könyvespolc', top: 'planks', bottom: 'planks', side: 'bookshelf_side' });

// ércek és ércblokkok
const ORES: [string, string, RGB][] = [
  ['redstone', 'Vöröskő érc', [214, 24, 24]], ['lapis', 'Lazurit érc', [31, 67, 140]],
  ['emerald', 'Smaragd érc', [42, 203, 87]], ['copper', 'Réz érc', [192, 107, 79]],
];
for (const [id, hu, c] of ORES) cube(hu, tex(`${id}_ore`, { kind: 'ore', c: STONE, c2: c }));

const metal = (hu: string, id: string, c: RGB) => cube(hu, tex(`${id}_block`, { kind: 'tiles', c }));
metal('Szénblokk', 'coal', [24, 23, 23]);
metal('Vasblokk', 'iron', [220, 220, 220]);
metal('Aranyblokk', 'gold', [246, 208, 61]);
metal('Gyémántblokk', 'diamond', [98, 219, 214]);
metal('Smaragdblokk', 'emerald', [42, 203, 87]);
metal('Lazuritblokk', 'lapis', [31, 67, 140]);
metal('Vöröskő blokk', 'redstone', [171, 27, 9]);
metal('Rézblokk', 'copper', [192, 107, 79]);
metal('Kvarcblokk', 'quartz', [236, 230, 223]);

/** az összes textúra neve (az atlasz ebben a sorrendben pakolja ki) */
export const TEXTURE_NAMES: string[] = Object.keys(RECIPES);
