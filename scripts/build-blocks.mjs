// Használat: npm run blocks -- <textúracsomag.zip>
//
// A csomag blockstates- és models-fájljaiból kiolvassa az összes blokkot, és létrehozza:
//   public/generated/blocks.json   a blokkok listája, lapok textúrái, alakja
//   public/textures/mc/*.png       a blokkok által használt textúrák
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from './lib-zip.mjs';
import { transparentFraction } from './lib-png.mjs';

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

/** Textúra-hivatkozás a modell lapjának uv-jával: ha a lap csak a textúra egy részét használja
 *  (pl. a Dokucraft pss_cube modellje a 2x2-es lap bal felső negyedét), akkor "id@u0,v0,u1,v1" */
const ref = (id, uv) =>
  !uv || (uv[0] === 0 && uv[1] === 0 && uv[2] === 16 && uv[3] === 16) ? id : `${id}@${uv.join(',')}`;

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
    const of = (k) => {
      const id = faces[k] ? tex(t, faces[k].texture) : null;
      return id ? ref(id, faces[k].uv) : null;
    };
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
const have = new Set();
const add = (d) => { blocks.push(d); have.add(d.name); };
const baseOf = (id) => id.split('@')[0];

// 1. blokkok blockstate-tel
for (const file of zip.names) {
  const m = file.match(/^assets\/minecraft\/blockstates\/([^/]+)\.json$/);
  if (!m) continue;
  const bs = zip.json(file);
  const d = bs ? describe(m[1], bs) : null;
  if (d) add(d); else skipped.push(m[1]);
}

// 2. blokkok, amiknek nincs blockstate-jük (a Minecraftban vannak), de a csomag felülírja a modelljüket
//    (pl. az ércek és az ásványblokkok: diamond_ore, emerald_block ...). A modelljüket ugyanúgy feloldjuk.
for (const file of zip.names) {
  const m = file.match(/^assets\/minecraft\/models\/block\/([a-z0-9_]+)\.json$/);
  if (!m || have.has(m[1])) continue;
  const d = describe(m[1], { variants: { '': { model: `block/${m[1]}` } } });
  if (d && d.kind === 'cube' && [d.top, d.bottom, d.side].every((x) => x && zip.has(`${A}textures/${baseOf(x)}.png`))) add(d);
}

// 3. a többi alap blokk (andesite, bricks, wool ...): a textúrák nevéből találjuk ki a kockát.
//    Az egyértelműen nem teljes kocka textúrákat (állapotok, rétegek, növények, apró részek) kihagyjuk.
const NOT_A_BLOCK = /(_top|_bottom|_side|_front|_back|_end|_inside|_overlay|_particle|_stage\d*|_double|_underwater|_sign|_hanging_sign|_shelf|_pane|_pane_top|_still|_flow|_lit|_on|_off|_open|_closed|_snow|_0|_1|_2|_3|_4|_5|_6|_7|_8|_9|_dust|_item|_bud)$/;
const NOT_A_CUBE = new RegExp([
  '_(e|emissive|fire|flame|inner|insides?|fan|bars?|chain|roots?|pot|cross|tendril|powered|active|inactive|ominous|ejecting|triggered|crafting|conditional|base|mount|wheel|saw|body|sides|ends|stem|stems|small|tall|hanging|ground|nylium_side)$',
  'candle|chain|lantern|torch|rail|lily|lilypad|kelp|vine|sapling|flower|petals|egg|pointed_dripstone',
  '^(crafter|vault|test|structure_block|respawn_anchor|cartography|command_block|chain_command_block|repeating_command_block|jigsaw|trial_spawner)',
  'seagrass|fern|bush|_plant|moss_carpet|redstone_dust|propagule|bamboo_(large|small|single|stalk)|spore|eyeblossom|leaf_litter|resin_clump|sea_pickle',
  'lectern|loom|grindstone|stonecutter|lever|end_rod|lightning_rod|campfire|hopper|piston|jukebox|cauldron|composter|brewing|dragon_egg|bell_|anvil|beacon|conduit|barrier',
  'amethyst_cluster|chorus|heavy_core|pressure_plate|snow_layer|nether_portal|ladder|straw_bed|wall_(post|railing|small)|glow_lichen|sculk_(vein|sensor|catalyst)',
  'farmland|dripstone_(down|up)|hardened_clay|rail_model|_moist|_ready|_compost|weeping|twisting|hanging_moss|golden_dandelion|firefly|wildflowers|nether_sprouts|short_dry|tall_dry',
  'coral_fan|coral$|glass_insides|honey_block_outer|jack_o_lantern|carved_pumpkin|sniffer|turtle|oak_pressure',
].join('|'));
for (const file of zip.names) {
  const m = file.match(/^assets\/minecraft\/textures\/block\/([a-z0-9_]+)\.png$/);
  if (!m || have.has(m[1]) || NOT_A_BLOCK.test(m[1]) || NOT_A_CUBE.test(m[1])) continue;
  const c = textureCube(m[1]);
  if (c) add({ name: m[1], kind: 'cube', ...c, tinted: false });
}

// 4. lyukas textúrájú "kockák" kiszűrése (a nem kocka alakú blokkok textúrái átlátszó pixeleket tartalmaznak).
//    Az eleve átlátszó blokkok (lomb, üveg, jég ...) maradnak.
const SEE_THROUGH = /(leaves|glass|ice$|slime|honey|frosted|cobweb|spawner)/;
function holes(id) {
  const data = zip.read(`${A}textures/${baseOf(id)}.png`);
  if (!data) return 0;
  const w = data.readUInt32BE(16);
  const uv = id.includes('@') ? id.split('@')[1].split(',').map(Number) : [0, 0, 16, 16];
  const px = (v) => Math.round((v / 16) * w);
  return transparentFraction(data, px(uv[0]), px(uv[1]), px(uv[2]), px(uv[3]));
}
const dropped = [];
for (let i = blocks.length - 1; i >= 0; i--) {
  const b = blocks[i];
  if (b.kind !== 'cube' || SEE_THROUGH.test(b.name)) continue;
  if (Math.max(holes(b.top), holes(b.side), holes(b.bottom)) > 0.04) { dropped.push(b.name); blocks.splice(i, 1); }
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
const written = new Set();
for (const id of [...used].sort()) {
  const base = baseOf(id);
  const data = zip.read(`${A}textures/${base}.png`);
  if (!data) { missing.push(id); continue; }
  if (!written.has(base)) { writeFileSync(resolve(outTex, `${flat(base)}.png`), data); written.add(base); }
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
if (dropped.length) console.warn(`Kihagyott lyukas textúrájú blokk (${dropped.length}): ${dropped.slice(0, 12).join(', ')}${dropped.length > 12 ? ' ...' : ''}`);
if (skipped.length) console.warn(`Kihagyott blokk (${skipped.length}): ${skipped.slice(0, 8).join(', ')}${skipped.length > 8 ? ' ...' : ''}`);
