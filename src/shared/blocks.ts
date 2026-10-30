export type RGB = [number, number, number];
export type FaceKind = 'top' | 'bottom' | 'side';

export const TEXTURE_NAMES = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'sand',
  'log_side', 'log_top', 'planks', 'leaves', 'cobblestone',
] as const;
export type TexName = (typeof TEXTURE_NAMES)[number];

export const AIR = 0;
export const B = {
  GRASS: 1, DIRT: 2, STONE: 3, SAND: 4,
  LOG: 5, PLANKS: 6, LEAVES: 7, COBBLE: 8,
} as const;

export interface BlockDef {
  name: string;
  top: TexName;
  bottom: TexName;
  side: TexName;
  /** Szürke textúrák színezése (a Minecraft is így csinálja a fűvel és a levéllel) */
  tint?: Partial<Record<FaceKind, RGB>>;
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
    name: 'Lomb', top: 'leaves', bottom: 'leaves', side: 'leaves',
    tint: { top: LEAF_TINT, bottom: LEAF_TINT, side: LEAF_TINT },
  },
  [B.COBBLE]: { name: 'Kavics', top: 'cobblestone', bottom: 'cobblestone', side: 'cobblestone' },
};

/** A játékos által lerakható blokkok (hotbar sorrend) */
export const HOTBAR: number[] = [
  B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.SAND, B.LOG, B.PLANKS, B.LEAVES,
];

/** Átlátszatlan blokk: eltakarja a mögötte lévő lapokat */
export function isOpaque(id: number): boolean {
  return id !== AIR && id !== B.LEAVES;
}
