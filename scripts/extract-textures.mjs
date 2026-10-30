// Használat: npm run textures -- <textúracsomag.zip>
// A zipből csak a játékhoz szükséges blokk-textúrákat másolja a public/textures mappába.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

// játékbeli név -> útvonal a csomagban (assets/minecraft/textures/ alatt)
const MAP = {
  grass_top: 'block/grass_block_top.png',
  grass_side: 'block/grass_block_side.png',
  dirt: 'block/dirt.png',
  stone: 'block/stone.png',
  sand: 'block/sand.png',
  log_side: 'block/oak_log.png',
  log_top: 'block/oak_log_top.png',
  planks: 'block/oak_planks.png',
  leaves: 'block/leaves/oak_leaves.png',
  cobblestone: 'block/cobblestone.png',
};

const zipPath = process.argv[2];
if (!zipPath || !existsSync(zipPath)) {
  console.error('Használat: npm run textures -- <textúracsomag.zip>');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/textures');
mkdirSync(outDir, { recursive: true });

const prefix = 'assets/minecraft/textures/';
const wanted = new Set(Object.values(MAP).map((p) => prefix + p));
const files = unzipSync(new Uint8Array(readFileSync(zipPath)), {
  filter: (f) => wanted.has(f.name),
});

let ok = 0;
for (const [name, path] of Object.entries(MAP)) {
  const data = files[prefix + path];
  if (!data) {
    console.warn(`Hiányzik: ${path}`);
    continue;
  }
  writeFileSync(resolve(outDir, `${name}.png`), data);
  ok++;
}
console.log(`${ok}/${Object.keys(MAP).length} textúra kimásolva ide: public/textures`);
