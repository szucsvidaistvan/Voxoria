// Használat: npm run blocks -- <textúracsomag.zip>
//
// A csomag blockstates- és models-fájljaiból (ha vannak), illetve a textúrák neveiből kiolvassa az összes blokkot, és létrehozza:
//   public/generated/blocks.json   a blokkok listája, lapok textúrái, alakja
//   public/textures/mc/*.png       a blokkok által használt textúrák
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from './lib-zip.mjs';
import { packRoot } from './lib-pack.mjs';
import { transparentFraction } from './lib-png.mjs';

const zipPath = process.argv[2];
if (!zipPath || !existsSync(zipPath)) {
  console.error('Használat: npm run blocks -- <textúracsomag.zip>');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const zip = readZip(zipPath);
const A = packRoot(zip);

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
 *  (pl. egyes csomagok pss_cube modellje a 2x2-es lap bal felső negyedét), akkor "id@u0,v0,u1,v1" */
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


// ---------- nem kocka alakú blokkok ----------

/** A Minecraft beépített (vanilla) modelljei, amiket a csomag nem tartalmaz, csak szülőként hivatkozik rájuk */
const face = (uv, texture, cullface) => ({ uv, texture, ...(cullface ? { cullface } : {}) });
const sideFaces = (uv, cull = true) => Object.fromEntries(
  ['north', 'south', 'west', 'east'].map((d) => [d, face(uv, '#side', cull ? d : undefined)]));
const TEMPLATES = {
  slab: [{ from: [0, 0, 0], to: [16, 8, 16], faces: {
    down: face([0, 0, 16, 16], '#bottom', 'down'), up: face([0, 0, 16, 16], '#top'), ...sideFaces([0, 8, 16, 16]) } }],
  slab_top: [{ from: [0, 8, 0], to: [16, 16, 16], faces: {
    down: face([0, 0, 16, 16], '#bottom'), up: face([0, 0, 16, 16], '#top', 'up'), ...sideFaces([0, 0, 16, 8]) } }],
  // a lépcső magas fele kelet felé néz (a Minecraft alapállása)
  stairs: [
    { from: [0, 0, 0], to: [16, 8, 16], faces: {
      down: face([0, 0, 16, 16], '#bottom', 'down'), up: face([0, 0, 16, 16], '#top'), ...sideFaces([0, 8, 16, 16]) } },
    { from: [8, 8, 0], to: [16, 16, 16], faces: {
      up: face([8, 0, 16, 16], '#top', 'up'),
      north: face([0, 0, 8, 8], '#side', 'north'), south: face([8, 0, 16, 8], '#side', 'south'),
      west: face([0, 0, 16, 8], '#side'), east: face([0, 0, 16, 8], '#side', 'east') } },
  ],
  button: [{ from: [5, 0, 6], to: [11, 2, 10], faces: {
    down: face([5, 6, 11, 10], '#texture', 'down'), up: face([5, 6, 11, 10], '#texture'),
    north: face([5, 14, 11, 16], '#texture'), south: face([5, 14, 11, 16], '#texture'),
    west: face([6, 14, 10, 16], '#texture'), east: face([6, 14, 10, 16], '#texture') } }],
  pressure_plate_up: [{ from: [1, 0, 1], to: [15, 1, 15], faces: {
    down: face([1, 1, 15, 15], '#texture', 'down'), up: face([1, 1, 15, 15], '#texture'),
    north: face([1, 15, 15, 16], '#texture'), south: face([1, 15, 15, 16], '#texture'),
    west: face([1, 15, 15, 16], '#texture'), east: face([1, 15, 15, 16], '#texture') } }],
  template_wall_post: [{ from: [4, 0, 4], to: [12, 16, 12], faces: {
    down: face([4, 4, 12, 12], '#wall', 'down'), up: face([4, 4, 12, 12], '#wall', 'up'),
    north: face([4, 0, 12, 16], '#wall'), south: face([4, 0, 12, 16], '#wall'),
    west: face([4, 0, 12, 16], '#wall'), east: face([4, 0, 12, 16], '#wall') } }],
};
const thin = (h) => [{ from: [0, 0, 0], to: [16, h, 16], faces: {
  down: face([0, 0, 16, 16], '#texture', 'down'), up: face([0, 0, 16, 16], '#texture'),
  ...Object.fromEntries(['north', 'south', 'west', 'east'].map((d) => [d, face([0, 16 - h, 16, 16], '#texture')])) } }];
TEMPLATES.moss_carpet = thin(1);
TEMPLATES.snow_height2 = thin(2);

function templateFor(builtin) {
  if (!builtin) return null;
  const b = builtin.replace(/^block\//, '');
  if (TEMPLATES[b]) return { key: b, elements: TEMPLATES[b] };
  if (/(inner|outer)_stairs$|_stairs$/.test(b)) return { key: 'stairs', elements: TEMPLATES.stairs };
  if (/_slab$/.test(b)) return { key: 'slab', elements: TEMPLATES.slab };
  return null;
}

/** A névvel megadott vanilla modellekhez (pl. oak_slab) az anyag textúrájának kitalálása */
function guessMaterial(name) {
  const base = name.replace(/_(slab|stairs|wall|button|pressure_plate)$/, '');
  const cands = [`${base}_planks`, base, `${base}s`, `${base}_block`, `${base.replace(/brick$/, 'bricks')}`, `${base}_bricks`];
  return cands.find((c) => hasTex(c)) ?? null;
}

/** A Minecraft alap uv-ja, ha a lapnak nincs megadva */
function defaultUv(dir, [x1, y1, z1], [x2, y2, z2]) {
  switch (dir) {
    case 'down': return [x1, 16 - z2, x2, 16 - z1];
    case 'up': return [x1, z1, x2, z2];
    case 'north': return [16 - x2, 16 - y2, 16 - x1, 16 - y1];
    case 'south': return [x1, 16 - y2, x2, 16 - y1];
    case 'west': return [z1, 16 - y2, z2, 16 - y1];
    default: return [16 - z2, 16 - y2, 16 - z1, 16 - y1];
  }
}

/** Egy modell elemei kimeneti formában: a textúrák feloldva, az uv kitöltve */
function toParts(elements, textures) {
  const parts = [];
  for (const e of elements) {
    const faces = {};
    for (const [dir, f] of Object.entries(e.faces ?? {})) {
      const id = tex(textures, f.texture);
      if (!id) continue;
      faces[dir] = {
        uv: f.uv ?? defaultUv(dir, e.from, e.to),
        tex: id,
        ...(f.cullface ? { cull: f.cullface } : {}),
        ...(f.tintindex !== undefined ? { tint: 1 } : {}),
        ...(f.rotation ? { rot: f.rotation } : {}),
      };
    }
    if (!Object.keys(faces).length) continue;
    const r = e.rotation;
    parts.push({
      from: e.from, to: e.to,
      ...(r && r.angle ? { rot: { o: r.origin ?? [8, 8, 8], a: r.axis, g: r.angle, s: r.rescale ? 1 : 0 } } : {}),
      faces,
    });
  }
  return parts;
}

/** A blokk alapállapota: az az állapot, aminek nincs elforgatása (a lépcsőnél az egyenes), a többszörös részeknél az összes feltétel nélküli */
function baseApplies(bs) {
  const one = (v) => (Array.isArray(v) ? v[0] : v);
  if (bs.variants) {
    const keys = Object.keys(bs.variants);
    const score = (k) => {
      const v = one(bs.variants[k]);
      return (/shape=(inner|outer)/.test(k) ? 4 : 0) + (v.x || v.y ? 2 : 0) + (/half=top/.test(k) ? 1 : 0);
    };
    const best = [...keys].sort((a, b) => score(a) - score(b))[0];
    const v = one(bs.variants[best]);
    return v?.model ? [v] : [];
  }
  if (bs.multipart) {
    const parts = bs.multipart.filter((p) => !p.when).map((p) => one(p.apply)).filter((a) => a?.model);
    if (parts.length) return parts;
    const first = one(bs.multipart[0]?.apply);
    return first?.model ? [first] : [];
  }
  return [];
}

function describeShape(name, bs, tinted) {
  const applies = baseApplies(bs);
  const parts = [];
  for (const a of applies) {
    const m = resolveModel(a.model);
    let elements = m.elements;
    let textures = { ...m.textures };
    if (!elements) {
      const tp = templateFor(m.builtin);
      if (!tp) continue;
      elements = tp.elements;
      if (!textures.side && !textures.texture && !textures.wall) {
        const mat = guessMaterial(name);
        if (mat) { textures.top = textures.bottom = textures.side = textures.texture = textures.wall = `block/${mat}`; }
      }
    }
    parts.push(...toParts(elements, textures));
  }
  if (!parts.length) return null;
  const v0 = applies[0];
  return { name, kind: 'shape', parts, rx: v0.x ?? 0, ry: v0.y ?? 0, tinted: tinted || parts.some((p) => Object.values(p.faces).some((f) => f.tint)) };
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
  // nem teljes kocka (lépcső, lap, növény, kerítés ...): az elemeit (dobozait) tároljuk el a rendereléshez
  return describeShape(name, bs, tinted);
}

// ---------- fő rész ----------

const blocks = [];
const skipped = [];
const have = new Set();
const add = (d) => { blocks.push(d); have.add(d.name); };
const baseOf = (id) => id.split('@')[0];

// 1. blokkok blockstate-tel
for (const file of zip.names) {
  const m = file.startsWith(`${A}blockstates/`) && file.match(/\/blockstates\/([^/]+)\.json$/);
  if (!m) continue;
  const bs = zip.json(file);
  const d = bs ? describe(m[1], bs) : null;
  if (d) add(d); else skipped.push(m[1]);
}

// 2. blokkok, amiknek nincs blockstate-jük (a Minecraftban vannak), de a csomag felülírja a modelljüket
//    (pl. az ércek és az ásványblokkok: diamond_ore, emerald_block ...). A modelljüket ugyanúgy feloldjuk.
for (const file of zip.names) {
  const m = file.startsWith(`${A}models/block/`) && file.match(/\/models\/block\/([a-z0-9_]+)\.json$/);
  if (!m || have.has(m[1])) continue;
  const d = describe(m[1], { variants: { '': { model: `block/${m[1]}` } } });
  if (d && d.kind === 'cube' && [d.top, d.bottom, d.side].every((x) => x && zip.has(`${A}textures/${baseOf(x)}.png`))) add(d);
}

// 2b. Textúra-csomagok, amikben nincsenek modellek (csak textúrák): a Minecraft alap alakú blokkjait
//     (növények, fáklya, kerítés, üvegtábla, szőnyeg ...) a textúrák neve alapján, beépített modellekkel hozzuk létre.
{
  const tint = (f) => ({ ...f, tintindex: 0 });
  const sides = (uv, tx) => Object.fromEntries(['north', 'south', 'west', 'east'].map((d) => [d, face(uv, tx)]));
  const FULL = [0, 0, 16, 16];
  const cross = (tinted) => {
    const f = () => (tinted ? tint(face(FULL, '#t')) : face(FULL, '#t'));
    const rotation = { origin: [8, 8, 8], axis: 'y', angle: 45, rescale: true };
    return [
      { from: [0.8, 0, 8], to: [15.2, 16, 8], rotation, faces: { north: f(), south: f() } },
      { from: [8, 0, 0.8], to: [8, 16, 15.2], rotation, faces: { west: f(), east: f() } },
    ];
  };
  const post = (a, b, sideTex, capTex) => [{ from: [a, 0, a], to: [b, 16, b], faces: {
    down: face([a, a, b, b], capTex), up: face([a, a, b, b], capTex), ...sides([a, 0, b, 16], sideTex) } }];
  const flat = (y, tinted) => [{ from: [0, y, 0], to: [16, y, 16], faces: {
    up: tinted ? tint(face(FULL, '#t')) : face(FULL, '#t'), down: tinted ? tint(face(FULL, '#t')) : face(FULL, '#t') } }];
  const boxed = (h, i = 0) => [{ from: [i, 0, i], to: [16 - i, h, 16 - i], faces: {
    down: face([i, i, 16 - i, 16 - i], '#bottom'), up: face([i, i, 16 - i, 16 - i], '#top'), ...sides([i, 16 - h, 16 - i, 16], '#side') } }];
  const TPL = {
    cross: cross(false),
    crossTinted: cross(true),
    torch: [{ from: [7, 0, 7], to: [9, 10, 9], faces: {
      down: face([7, 13, 9, 15], '#t'), up: face([7, 6, 9, 8], '#t'), ...sides([7, 6, 9, 16], '#t') } }],
    pane: post(7, 9, '#p', '#e'),
    fence: post(6, 10, '#t', '#t'),
    trapdoor: [{ from: [0, 0, 0], to: [16, 3, 16], faces: {
      down: face(FULL, '#t'), up: face(FULL, '#t'), ...sides([0, 13, 16, 16], '#t') } }],
    carpet: thin(1).map((e) => ({ ...e, faces: Object.fromEntries(Object.entries(e.faces).map(([k, f]) => [k, { ...f, texture: '#t' }])) })),
    layer: thin(2).map((e) => ({ ...e, faces: Object.fromEntries(Object.entries(e.faces).map(([k, f]) => [k, { ...f, texture: '#t' }])) })),
    lily: flat(0.25, true),
    rail: flat(0.5, false),
    ladder: [{ from: [0, 0, 15.2], to: [16, 16, 15.2], faces: { north: face(FULL, '#t'), south: face(FULL, '#t') } }],
    cactus: [
      { from: [0, 0, 1], to: [16, 16, 15], faces: { west: face(FULL, '#side'), east: face(FULL, '#side') } },
      { from: [1, 0, 0], to: [15, 16, 16], faces: { north: face(FULL, '#side'), south: face(FULL, '#side') } },
      { from: [1, 0, 1], to: [15, 16, 15], faces: { up: face(FULL, '#top'), down: face(FULL, '#bottom') } },
    ],
  };
  const put = (name, tpl, textures, tinted = false) => {
    if (have.has(name)) return;
    if (!Object.values(textures).every((t) => hasTex(t.replace(/^block\//, '')))) return;
    const parts = toParts(tpl, textures);
    if (parts.length) add({ name, kind: 'shape', parts, rx: 0, ry: 0, tinted });
  };
  const b = (n) => `block/${n}`;
  const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak'];
  const COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];

  for (const n of ['allium', 'azure_bluet', 'blue_orchid', 'dandelion', 'oxeye_daisy', 'orange_tulip', 'pink_tulip', 'red_tulip', 'white_tulip',
    'poppy', 'brown_mushroom', 'red_mushroom', 'dead_bush', 'cobweb', 'sugar_cane', 'seagrass']) put(n, TPL.cross, { t: b(n) });
  for (const w of WOODS) put(`${w}_sapling`, TPL.cross, { t: b(`${w}_sapling`) });
  put('short_grass', TPL.crossTinted, { t: b('grass') }, true);
  put('fern', TPL.crossTinted, { t: b('fern') }, true);
  put('torch', TPL.torch, { t: b('torch') });
  put('redstone_torch', TPL.torch, { t: b('redstone_torch') });
  put('glass_pane', TPL.pane, { p: b('glass'), e: b('glass_pane_top') });
  for (const c of COLORS) {
    put(`${c}_stained_glass_pane`, TPL.pane, { p: b(`${c}_stained_glass`), e: b(`${c}_stained_glass_pane_top`) });
    put(`${c}_carpet`, TPL.carpet, { t: b(`${c}_wool`) });
  }
  put('iron_bars', TPL.pane, { p: b('iron_bars'), e: b('iron_bars') });
  for (const w of WOODS) {
    put(`${w}_fence`, TPL.fence, { t: b(`${w}_planks`) });
    put(`${w}_trapdoor`, TPL.trapdoor, { t: b(`${w}_trapdoor`) });
  }
  put('nether_brick_fence', TPL.fence, { t: b('nether_bricks') });
  put('iron_trapdoor', TPL.trapdoor, { t: b('iron_trapdoor') });
  put('snow', TPL.layer, { t: b('snow') });
  put('lily_pad', TPL.lily, { t: b('lily_pad') }, true);
  put('ladder', TPL.ladder, { t: b('ladder') });
  // ajtók: a blokk alsó, zárt állapota; az alsó és felső fél textúrája külön, az állapotokat a játék készíti el
  for (const w of [...WOODS, 'iron']) {
    const name = `${w}_door`, bottom = `${w}_door_bottom`, top = `${w}_door_top`;
    if (have.has(name) || !hasTex(bottom) || !hasTex(top)) continue;
    const plate = [{ from: [13, 0, 0], to: [16, 16, 16], faces: Object.fromEntries(['down', 'up', 'north', 'south', 'west', 'east'].map((d) => [d, { texture: '#t' }])) }];
    add({ name, kind: 'shape', parts: toParts(plate, { t: b(bottom) }), rx: 0, ry: 0, tinted: false, door: { bottom: b(bottom), top: b(top) } });
  }
  for (const n of ['rail', 'powered_rail', 'detector_rail', 'activator_rail']) put(n, TPL.rail, { t: b(n) });
  put('cactus', TPL.cactus, { top: b('cactus_top'), bottom: b('cactus_bottom'), side: b('cactus_side') });
  put('enchanting_table', boxed(12), { top: b('enchanting_table_top'), bottom: b('enchanting_table_bottom'), side: b('enchanting_table_side') });
  put('daylight_detector', boxed(6), { top: b('daylight_detector_top'), bottom: b('daylight_detector_side'), side: b('daylight_detector_side') });
  put('cake', boxed(8, 1), { top: b('cake_top'), bottom: b('cake_bottom'), side: b('cake_side') });
  put('farmland', boxed(15), { top: b('farmland'), bottom: b('dirt'), side: b('dirt') });
  put('dirt_path', boxed(15), { top: b('grass_path_top'), bottom: b('dirt'), side: b('grass_path_side') });
}

// 3. a többi alap blokk (andesite, bricks, wool ...): a textúrák nevéből találjuk ki a kockát.
//    Az egyértelműen nem teljes kocka textúrákat (állapotok, rétegek, növények, apró részek) kihagyjuk.
const NOT_A_BLOCK = /(_top|_bottom|_side|_front|_back|_end|_inside|_overlay|_particle|_stage\d*|_double|_underwater|_sign|_hanging_sign|_shelf|_pane|_pane_top|_still|_flow|_lit|_on|_off|_open|_closed|_snow|_0|_1|_2|_3|_4|_5|_6|_7|_8|_9|_dust|_item|_bud)$/;
const NOT_A_CUBE = new RegExp([
  '_(e|emissive|fire|flame|inner|insides?|fan|bars?|chain|roots?|pot|cross|tendril|powered|active|inactive|ominous|ejecting|triggered|crafting|conditional|base|mount|wheel|saw|body|sides|ends|stem|stems|small|tall|hanging|ground|nylium_side)$',
  'candle|chain|^(soul_|copper_)?lantern$|torch|rail|lily|lilypad|kelp|vine|sapling|flower|petals|egg|pointed_dripstone',
  '^(crafter|vault|test|structure_block|respawn_anchor|cartography|command_block|chain_command_block|repeating_command_block|jigsaw|trial_spawner)',
  'seagrass|fern|bush|_plant|moss_carpet|redstone_dust|propagule|bamboo_(large|small|single|stalk)|spore|eyeblossom|leaf_litter|resin_clump|sea_pickle',
  'lectern|loom|grindstone|stonecutter|lever|end_rod|lightning_rod|campfire|hopper|piston|jukebox|cauldron|composter|brewing|dragon_egg|bell_|anvil|beacon|conduit|barrier',
  'amethyst_cluster|chorus|heavy_core|pressure_plate|snow_layer|nether_portal|ladder|straw_bed|wall_(post|railing|small)|glow_lichen|sculk_(vein|sensor|catalyst)',
  'farmland|dripstone_(down|up)|hardened_clay|rail_model|_moist|_ready|_compost|weeping|twisting|hanging_moss|golden_dandelion|firefly|wildflowers|nether_sprouts|short_dry|tall_dry',
  '^carpet_|^debug|item_frame|_front_vertical|^(comparator|repeater)$|^shulker_box$',
  'coral_fan|coral$|glass_insides|honey_block_outer|jack_o_lantern|carved_pumpkin|sniffer|turtle|oak_pressure',
].join('|'));
for (const file of zip.names) {
  const m = file.startsWith(`${A}textures/block/`) && file.match(/\/textures\/block\/([a-z0-9_]+)\.png$/);
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
// 4b. Alap blokkok, amiknek a Minecraftban saját modelljük van (a csomag nem írja felül): ezek lapjait kézzel adjuk meg
const SPECIAL_CUBES = [
  // név, felső, alsó, oldal textúra (block/ alatt)
  ['crafting_table', 'crafting_table_top', 'oak_planks', 'crafting_table_side'],
  ['furnace', 'furnace_top', 'furnace_top', 'furnace_side'],
  ['blast_furnace', 'blast_furnace_top', 'blast_furnace_top', 'blast_furnace_side'],
  ['pumpkin', 'pumpkin_top', 'pumpkin_top', 'pumpkin_side'],
  ['melon', 'melon_top', 'melon_top', 'melon_side'],
  ['hay_block', 'hay_block_top', 'hay_block_top', 'hay_block_side'],
  ['bone_block', 'bone_block_top', 'bone_block_top', 'bone_block_side'],
  ['quartz_block', 'quartz_block_top', 'quartz_block_bottom', 'quartz_block_side'],
  ['quartz_pillar', 'quartz_pillar_top', 'quartz_pillar_top', 'quartz_pillar'],
  ['purpur_pillar', 'purpur_pillar_top', 'purpur_pillar_top', 'purpur_pillar'],
  ['snow_block', 'snow', 'snow', 'snow'],
  ['dried_kelp_block', 'dried_kelp_top', 'dried_kelp_bottom', 'dried_kelp_side'],
  ['lodestone', 'lodestone_top', 'lodestone_top', 'lodestone_side'],
  ['smooth_quartz', 'quartz_block_bottom', 'quartz_block_bottom', 'quartz_block_bottom'],
  ['tnt', 'tnt_top', 'tnt_bottom', 'tnt_side'],
  ['podzol', 'podzol_top', 'dirt', 'podzol_side'],
  ['mycelium', 'mycelium_top', 'dirt', 'mycelium_side'],
  ['jukebox', 'jukebox_top', 'jukebox_side', 'jukebox_side'],
  ['carved_pumpkin', 'pumpkin_top', 'pumpkin_top', 'carved_pumpkin'],
  ['jack_o_lantern', 'pumpkin_top', 'pumpkin_top', 'jack_o_lantern'],
  ['observer', 'observer_top', 'observer_top', 'observer_side'],
];
for (const [name, top, bottom, side] of SPECIAL_CUBES) {
  if (have.has(name) || ![top, bottom, side].every(hasTex)) continue;
  add({ name, kind: 'cube', top: `block/${top}`, bottom: `block/${bottom}`, side: `block/${side}`, tinted: false });
}

// 4c. Lépcsők, lapok és falak az alap kő- és téglablokkokhoz (a csomag csak a saját blockstate-jeiket tartalmazza)
const STAIR_SLAB = /^((oak|spruce|birch|jungle|acacia|dark_oak)_planks|stone|smooth_stone|cobblestone|mossy_cobblestone|stone_bricks|mossy_stone_bricks|andesite|polished_andesite|diorite|polished_diorite|granite|polished_granite|sandstone|cut_sandstone|smooth_sandstone|red_sandstone|cut_red_sandstone|bricks|nether_bricks|red_nether_bricks|quartz_block|smooth_quartz|purpur_block|prismarine|prismarine_bricks|dark_prismarine|end_stone_bricks|mud_bricks|blackstone|polished_blackstone|polished_blackstone_bricks|cobbled_deepslate|polished_deepslate|deepslate_bricks|deepslate_tiles|tuff|polished_tuff|tuff_bricks|cut_copper|exposed_cut_copper|weathered_cut_copper|oxidized_cut_copper|resin_bricks)$/;
const WALL = /^(cobblestone|mossy_cobblestone|stone_bricks|mossy_stone_bricks|andesite|diorite|granite|sandstone|red_sandstone|bricks|nether_bricks|red_nether_bricks|end_stone_bricks|prismarine|mud_bricks|blackstone|polished_blackstone|polished_blackstone_bricks|tuff|tuff_bricks)$/;
const shapeName = (n) => n.replace(/bricks$/, 'brick').replace(/_block$/, '').replace(/_planks$/, '');
const byName = new Map(blocks.map((b) => [b.name, b]));
for (const b of [...blocks]) {
  if (b.kind !== 'cube') continue;
  const base = shapeName(b.name);
  const t = { top: b.top, bottom: b.bottom, side: b.side, wall: b.side };
  const addShape = (suffix, tpl, textures) => {
    const nm = `${base}_${suffix}`;
    if (byName.has(nm)) return;
    const d = { name: nm, kind: 'shape', parts: toParts(tpl, textures), rx: 0, ry: 0, tinted: false };
    add(d); byName.set(nm, d);
  };
  if (STAIR_SLAB.test(b.name)) { addShape('stairs', TEMPLATES.stairs, t); addShape('slab', TEMPLATES.slab, t); }
  if (WALL.test(b.name)) addShape('wall', TEMPLATES.template_wall_post, t);
}

// 5. a nem kocka blokkoknál a hiányzó textúrájú lapokat elhagyjuk
for (let i = blocks.length - 1; i >= 0; i--) {
  const b = blocks[i];
  if (b.kind !== 'shape') continue;
  for (const part of b.parts) {
    for (const [d, f] of Object.entries(part.faces)) if (!zip.has(`${A}textures/${f.tex}.png`)) delete part.faces[d];
  }
  b.parts = b.parts.filter((part) => Object.keys(part.faces).length);
  if (!b.parts.length) { skipped.push(b.name); blocks.splice(i, 1); }
}
blocks.sort((a, b) => a.name.localeCompare(b.name));

// tartalmi szabályok: a tiltott blokkok (scripts/content-policy.json) nem kerülnek be
{
  const { applyPolicy } = await import('./apply-content-policy.mjs');
  const { keep } = applyPolicy(blocks);
  blocks.length = 0; blocks.push(...keep);
}

// a használt textúrák
const used = new Set();
for (const b of blocks) {
  if (b.kind === 'cube') [b.top, b.bottom, b.side].forEach((x) => used.add(x));
  else for (const part of b.parts) for (const f of Object.values(part.faces)) used.add(f.tex);
  if (b.door) { used.add(b.door.bottom); used.add(b.door.top); }
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
  else {
    for (const part of b.parts) for (const f of Object.values(part.faces)) f.tex = key(f.tex);
    if (b.door) { b.door.bottom = key(b.door.bottom); b.door.top = key(b.door.top); }
  }
}

writeFileSync(resolve(outGen, 'blocks.json'), JSON.stringify({ textures: textureKeys, blocks }));

const cubes = blocks.filter((b) => b.kind === 'cube').length;
console.log(`${blocks.length} blokk: ${cubes} teljes kocka, ${blocks.length - cubes} egyéb alakú.`);
console.log(`${textureKeys.length} textúra kimásolva ide: public/textures/mc`);
if (missing.length) console.warn(`Hiányzó textúra (${missing.length}): ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' ...' : ''}`);
if (dropped.length) console.warn(`Kihagyott lyukas textúrájú blokk (${dropped.length}): ${dropped.slice(0, 12).join(', ')}${dropped.length > 12 ? ' ...' : ''}`);
if (skipped.length) console.warn(`Kihagyott blokk (${skipped.length}): ${skipped.slice(0, 8).join(', ')}${skipped.length > 8 ? ' ...' : ''}`);
