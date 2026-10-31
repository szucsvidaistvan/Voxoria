import { EXTRA_BLOCKS, TEXTURE_NAMES } from './catalog';

export type RGB = [number, number, number];
export type FaceKind = 'top' | 'bottom' | 'side';

/** Textúra neve (a rajzolási recept a catalog.ts-ben van) */
export type TexName = string;

export { TEXTURE_NAMES };

export const AIR = 0;
export const B = {
  GRASS: 1, DIRT: 2, STONE: 3, SAND: 4,
  LOG: 5, PLANKS: 6, LEAVES: 7, COBBLE: 8, WATER: 9,
  BEDROCK: 10, GRAVEL: 11, SANDSTONE: 12,
  COAL_ORE: 13, IRON_ORE: 14, GOLD_ORE: 15, DIAMOND_ORE: 16,
} as const;

/** A katalógus blokkjainak azonosítói ettől indulnak; az 1..99 az alapblokkoké */
export const FIRST_EXTRA_ID = 100;
/** A chunkok Uint16Array-ben tárolnak, ez a felső határ */
export const MAX_BLOCK_ID = 65535;

export interface BlockDef {
  name: string;
  top: TexName;
  bottom: TexName;
  side: TexName;
  /** Szürke textúrák színezése (a Minecraft is így csinálja a fűvel és a levéllel) */
  tint?: Partial<Record<FaceKind, RGB>>;
  /** false: átlátszó vagy lyukas (lomb, üveg, víz), nem takarja el a mögötte lévő lapokat */
  opaque?: boolean;
}

const GRASS_TINT: RGB = [0.55, 0.85, 0.35];
const LEAF_TINT: RGB = [0.40, 0.75, 0.30];

export const BLOCKS: Record<number, BlockDef> = {
  [B.GRASS]: { name: 'Fű', top: 'grass_top', bottom: 'dirt', side: 'grass_side', tint: { top: GRASS_TINT } },
  [B.DIRT]: { name: 'Föld', top: 'dirt', bottom: 'dirt', side: 'dirt' },
  [B.STONE]: { name: 'Kő', top: 'stone', bottom: 'stone', side: 'stone' },
  [B.SAND]: { name: 'Homok', top: 'sand', bottom: 'sand', side: 'sand' },
  [B.LOG]: { name: 'Fatörzs', top: 'log_top', bottom: 'log_top', side: 'log_side' },
  [B.PLANKS]: { name: 'Deszka', top: 'planks', bottom: 'planks', side: 'planks' },
  [B.LEAVES]: {
    name: 'Lomb', top: 'leaves', bottom: 'leaves', side: 'leaves', opaque: false,
    tint: { top: LEAF_TINT, bottom: LEAF_TINT, side: LEAF_TINT },
  },
  [B.COBBLE]: { name: 'Kavics', top: 'cobblestone', bottom: 'cobblestone', side: 'cobblestone' },
  [B.WATER]: { name: 'Víz', top: 'water', bottom: 'water', side: 'water', opaque: false },
  [B.BEDROCK]: { name: 'Alapkőzet', top: 'bedrock', bottom: 'bedrock', side: 'bedrock' },
  [B.GRAVEL]: { name: 'Kavics (sóder)', top: 'gravel', bottom: 'gravel', side: 'gravel' },
  [B.SANDSTONE]: { name: 'Homokkő', top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone' },
  [B.COAL_ORE]: { name: 'Szénérc', top: 'coal_ore', bottom: 'coal_ore', side: 'coal_ore' },
  [B.IRON_ORE]: { name: 'Vasérc', top: 'iron_ore', bottom: 'iron_ore', side: 'iron_ore' },
  [B.GOLD_ORE]: { name: 'Aranyérc', top: 'gold_ore', bottom: 'gold_ore', side: 'gold_ore' },
  [B.DIAMOND_ORE]: { name: 'Gyémántérc', top: 'diamond_ore', bottom: 'diamond_ore', side: 'diamond_ore' },
};

// a katalógus blokkjai: a sorrend adja az azonosítót, ezért a mentések stabilak maradnak
EXTRA_BLOCKS.forEach((b, i) => {
  const id = FIRST_EXTRA_ID + i;
  if (id > MAX_BLOCK_ID) return;
  BLOCKS[id] = { name: b.name, top: b.top, bottom: b.bottom, side: b.side, opaque: b.opaque };
});

/** A játékos által lerakható blokkok kezdő hotbarja */
export const HOTBAR: number[] = [
  B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.SAND, B.LOG, B.PLANKS, B.LEAVES,
];

/** Az összes ismert blokk azonosítója, a víz nélkül (a kreatív inventoryhoz) */
export function placeableBlocks(): number[] {
  return Object.keys(BLOCKS).map(Number).filter((id) => id !== B.WATER).sort((a, b) => a - b);
}

/** Átlátszatlan blokk: eltakarja a mögötte lévő lapokat */
export function isOpaque(id: number): boolean {
  const def = BLOCKS[id];
  // ismeretlen azonosító (pl. régi mentésből): nem takar el semmit
  return def ? def.opaque !== false : false;
}

/** Szilárd blokk: ütközik vele a játékos, és a sugár megáll rajta (a víz nem az) */
export function isSolid(id: number): boolean {
  return id !== AIR && id !== B.WATER;
}
