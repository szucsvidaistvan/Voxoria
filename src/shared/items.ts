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
  tool?: { type: ToolType; tier: number; speed: number };
  /** ennyi életerőt tölt vissza (fél szívekben) */
  heal?: number;
  /** a kijelzés színe, ha a textúra hiányzik */
  color: string;
}

export const I = {
  STICK: ITEM_BASE + 1, COAL: ITEM_BASE + 2, DIAMOND: ITEM_BASE + 3, IRON_INGOT: ITEM_BASE + 4,
  GOLD_INGOT: ITEM_BASE + 5, FLINT: ITEM_BASE + 6, APPLE: ITEM_BASE + 7,
  BUCKET: ITEM_BASE + 8, WATER_BUCKET: ITEM_BASE + 9, LAVA_BUCKET: ITEM_BASE + 10, FLINT_AND_STEEL: ITEM_BASE + 11,
} as const;

export const ITEMS: Record<number, ItemDef> = {
  [I.STICK]: { name: 'Pálca', tex: 'stick', stack: 64, color: '#8a6a3a' },
  [I.COAL]: { name: 'Szén', tex: 'coal', stack: 64, color: '#2b2b2b' },
  [I.DIAMOND]: { name: 'Gyémánt', tex: 'diamond', stack: 64, color: '#4be3e0' },
  [I.IRON_INGOT]: { name: 'Vasrúd', tex: 'iron_ingot', stack: 64, color: '#d8d8d8' },
  [I.GOLD_INGOT]: { name: 'Aranyrúd', tex: 'gold_ingot', stack: 64, color: '#f5d442' },
  [I.FLINT]: { name: 'Kova', tex: 'flint', stack: 64, color: '#55555a' },
  [I.APPLE]: { name: 'Alma', tex: 'apple', stack: 64, heal: 4, color: '#d33a2c' },
  [I.BUCKET]: { name: 'Vödör', tex: 'bucket', stack: 16, color: '#b5b5b5' },
  [I.WATER_BUCKET]: { name: 'Vizes vödör', tex: 'water_bucket', stack: 1, color: '#3a6fd8' },
  [I.LAVA_BUCKET]: { name: 'Lávás vödör', tex: 'lava_bucket', stack: 1, color: '#e86a14' },
  [I.FLINT_AND_STEEL]: { name: 'Kova és acél', tex: 'flint_and_steel', stack: 1, color: '#777b88' },
};

// eszközök: 5 anyag x 4 típus
const MATERIALS = [
  { id: 'wooden', name: 'Fa', tier: 1, speed: 2, color: '#a07a44' },
  { id: 'stone', name: 'Kő', tier: 2, speed: 4, color: '#8f8f8f' },
  { id: 'iron', name: 'Vas', tier: 3, speed: 6, color: '#d8d8d8' },
  { id: 'golden', name: 'Arany', tier: 1, speed: 12, color: '#f5d442' },
  { id: 'diamond', name: 'Gyémánt', tier: 4, speed: 8, color: '#4be3e0' },
];
const TOOLS: [ToolType, string][] = [['pickaxe', 'csákány'], ['axe', 'balta'], ['shovel', 'ásó'], ['sword', 'kard']];
/** TOOL_ID[anyag][típus] */
export const TOOL_ID: Record<string, Record<ToolType, number>> = {};
MATERIALS.forEach((m, mi) => {
  TOOL_ID[m.id] = {} as Record<ToolType, number>;
  TOOLS.forEach(([type, hu], ti) => {
    const id = ITEM_BASE + 20 + mi * 4 + ti;
    TOOL_ID[m.id][type] = id;
    ITEMS[id] = { name: `${m.name} ${hu}`, tex: `${m.id}_${type}`, stack: 1, tool: { type, tier: m.tier, speed: m.speed }, color: m.color };
  });
});

export const isItem = (id: number): boolean => id >= ITEM_BASE;
export const itemName = (id: number): string => ITEMS[id]?.name ?? BLOCKS[id]?.name ?? '?';
export const maxStack = (id: number): number => ITEMS[id]?.stack ?? 64;
export const toolOf = (id: number | undefined): ItemDef['tool'] => (id === undefined ? undefined : ITEMS[id]?.tool);
