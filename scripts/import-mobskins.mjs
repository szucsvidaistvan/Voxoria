#!/usr/bin/env node
// A Good Vibes csomag állat-skinjeinek importja (public/textures/entity). CC BY 4.0, lásd CREDITS-GoodVibes.txt.
// Használat: node scripts/import-mobskins.mjs <a csomag minecraft/textures/entity mappája>
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) { console.error('Használat: node scripts/import-mobskins.mjs <entity textúra mappa>'); process.exit(1); }
const dst = resolve(root, 'public/textures/entity');
mkdirSync(dst, { recursive: true });
// [célnév, forrás a csomagban]
const MAP = [
  ...['brown', 'white', 'black', 'gold', 'salt', 'white_splotched', 'toast'].map((c) => [`rabbit_${c}`, `rabbit/${c}.png`]),
  ...['ocelot', 'black', 'red', 'siamese'].map((c) => [`cat_${c}`, `cat/${c}.png`]),
  ...['blue', 'green', 'grey', 'red_blue', 'yellow_blue'].map((c) => [`parrot_${c}`, `parrot/parrot_${c}.png`]),
  ...['brown', 'gray', 'white'].map((c) => [`llama_${c}`, `llama/${c}.png`]),
  ...['black', 'brown', 'chestnut', 'creamy', 'darkbrown', 'gray', 'white'].map((c) => [`horse_${c}`, `horse/horse_${c}.png`]),
  ['donkey', 'horse/donkey.png'], ['mule', 'horse/mule.png'], ['turtle', 'turtle/big_sea_turtle.png'], ['bat', 'bat.png'], ['squid', 'squid.png'],
  ['fish_cod', 'fish/cod.png'], ['fish_salmon', 'fish/salmon.png'], ['fish_puffer', 'fish/pufferfish.png'],
];
let n = 0;
for (const [to, from] of MAP) {
  const f = resolve(src, from);
  if (!existsSync(f)) { console.warn('hiányzik:', from); continue; }
  copyFileSync(f, resolve(dst, `${to}.png`)); n++;
}
console.log(`${n} skin bemásolva`);
