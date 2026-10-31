export type RGB = [number, number, number];
export type FaceKind = 'top' | 'bottom' | 'side';

/** Textúra neve. Az alapblokkoké a `public/textures/<név>.png`, a generált blokkoké a `public/textures/mc/<név>.png` */
export type TexName = string;

/** Az alapblokkok textúrái (a világgenerálás ezeket használja) */
export const BASE_TEXTURES: TexName[] = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'sand',
  'log_side', 'log_top', 'planks', 'leaves', 'cobblestone',
  'water', // ha a csomag nincs kicsomagolva, az atlas maga rajzolja
  'bedrock', 'gravel', 'sandstone', 'sandstone_top', 'sandstone_bottom',
  'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore',
];

export const AIR = 0;
export const B = {
  GRASS: 1, DIRT: 2, STONE: 3, SAND: 4,
  LOG: 5, PLANKS: 6, LEAVES: 7, COBBLE: 8, WATER: 9,
  BEDROCK: 10, GRAVEL: 11, SANDSTONE: 12,
  COAL_ORE: 13, IRON_ORE: 14, GOLD_ORE: 15, DIAMOND_ORE: 16,
} as const;

/** A generált blokkok azonosítói ettől indulnak; az 1..99 az alapblokkoké */
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
  /** false: átlátszó vagy lyukas (lomb, üveg), nem takarja el a mögötte lévő lapokat */
  opaque?: boolean;
  /** a Minecraftbeli azonosító (csak a generált blokkoknál) */
  key?: string;
}

export const GRASS_TINT: RGB = [0.55, 0.85, 0.35];
export const LEAF_TINT: RGB = [0.40, 0.75, 0.30];

export const BLOCKS: Record<number, BlockDef> = {
  [B.GRASS]: { name: 'Fű', top: 'grass_top', bottom: 'dirt', side: 'grass_side' },
  [B.DIRT]: { name: 'Föld', top: 'dirt', bottom: 'dirt', side: 'dirt' },
  [B.STONE]: { name: 'Kő', top: 'stone', bottom: 'stone', side: 'stone' },
  [B.SAND]: { name: 'Homok', top: 'sand', bottom: 'sand', side: 'sand' },
  [B.LOG]: { name: 'Fatörzs', top: 'log_top', bottom: 'log_top', side: 'log_side' },
  [B.PLANKS]: { name: 'Deszka', top: 'planks', bottom: 'planks', side: 'planks' },
  [B.LEAVES]: {
    name: 'Lomb', top: 'leaves', bottom: 'leaves', side: 'leaves', opaque: false,
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

/** A játékos által lerakható blokkok kezdő hotbarja */
export const HOTBAR: number[] = [
  B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.SAND, B.LOG, B.PLANKS, B.LEAVES,
];

// ---------- generált blokkok ----------

/** A `scripts/build-blocks.mjs` által készített blocks.json egy bejegyzése */
export interface GeneratedBlock {
  name: string;
  kind: 'cube' | 'shape';
  top?: string;
  bottom?: string;
  side?: string;
  tinted?: boolean;
}

export interface GeneratedPack {
  textures: string[];
  blocks: GeneratedBlock[];
}

/** Ezekhez az alapblokkok tartoznak, a generált listából kihagyjuk őket */
const BASE_KEYS = new Set([
  'grass_block', 'dirt', 'stone', 'sand', 'oak_log', 'oak_planks', 'oak_leaves', 'cobblestone',
  'bedrock', 'gravel', 'sandstone', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore',
]);

/** Nem valódi, lerakható blokkok: állapot- és részletek, amiknek van textúrájuk, de nem kocka */
const NOT_PLACEABLE = /(_on|_off|_lit|_inner|_pot|_line\d*|_west|_east|_north|_south|_up|_down|_e|_w|_n|_s|_stage\d+|_cracked|_not_cracked.*|_overlay|_particle|_dust|_plant|_roots?|_vines?|_fan|_sapling|_carpet|_pane|_bud|_item)$|^(comparator|repeater|redstone_dust|water_|lava_|fire_(?!coral_block)|tripwire|torch|lantern|candle|cake|conduit|beacon)/;

/** Átlátszó vagy lyukas blokkok */
const SEE_THROUGH = /(leaves|glass|ice$|slime|honey|frosted|cobweb|spawner|trial_spawner)/;

/** A regisztráció eredménye: azonosító → generált blokk, és a plusz textúrák */
export const extraTextures: TexName[] = [];

/**
 * A generált blokkok regisztrálása. Az azonosítók a blokkok névsorából adódnak (FIRST_EXTRA_ID-től),
 * ezért ugyanazon textúracsomaggal mindig ugyanazok. Csak a teljes kockákat vesszük fel.
 * Visszaadja a felvett azonosítókat névsorban.
 */
export function registerGenerated(pack: GeneratedPack): number[] {
  const ids: number[] = [];
  let next = FIRST_EXTRA_ID;
  const tex = new Set<string>();
  const cubes = pack.blocks
    .filter((b) => b.kind === 'cube' && b.top && b.bottom && b.side)
    .filter((b) => !BASE_KEYS.has(b.name) && !NOT_PLACEABLE.test(b.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const b of cubes) {
    if (next > MAX_BLOCK_ID) break;
    const name = b.name.replace(/_/g, ' ');
    BLOCKS[next] = {
      name: name.charAt(0).toUpperCase() + name.slice(1),
      key: b.name,
      top: b.top!,
      bottom: b.bottom!,
      side: b.side!,
      opaque: !SEE_THROUGH.test(b.name),
      // a színes textúrákat nem színezzük (a GRASS_TINT / LEAF_TINT csak szürke textúrákhoz kell)
      tint: undefined,
    };
    tex.add(b.top!); tex.add(b.bottom!); tex.add(b.side!);
    ids.push(next++);
  }
  extraTextures.length = 0;
  extraTextures.push(...[...tex].filter((t) => pack.textures.includes(t)).sort());
  return ids;
}

/** Az összes ismert blokk azonosítója, a levegő és a folyadékok nélkül (a kreatív inventoryhoz) */
export function placeableBlocks(): number[] {
  return Object.keys(BLOCKS).map(Number).filter((id) => id !== B.WATER).sort((a, b) => a - b);
}

/** Átlátszatlan blokk: eltakarja a mögötte lévő lapokat */
export function isOpaque(id: number): boolean {
  const def = BLOCKS[id];
  // ismeretlen azonosító (pl. másik textúracsomaggal mentett blokk): nem takar el semmit
  return def ? def.opaque !== false : false;
}

/** Szilárd blokk: ütközik vele a játékos, és a sugár megáll rajta (a víz nem az) */
export function isSolid(id: number): boolean {
  return id !== AIR && id !== B.WATER;
}
