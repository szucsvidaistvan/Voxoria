import { BLOCKS } from './blocks';

/** Az elemek (nem lerakható dolgok) azonosítói ettől indulnak; ez alatt blokkok vannak */
export const ITEM_BASE = 40000;

export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'sword';

export interface ItemDef {
  name: string;
  /** a textúra neve a textures/item mappában (kiterjesztés nélkül) */
  tex: string;
  stack: number;
  /** eszköz: típus, szint (1 fa, 2 kő, 3 vas, 4 gyémánt), és a bontás sebessége */
  tool?: { type: ToolType; tier: number; speed: number; /** ennyi használat után törik el */ durability: number; /** sebzés támadáskor (fél szívben) */ damage: number };
  /** étel: ennyi éhséget tölt vissza (fél húscomb) és ennyi telítettséget ad */
  food?: { hunger: number; sat: number };
  /** a kijelzés színe, ha a textúra hiányzik */
  color: string;
}

export const I = {
  STICK: ITEM_BASE + 1, COAL: ITEM_BASE + 2, DIAMOND: ITEM_BASE + 3, IRON_INGOT: ITEM_BASE + 4,
  GOLD_INGOT: ITEM_BASE + 5, FLINT: ITEM_BASE + 6, APPLE: ITEM_BASE + 7, CHARCOAL: ITEM_BASE + 12,
  BUCKET: ITEM_BASE + 8, WATER_BUCKET: ITEM_BASE + 9, LAVA_BUCKET: ITEM_BASE + 10, FLINT_AND_STEEL: ITEM_BASE + 11,
  // ételek és mobdropok (a 20..39 az eszközöké)
  RAW_BEEF: ITEM_BASE + 13, COOKED_BEEF: ITEM_BASE + 14, RAW_PORK: ITEM_BASE + 15, COOKED_PORK: ITEM_BASE + 16,
  RAW_CHICKEN: ITEM_BASE + 17, COOKED_CHICKEN: ITEM_BASE + 18, RAW_MUTTON: ITEM_BASE + 19,
  COOKED_MUTTON: ITEM_BASE + 40, ROTTEN_FLESH: ITEM_BASE + 41, GUNPOWDER: ITEM_BASE + 42,
} as const;

export const ITEMS: Record<number, ItemDef> = {
  [I.STICK]: { name: 'Stick', tex: 'stick', stack: 64, color: '#8a6a3a' },
  [I.COAL]: { name: 'Coal', tex: 'coal', stack: 64, color: '#2b2b2b' },
  [I.DIAMOND]: { name: 'Diamond', tex: 'diamond', stack: 64, color: '#4be3e0' },
  [I.IRON_INGOT]: { name: 'Iron Ingot', tex: 'iron_ingot', stack: 64, color: '#d8d8d8' },
  [I.GOLD_INGOT]: { name: 'Gold Ingot', tex: 'gold_ingot', stack: 64, color: '#f5d442' },
  [I.FLINT]: { name: 'Flint', tex: 'flint', stack: 64, color: '#55555a' },
  [I.APPLE]: { name: 'Apple', tex: 'apple', stack: 64, food: { hunger: 4, sat: 2.4 }, color: '#d33a2c' },
  [I.RAW_BEEF]: { name: 'Raw Beef', tex: 'raw_beef', stack: 64, food: { hunger: 3, sat: 1.8 }, color: '#c0504d' },
  [I.COOKED_BEEF]: { name: 'Steak', tex: 'cooked_beef', stack: 64, food: { hunger: 8, sat: 12.8 }, color: '#7a4a2b' },
  [I.RAW_PORK]: { name: 'Raw Porkchop', tex: 'raw_porkchop', stack: 64, food: { hunger: 3, sat: 1.8 }, color: '#e59a9a' },
  [I.COOKED_PORK]: { name: 'Cooked Porkchop', tex: 'cooked_porkchop', stack: 64, food: { hunger: 8, sat: 12.8 }, color: '#a8683f' },
  [I.RAW_CHICKEN]: { name: 'Raw Chicken', tex: 'raw_chicken', stack: 64, food: { hunger: 2, sat: 1.2 }, color: '#e8c9b5' },
  [I.COOKED_CHICKEN]: { name: 'Cooked Chicken', tex: 'cooked_chicken', stack: 64, food: { hunger: 6, sat: 7.2 }, color: '#c98a45' },
  [I.RAW_MUTTON]: { name: 'Raw Mutton', tex: 'raw_mutton', stack: 64, food: { hunger: 2, sat: 1.2 }, color: '#b8605a' },
  [I.COOKED_MUTTON]: { name: 'Cooked Mutton', tex: 'cooked_mutton', stack: 64, food: { hunger: 6, sat: 9.6 }, color: '#8a5230' },
  [I.ROTTEN_FLESH]: { name: 'Rotten Flesh', tex: 'rotten_flesh', stack: 64, food: { hunger: 4, sat: 0.8 }, color: '#6f7d3c' },
  [I.GUNPOWDER]: { name: 'Gunpowder', tex: 'gunpowder', stack: 64, color: '#6b6b6b' },
  [I.CHARCOAL]: { name: 'Charcoal', tex: 'charcoal', stack: 64, color: '#3a3330' },
  [I.BUCKET]: { name: 'Bucket', tex: 'bucket', stack: 16, color: '#b5b5b5' },
  [I.WATER_BUCKET]: { name: 'Water Bucket', tex: 'water_bucket', stack: 1, color: '#3a6fd8' },
  [I.LAVA_BUCKET]: { name: 'Lava Bucket', tex: 'lava_bucket', stack: 1, color: '#e86a14' },
  [I.FLINT_AND_STEEL]: { name: 'Flint and Steel', tex: 'flint_and_steel', stack: 1, color: '#777b88' },
};

// A Good Vibes csomagból átvett általános tárgyak (a lista a scripts/item-policy.json "import" részéből jön).
// [kulcs, név, étel: éhség/telítettség, halmaz]
const EXTRA: [string, string, [number, number]?, number?][] = [
  ['bread', 'Bread', [5, 6]], ['cookie', 'Cookie', [2, 0.4]], ['baked_potato', 'Baked Potato', [5, 6]], ['potato', 'Potato', [1, 0.6]],
  ['carrot', 'Carrot', [3, 3.6]], ['cod', 'Raw Cod', [2, 0.4]], ['cooked_cod', 'Cooked Cod', [5, 6]], ['salmon', 'Raw Salmon', [2, 0.4]],
  ['cooked_salmon', 'Cooked Salmon', [6, 9.6]], ['rabbit', 'Raw Rabbit', [3, 1.8]], ['cooked_rabbit', 'Cooked Rabbit', [5, 6]],
  ['melon_slice', 'Melon Slice', [2, 1.2]], ['pumpkin_pie', 'Pumpkin Pie', [8, 4.8]], ['mushroom_stew', 'Mushroom Stew', [6, 7.2], 1],
  ['beetroot', 'Beetroot', [1, 1.2]], ['beetroot_soup', 'Beetroot Soup', [6, 7.2], 1],
  ['leather', 'Leather'], ['feather', 'Feather'], ['bone', 'Bone'], ['bone_meal', 'Bone Meal'], ['paper', 'Paper'], ['book', 'Book'],
  ['string', 'String'], ['sugar', 'Sugar'], ['clay_ball', 'Clay Ball'], ['brick', 'Brick'], ['iron_nugget', 'Iron Nugget'],
  ['gold_nugget', 'Gold Nugget'], ['lapis_lazuli', 'Lapis Lazuli'], ['emerald', 'Emerald'], ['quartz', 'Quartz'], ['wheat', 'Wheat'],
  ['wheat_seeds', 'Wheat Seeds'], ['melon_seeds', 'Melon Seeds'], ['pumpkin_seeds', 'Pumpkin Seeds'], ['beetroot_seeds', 'Beetroot Seeds'],
  ['egg', 'Egg', undefined, 16], ['bowl', 'Bowl'], ['glass_bottle', 'Glass Bottle'], ['snowball', 'Snowball', undefined, 16],
  ['cocoa_beans', 'Cocoa Beans'], ['sugar_cane', 'Sugar Cane'], ['milk_bucket', 'Milk Bucket', undefined, 1],
  ['cyan_dye', 'Cyan Dye'], ['gray_dye', 'Gray Dye'], ['light_blue_dye', 'Light Blue Dye'], ['light_gray_dye', 'Light Gray Dye'],
  ['lime_dye', 'Lime Dye'], ['magenta_dye', 'Magenta Dye'], ['orange_dye', 'Orange Dye'], ['pink_dye', 'Pink Dye'],
  ['purple_dye', 'Purple Dye'], ['rose_red', 'Red Dye'], ['dandelion_yellow', 'Yellow Dye'], ['cactus_green', 'Green Dye'],
];
/** EXTRA_ID[kulcs]: a tárgy azonosítója (ITEM_BASE + 100-tól, a fenti sorrendben) */
export const EXTRA_ID: Record<string, number> = {};
EXTRA.forEach(([key, name, food, stack], i) => {
  const id = ITEM_BASE + 100 + i;
  EXTRA_ID[key] = id;
  ITEMS[id] = { name, tex: key, stack: stack ?? 64, ...(food ? { food: { hunger: food[0], sat: food[1] } } : {}), color: '#a0a0a0' };
});

// eszközök: 5 anyag x 4 típus
const MATERIALS = [
  // durability: ennyi használat után törik el; bonus: a támadás sebzéséhez adódik
  { id: 'wooden', name: 'Wooden', tier: 1, speed: 2, color: '#a07a44', durability: 59, bonus: 0 },
  { id: 'stone', name: 'Stone', tier: 2, speed: 4, color: '#8f8f8f', durability: 131, bonus: 1 },
  { id: 'iron', name: 'Iron', tier: 3, speed: 6, color: '#d8d8d8', durability: 250, bonus: 2 },
  { id: 'golden', name: 'Golden', tier: 1, speed: 12, color: '#f5d442', durability: 32, bonus: 0 },
  { id: 'diamond', name: 'Diamond', tier: 4, speed: 8, color: '#4be3e0', durability: 1561, bonus: 3 },
];
/** Alap támadás-sebzés típusonként (fél szív): a kard a legerősebb */
const BASE_DAMAGE: Record<ToolType, number> = { sword: 4, axe: 3, pickaxe: 2, shovel: 2 };
const TOOLS: [ToolType, string][] = [['pickaxe', 'Pickaxe'], ['axe', 'Axe'], ['shovel', 'Shovel'], ['sword', 'Sword']];
/** TOOL_ID[anyag][típus] */
export const TOOL_ID: Record<string, Record<ToolType, number>> = {};
MATERIALS.forEach((m, mi) => {
  TOOL_ID[m.id] = {} as Record<ToolType, number>;
  TOOLS.forEach(([type, hu], ti) => {
    const id = ITEM_BASE + 20 + mi * 4 + ti;
    TOOL_ID[m.id][type] = id;
    ITEMS[id] = { name: `${m.name} ${hu}`, tex: `${m.id}_${type}`, stack: 1, tool: { type, tier: m.tier, speed: m.speed, durability: m.durability, damage: BASE_DAMAGE[type] + m.bonus }, color: m.color };
  });
});

export const isItem = (id: number): boolean => id >= ITEM_BASE;
export const itemName = (id: number): string => ITEMS[id]?.name ?? BLOCKS[id]?.name ?? '?';
export const maxStack = (id: number): number => ITEMS[id]?.stack ?? 64;
export const toolOf = (id: number | undefined): ItemDef['tool'] => (id === undefined ? undefined : ITEMS[id]?.tool);
