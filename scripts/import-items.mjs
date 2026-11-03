#!/usr/bin/env node
// A Good Vibes csomag tárgytextúráinak importja a scripts/item-policy.json "import" listája szerint.
// Használat: node scripts/import-items.mjs <a csomag minecraft/textures/item mappája>
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) { console.error('Használat: node scripts/import-items.mjs <item textúra mappa>'); process.exit(1); }
const policy = JSON.parse(readFileSync(resolve(root, 'scripts/item-policy.json'), 'utf8'));
const dst = resolve(root, 'public/textures/item');
mkdirSync(dst, { recursive: true });
let n = 0;
for (const name of policy.import) {
  const f = resolve(src, `${name}.png`);
  if (!existsSync(f)) { console.warn('hiányzik:', name); continue; }
  copyFileSync(f, resolve(dst, `${name}.png`)); n++;
}
console.log(`${n} tárgytextúra bemásolva`);
