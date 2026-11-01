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
  const name = b.name.replace(/_/g, ' ');
  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    key: b.name,
    top, bottom, side,
    opaque: false,
    parts, rots, tintColor,
    tint: tintColor ? { top: tintColor, bottom: tintColor, side: tintColor } : undefined,
    boxes: NO_COLLIDE.test(b.name) ? [] : boxes,
    pick,
  };
}

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
    const leafy = LEAF_LIKE.test(b.name);
    BLOCKS[next] = {
      name: name.charAt(0).toUpperCase() + name.slice(1),
      key: b.name,
      top: b.top!,
      bottom: b.bottom!,
      side: b.side!,
      opaque: !SEE_THROUGH.test(b.name),
      tint: leafy
        ? { top: LEAF_TINT, bottom: LEAF_TINT, side: LEAF_TINT }
        : b.tinted ? { top: GRASS_TINT } : undefined,
    };
    tex.add(b.top!); tex.add(b.bottom!); tex.add(b.side!);
    ids.push(next++);
  }

  // nem kocka alakú blokkok: előbb az alapállapotok (névsorban), utána az elforgatott változatok,
  // így a kockák és az alap alakú blokkok azonosítói stabilak maradnak
  const shapes = pack.blocks
    .filter((b) => b.kind === 'shape' && b.parts?.length && !BASE_KEYS.has(b.name) && !SHAPE_SKIP.test(b.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const baseIds: number[] = [];
  const kept: GeneratedBlock[] = [];
  for (const b of shapes) {
    if (next > MAX_BLOCK_ID - 8) break;
    BLOCKS[next] = shapeDef(b, 0, 0);
    for (const p of b.parts!) for (const f of Object.values(p.faces)) tex.add(f!.tex);
    baseIds.push(next);
    kept.push(b);
    ids.push(next++);
  }
  baseIds.forEach((id, i) => {
    const b = kept[i];
    const n = FLIPPABLE.test(b.name) ? 8 : 4;
    const variants: number[] = new Array(n);
    variants[0] = id;
    for (let v = 1; v < n; v++) {
      if (next > MAX_BLOCK_ID) break;
      BLOCKS[next] = { ...shapeDef(b, v % 4, v >> 2), hidden: true };
      variants[v] = next++;
    }
    BLOCKS[id].variants = variants;
  });

  extraTextures.length = 0;
  extraTextures.push(...[...tex].filter((t) => pack.textures.includes(t)).sort());
  return ids;
}

/** Az összes ismert blokk azonosítója, a levegő és a folyadékok nélkül (a kreatív inventoryhoz) */
export function placeableBlocks(): number[] {
  return Object.keys(BLOCKS).map(Number).filter((id) => id !== B.WATER && !BLOCKS[id].hidden).sort((a, b) => a - b);
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
