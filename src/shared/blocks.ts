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
  'obsidian', 'lava', 'fire', 'crafting_table_top', 'crafting_table_side',
];

export const AIR = 0;
export const B = {
  GRASS: 1, DIRT: 2, STONE: 3, SAND: 4,
  LOG: 5, PLANKS: 6, LEAVES: 7, COBBLE: 8, WATER: 9,
  BEDROCK: 10, GRAVEL: 11, SANDSTONE: 12,
  COAL_ORE: 13, IRON_ORE: 14, GOLD_ORE: 15, DIAMOND_ORE: 16,
  OBSIDIAN: 17, LAVA: 18, FIRE: 19, CRAFTING_TABLE: 20,
} as const;

// ---------- folyadékok ----------
// A víznek és a lávának több azonosítója van: forrás (0. szint), folyó (1..7. szint) és zuhanó (8. szint).
// Víz: forrás = B.WATER, folyó = 21..27, zuhanó = 28.  Láva: forrás = B.LAVA, folyó = 29..35, zuhanó = 36.
const WATER_FLOW = 20, WATER_FALL = 28, LAVA_FLOW = 28, LAVA_FALL = 36;
export const FLUID_NONE = 0, FLUID_WATER = 1, FLUID_LAVA = 2;
const FK = new Uint8Array(64), FL = new Uint8Array(64);
FK[B.WATER] = FLUID_WATER;
for (let l = 1; l <= 7; l++) { FK[WATER_FLOW + l] = FLUID_WATER; FL[WATER_FLOW + l] = l; }
FK[WATER_FALL] = FLUID_WATER; FL[WATER_FALL] = 8;
FK[B.LAVA] = FLUID_LAVA;
for (let l = 1; l <= 7; l++) { FK[LAVA_FLOW + l] = FLUID_LAVA; FL[LAVA_FLOW + l] = l; }
FK[LAVA_FALL] = FLUID_LAVA; FL[LAVA_FALL] = 8;

/** 0: nem folyadék, 1: víz, 2: láva */
export const fluidKind = (id: number): number => (id < 64 ? FK[id] : 0);
/** 0: forrás, 1..7: folyó (minél nagyobb, annál vékonyabb), 8: zuhanó */
export const fluidLevel = (id: number): number => (id < 64 ? FL[id] : 0);
export const fluidId = (kind: number, level: number): number =>
  kind === FLUID_WATER ? (level === 0 ? B.WATER : level === 8 ? WATER_FALL : WATER_FLOW + level)
    : (level === 0 ? B.LAVA : level === 8 ? LAVA_FALL : LAVA_FLOW + level);
/** A folyadék felszínének magassága a blokkon belül (0..1) */
export const fluidHeight = (level: number): number => (level >= 8 ? 1 : (8 - level) / 9);

/** A generált blokkok azonosítói ettől indulnak; az 1..99 az alapblokkoké */
export const FIRST_EXTRA_ID = 100;
/** A chunkok Uint16Array-ben tárolnak, ez a felső határ */
export const MAX_BLOCK_ID = 65535;

export type Vec3 = [number, number, number];
export type Dir = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';
/** Egy modellelem (doboz) egy lapja: uv a 0..16-os textúratérben, tex a textúra neve */
export interface ShapeFace { uv: [number, number, number, number]; tex: TexName; cull?: Dir; tint?: number; rot?: number }
export interface ShapePart {
  from: Vec3;
  to: Vec3;
  /** elemszintű forgatás (pl. a növények keresztezett lapjai) */
  rot?: { o: Vec3; a: 'x' | 'y' | 'z'; g: number; s: number };
  faces: Partial<Record<Dir, ShapeFace>>;
}
/** Doboz a blokkon belül, 0..1 koordinátákban: x0, y0, z0, x1, y1, z1 */
export type Box = [number, number, number, number, number, number];
/** Elforgatás a blokk közepe körül (fok, 90 többszöröse) */
export type Rot = ['x' | 'y', number];

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
  /** nem kocka alakú blokk: a modell dobozai */
  parts?: ShapePart[];
  /** a dobozokra alkalmazott elforgatások (alapállás, fejjel lefelé, a játékos felé fordítás) */
  rots?: Rot[];
  /** ütközési dobozok; üres: átjárható (növény, fáklya). Kockánál nincs megadva. */
  boxes?: Box[];
  /** célzási dobozok (sugárkövetés) */
  pick?: Box[];
  /** az alapblokk elforgatott változatai: [irány 0..3] vagy [fejjel lefelé * 4 + irány] */
  variants?: number[];
  /** a változatok nem jelennek meg az inventoryban */
  hidden?: boolean;
  /** a `tinted` lapok színe */
  tintColor?: RGB;
  /** az elforgatott vagy folyó változat alapblokkja (ezt dobja, ezt választja a pipetta) */
  base?: number;
  /** kerítés, fal, üvegtábla: a szomszédok felé kinyúló karok */
  conn?: Conn;
  /** ajtó: melyik fele, nyitva van-e, merre néz; ids: a 16 változat ([fél * 8 + nyitva * 4 + irány]) */
  door?: { half: 0 | 1; open: 0 | 1; dir: number; ids: number[] };
  /** falra szerelhető blokk (létra, fáklya): az az irány, amerre alapállásban a fal van (0 kelet, 1 dél, 2 nyugat, 3 észak) */
  wall?: number;
  /** fali változat esetén: merre van a fal, amire a blokk fel van szerelve (0 kelet, 1 dél, 2 nyugat, 3 észak). Ha a fal eltűnik, a blokk leesik. */
  attach?: number;
  /** a falra rakott változatok (a `wall` iránya szerint elforgatva, a lerakáskor kell); csak az alap fáklyánál */
  wallVariants?: number[];
  /** fényforrás: a fény erőssége 1..15 (a fáklya 14, a láva 15) */
  light?: number;
}

export type ConnKind = 'fence' | 'wall' | 'pane';
/** A karok sorrendje: észak (-z), kelet (+x), dél (+z), nyugat (-x) */
export interface Conn {
  kind: ConnKind;
  arms: ShapePart[][];
  armBoxes: Box[][];
  armPick: Box[][];
}

const GRASS_TINT: RGB = [0.55, 0.85, 0.35];
const LEAF_TINT: RGB = [0.40, 0.75, 0.30];

export const BLOCKS: Record<number, BlockDef> = {
  [B.GRASS]: { name: 'Grass Block', top: 'grass_top', bottom: 'dirt', side: 'grass_side', tint: { top: GRASS_TINT } },
  [B.DIRT]: { name: 'Dirt', top: 'dirt', bottom: 'dirt', side: 'dirt' },
  [B.STONE]: { name: 'Stone', top: 'stone', bottom: 'stone', side: 'stone' },
  [B.SAND]: { name: 'Sand', top: 'sand', bottom: 'sand', side: 'sand' },
  [B.LOG]: { name: 'Oak Log', top: 'log_top', bottom: 'log_top', side: 'log_side' },
  [B.PLANKS]: { name: 'Oak Planks', top: 'planks', bottom: 'planks', side: 'planks' },
  [B.LEAVES]: {
    name: 'Oak Leaves', top: 'leaves', bottom: 'leaves', side: 'leaves', opaque: false,
    tint: { top: LEAF_TINT, bottom: LEAF_TINT, side: LEAF_TINT },
  },
  [B.COBBLE]: { name: 'Cobblestone', top: 'cobblestone', bottom: 'cobblestone', side: 'cobblestone' },
  [B.WATER]: { name: 'Water', top: 'water', bottom: 'water', side: 'water', opaque: false },
  [B.BEDROCK]: { name: 'Bedrock', top: 'bedrock', bottom: 'bedrock', side: 'bedrock' },
  [B.GRAVEL]: { name: 'Gravel', top: 'gravel', bottom: 'gravel', side: 'gravel' },
  [B.SANDSTONE]: { name: 'Sandstone', top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone' },
  [B.COAL_ORE]: { name: 'Coal Ore', top: 'coal_ore', bottom: 'coal_ore', side: 'coal_ore' },
  [B.IRON_ORE]: { name: 'Iron Ore', top: 'iron_ore', bottom: 'iron_ore', side: 'iron_ore' },
  [B.GOLD_ORE]: { name: 'Gold Ore', top: 'gold_ore', bottom: 'gold_ore', side: 'gold_ore' },
  [B.DIAMOND_ORE]: { name: 'Diamond Ore', top: 'diamond_ore', bottom: 'diamond_ore', side: 'diamond_ore' },
  [B.OBSIDIAN]: { name: 'Obsidian', top: 'obsidian', bottom: 'obsidian', side: 'obsidian' },
  [B.LAVA]: { name: 'Lava', top: 'lava', bottom: 'lava', side: 'lava', opaque: false, light: 15 },
  [B.FIRE]: {
    name: 'Fire', top: 'fire', bottom: 'fire', side: 'fire', opaque: false,
    parts: crossParts('fire'), rots: [], boxes: [], pick: [], light: 15,
  },
  [B.CRAFTING_TABLE]: { name: 'Crafting Table', top: 'crafting_table_top', bottom: 'planks', side: 'crafting_table_side' },
};

// a folyékony blokkok további szintjei (az inventoryban nem jelennek meg)
for (let l = 1; l <= 8; l++) {
  const w = fluidId(FLUID_WATER, l), v = fluidId(FLUID_LAVA, l);
  BLOCKS[w] = { name: 'Water', top: 'water', bottom: 'water', side: 'water', opaque: false, hidden: true, base: B.WATER };
  BLOCKS[v] = { name: 'Lava', top: 'lava', bottom: 'lava', side: 'lava', opaque: false, hidden: true, base: B.LAVA, light: 15 };
}

// ---------- fény ----------

/** A blokkok fényereje azonosító szerint (0: nem világít). A `refreshLight` tölti fel a BLOCKS alapján. */
export const LIGHT = new Uint8Array(MAX_BLOCK_ID + 1);
export const lightOf = (id: number): number => LIGHT[id];
/** Ezek a generált blokkok világítanak (kulcs: Minecraft-név, érték: fényerő) */
const EMITTERS: Record<string, number> = {
  jack_o_lantern: 15, magma: 3, torch: 14,
};
/** Újraszámolja a LIGHT táblát. A blokkok regisztrálása után kell hívni. */
export function refreshLight(): void {
  LIGHT.fill(0);
  for (const [id, def] of Object.entries(BLOCKS)) LIGHT[Number(id)] = def.light ?? 0;
}

/** 'oak_stairs' -> 'Oak Stairs' */
export const titleCase = (key: string): string =>
  key.split('_').map((w) => (w === 'tnt' ? 'TNT' : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');

/** Két keresztezett lap (növények, tűz): a Minecraft cross modellje */
function crossParts(tex: TexName): ShapePart[] {
  const f = (): ShapeFace => ({ uv: [0, 0, 16, 16], tex });
  const rot = { o: [8, 8, 8] as Vec3, a: 'y' as const, g: 45, s: 1 };
  return [
    { from: [0.8, 0, 8], to: [15.2, 16, 8], rot, faces: { north: f(), south: f() } },
    { from: [8, 0, 0.8], to: [8, 16, 15.2], rot, faces: { west: f(), east: f() } },
  ];
}

// kulcs (Minecraft-név) -> blokk azonosító, a receptekhez és a tűzhöz
const KEY_ID = new Map<string, number>();
const BASE_KEY_NAMES: Record<number, string> = {
  [B.GRASS]: 'grass_block', [B.DIRT]: 'dirt', [B.STONE]: 'stone', [B.SAND]: 'sand', [B.LOG]: 'oak_log',
  [B.PLANKS]: 'oak_planks', [B.LEAVES]: 'oak_leaves', [B.COBBLE]: 'cobblestone', [B.BEDROCK]: 'bedrock',
  [B.GRAVEL]: 'gravel', [B.SANDSTONE]: 'sandstone', [B.COAL_ORE]: 'coal_ore', [B.IRON_ORE]: 'iron_ore',
  [B.GOLD_ORE]: 'gold_ore', [B.DIAMOND_ORE]: 'diamond_ore', [B.OBSIDIAN]: 'obsidian', [B.LAVA]: 'lava',
  [B.FIRE]: 'fire', [B.CRAFTING_TABLE]: 'crafting_table',
};
for (const [id, key] of Object.entries(BASE_KEY_NAMES)) {
  BLOCKS[Number(id)].key = key;
  KEY_ID.set(key, Number(id));
}
refreshLight();
/** A blokk azonosítója a Minecraftbeli nevéből (pl. 'cobblestone_slab'), vagy undefined, ha a csomagban nincs */
export const blockId = (key: string): number | undefined => KEY_ID.get(key);
/** A blokk Minecraftbeli neve, ha ismert */
export const blockKey = (id: number): string => BLOCKS[BLOCKS[id]?.base ?? id]?.key ?? '';

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
  parts?: ShapePart[];
  rx?: number;
  ry?: number;
  /** ajtó: az alsó és a felső fél textúrája */
  door?: { bottom: string; top: string };
}

export interface GeneratedPack {
  textures: string[];
  blocks: GeneratedBlock[];
}

/** Ezekhez az alapblokkok tartoznak, a generált listából kihagyjuk őket */
const BASE_KEYS = new Set([
  'grass_block', 'dirt', 'stone', 'sand', 'oak_log', 'oak_planks', 'oak_leaves', 'cobblestone',
  'bedrock', 'gravel', 'sandstone', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore',
  'obsidian', 'lava', 'fire', 'crafting_table',
]);

/** Nem valódi, lerakható blokkok: állapot- és részletek, amiknek van textúrájuk, de nem kocka */
const NOT_PLACEABLE = /(_horizontal|_snow|_side2|_alt|_in|_vertical|_double|_on|_off|_lit|_inner|_pot|_line\d*|_west|_east|_north|_south|_up|_down|_e|_w|_n|_s|_stage\d+|_cracked|_not_cracked.*|_overlay|_particle|_dust|_plant|_roots?|_vines?|_fan|_sapling|_carpet|_pane|_bud|_item)$|^(creaking_heart_|tuff_2|comparator|repeater|redstone_dust|water_|lava_|fire_(?!coral_block)|tripwire|torch|lantern|candle|cake|conduit|beacon)/;

/** Átlátszó vagy lyukas blokkok */
const SEE_THROUGH = /(leaves|glass|ice$|slime|honey|frosted|cobweb|spawner|trial_spawner)/;

/** Szürke textúrák, amiket színezni kell */
const LEAF_LIKE = /leaves|vine/;


// ---------- forgatás ----------

/** Pont elforgatása a tengely körül (fok). Az y forgatás a Minecraftban az óramutató járásával megegyező (felülnézetből). */
export function rotPoint(p: Vec3, axis: 'x' | 'y' | 'z', deg: number): Vec3 {
  const r = (deg * Math.PI) / 180;
  const c = Math.round(Math.cos(r) * 1e9) / 1e9, s = Math.round(Math.sin(r) * 1e9) / 1e9;
  const [x, y, z] = p;
  if (axis === 'x') return [x, y * c - z * s, y * s + z * c];
  if (axis === 'y') return [x * c - z * s, y, x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}

/** Doboz elforgatása a blokk közepe körül (a 90 fok többszöröseinél a doboz tengelyirányú marad) */
function rotBox(b: Box, rots: Rot[]): Box {
  const out: Box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    let p: Vec3 = [(i & 1 ? b[3] : b[0]) - 0.5, (i & 2 ? b[4] : b[1]) - 0.5, (i & 4 ? b[5] : b[2]) - 0.5];
    for (const [a, d] of rots) p = rotPoint(p, a, d);
    for (let k = 0; k < 3; k++) {
      out[k] = Math.min(out[k], p[k] + 0.5);
      out[k + 3] = Math.max(out[k + 3], p[k] + 0.5);
    }
  }
  return out.map((v) => Math.round(v * 1e4) / 1e4) as Box;
}

/** Ezek a nem kocka alakú blokkok átjárhatóak (növények, fáklya, sín, gomb ...) */
const NO_COLLIDE = /(torch|rail|button|pressure_plate|sapling|tulip|orchid|allium|bluet|cornflower|daisy|dandelion|poppy|lily|rose|bush|fern|grass|mushroom|fungus|roots|vine|lever|tripwire|stem|wheat|cobweb|sugar_cane|coral|small_dripleaf|repeater|comparator|redstone|wildflowers|torchflower|berry|flower)/;
/** Nem lerakható állapot- és részblokkok */
const SHAPE_SKIP = /^(potted_|attached_|redstone_wire$|tripwire$|lava_cauldron|water_cauldron|powder_snow_cauldron)|(_wall_torch|_crop|_plant)$/;
/** Ezeknek van "fejjel lefelé" (felső fél) változata */
/** ezek az alakú blokkok az összes többi után kapnak azonosítót */
const LATE_SHAPES = ['chest'];
const FLIPPABLE = /(_slab|_stairs|_trapdoor)$/;

function shapeDef(b: GeneratedBlock, dir: number, flip: number): BlockDef {
  const parts = b.parts!;
  const rots: Rot[] = [];
  if (b.rx) rots.push(['x', b.rx]);
  if (b.ry) rots.push(['y', b.ry]);
  if (flip) rots.push(['x', 180]);
  if (dir) rots.push(['y', 90 * dir]);

  const faceTex = (dirs: Dir[]): TexName | undefined => {
    for (const p of parts) for (const d of dirs) if (p.faces[d]) return p.faces[d]!.tex;
    return undefined;
  };
  const side = faceTex(['north', 'east', 'south', 'west']) ?? faceTex(['up', 'down'])!;
  const top = faceTex(['up']) ?? side;
  const bottom = faceTex(['down']) ?? side;

  // ütközés és célzás: az elforgatás nélküli részek dobozai
  const pick: Box[] = [];
  const boxes: Box[] = [];
  for (const p of parts) {
    if (p.rot) continue;
    const dim = [p.to[0] - p.from[0], p.to[1] - p.from[1], p.to[2] - p.from[2]];
    const grow = dim.map((d) => (d < 0.5 ? (0.5 - d) / 2 : 0));
    const raw: Box = [
      (p.from[0] - grow[0]) / 16, (p.from[1] - grow[1]) / 16, (p.from[2] - grow[2]) / 16,
      (p.to[0] + grow[0]) / 16, (p.to[1] + grow[1]) / 16, (p.to[2] + grow[2]) / 16,
    ];
    pick.push(rotBox(raw, rots));
    if (Math.min(...dim) >= 0.5) boxes.push(rotBox([p.from[0] / 16, p.from[1] / 16, p.from[2] / 16, p.to[0] / 16, p.to[1] / 16, p.to[2] / 16], rots));
  }
  const leafy = LEAF_LIKE.test(b.name);
  const tintColor: RGB | undefined = b.tinted ? (leafy ? LEAF_TINT : GRASS_TINT) : undefined;
  const name = titleCase(b.name);
  const kind = connKindOf(b.name);
  if (kind) {
    // kerítés, fal, üvegtábla: az oszlop dobozai, a karok a szomszédoktól függően kerülnek hozzá
    return {
      name, key: b.name, top, bottom, side, opaque: false,
      parts, rots, tintColor, boxes: [POST_SHAPES[kind].coll], pick: [POST_SHAPES[kind].pick], conn: makeConn(kind, side),
    };
  }
  return {
    name,
    key: b.name,
    top, bottom, side,
    opaque: false,
    parts, rots, tintColor,
    tint: tintColor ? { top: tintColor, bottom: tintColor, side: tintColor } : undefined,
    boxes: NO_COLLIDE.test(b.name) ? [] : boxes,
    pick,
    wall: b.name === 'ladder' ? 1 : undefined,
    // a létra a falra van szerelve: a fal iránya a forgatással együtt változik
    attach: b.name === 'ladder' ? (1 + dir) % 4 : undefined,
    light: EMITTERS[b.name],
  };
}

/** Ezeknek a fáklyáknak van fali változata */
const TORCHES = new Set(['torch']);
/** A fali fáklya modellje a nyugati falra (x = 0) van rajzolva, ez a `wall` iránya */
const WALL_TORCH_SIDE = 2;

/**
 * A fali fáklya modellje: a Minecraft template_torch_wall elemével egyező, a faltól 22,5 fokkal elhajló rúd.
 * A lapok textúrája és uv-ja az álló fáklyáé.
 */
function wallTorchParts(standing: ShapePart[]): ShapePart[] {
  const faces = standing[0].faces;
  return [{ from: [-1, 3.5, 7], to: [1, 13.5, 9], rot: { o: [0, 3.5, 8], a: 'z', g: -22.5, s: 0 }, faces }];
}
/** A fali fáklya célzási doboza a nyugati falhoz (a forgatott részeket a shapeDef nem veszi figyelembe) */
const WALL_TORCH_PICK: Box = [0, 3 / 16, 6 / 16, 5.5 / 16, 14 / 16, 10 / 16];


// ---------- kapcsolódó blokkok (kerítés, fal, üvegtábla) ----------

const DIRS: Dir[] = ['down', 'up', 'north', 'south', 'west', 'east'];

/** A Minecraft alap uv-ja egy laphoz */
function defaultUv(dir: Dir, [x1, y1, z1]: Vec3, [x2, y2, z2]: Vec3): [number, number, number, number] {
  switch (dir) {
    case 'down': return [x1, 16 - z2, x2, 16 - z1];
    case 'up': return [x1, z1, x2, z2];
    case 'north': return [16 - x2, 16 - y2, 16 - x1, 16 - y1];
    case 'south': return [x1, 16 - y2, x2, 16 - y1];
    case 'west': return [z1, 16 - y2, z2, 16 - y1];
    default: return [16 - z2, 16 - y2, 16 - z1, 16 - y1];
  }
}

function boxPart(from: Vec3, to: Vec3, tex: string): ShapePart {
  const faces: ShapePart['faces'] = {};
  for (const d of DIRS) faces[d] = { uv: defaultUv(d, from, to), tex };
  return { from, to, faces };
}

/** Doboz elforgatása a blokk közepe körül k * 90 fokkal (az óramutató járásával megegyezően, felülnézetből): (x, z) -> (16 - z, x) */
function turn16(from: Vec3, to: Vec3, k: number): [Vec3, Vec3] {
  let [x1, z1, x2, z2] = [from[0], from[2], to[0], to[2]];
  for (let i = 0; i < k; i++) [x1, z1, x2, z2] = [16 - z2, x1, 16 - z1, x2];
  return [[x1, from[1], z1], [x2, to[1], z2]];
}
function turnUnit(b: Box, k: number): Box {
  let [x1, z1, x2, z2] = [b[0], b[2], b[3], b[5]];
  for (let i = 0; i < k; i++) [x1, z1, x2, z2] = [1 - z2, x1, 1 - z1, x2];
  return [x1, b[1], z1, x2, b[4], z2];
}

/** A karok alakja a blokk fajtája szerint, északi irányban (16-os egységekben) */
const ARM_SHAPES: Record<ConnKind, { bars: [Vec3, Vec3][]; coll: Box; pick: Box }> = {
  fence: {
    bars: [[[7, 6, 0], [9, 9, 9]], [[7, 12, 0], [9, 15, 9]]],
    coll: [7 / 16, 0, 0, 9 / 16, 1.5, 9 / 16], pick: [7 / 16, 0, 0, 9 / 16, 1, 9 / 16],
  },
  wall: {
    bars: [[[5, 0, 0], [11, 13, 8]]],
    coll: [5 / 16, 0, 0, 11 / 16, 1.5, 8 / 16], pick: [5 / 16, 0, 0, 11 / 16, 1, 8 / 16],
  },
  pane: {
    bars: [[[7, 0, 0], [9, 16, 8]]],
    coll: [7 / 16, 0, 0, 9 / 16, 1, 8 / 16], pick: [7 / 16, 0, 0, 9 / 16, 1, 8 / 16],
  },
};
/** Az oszlop ütközési és célzási doboza */
const POST_SHAPES: Record<ConnKind, { coll: Box; pick: Box }> = {
  fence: { coll: [6 / 16, 0, 6 / 16, 10 / 16, 1.5, 10 / 16], pick: [6 / 16, 0, 6 / 16, 10 / 16, 1, 10 / 16] },
  wall: { coll: [4 / 16, 0, 4 / 16, 12 / 16, 1.5, 12 / 16], pick: [4 / 16, 0, 4 / 16, 12 / 16, 1, 12 / 16] },
  pane: { coll: [7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16], pick: [7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16] },
};

function connKindOf(name: string): ConnKind | null {
  if (/_fence$/.test(name)) return 'fence';
  if (/_wall$/.test(name)) return 'wall';
  if (/(_pane$|^iron_bars$)/.test(name)) return 'pane';
  return null;
}

function makeConn(kind: ConnKind, tex: string): Conn {
  const shape = ARM_SHAPES[kind];
  const arms: ShapePart[][] = [], armBoxes: Box[][] = [], armPick: Box[][] = [];
  for (let k = 0; k < 4; k++) {
    arms.push(shape.bars.map(([f, t]) => { const [a, b] = turn16(f, t, k); return boxPart(a, b, tex); }));
    armBoxes.push([turnUnit(shape.coll, k)]);
    armPick.push([turnUnit(shape.pick, k)]);
  }
  return { kind, arms, armBoxes, armPick };
}

/** A szomszéd blokk kapcsolódik-e a (kerítés, fal, üvegtábla) blokkhoz? */
function connectsTo(kind: ConnKind, nid: number): boolean {
  if (nid === AIR) return false;
  const d = BLOCKS[nid];
  if (!d) return false;
  if (d.conn) return kind === 'pane' ? d.conn.kind === 'pane' || d.conn.kind === 'wall' : d.conn.kind === kind;
  return isOpaque(nid) && !d.parts && fluidKind(nid) === FLUID_NONE; // tömör kocka
}

const ARM_OFFSETS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
/** Melyik irányba nyúlnak karok: bitmaszk (0: észak, 1: kelet, 2: dél, 3: nyugat). get(dx, dz): a szomszéd blokk. */
export function connectionMask(def: BlockDef, get: (dx: number, dz: number) => number): number {
  let m = 0;
  for (let k = 0; k < 4; k++) if (connectsTo(def.conn!.kind, get(ARM_OFFSETS[k][0], ARM_OFFSETS[k][1]))) m |= 1 << k;
  return m;
}
/** A blokk lapjai a kapcsolódó karokkal együtt */
export function connectedParts(def: BlockDef, get: (dx: number, dz: number) => number): ShapePart[] {
  const m = connectionMask(def, get);
  const out = [...def.parts!];
  for (let k = 0; k < 4; k++) if (m & (1 << k)) out.push(...def.conn!.arms[k]);
  return out;
}
/** Ütközési vagy célzási dobozok a kapcsolódó karokkal együtt */
export function dynamicBoxes(def: BlockDef, get: (dx: number, dz: number) => number, which: 'boxes' | 'pick'): Box[] {
  const m = connectionMask(def, get);
  const out: Box[] = [...((which === 'boxes' ? def.boxes : def.pick) ?? [])];
  for (let k = 0; k < 4; k++) if (m & (1 << k)) out.push(...(which === 'boxes' ? def.conn!.armBoxes[k] : def.conn!.armPick[k]));
  return out;
}

// ---------- ajtók ----------

/** Az ajtólap: zárva a blokk keleti szélén, nyitva az északi szélén (alapállásban; az irány elforgatja) */
function doorPlate(open: number, tex: string): ShapePart {
  return open ? boxPart([0, 0, 0], [16, 16, 3], tex) : boxPart([13, 0, 0], [16, 16, 16], tex);
}
const DOOR_BOX: Box[] = [[13 / 16, 0, 0, 1, 1, 1], [0, 0, 0, 1, 1, 3 / 16]];


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
    const name = titleCase(b.name);
    const leafy = LEAF_LIKE.test(b.name);
    BLOCKS[next] = {
      name,
      key: b.name,
      top: b.top!,
      bottom: b.bottom!,
      side: b.side!,
      opaque: !SEE_THROUGH.test(b.name),
      tint: leafy
        ? { top: LEAF_TINT, bottom: LEAF_TINT, side: LEAF_TINT }
        : b.tinted ? { top: GRASS_TINT } : undefined,
      light: EMITTERS[b.name],
    };
    tex.add(b.top!); tex.add(b.bottom!); tex.add(b.side!);
    KEY_ID.set(b.name, next);
    ids.push(next++);
  }

  // nem kocka alakú blokkok: előbb az alapállapotok (névsorban), utána az elforgatott változatok,
  // így a kockák és az alap alakú blokkok azonosítói stabilak maradnak
  const shapes = pack.blocks
    .filter((b) => b.kind === 'shape' && b.parts?.length && !BASE_KEYS.has(b.name) && !SHAPE_SKIP.test(b.name) && !LATE_SHAPES.includes(b.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const baseIds: number[] = [];
  const kept: GeneratedBlock[] = [];
  for (const b of shapes) {
    if (next > MAX_BLOCK_ID - 8) break;
    BLOCKS[next] = shapeDef(b, 0, 0);
    for (const p of b.parts!) for (const f of Object.values(p.faces)) tex.add(f!.tex);
    if (b.door) { tex.add(b.door.bottom); tex.add(b.door.top); }
    baseIds.push(next);
    kept.push(b);
    KEY_ID.set(b.name, next);
    ids.push(next++);
  }
  baseIds.forEach((id, i) => {
    const b = kept[i];
    if (BLOCKS[id].conn) return; // a kerítés, fal, üvegtábla alakja a szomszédoktól függ, nincs elforgatott változata
    if (b.door) {
      // ajtó: alsó és felső fél, zárva és nyitva, négy irányban (16 változat); az alap az alsó, zárt, keleti
      const doorIds: number[] = new Array(16);
      const nm = BLOCKS[id].name;
      for (let half = 0; half < 2; half++) for (let open = 0; open < 2; open++) for (let dir = 0; dir < 4; dir++) {
        const idx = half * 8 + open * 4 + dir;
        const did = idx === 0 ? id : next++;
        if (did > MAX_BLOCK_ID) return;
        const t = half ? b.door.top : b.door.bottom;
        const rots: Rot[] = dir ? [['y', 90 * dir]] : [];
        const box = rotBox(DOOR_BOX[open], rots);
        BLOCKS[did] = {
          name: nm, key: b.name, top: t, bottom: t, side: t, opaque: false,
          parts: [doorPlate(open, t)], rots, boxes: [box], pick: [box],
          hidden: idx !== 0, base: id,
          door: { half: half as 0 | 1, open: open as 0 | 1, dir, ids: doorIds },
        };
        doorIds[idx] = did;
      }
      return;
    }
    const n = FLIPPABLE.test(b.name) ? 8 : 4;
    const variants: number[] = new Array(n);
    variants[0] = id;
    for (let v = 1; v < n; v++) {
      if (next > MAX_BLOCK_ID) break;
      BLOCKS[next] = { ...shapeDef(b, v % 4, v >> 2), hidden: true, base: id };
      variants[v] = next++;
    }
    BLOCKS[id].variants = variants;
  });

  // fali fáklyák: a végén vesszük fel őket, hogy a korábbi blokkok azonosítói (és a mentések) ne csússzanak el
  for (const key of TORCHES) {
    const id = KEY_ID.get(key);
    const std = id === undefined ? undefined : BLOCKS[id];
    if (id === undefined || !std?.parts || next + 4 > MAX_BLOCK_ID) continue;
    const parts = wallTorchParts(std.parts);
    const wallVariants: number[] = [];
    for (let d = 0; d < 4; d++) {
      const rots: Rot[] = d ? [['y', 90 * d]] : [];
      BLOCKS[next] = {
        ...std, parts, rots, boxes: [], pick: [rotBox(WALL_TORCH_PICK, rots)],
        hidden: true, base: id, attach: (WALL_TORCH_SIDE + d) % 4, variants: undefined, wallVariants: undefined,
      };
      wallVariants.push(next++);
    }
    std.wallVariants = wallVariants;
  }
  // a később bevezetett alakú blokkok (láda) a végére kerülnek, hogy a korábbi azonosítók (és a mentések) ne csússzanak el
  for (const key of LATE_SHAPES) {
    const b = pack.blocks.find((x) => x.kind === 'shape' && x.name === key && x.parts?.length);
    if (!b || next + 4 > MAX_BLOCK_ID) continue;
    const id = next++;
    BLOCKS[id] = shapeDef(b, 0, 0);
    for (const p of b.parts!) for (const f of Object.values(p.faces)) tex.add(f!.tex);
    KEY_ID.set(b.name, id);
    ids.push(id);
    const variants: number[] = [id];
    for (let v = 1; v < 4; v++) {
      BLOCKS[next] = { ...shapeDef(b, v, 0), hidden: true, base: id };
      variants[v] = next++;
    }
    BLOCKS[id].variants = variants;
  }
  refreshLight();

  extraTextures.length = 0;
  extraTextures.push(...[...tex].filter((t) => pack.textures.includes(t)).sort());
  return ids;
}

/** Az összes ismert, lerakható blokk azonosítója (a kreatív inventoryhoz) */
export function placeableBlocks(): number[] {
  return Object.keys(BLOCKS).map(Number).filter((id) => !BLOCKS[id].hidden).sort((a, b) => a - b);
}

/** Átlátszatlan blokk: eltakarja a mögötte lévő lapokat */
export function isOpaque(id: number): boolean {
  const def = BLOCKS[id];
  // ismeretlen azonosító (pl. másik textúracsomaggal mentett blokk): nem takar el semmit
  return def ? def.opaque !== false : false;
}

/** Szilárd blokk: ütközik vele a játékos, és a sugár megáll rajta (a víz nem az) */
export function isSolid(id: number): boolean {
  return id !== AIR && fluidKind(id) === FLUID_NONE;
}

// ---------- éghetőség ----------

const FLAMMABLE: [RegExp, number][] = [
  [/(^|_)(leaves)$|^vine$|(^|_)(sapling|grass|fern|dead_bush|tulip|poppy|dandelion|allium|orchid|bluet|daisy|mushroom|sugar_cane|seagrass)$/, 0.8],
  [/_wool$|_carpet$|^hay_block$|^dried_kelp_block$/, 0.6],
  [/^bookshelf$/, 0.35],
  [/(oak|spruce|birch|jungle|acacia|dark_oak|crimson|warped|mangrove|cherry|bamboo)_(planks|log|wood|stairs|slab|fence|fence_gate|trapdoor|door|pressure_plate|button)$|^(crafting_table|chest|ladder|lectern|note_block|jukebox|barrel|stripped_.*_log)$/, 0.3],
  [/^coal_block$/, 0.05],
];
const flameCache = new Map<number, number>();
/** Annak az esélye, hogy a blokk elég egy szomszédos tűz egy frissítésekor (0: nem éghető) */
export function flammability(id: number): number {
  let v = flameCache.get(id);
  if (v === undefined) {
    const key = blockKey(id);
    v = 0;
    if (key) for (const [re, f] of FLAMMABLE) if (re.test(key)) { v = f; break; }
    flameCache.set(id, v);
  }
  return v;
}
