// Használat: npm run blocks -- <textúracsomag.zip>
//
// A csomag blockstates- és models-fájljaiból kiolvassa az összes blokkot, és létrehozza:
//   public/generated/blocks.json   a blokkok listája, lapok textúrái, alakja
//   public/textures/mc/*.png       a blokkok által használt textúrák
// Mindkettő a .gitignore-ban van (a Dokucraft licence miatt nem kerülhet a repóba).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from './lib-zip.mjs';

const zipPath = process.argv[2];
if (!zipPath || !existsSync(zipPath)) {
  console.error('Használat: npm run blocks -- <textúracsomag.zip>');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const zip = readZip(zipPath);
const A = 'assets/minecraft/';

const strip = (s) => s.replace(/^minecraft:/, '');

// ---------- modellek feloldása ----------

/** A modell láncának összefésülése: textúrák, elemek, és a lánc végén lévő beépített (vanilla) szülő */
const modelCache = new Map();
function resolveModel(id) {
  id = strip(id);
  if (modelCache.has(id)) return modelCache.get(id);
  const m = zip.json(`${A}models/${id}.json`);
  let out;
  if (!m) {
    out = { builtin: id, textures: {}, elements: null };
  } else {
    const parent = m.parent ? resolveModel(m.parent) : { builtin: null, textures: {}, elements: null };
    out = {
      builtin: parent.builtin,
      textures: { ...parent.textures, ...(m.textures ?? {}) },
      elements: m.elements ?? parent.elements,
    };
  }
  modelCache.set(id, out);
  return out;
}

/** "#all" -> a végleges textúraazonosító (pl. "block/stone"), vagy null */
function tex(textures, ref, depth = 0) {
  if (!ref || depth > 8) return null;
  if (ref[0] === '#') return tex(textures, textures[ref.slice(1)], depth + 1);
  return strip(ref);
}

const pick = (textures, keys) => {
  for (const k of keys) {
    const t = tex(textures, textures[k]);
    if (t) return t;
  }
  return null;
};

// ---------- egy blokk alapmodelljének kiválasztása ----------

function firstModel(bs) {
  const one = (v) => (Array.isArray(v) ? v[0] : v);
  if (bs.variants) {
    const keys = Object.keys(bs.variants);
    const key = keys.includes('') ? '' : keys[0];
    return one(bs.variants[key])?.model ?? null;
  }
  if (bs.multipart) {
    const part = bs.multipart.find((p) => !p.when) ?? bs.multipart[0];
    return one(part.apply)?.model ?? null;
  }
  return null;
}

const CUBE_PARENTS = /^block\/(cube|cube_all|cube_column|cube_column_horizontal|cube_bottom_top|cube_top|orientable|orientable_with_bottom|cube_mirrored_all|cube_mirrored|leaves|template_single_face|cube_directional)/;

function isFullCube(elements) {
  if (!elements || elements.length !== 1) return false;
  const { from, to } = elements[0];
  return from?.every((v) => v === 0) && to?.every((v) => v === 16);
}

const hasTex = (n) => zip.has(`${A}textures/block/${n}.png`);

/** Kocka a textúrák nevéből: name.png (oldal), name_top.png, name_bottom.png vagy name_side.png */
function textureCube(base) {
  const side = hasTex(base) ? base : hasTex(`${base}_side`) ? `${base}_side` : null;
  const top = hasTex(`${base}_top`) ? `${base}_top` : hasTex(`${base}_end`) ? `${base}_end` : side;
  if (!side || !top) return null;
  const bottom = hasTex(`${base}_bottom`) ? `${base}_bottom` : top === side ? side : top;
  return { top: `block/${top}`, bottom: `block/${bottom}`, side: `block/${side}` };
}

function describe(name, bs) {
  const modelId = firstModel(bs);
  if (!modelId) return null;
  const m = resolveModel(modelId);
  const t = m.textures;
  const tinted = !!m.elements?.some((e) => Object.values(e.faces ?? {}).some((f) => f.tintindex !== undefined));

  const cubeFromTextures = () => ({
    top: pick(t, ['up', 'top', 'end', 'all', 'particle']),
    bottom: pick(t, ['down', 'bottom', 'end', 'all', 'particle']),
    side: pick(t, ['north', 'side', 'front', 'south', 'east', 'west', 'all', 'particle']),
  });

  if (m.builtin && CUBE_PARENTS.test(m.builtin)) {
    const f = cubeFromTextures();
    if (f.top && f.side) return { name, kind: 'cube', ...f, bottom: f.bottom ?? f.side, tinted };
  }
  if (isFullCube(m.elements)) {
    const faces = m.elements[0].faces ?? {};
    const of = (k) => tex(t, faces[k]?.texture);
    const side = of('north') ?? of('east') ?? of('south') ?? of('west');
    const top = of('up'), bottom = of('down');
    if (top && side) return { name, kind: 'cube', top, bottom: bottom ?? side, side, tinted };
  }
  // a csomag nem írja felül a modellt (pl. block/stone): a textúra nevéből találjuk ki a kockát
  if (!m.elements && m.builtin && /^block\/[a-z0-9_]+$/.test(m.builtin)) {
    const c = textureCube(m.builtin.slice('block/'.length));
    if (c) return { name, kind: 'cube', ...c, tinted };
  }
  // nem teljes kocka (lépcső, lap, növény, kerítés ...): az elemeit eltároljuk a későbbi rendereléshez
  const textures = {};
  for (const k of Object.keys(t)) {
    const v = tex(t, t[k]);
    if (v) textures[k] = v;
  }
  return { name, kind: 'shape', model: modelId, builtin: m.builtin ?? null, elements: m.elements ?? null, textures, tinted };
}

// ---------- fő rész ----------

const blocks = [];
const skipped = [];
for (const file of zip.names) {
  const m = file.match(/^assets\/minecraft\/blockstates\/([^/]+)\.json$/);
  if (!m) continue;
  const bs = zip.json(file);
  const d = bs ? describe(m[1], bs) : null;
  if (d) blocks.push(d); else skipped.push(m[1]);
}

// Azok az alap blokkok, amiknek a blockstate-je a Minecraftban van (deszka, ércek, üveg ...):
// a textúrák nevéből találjuk ki őket. Az egyértelműen nem blokk-textúrákat kihagyjuk.
const NOT_A_BLOCK = /(_top|_bottom|_side|_front|_back|_end|_inside|_overlay|_particle|_stage\d*|_double|_underwater|_sign|_hanging_sign|_shelf|_pane|_pane_top|_still|_flow|_lit|_on|_off|_open|_closed|_snow|_0|_1|_2|_3|_4|_5|_6|_7|_8|_9|_dust|_item|_bud)$/;
const have = new Set(blocks.map((b) => b.name));
for (const file of zip.names) {
  const m = file.match(/^assets\/minecraft\/textures\/block\/([a-z0-9_]+)\.png$/);
  if (!m || have.has(m[1]) || NOT_A_BLOCK.test(m[1])) continue;
  const c = textureCube(m[1]);
  if (c) { blocks.push({ name: m[1], kind: 'cube', ...c, tinted: false }); have.add(m[1]); }
}
blocks.sort((a, b) => a.name.localeCompare(b.name));

// a használt textúrák
const used = new Set();
for (const b of blocks) {
  if (b.kind === 'cube') [b.top, b.bottom, b.side].forEach((x) => used.add(x));
  else Object.values(b.textures).forEach((x) => used.add(x));
}

const flat = (id) => id.replace(/\//g, '__');
const outTex = resolve(root, 'public/textures/mc');
const outGen = resolve(root, 'public/generated');
mkdirSync(outTex, { recursive: true });
mkdirSync(outGen, { recursive: true });

const textureKeys = [];
const missing = [];
for (const id of [...used].sort()) {
  const data = zip.read(`${A}textures/${id}.png`);
  if (!data) { missing.push(id); continue; }
  writeFileSync(resolve(outTex, `${flat(id)}.png`), data);
  textureKeys.push(flat(id));
}

// a blokkokban a textúraazonosítókat a kimeneti kulcsokra cseréljük
const key = (id) => (id ? flat(id) : null);
for (const b of blocks) {
  if (b.kind === 'cube') { b.top = key(b.top); b.bottom = key(b.bottom); b.side = key(b.side); }
  else for (const k of Object.keys(b.textures)) b.textures[k] = key(b.textures[k]);
}

writeFileSync(resolve(outGen, 'blocks.json'), JSON.stringify({ textures: textureKeys, blocks }));

const cubes = blocks.filter((b) => b.kind === 'cube').length;
console.log(`${blocks.length} blokk: ${cubes} teljes kocka, ${blocks.length - cubes} egyéb alakú.`);
console.log(`${textureKeys.length} textúra kimásolva ide: public/textures/mc`);
if (missing.length) console.warn(`Hiányzó textúra (${missing.length}): ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' ...' : ''}`);
if (skipped.length) console.warn(`Kihagyott blokk (${skipped.length}): ${skipped.slice(0, 8).join(', ')}${skipped.length > 8 ? ' ...' : ''}`);
