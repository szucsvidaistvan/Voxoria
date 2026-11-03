#!/usr/bin/env node
// A tartalmi szabályok (scripts/content-policy.json) alkalmazása a kész blokklistára:
//   - kiszűri a tiltott blokkokat a public/generated/blocks.json fájlból,
//   - törli a már csak általuk használt textúrákat a public/textures/mc mappából.
// Használat: node scripts/apply-content-policy.mjs [--dry]   (--dry: csak kiírja, mit törölne)
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dry = process.argv.includes('--dry');

/** A szabályok betöltése: [{ id, why, re }] */
export function loadPolicy() {
  const p = JSON.parse(readFileSync(resolve(root, 'scripts/content-policy.json'), 'utf8'));
  return p.remove.map((r) => ({ ...r, re: new RegExp(r.pattern) }));
}
/** Melyik szabály tiltja a blokkot (név szerint)? null: megtartjuk. */
export const ruleFor = (rules, name) => rules.find((r) => r.re.test(name)) ?? null;

/** A blokkok textúráinak halmaza */
export function usedTextures(blocks) {
  const used = new Set();
  for (const b of blocks) {
    if (b.kind === 'cube') [b.top, b.bottom, b.side].forEach((x) => x && used.add(x));
    else for (const part of b.parts ?? []) for (const f of Object.values(part.faces)) used.add(f.tex);
    if (b.door) { used.add(b.door.bottom); used.add(b.door.top); }
  }
  return used;
}

/** Szűrés a memóriában: visszaadja a megtartott blokkokat és a törölteket szabályonként */
export function applyPolicy(blocks) {
  const rules = loadPolicy();
  const keep = [], removed = new Map();
  for (const b of blocks) {
    const r = ruleFor(rules, b.name);
    if (!r) { keep.push(b); continue; }
    if (!removed.has(r.id)) removed.set(r.id, []);
    removed.get(r.id).push(b.name);
  }
  return { keep, removed, rules };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = resolve(root, 'public/generated/blocks.json');
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const { keep, removed, rules } = applyPolicy(data.blocks);
  let n = 0;
  for (const r of rules) {
    const list = removed.get(r.id) ?? [];
    n += list.length;
    console.log(`[${r.id}] ${list.length} blokk: ${list.join(', ')}`);
  }
  const used = usedTextures(keep);
  const dir = resolve(root, 'public/textures/mc');
  const unused = readdirSync(dir).filter((f) => f.endsWith('.png') && !used.has(f.slice(0, -4)));
  console.log(`\nÖsszesen ${n} blokk esik ki (${data.blocks.length} -> ${keep.length}), ${unused.length} textúra törlendő.`);
  if (!dry) {
    for (const f of unused) unlinkSync(resolve(dir, f));
    writeFileSync(file, JSON.stringify({ textures: data.textures.filter((t) => used.has(t)), blocks: keep }));
    console.log('Kész: blocks.json és a textúrák frissítve.');
  } else console.log('(--dry: semmi sem változott)');
}
