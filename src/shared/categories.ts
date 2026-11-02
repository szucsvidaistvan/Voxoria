import { B, BLOCKS, blockKey } from './blocks';
import { ITEMS, isItem } from './items';

/** A kreatív blokkválasztó csoportjai (a sorrend a megjelenítés sorrendje) */
export interface Category {
  id: string;
  name: string;
}

export const CATEGORIES: Category[] = [
  { id: 'building', name: 'Building Blocks' },
  { id: 'natural', name: 'Natural Blocks' },
  { id: 'stairs', name: 'Stairs, Slabs & Walls' },
  { id: 'doors', name: 'Doors, Fences & Ladders' },
  { id: 'plants', name: 'Plants' },
  { id: 'decor', name: 'Decoration' },
  { id: 'functional', name: 'Functional' },
  { id: 'fluids', name: 'Fluids & Fire' },
  { id: 'tools', name: 'Tools' },
  { id: 'materials', name: 'Materials & Food' },
];

const NATURAL = /^(grass_block|dirt|coarse_dirt|podzol|mycelium|dirt_path|farmland|sand|red_sand|gravel|clay|snow|snow_block|ice|packed_ice|blue_ice|frosted_ice|bedrock|obsidian|netherrack|soul_sand|magma|end_stone|stone|andesite|diorite|granite|tuff|deepslate|basalt|calcite|sponge|mud|moss_block|cobweb)$|_ore$|_log$|_wood$|^stripped_|leaves$/;
const PLANTS = /(sapling|tulip|poppy|dandelion|allium|orchid|bluet|daisy|mushroom$|^short_grass$|^fern$|dead_bush|sugar_cane|seagrass|lily_pad|^vine$|^cactus$|bush|flower)/;
const DOORS = /(_door$|_trapdoor$|_fence$|_fence_gate$|^ladder$)/;
const DECOR = /(_wool$|_carpet$|glass|_pane$|^iron_bars$|lantern|banner|^flower_pot$|_terracotta$|_concrete$)/;
const FUNCTIONAL = /^(crafting_table|furnace|blast_furnace|smoker|tnt|jukebox|note_block|enchanting_table|daylight_detector|bookshelf|cake|torch|redstone_torch|observer|lodestone|.*rail)$/;

/** A blokk vagy tárgy csoportja a kreatív blokkválasztóban */
export function categoryOf(id: number): string {
  if (isItem(id)) return ITEMS[id]?.tool ? 'tools' : 'materials';
  if (id === B.WATER || id === B.LAVA || id === B.FIRE) return 'fluids';
  const key = BLOCKS[id]?.key ?? blockKey(id);
  if (/_(stairs|slab|wall)$/.test(key)) return 'stairs';
  if (DOORS.test(key)) return 'doors';
  if (PLANTS.test(key)) return 'plants';
  if (FUNCTIONAL.test(key)) return 'functional';
  if (DECOR.test(key)) return 'decor';
  if (NATURAL.test(key)) return 'natural';
  return 'building';
}
