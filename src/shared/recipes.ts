import { B, blockId, blockKey } from './blocks';
import { I, TOOL_ID, type ToolType } from './items';

export interface Stack {
  id: number;
  n: number;
  /** eszköz kopása: ennyi használat már elfogyott belőle (nincs megadva: új) */
  d?: number;
}

/** Egy összetevő: konkrét azonosító, vagy címke ('planks', 'log') */
type Ing = number | string;

interface Recipe {
  /** alakhoz kötött recept: a sorok, a betűk a keys-ben vannak, a szóköz üres hely */
  shape?: string[];
  keys?: Record<string, Ing>;
  /** alak nélküli recept */
  shapeless?: Ing[];
  /** az eredmény; függvény, ha az összetevőktől függ (pl. a fa fajtája) */
  out: Stack | ((ids: number[]) => Stack | null);
}

const TAGS: Record<string, (id: number) => boolean> = {
  planks: (id) => blockKey(id).endsWith('_planks'),
  log: (id) => /(_log|_wood)$/.test(blockKey(id)),
  coal: (id) => id === I.COAL || id === I.CHARCOAL,
  wool: (id) => /_wool$/.test(blockKey(id)),
};
const matches = (ing: Ing, id: number) => (typeof ing === 'number' ? ing === id : !!TAGS[ing]?.(id));

let recipes: Recipe[] = [];

/** A receptek összeállítása. A generált blokkok regisztrálása UTÁN kell hívni. */
export function initRecipes(): void {
  recipes = [];
  const add = (r: Recipe) => recipes.push(r);
  const blk = (key: string, n: number): Stack | null => {
    const id = blockId(key);
    return id === undefined ? null : { id, n };
  };
  const addIf = (r: Omit<Recipe, 'out'>, out: Stack | null) => { if (out) add({ ...r, out }); };

  // fa: a rönk fajtájának megfelelő deszka
  add({
    shapeless: ['log'],
    out: ([id]) => {
      const wood = blockKey(id).replace(/(_log|_wood)$/, '').replace(/^stripped_/, '');
      const planks = blockId(`${wood}_planks`);
      return { id: planks ?? B.PLANKS, n: 4 };
    },
  });
  add({ shape: ['P', 'P'], keys: { P: 'planks' }, out: { id: I.STICK, n: 4 } });
  addIf({ shape: ['C', 'S'], keys: { C: 'coal', S: I.STICK } }, blk('torch', 4));
  addIf({ shape: ['S S', 'SSS', 'S S'], keys: { S: I.STICK } }, blk('ladder', 3));
  addIf({ shape: ['CCC', 'C C', 'CCC'], keys: { C: B.COBBLE } }, blk('furnace', 1));
  // a fa fajtájától függő eredmények: a deszka fajtájának megfelelő kerítés, lap, lépcső, csapóajtó
  const woodOut = (suffix: string, n: number) => ([id]: number[]): Stack | null => {
    const wood = blockKey(id).replace(/_planks$/, '');
    const out = blockId(`${wood}_${suffix}`) ?? blockId(`oak_${suffix}`);
    return out === undefined ? null : { id: out, n };
  };
  add({ shape: ['PSP', 'PSP'], keys: { P: 'planks', S: I.STICK }, out: woodOut('fence', 3) });
  add({ shape: ['PPP'], keys: { P: 'planks' }, out: woodOut('slab', 6) });
  add({ shape: ['P  ', 'PP ', 'PPP'], keys: { P: 'planks' }, out: woodOut('stairs', 4) });
  add({ shape: ['PPP', 'PPP'], keys: { P: 'planks' }, out: woodOut('trapdoor', 2) });
  add({ shape: ['PP', 'PP'], keys: { P: 'planks' }, out: { id: B.CRAFTING_TABLE, n: 1 } });
  // ajtó: 2x3 deszka, a deszka fajtájának megfelelő ajtó (3 darab)
  add({
    shape: ['PP', 'PP', 'PP'], keys: { P: 'planks' },
    out: ([id]) => {
      const door = blockId(`${blockKey(id).replace(/_planks$/, '')}_door`) ?? blockId('oak_door');
      return door === undefined ? null : { id: door, n: 3 };
    },
  });
  addIf({ shape: ['II', 'II', 'II'], keys: { I: I.IRON_INGOT } }, blk('iron_door', 3));
  addIf({ shape: ['CCC'], keys: { C: B.COBBLE } }, blk('cobblestone_slab', 6));
  addIf({ shape: ['C  ', 'CC ', 'CCC'], keys: { C: B.COBBLE } }, blk('cobblestone_stairs', 4));
  addIf({ shape: ['CCC', 'CCC'], keys: { C: B.COBBLE } }, blk('cobblestone_wall', 6));
  addIf({ shape: ['SSS'], keys: { S: B.STONE } }, blk('stone_slab', 6));
  addIf({ shape: ['S  ', 'SS ', 'SSS'], keys: { S: B.STONE } }, blk('stone_stairs', 4));
  addIf({ shape: ['SS', 'SS'], keys: { S: B.STONE } }, blk('stone_bricks', 4));
  add({ shape: ['SS', 'SS'], keys: { S: B.SAND }, out: { id: B.SANDSTONE, n: 1 } });

  // kő-féle blokkcsaládok: lap (3 -> 6), lépcső (6 -> 4), fal (6 -> 6), ha a csomagban van
  const families = [
    'stone_brick', 'mossy_stone_brick', 'sandstone', 'red_sandstone', 'cut_sandstone', 'cut_red_sandstone', 'brick',
    'andesite', 'diorite', 'granite', 'polished_andesite', 'polished_diorite', 'polished_granite',
    'quartz', 'smooth_quartz', 'mossy_cobblestone',
  ];
  for (const f of families) {
    const base = blockId(f) ?? blockId(`${f}s`) ?? blockId(`${f}_block`);
    if (base === undefined) continue;
    addIf({ shape: ['BBB'], keys: { B: base } }, blk(`${f}_slab`, 6));
    addIf({ shape: ['B  ', 'BB ', 'BBB'], keys: { B: base } }, blk(`${f}_stairs`, 4));
    addIf({ shape: ['BBB', 'BBB'], keys: { B: base } }, blk(`${f}_wall`, 6));
  }
  // csiszolt kövek: 4 -> 4
  for (const k of ['andesite', 'diorite', 'granite']) {
    const b = blockId(k), o = blk(`polished_${k}`, 4);
    if (b !== undefined && o) add({ shape: ['BB', 'BB'], keys: { B: b }, out: o });
  }
  // ásványblokkok és vissza: 9 -> blokk, blokk -> 9
  const ores: [string, number][] = [['iron_block', I.IRON_INGOT], ['gold_block', I.GOLD_INGOT], ['diamond_block', I.DIAMOND], ['coal_block', I.COAL]];
  for (const [key, item] of ores) {
    const bid = blockId(key);
    if (bid === undefined) continue;
    add({ shape: ['III', 'III', 'III'], keys: { I: item }, out: { id: bid, n: 1 } });
    add({ shapeless: [bid], out: { id: item, n: 9 } });
  }
  // üveg, üvegtábla, vasrács
  const glass = blockId('glass');
  if (glass !== undefined) addIf({ shape: ['GGG', 'GGG'], keys: { G: glass } }, blk('glass_pane', 16));
  addIf({ shape: ['III', 'III'], keys: { I: I.IRON_INGOT } }, blk('iron_bars', 16));
  // szőnyeg: 2 gyapjú -> 3 szőnyeg (a gyapjú színével)
  add({
    shape: ['WW'], keys: { W: 'wool' },
    out: ([id]) => { const c = blockId(blockKey(id).replace(/_wool$/, '_carpet')); return c === undefined ? null : { id: c, n: 3 }; },
  });

  add({ shape: ['I I', ' I '], keys: { I: I.IRON_INGOT }, out: { id: I.BUCKET, n: 1 } });
  add({ shapeless: [I.IRON_INGOT, I.FLINT], out: { id: I.FLINT_AND_STEEL, n: 1 } });

  // eszközök
  const mats: [string, Ing][] = [['wooden', 'planks'], ['stone', B.COBBLE], ['iron', I.IRON_INGOT], ['golden', I.GOLD_INGOT], ['diamond', I.DIAMOND]];
  const shapes: Record<ToolType, string[]> = {
    pickaxe: ['MMM', ' S ', ' S '], axe: ['MM', 'MS', ' S'], shovel: ['M', 'S', 'S'], sword: ['M', 'M', 'S'],
  };
  for (const [m, ing] of mats) {
    for (const type of Object.keys(shapes) as ToolType[]) {
      add({ shape: shapes[type], keys: { M: ing, S: I.STICK }, out: { id: TOOL_ID[m][type], n: 1 } });
    }
  }
}

type Grid = (Stack | null)[];

function matchShaped(grid: Grid, w: number, h: number, r: Recipe): boolean {
  // a rács tartalmának befoglaló téglalapja
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (grid[y * w + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) return false;
  const gw = x1 - x0 + 1, gh = y1 - y0 + 1;
  const rows = r.shape!;
  const rw = Math.max(...rows.map((s) => s.length)), rh = rows.length;
  if (gw !== rw || gh !== rh) return false;
  const test = (mirror: boolean) => {
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const ch = rows[y][mirror ? rw - 1 - x : x] ?? ' ';
      const cell = grid[(y0 + y) * w + x0 + x];
      if (ch === ' ') { if (cell) return false; } else if (!cell || !matches(r.keys![ch], cell.id)) return false;
    }
    return true;
  };
  return test(false) || test(true);
}

function matchShapeless(ids: number[], r: Recipe): boolean {
  const need = r.shapeless!;
  if (need.length !== ids.length) return false;
  const used = new Array(ids.length).fill(false);
  const go = (i: number): boolean => {
    if (i === need.length) return true;
    for (let k = 0; k < ids.length; k++) {
      if (!used[k] && matches(need[i], ids[k])) {
        used[k] = true;
        if (go(i + 1)) return true;
        used[k] = false;
      }
    }
    return false;
  };
  return go(0);
}

/** A rácsban lévő dolgokból készíthető tárgy (w x h méretű rács, soronként), vagy null */
export function matchRecipe(grid: Grid, w: number, h: number): Stack | null {
  const ids = grid.filter((s): s is Stack => !!s).map((s) => s.id);
  if (!ids.length) return null;
  for (const r of recipes) {
    const ok = r.shape ? matchShaped(grid, w, h, r) : matchShapeless(ids, r);
    if (!ok) continue;
    const out = typeof r.out === 'function' ? r.out(ids) : r.out;
    if (out) return { ...out };
  }
  return null;
}
