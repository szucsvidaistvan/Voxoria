// Használat: npm run blocks -- <textúracsomag.zip> [--shapes]
//
// A csomag blockstates- és models-fájljaiból kiolvassa az összes blokkot, és létrehozza:
//   public/generated/blocks.json   a blokkok listája, lapok textúrái, alakja
//   public/textures/mc/*.png       a blokkok által használt textúrák
// Mindkettő a .gitignore-ban van (a Dokucraft licence miatt nem kerülhet a repóba).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from './lib-zip.mjs';

const WITH_SHAPES = process.argv.includes('--shapes');
const zipPath = process.argv.slice(2).find((a) => !a.startsWith('--'));
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

/** Kocka a textúrák nevéből: name.png (oldal), name_side(s), name_top / name_end(s), name_bottom, name_front */
function textureCube(base) {
  const first = (...c) => c.find(hasTex) ?? null;
  const side = first(base, `${base}_side`, `${base}_sides`, `${base}_front`);
  const top = first(`${base}_top`, `${base}_end`, `${base}_ends`) ?? side;
  if (!side || !top) return null;
  const bottom = first(`${base}_bottom`) ?? (top === side ? side : top);
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
const NOT_A_BLOCK = /(_inside|_overlay|_particle|_stage\d*|_double|_underwater|_sign|_hanging_sign|_shelf|_pane|_still|_flow|_lit|_on|_off|_open|_closed|_snow|_0|_1|_2|_3|_4|_5|_6|_7|_8|_9|_dust|_item|_bud|_powered)$/;
const FACE_SUFFIX = /_(top|bottom|side|sides|end|ends|front|back)$/;
// csak a már felismert kockák számítanak: ha a blockstate "egyéb alakúnak" látszott, de a textúrái
// alapján kockának vehető (pl. kaktusz, mélykő), akkor az egyéb alakú bejegyzést lecseréljük
const have = new Set(blocks.filter((b) => b.kind === 'cube').map((b) => b.name));
const addCube = (name, c, tinted = false) => {
  if (have.has(name)) return;
  const old = blocks.findIndex((b) => b.name === name);
  if (old >= 0) blocks.splice(old, 1);
  blocks.push({ name, kind: 'cube', ...c, tinted });
  have.add(name);
};
for (const file of zip.names) {
  const m = file.match(/^assets\/minecraft\/textures\/block\/([a-z0-9_]+)\.png$/);
  if (!m) continue;
  // a name_top, name_side ... textúrákból a name blokk nevét vesszük
  const base = m[1].replace(FACE_SUFFIX, '');
  if (have.has(base) || NOT_A_BLOCK.test(base)) continue;
  const c = textureCube(base);
  if (c) addCube(base, c);
}

// Az almappákban tárolt változatok (a csomag a 0. változatot adja): mélykő, mélykő ércek, hó
const sub = (p) => (hasTex(p) ? `block/${p}` : null);
const alias = (name, top, side, bottom = top) => {
  const t = sub(top), sd = sub(side), b = sub(bottom);
  if (t && sd && b) addCube(name, { top: t, bottom: b, side: sd });
};
alias('deepslate', 'deepslate/ends/0', 'deepslate/sides/0');
alias('cobbled_deepslate', 'deepslate/cobbled/0', 'deepslate/cobbled/0');
alias('polished_deepslate', 'deepslate/polished/0', 'deepslate/polished/0');
alias('deepslate_bricks', 'deepslate/bricks/0', 'deepslate/bricks/0');
alias('cracked_deepslate_bricks', 'deepslate/bricks/cracked/0', 'deepslate/bricks/cracked/0');
alias('deepslate_tiles', 'deepslate/tiles/0', 'deepslate/tiles/0');
alias('cracked_deepslate_tiles', 'deepslate/tiles/cracked/0', 'deepslate/tiles/cracked/0');
for (const ore of ['coal', 'copper', 'diamond', 'emerald', 'gold', 'iron', 'lapis', 'redstone']) {
  alias(`deepslate_${ore}_ore`, `deepslate_ores/${ore}/ends/0`, `deepslate_ores/${ore}/sides/0`);
}
alias('snow_block', 'snow', 'snow');
// Nem teljes kocka, vagy állapot-/részlettextúra: ezek nem kerülnek a listára, mert a játék most
// csak kockákat rajzol (lépcső, növény, fáklya, sín, gyertya ...). Később, saját modellekkel pótoljuk őket.
const ALLOW = new Set(['sea_lantern', 'jack_o_lantern', 'beacon', 'bamboo_block', 'mushroom_stem']);
const DENY = [
  /sapling|candle|torch|lantern|rail|chain|(^|_)bars$|fern|(^|_)grass$|dry_grass|seagrass|kelp|sea_pickle/,
  /(^|_)coral(_fan)?$|_coral_fan$|flower|petals|cornflower|lily|firefly|berry_bush|azalea(_plant|_bush)?$|potted|_pot$/,
  /^(attached_)?(melon|pumpkin)_stem$|vines?(_|$)|weeping|twisting|egg|stalk|chorus_flower|cactus_flower/,
  /cauldron|composter|hopper|anvil|^bell|beacon_|end_rod|end_portal|lectern|item_frame|lightning_rod|pressure_plate/,
  /carpet|snow_layer|_slab$|wall_(post|railing|small_post)|nether_portal|leaf_litter|straw_bed|campfire|command_block/,
  /cartography_map|_triggered|poppy|sprouts|dust_line|_bar$|pointed_dripstone|eyeblossom|spore_blossom|roots$|structure_block|test_block|_side\d$|frogspawn|_vertical$|_ominous|_inactive|_active|_ejecting/,
  /_e$|_inner|fire$|_fire|rail_model|conduit|lava|bamboo_(singleleaf|large|small)|sunflower|wildflowers|glass_insides/,
];
const denied = (n) => !ALLOW.has(n) && DENY.some((r) => r.test(n));
const before = blocks.length;
blocks.splice(0, blocks.length, ...blocks.filter((b) => b.kind !== 'cube' || !denied(b.name)));
console.log(`Kiszűrt nem kocka alakú vagy részlet-textúra: ${before - blocks.length}`);

// A nem kocka alakú blokkokat (lépcső, lap, növény ...) a játék még nem rajzolja ki, ezért alapból
// nem írjuk ki őket (kisebb a blocks.json és a textúramappa). A `--shapes` kapcsoló kéri őket.
if (!WITH_SHAPES) blocks.splice(0, blocks.length, ...blocks.filter((b) => b.kind === 'cube'));
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
