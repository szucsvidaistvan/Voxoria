// Használat: npm run textures -- <textúracsomag.zip>
// A zipből csak a játékhoz szükséges blokk-textúrákat másolja a public/textures mappába.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from './lib-zip.mjs';
import { packRoot } from './lib-pack.mjs';

// játékbeli név -> útvonal a csomagban (a textures/ mappa alatt); több lehetséges útvonal is megadható
const MAP = {
  grass_top: 'block/grass_block_top.png',
  grass_side: 'block/grass_block_side.png',
  dirt: 'block/dirt.png',
  stone: 'block/stone.png',
  sand: 'block/sand.png',
  log_side: 'block/oak_log.png',
  log_top: 'block/oak_log_top.png',
  planks: 'block/oak_planks.png',
  leaves: ['block/leaves/oak_leaves.png', 'block/oak_leaves.png'],
  cobblestone: 'block/cobblestone.png',
  water: 'block/water_still.png',
  bedrock: 'block/bedrock.png',
  gravel: 'block/gravel.png',
  sandstone: 'block/sandstone.png',
  sandstone_top: 'block/sandstone_top.png',
  sandstone_bottom: 'block/sandstone_bottom.png',
  coal_ore: 'block/coal_ore.png',
  iron_ore: 'block/iron_ore.png',
  gold_ore: 'block/gold_ore.png',
  diamond_ore: 'block/diamond_ore.png',
  obsidian: 'block/obsidian.png',
  lava: 'block/lava_still.png',
  fire: ['block/fire_0.png', 'block/fire_layer_0.png'],
  crafting_table_top: 'block/crafting_table_top.png',
  crafting_table_side: 'block/crafting_table_side.png',
};

// elemek (eszközök, vödör ...): a textures/item mappából a public/textures/item mappába
const MATERIALS = ['wooden', 'stone', 'iron', 'golden', 'diamond'];
const TOOLS = ['pickaxe', 'axe', 'shovel', 'sword'];
const ITEM_TEXTURES = [
  'stick', 'coal', 'diamond', 'iron_ingot', 'gold_ingot', 'flint', 'apple', 'bucket', 'water_bucket', 'lava_bucket', 'flint_and_steel',
  ...MATERIALS.flatMap((m) => TOOLS.map((t) => `${m}_${t}`)),
];

const zipPath = process.argv[2];
if (!zipPath || !existsSync(zipPath)) {
  console.error('Használat: npm run textures -- <textúracsomag.zip>');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/textures');
mkdirSync(outDir, { recursive: true });

const zip = readZip(zipPath);
const prefix = `${packRoot(zip)}textures/`;

let ok = 0;
for (const [name, paths] of Object.entries(MAP)) {
  const candidates = Array.isArray(paths) ? paths : [paths];
  const found = candidates.find((p) => zip.has(prefix + p));
  const data = found ? zip.read(prefix + found) : null;
  if (!data) {
    console.warn(`Hiányzik: ${candidates[0]}`);
    continue;
  }
  writeFileSync(resolve(outDir, `${name}.png`), data);
  ok++;
}
const itemDir = resolve(outDir, 'item');
mkdirSync(itemDir, { recursive: true });
let itemsOk = 0;
for (const name of ITEM_TEXTURES) {
  const data = zip.has(`${prefix}item/${name}.png`) ? zip.read(`${prefix}item/${name}.png`) : null;
  if (!data) { console.warn(`Hiányzik az elem textúra: item/${name}.png`); continue; }
  writeFileSync(resolve(itemDir, `${name}.png`), data);
  itemsOk++;
}
console.log(`${itemsOk}/${ITEM_TEXTURES.length} elem textúra kimásolva ide: public/textures/item`);
console.log(`${ok}/${Object.keys(MAP).length} textúra kimásolva ide: public/textures`);
