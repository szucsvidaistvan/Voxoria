import { B, BLOCKS, blockId, blockKey } from './blocks';
import { EXTRA_ID, I, toolOf, type ToolType } from './items';

/** Bontási szabály: keménység, a hozzá való szerszám, és a begyűjtéshez kellő minimális szint (0: bármi) */
export interface BreakRule {
  hardness: number;
  tool: ToolType | null;
  tier: number;
}

const baseOf = (id: number) => BLOCKS[id]?.base ?? id;

const INSTANT = /(torch|sapling|^grass$|^short_grass$|^fern$|dead_bush|tulip|poppy|dandelion|allium|orchid|bluet|daisy|mushroom$|sugar_cane|seagrass|^fire$|cobweb|rail$|lever|button|lily_pad|carpet$|^snow$|^tall_grass|_stage\d$)/;
const SOFT = /^(dirt|grass_block|coarse_dirt|podzol|mycelium|farmland|farmland_moist|dirt_path|sand|red_sand|gravel|clay|soul_sand|snow_block|concrete_powder)$|_concrete_powder$/;
const WOOD = /(planks|_log$|_wood$|^stripped_|fence|trapdoor|_door$|^crafting_table$|^bookshelf$|^chest$|^barrel$|^ladder$|^note_block$|^jukebox$)|^(oak|spruce|birch|jungle|acacia|dark_oak)_(stairs|slab|pressure_plate)$/;

export function breakRule(id: number): BreakRule {
  const key = blockKey(id);
  if (key === 'bedrock') return { hardness: Infinity, tool: null, tier: 0 };
  if (key === 'obsidian') return { hardness: 50, tool: 'pickaxe', tier: 4 };
  if (INSTANT.test(key)) return { hardness: 0, tool: null, tier: 0 };
  if (/_ore$/.test(key)) {
    const tier = /(coal|quartz)/.test(key) ? 1 : /(iron|lapis|copper)/.test(key) ? 2 : 3;
    return { hardness: 3, tool: 'pickaxe', tier };
  }
  const metal = /^(iron|gold|diamond|emerald|lapis|redstone|coal)_block$/.exec(key);
  if (metal) {
    const tier = metal[1] === 'iron' || metal[1] === 'lapis' ? 2 : metal[1] === 'coal' || metal[1] === 'redstone' ? 1 : 3;
    return { hardness: metal[1] === 'gold' ? 3 : 5, tool: 'pickaxe', tier };
  }
  if (SOFT.test(key)) return { hardness: /^(gravel|clay|grass_block)$/.test(key) ? 0.6 : 0.5, tool: 'shovel', tier: 0 };
  if (WOOD.test(key)) return { hardness: key === 'bookshelf' ? 1.5 : 2, tool: 'axe', tier: 0 };
  if (/leaves$/.test(key)) return { hardness: 0.2, tool: null, tier: 0 };
  if (/glass|ice$/.test(key)) return { hardness: 0.3, tool: null, tier: 0 };
  if (/wool$|^hay_block$/.test(key)) return { hardness: 0.8, tool: null, tier: 0 };
  if (/stone|cobble|brick|stairs|slab|wall|terracotta|concrete|andesite|diorite|granite|quartz|magma|basalt|deepslate|tuff|blackstone|furnace|lantern|iron_bars/.test(key)) {
    return { hardness: 1.5, tool: 'pickaxe', tier: 1 };
  }
  return { hardness: 1, tool: null, tier: 0 };
}

/** Meddig tart a blokk bontása a kézben tartott dologgal (másodperc). Infinity: nem bontható.
 * @param underLog fa gyökerei alatt van-e (közvetlenül fölötte rönk): ott a föld kézzel sokkal nehezebben jön ki */
/** Globális szorzó: a túlélő világ nem könnyű, minden blokk kiütése tovább tart */
export const MINING_SCALE = 1.5;

export function breakTime(id: number, held: number | undefined, underLog = false): number {
  const r = breakRule(id);
  if (!isFinite(r.hardness)) return Infinity;
  if (r.hardness <= 0) return 0;
  const tool = toolOf(held);
  const matches = !!r.tool && !!tool && tool.type === r.tool;
  const speed = matches ? tool!.speed : 1;
  const can = !r.tool || r.tier === 0 || (matches && tool!.tier >= r.tier);
  let t = (r.hardness * (can ? 1.5 : 5) * MINING_SCALE) / speed;
  const key = blockKey(id);
  // a fát kézzel (vagy nem baltával) is ki lehet ütni, de sokkal tovább tart
  if (/(_log|_wood)$/.test(key) && !(matches && tool!.type === 'axe')) t *= 2.5;
  // a fa gyökerei közt a talajt kézzel (ásó nélkül) nehéz kiszedni
  if (underLog && SOFT.test(key) && !(matches && tool!.type === 'shovel')) t *= 3;
  return t;
}

/** Mit ad a blokk, ha a kézben lévő dologgal bontják? null: semmit. */
export function dropFor(id: number, held: number | undefined, rand: () => number = Math.random): { id: number; n: number } | null {
  const base = baseOf(id);
  const r = breakRule(base);
  if (!isFinite(r.hardness)) return null;
  const tool = toolOf(held);
  const matches = !!r.tool && !!tool && tool.type === r.tool;
  if (r.tool && r.tier > 0 && !(matches && tool!.tier >= r.tier)) return null;

  const key = blockKey(base);
  switch (key) {
    case 'stone': return { id: B.COBBLE, n: 1 };
    case 'grass_block': return { id: B.DIRT, n: 1 };
    case 'coal_ore': return { id: I.COAL, n: 1 };
    case 'diamond_ore': return { id: I.DIAMOND, n: 1 };
    case 'gravel': return rand() < 0.1 ? { id: I.FLINT, n: 1 } : { id: base, n: 1 };
    case 'lapis_ore': return { id: EXTRA_ID['lapis_lazuli'], n: 4 + Math.floor(rand() * 5) };
    case 'emerald_ore': return { id: EXTRA_ID['emerald'], n: 1 };
    case 'sugar_cane': return { id: EXTRA_ID['sugar_cane'], n: 1 };
    case 'clay': return { id: EXTRA_ID['clay_ball'], n: 4 };
    case 'snow': return { id: EXTRA_ID['snowball'], n: 1 };
    case 'snow_block': return { id: EXTRA_ID['snowball'], n: 4 };
    case 'cobweb': return { id: EXTRA_ID['string'], n: 1 };
    case 'seagrass': {
      // átmenetileg: a tengeri fűből néha hal kerül elő (amíg nincs horgászat)
      const q = rand();
      if (q < 0.03) return { id: EXTRA_ID['cod'], n: 1 };
      if (q < 0.05) return { id: EXTRA_ID['salmon'], n: 1 };
      return { id: base, n: 1 };
    }
    case 'farmland': case 'farmland_moist': case 'dirt_path': return { id: B.DIRT, n: 1 };
    case 'fire': case 'bedrock': return null;
    default:
  }
  if (/leaves$/.test(key)) {
    // minden fafajta a saját csemetéjét adja (a tölgyé az alap, ha a fajtának nincs külön)
    const wood = key.replace(/_leaves$/, '');
    const sapling = blockId(`${wood}_sapling`) ?? blockId('oak_sapling');
    if (sapling !== undefined && rand() < 0.06) return { id: sapling, n: 1 };
    if (/^(oak|dark_oak)$/.test(wood) && rand() < 0.02) return { id: I.APPLE, n: 1 };
    if (wood === 'jungle' && rand() < 0.03) return { id: EXTRA_ID['cocoa_beans'], n: 1 };
    return null;
  }
  if (/^(ice)$/.test(key)) return null;
  if (/glass/.test(key) && !/pane$/.test(key)) return null;
  // fű és páfrány: néha búzamag
  if (/^(short_grass|grass|fern|tall_grass)$/.test(key)) {
    // csak búzamag (12,5%); a többi növény máshonnan jön: vad murok/krumpli/cékla a világban, zombik, kakaó a dzsungelfákon
    return rand() < 0.125 && EXTRA_ID['wheat_seeds'] !== undefined ? { id: EXTRA_ID['wheat_seeds'], n: 1 } : null;
  }
  // kakaóhüvely: éretten 2–3 babot ad, éretlenül egyet
  const cocoa = /^cocoa_stage(\d)$/.exec(key);
  if (cocoa && EXTRA_ID['cocoa_beans'] !== undefined) return { id: EXTRA_ID['cocoa_beans'], n: cocoa[1] === '2' ? 2 + Math.floor(rand() * 2) : 1 };
  const crop = /^(wheat|carrots|potatoes|beetroots)_stage(\d)$/.exec(key);
  if (crop) {
    const ripe = Number(crop[2]) === (crop[1] === 'wheat' ? 7 : 3);
    const seed = EXTRA_ID[crop[1] === 'wheat' ? 'wheat_seeds' : crop[1] === 'beetroots' ? 'beetroot_seeds' : crop[1] === 'carrots' ? 'carrot' : 'potato'];
    if (crop[1] === 'carrots' || crop[1] === 'potatoes') return { id: seed, n: ripe ? 1 + Math.floor(rand() * 4) : 1 };
    if (!ripe) return { id: seed, n: 1 };
    return { id: EXTRA_ID[crop[1] === 'wheat' ? 'wheat' : 'beetroot'], n: 1 };
  }
  // a dinnye szeleteket ad (3-7), nem egész blokkot
  if (key === 'melon') {
    const slice = EXTRA_ID['melon_slice'];
    if (slice !== undefined) return { id: slice, n: 3 + Math.floor(rand() * 5) };
  }
  return { id: base, n: 1 };
}


/** Érett búza és cékla: a mag is jár mellé (1-3 darab) */
export function bonusDrop(id: number, rand: () => number = Math.random): { id: number; n: number } | null {
  const crop = /^(wheat|beetroots)_stage(\d)$/.exec(blockKey(baseOf(id)));
  if (!crop || Number(crop[2]) !== (crop[1] === 'wheat' ? 7 : 3)) return null;
  const seed = EXTRA_ID[crop[1] === 'wheat' ? 'wheat_seeds' : 'beetroot_seeds'];
  return seed === undefined ? null : { id: seed, n: 1 + Math.floor(rand() * 3) };
}
