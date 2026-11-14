import './style.css';
import * as THREE from 'three';
import {
  AIR, B, BLOCKS, FLUID_LAVA, FLUID_WATER, HOTBAR, blockId, blockKey, fluidId, fluidKind, fluidLevel, placeableBlocks,
  registerGenerated, type GeneratedPack, type RGB,
} from '../shared/blocks';
import { FluidSim, isReplaceable } from '../shared/fluids';
import { GravitySim } from '../shared/gravity';
import { createFallingView } from './falling';
import { EXTRA_ID, I, ITEMS, armorPoints, isItem, itemName, toolOf } from '../shared/items';
import { CATEGORIES, categoryOf } from '../shared/categories';
import { initRecipes } from '../shared/recipes';
import { CropSim, SEED_CROP, isFarmland, isTillable } from '../shared/farming';
import { Furnace, initSmelting } from '../shared/smelting';
import { Chest } from '../shared/chest';
import { COCOA_LOG, LIGHT, isOpaque } from '../shared/blocks';
import { resetLightCache } from '../shared/light';
import { bonusDrop, breakRule, breakTime, dropFor } from '../shared/survival';
import { raycast, type RayHit } from '../shared/raycast';
import { CH, CS, SEA_LEVEL, World } from '../shared/world';
import { buildAtlas, TILE } from './atlas';
import { DAY_FRACTION, DAY_SECONDS, START_TIME, formatClock, isNight, skyAt } from './daynight';
import { createMoonTexture, createSunTexture } from './sky';
import { createMobView, createPlayerView } from './mobview';
import { EAT_TIME, createHandItem } from './handitem';
import { createInventoryPreview } from './invpreview';
import { createCollapse } from './collapse';
import { MobManager, mobDrops, type Mob, type MobCtx } from '../shared/mobs';
import { findTree, isLogBlock } from '../shared/tree';
import { BagUI, HOTBAR_SIZE, Inventory, SlotView, createItemPainter } from './inventory';
import { Health, createStatBars } from './health';
import { createNameplates } from './nameplates';
import { createCracks, createDrops, createParticles } from './effects';
import { createBlockIcons } from './icons';
import { Input } from './input';
import { buildChunkGeometry } from './mesher';
import { EYE, Player } from './player';
import { clearSave, initSave, loadSave, loadSettings, writeSave, writeSettings, type SaveData } from './save';

const SKY = 0x8fb8ff;
const SKY_DIST = 300; // a nap, a hold és a csillagok távolsága (a kamera far értéke 400)

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** A `npm run blocks` által készített blokklista betöltése. Ha nincs, csak az alapblokkok vannak. */
async function loadGenerated(): Promise<number> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}generated/blocks.json`);
    if (!res.ok) return 0;
    const n = registerGenerated((await res.json()) as GeneratedPack).length;
    return n;
  } catch {
    return 0; // nincs fájl (a dev szerver ilyenkor HTML-t ad vissza, ami nem JSON)
  }
}

async function main(): Promise<void> {
  await initSave();
  const extraCount = await loadGenerated();
  initRecipes(); // a generált blokkok után, mert a receptek hivatkoznak rájuk
  initSmelting();
  resetLightCache();
  const atlas = await buildAtlas();

  // ---------- renderelés ----------
  const canvas = $<HTMLCanvasElement>('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const bgColor = new THREE.Color(SKY);
  scene.background = bgColor;
  const fog = new THREE.Fog(SKY, 50, 90); // a távolságát minden képkockán beállítjuk
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 400);
  camera.rotation.order = 'YXZ';
  const material = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.5 });
  // a chunkok anyaga: a `material` globális napszak-fénye mellé csúcsonként nap- és blokkfényt (fáklya, láva ...) kap.
  // A kész szín = max(napszak-fény * napfény, barlang-félhomály, blokkfény * meleg árnyalat).
  const chunkMaterial = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.5 });
  chunkMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 lights;\nvarying vec2 vLights;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLights = lights;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLights;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec3 skyLit = diffuse * vLights.x;
         vec3 caveDark = vec3( 0.045, 0.05, 0.075 );
         vec3 torchLit = vec3( 1.0, 0.86, 0.66 ) * vLights.y;
         vec4 diffuseColor = vec4( max( max( skyLit, caveDark ), torchLit ), opacity );`,
      );
  };
  chunkMaterial.customProgramCacheKey = () => 'voxoria-chunk-light';
  // a víz átlátszó, és alulról is látszik a felszíne
  const waterMaterial = new THREE.MeshBasicMaterial({
    map: atlas.anim.texture, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide,
  });

  const cracks = createCracks(scene);
  const particles = createParticles(scene, atlas);

  // a láva világít: nem sötétedik az éjszakával
  const lavaMaterial = new THREE.MeshBasicMaterial({ map: atlas.anim.texture, vertexColors: true });
  // a tűz is világít, és animált
  const fireMaterial = new THREE.MeshBasicMaterial({ map: atlas.anim.texture, vertexColors: true, alphaTest: 0.3, side: THREE.DoubleSide });

  // ég: nap, hold, csillagok (a kamerával együtt mozognak)
  const skyMat = (map: THREE.Texture) =>
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), skyMat(createSunTexture()));
  // a hold 8 fázisa: a textúrák elkészülnek, és a nap sorszáma szerint váltunk köztük
  const moonTextures = Array.from({ length: 8 }, (_, k) => createMoonTexture(k));
  const moonMat = skyMat(moonTextures[4]);
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), moonMat);
  let moonShown = 4;
  const starPos = new Float32Array(400 * 3);
  for (let i = 0; i < 400; i++) {
    const zz = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - zz * zz);
    starPos.set([r * Math.cos(a) * SKY_DIST, zz * SKY_DIST, r * Math.sin(a) * SKY_DIST], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  for (const o of [sun, moon, stars]) {
    o.frustumCulled = false;
    scene.add(o);
  }

  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: 0x000000 }),
  );
  highlight.visible = false;
  scene.add(highlight);

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // ---------- bemenet és beállítások ----------
  const inv = new Inventory();
  const input = new Input(canvas, HOTBAR_SIZE);
  if (input.touch) document.body.classList.add('touch');
  const settings = loadSettings({ renderDistance: input.touch ? 4 : 6, sensitivity: 1, mobs: 'on' });

  let fogFar = 100;
  const applySettings = () => {
    input.sensitivity = settings.sensitivity;
    fogFar = settings.renderDistance * CS;
  };

  // ---------- világ ----------
  let world: World;
  let gravity: GravitySim;
  let crops: CropSim;
  let player: Player;
  let sim: FluidSim;
  let mobs: MobManager;
  type Mode = 'survival' | 'creative';
  let mode: Mode = 'survival';
  const health = new Health();
  /** chunkonként két mesh: a szilárd blokkoké és a vízé */
  const meshes = new Map<string, THREE.Mesh[]>();
  const built = new Set<string>();
  let started = false;
  let timeOfDay = START_TIME;
  /** hányadik napnál tartunk (a hold fázisa ebből jön) */
  let dayCount = 1;
  /** a láb→fej irány az ágynál: 0 kelet, 1 dél, 2 nyugat, 3 észak (mint a játékos nézési iránya) */
  const BED_DIR: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const toastEl = document.getElementById('toast') as HTMLElement;
  let toastTimer = 0;
  const showToast = (text: string, ms = 2600): void => {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, ms);
  };
  /** Alvás: csak éjjel, és csak ha nincs ellenséges mob a közelben; reggelre ugrik az idő */
  const sleep = (): void => {
    if (!isNight(timeOfDay)) { showToast('You can only sleep at night'); return; }
    const near = mobs.mobs.some((m) => m.def.hostile && Math.hypot(m.x - player.pos.x, m.y - player.pos.y, m.z - player.pos.z) < 8);
    if (near) { showToast('You cannot sleep now: there are monsters nearby'); return; }
    if (timeOfDay >= DAY_FRACTION) dayCount++;
    timeOfDay = START_TIME;
    showToast('Good morning!');
  };
  /** a lerakott tűzhelyek állapota, a helyük szerint ("x,y,z") */
  const furnaces = new Map<string, Furnace>();
  const chests = new Map<string, Chest>();
  const fkey = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const spawn = { x: 8, z: 8 };

  const dropMeshes = (key: string) => {
    const list = meshes.get(key);
    if (!list) return;
    for (const m of list) {
      scene.remove(m);
      m.geometry.dispose();
    }
    meshes.delete(key);
  };

  const rebuild = (cx: number, cz: number) => {
    const chunk = world.getChunk(cx, cz);
    if (!chunk) return;
    const key = World.key(cx, cz);
    dropMeshes(key);
    const g = buildChunkGeometry(world, chunk, atlas);
    const list: THREE.Mesh[] = [];
    const add = (geo: THREE.BufferGeometry | null, mat: THREE.Material, renderOrder: number) => {
      if (!geo) return;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(cx * CS, 0, cz * CS);
      m.renderOrder = renderOrder;
      scene.add(m);
      list.push(m);
    };
    add(g.solid, chunkMaterial, 0);
    add(g.lava, lavaMaterial, 0);
    add(g.fire, fireMaterial, 0);
    add(g.water, waterMaterial, 1);
    if (list.length) meshes.set(key, list);
    built.add(key);
  };

  /** A megváltozott chunkok (és a szomszédaik, ha a határon van a blokk): képkockánként néhányat építünk újra */
  const dirty = new Set<string>();
  const markDirty = (x: number, z: number) => {
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const lx = x - cx * CS, lz = z - cz * CS;
    dirty.add(World.key(cx, cz));
    if (lx === 0) dirty.add(World.key(cx - 1, cz));
    if (lx === CS - 1) dirty.add(World.key(cx + 1, cz));
    if (lz === 0) dirty.add(World.key(cx, cz - 1));
    if (lz === CS - 1) dirty.add(World.key(cx, cz + 1));
  };
  const flushDirty = (budget: number) => {
    for (const key of dirty) {
      if (budget-- <= 0) break;
      dirty.delete(key);
      const [cx, cz] = key.split(',').map(Number);
      if (built.has(key)) rebuild(cx, cz);
    }
  };
  /** Azonnali újraépítés (a játékos saját módosításánál, hogy ne késsen) */
  const refresh = (x: number, z: number) => {
    markDirty(x, z);
    flushDirty(5);
  };

  const orderCache = new Map<number, [number, number][]>();
  const order = (r: number) => {
    let o = orderCache.get(r);
    if (!o) {
      o = [];
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dz * dz <= r * r + r) o.push([dx, dz]);
      o.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
      orderCache.set(r, o);
    }
    return o;
  };

  const ready = (cx: number, cz: number) =>
    !!(world.getChunk(cx, cz) && world.getChunk(cx + 1, cz) && world.getChunk(cx - 1, cz) &&
       world.getChunk(cx, cz + 1) && world.getChunk(cx, cz - 1));

  /** A játékos körüli chunkok betöltése, meshelése (képkockánként korlátozva) */
  const stream = (px: number, pz: number, r: number, genBudget: number, meshBudget: number) => {
    const ccx = Math.floor(px / CS), ccz = Math.floor(pz / CS);
    let g = 0;
    for (const [dx, dz] of order(r + 1)) {
      if (world.getChunk(ccx + dx, ccz + dz)) continue;
      if (g++ >= genBudget) break;
      world.ensureChunk(ccx + dx, ccz + dz);
    }
    let m = 0;
    for (const [dx, dz] of order(r)) {
      const cx = ccx + dx, cz = ccz + dz;
      if (built.has(World.key(cx, cz)) || !ready(cx, cz)) continue;
      if (m++ >= meshBudget) break;
      rebuild(cx, cz);
    }
  };

  const unload = (px: number, pz: number, r: number) => {
    const ccx = Math.floor(px / CS), ccz = Math.floor(pz / CS);
    for (const [key, c] of world.chunks) {
      const dx = c.cx - ccx, dz = c.cz - ccz;
      if (dx * dx + dz * dz <= (r + 3) * (r + 3)) continue;
      dropMeshes(key);
      built.delete(key);
      world.chunks.delete(key); // a módosítások megmaradnak, újratöltéskor visszakerülnek
    }
  };

  const clearWorld = () => {
    for (const key of [...meshes.keys()]) dropMeshes(key);
    built.clear();
  };

  /** Szárazföldet keres a kezdőpont körül, hogy ne a tenger közepén induljon a játékos */
  const findSpawn = (w: World) => {
    const cands: [number, number][] = [];
    for (let dz = -96; dz <= 96; dz += 8) for (let dx = -96; dx <= 96; dx += 8) cands.push([8 + dx, 8 + dz]);
    cands.sort((a, b) => Math.hypot(a[0] - 8, a[1] - 8) - Math.hypot(b[0] - 8, b[1] - 8));
    const land = cands.find(([x, z]) => w.heightAt(x, z) > SEA_LEVEL + 1);
    [spawn.x, spawn.z] = land ?? [8, 8];
  };

  const startWorld = (seed: number, save: SaveData | null, newMode: Mode = 'survival') => {
    clearWorld();
    world = new World(seed);
    sim = new FluidSim(world, (x, _y, z) => markDirty(x, z));
    crops = new CropSim(world, (x, y, z, id) => { setBlockAt(x, y, z, id); });
    gravity = new GravitySim(
      world,
      (x, y, z) => { markDirty(x, z); sim.notify(x, y, z); },
      (x, y, z, id) => drops.spawn(id, 1, x + 0.5, y + 0.5, z + 0.5),
    );
    mobs = new MobManager(world);
    mobView.clear();
    dirty.clear();
    drops.clear();
    if (save) world.importEdits(save.edits);
    timeOfDay = save?.time ?? START_TIME;
    dayCount = save?.day ?? 1;
    furnaces.clear();
    chests.clear();
    for (const a of save?.chests ?? []) chests.set(fkey(a[0], a[1], a[2]), Chest.fromFlat(a.slice(3)));
    for (const a of save?.furnaces ?? []) furnaces.set(fkey(a[0], a[1], a[2]), Furnace.fromFlat(a.slice(3)));

    // játékmód és tároló (a régi mentések kreatívak voltak, csak a hotbarjuk volt meg)
    mode = save ? save.mode ?? 'creative' : newMode;
    document.body.classList.toggle('creative', mode === 'creative');
    inv.slots.fill(null);
    inv.setArmorFlat(save?.arm);
    if (save?.inv) inv.fromFlat(save.inv);
    else if (save?.hotbar) save.hotbar.forEach((id, i) => { if (BLOCKS[id] && i < HOTBAR_SIZE) inv.slots[i] = { id, n: 1 }; });
    else if (mode === 'creative') HOTBAR.forEach((id, i) => { inv.slots[i] = { id, n: 1 }; });
    paintHotbar();
    health.reset();
    if (save?.hp !== undefined) health.hp = Math.max(1, Math.min(health.max, save.hp));
    if (save?.food !== undefined) { health.food = Math.max(0, Math.min(20, save.food)); health.saturation = Math.max(0, Math.min(health.food, save.sat ?? 5)); }
    findSpawn(world);
    player = new Player(world);
    stream(spawn.x, spawn.z, 2, Infinity, Infinity);

    if (save) {
      [player.pos.x, player.pos.y, player.pos.z] = save.pos;
      player.yaw = save.yaw;
      player.pitch = save.pitch;
    } else {
      let y = world.heightAt(spawn.x, spawn.z) + 1;
      while (world.getBlock(spawn.x, y, spawn.z) !== 0 || world.getBlock(spawn.x, y + 1, spawn.z) !== 0) y++;
      player.pos = { x: spawn.x + 0.5, y, z: spawn.z + 0.5 };
    }
    stream(player.pos.x, player.pos.z, 2, Infinity, Infinity);
  };

  const saveGame = () => {
    if (!started) return;
    const p = player.pos;
    writeSave({
      seed: world.seed, edits: world.exportEdits(), pos: [p.x, p.y, p.z], yaw: player.yaw, pitch: player.pitch,
      time: timeOfDay, day: dayCount, furnaces: [...furnaces].map(([k, f]) => [...k.split(',').map(Number), ...f.toFlat()]), chests: [...chests].map(([k, c]) => [...k.split(',').map(Number), ...c.toFlat()]), mode, hp: health.hp, food: health.food, sat: health.saturation, inv: inv.toFlat(), arm: inv.armorFlat(),
    });
  };

  // ---------- hotbar ----------
  /** A blokk ikonja: izometrikus kocka (a nem kocka alakú blokkok dobozokból, a növények képként) */
  const drawIcon = createBlockIcons(atlas);

  /** Az elem textúrák betöltése után minden ikon újrarajzolódik */
  /** a választó tárgyainak újrarajzolása, ha új textúra töltődött be (lekérve, hogy sok betöltés egy rajzolás legyen) */
  let pickerDirty = false;
  const repaintPicker = () => {
    if (pickerDirty) return;
    pickerDirty = true;
    requestAnimationFrame(() => {
      pickerDirty = false;
      for (const it of invItems) if (isItem(it.id)) paintStack(it.canvas, it.id);
    });
  };
  let hand: ReturnType<typeof createHandItem> | null = null;
  let iconsReady = false; // az előtöltés alatt a (később létrejövő) nézeteket még nem értesítjük
  const itemPainter = createItemPainter(import.meta.env.BASE_URL, () => {
    if (!iconsReady) return;
    hotViews.forEach((v) => v.invalidate());
    paintHotbar();
    bag.invalidate();
    drops.refreshIcons();
    repaintPicker();
    hand?.invalidate();
  });
  await itemPainter.preload();
  iconsReady = true;
  const paintStack = (c: HTMLCanvasElement, id: number) => (isItem(id) ? itemPainter(c, id) : drawIcon(c, id));

  const drops = createDrops(scene, atlas, material, paintStack);
  const mobView = createMobView(scene);
  hand = createHandItem(paintStack, atlas, isItem, import.meta.env.BASE_URL);
  const collapse = createCollapse(scene, atlas, material, () => world);
  const fallingView = createFallingView(scene, atlas, material);
  // harmadik személyű nézet (V): a játékos saját modellje a kamera előtt
  const playerView = createPlayerView(scene, import.meta.env.BASE_URL, atlas);
  /** nézet (V): 0 első személy, 1 hátulról, 2 elölről */
  let viewMode: 0 | 1 | 2 = 0;
  let thirdPerson = false; // viewMode > 0
  let shownArmor = '';
  let invPreview: ReturnType<typeof createInventoryPreview> | null = null;
  let mouseX = 0, mouseY = 0;
  document.addEventListener('pointermove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
  let walkPhase = 0;
  const hotbarEl = $('hotbar');
  const hotViews: SlotView[] = [];
  const held = () => inv.slots[input.hotbar];
  const paintHotbar = () => hotViews.forEach((v, i) => v.set(inv.slots[i], mode === 'creative'));
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const v = new SlotView(paintStack, 'slot');
    v.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      input.hotbar = i;
      selectSlot(i);
      announce(i);
    });
    hotbarEl.appendChild(v.el);
    hotViews.push(v);
  }
  const selectSlot = (i: number) => hotViews.forEach((v, n) => v.el.classList.toggle('selected', n === i));

  // a kézben lévő dolog neve rövid időre megjelenik, amikor a sávban választasz
  const heldName = $('held-name');
  let heldTimer = 0;
  const announce = (i: number) => {
    const st = inv.slots[i];
    if (!st) return;
    heldName.textContent = itemName(st.id);
    heldName.classList.add('show');
    window.clearTimeout(heldTimer);
    heldTimer = window.setTimeout(() => heldName.classList.remove('show'), 1800);
  };
  input.onHotbar = (i) => { selectSlot(i); announce(i); };
  selectSlot(0);
  paintHotbar();

  // ---------- életerő ----------
  const updateStats = createStatBars(import.meta.env.BASE_URL);
  const updateVitals = (hp: Health, shake: boolean) => updateStats(hp, shake, armorPoints(inv.armor.map((s) => s?.id)));
  const nameplates = createNameplates($('nameplates'), (m) => {
    // takarja-e blokk a mob fejét a kamerától
    const c = camera.position, dx = m.x - c.x, dy = m.y + m.def.h * 0.8 - c.y, dz = m.z - c.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const r = raycast(world, c.x, c.y, c.z, dx / len, dy / len, dz / len, len);
    return !!r && Math.hypot(r.hx - c.x, r.hy - c.y, r.hz - c.z) < len - 0.5;
  });
  const hurtEl = $('hurt'), fireEl = $('fire-overlay');
  health.onHurt = () => {
    hurtEl.classList.remove('flash');
    void hurtEl.offsetWidth; // az animáció újraindításához
    hurtEl.classList.add('flash');
  };
  let lastFallAt = -99;
  const now = () => performance.now() / 1000;
  let lastMobHit = -99;
  let lastMobHitBy = 'slain by a monster';

  // ---------- inventory és barkácsolás ----------
  const bag = new BagUI(inv, paintStack);
  bag.onChange = paintHotbar;

  // ---------- menü ----------
  type State = 'menu' | 'playing' | 'inventory' | 'dead';
  let state: State = 'menu';
  const menu = $('menu'), hud = $('hud');
  const btnContinue = $('btn-continue'), btnNew = $('btn-new'), btnSettings = $('btn-settings');
  const settingsEl = $('settings');
  const distEl = $<HTMLInputElement>('set-dist'), distVal = $('set-dist-val'), sensEl = $<HTMLInputElement>('set-sens');

  const refreshMenu = () => {
    btnContinue.hidden = !(started || loadSave());
  };

  /** Telefonon: teljes képernyő és fekvő tájolás kérése (Androidon működik, iPhone-on csak a forgatás kérése látszik) */
  const tryLandscape = () => {
    if (!input.touch) return;
    try {
      const el = document.documentElement;
      const full = !document.fullscreenElement && el.requestFullscreen ? el.requestFullscreen() : Promise.resolve();
      Promise.resolve(full)
        .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
        .catch(() => {});
    } catch { /* nem támogatott */ }
  };
  $('rotate-ok').addEventListener('click', () => document.body.classList.add('allow-portrait'));
  const dropFocus = () => (document.activeElement as HTMLElement | null)?.blur?.();
  const play = () => {
    dropFocus();
    tryLandscape();
    state = 'playing';
    menu.hidden = true;
    hud.hidden = false;
    input.reset();
    input.enabled = true;
    input.lock();
  };

  const pause = () => {
    if (state !== 'playing') return;
    state = 'menu';
    input.enabled = false;
    input.reset();
    highlight.visible = false;
    saveGame();
    if (document.pointerLockElement) document.exitPointerLock();
    menu.hidden = false;
    hud.hidden = true;
    refreshMenu();
  };
  input.onPause = pause;
  // ha a böngésző nem adta meg az egérzárat (pl. gyors újrakérés után), egy kattintás visszaadja
  canvas.addEventListener('click', () => {
    if (state === 'playing' && !input.touch && !input.locked) input.lock();
  });

  // ---------- kreatív blokk- és tárgyválasztó ----------
  // Minden blokk és tárgy csoportokba rendezve; a "All" fülön a csoportok egymás után, címsorral.
  const invEl = $('inventory'), invGrid = $('inv-grid'), invInfo = $('inv-info'), invTabs = $('inv-tabs');
  const invSearch = $<HTMLInputElement>('inv-search');
  type InvItem = { id: number; cat: string; el: HTMLButtonElement; text: string; canvas: HTMLCanvasElement };
  let invItems: InvItem[] = [];
  const invHeads = new Map<string, HTMLElement>();
  const tabBtns = new Map<string, HTMLButtonElement>();
  let invTab = 'all';

  const buildInventory = () => {
    const ids = [...placeableBlocks(), ...Object.keys(ITEMS).map(Number)];
    const byCat = new Map<string, number[]>();
    for (const id of ids) {
      const c = categoryOf(id);
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c)!.push(id);
    }
    const frag = document.createDocumentFragment();
    invItems = [];
    for (const cat of CATEGORIES) {
      const list = (byCat.get(cat.id) ?? []).sort((x, y) => itemName(x).localeCompare(itemName(y)));
      if (!list.length) continue;
      const head = document.createElement('h3');
      head.className = 'inv-group';
      head.textContent = cat.name;
      invHeads.set(cat.id, head);
      frag.appendChild(head);
      for (const id of list) {
        const name = itemName(id);
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'inv-item';
        el.title = name;
        el.setAttribute('aria-label', name);
        const c = document.createElement('canvas');
        c.width = c.height = TILE;
        paintStack(c, id);
        el.appendChild(c);
        el.addEventListener('click', () => {
          inv.slots[input.hotbar] = { id, n: 1 };
          paintHotbar();
          closeUI();
          announce(input.hotbar);
        });
        frag.appendChild(el);
        invItems.push({ id, cat: cat.id, el, canvas: c, text: `${name} ${blockKey(id)}`.toLowerCase() });
      }
    }
    invGrid.replaceChildren(frag);

    // fülek: az összes, és csoportonként egy
    const tabs = [{ id: 'all', name: 'All' }, ...CATEGORIES.filter((c) => byCat.has(c.id))];
    invTabs.replaceChildren();
    for (const t of tabs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inv-tab';
      btn.textContent = t.name;
      btn.addEventListener('click', () => { invTab = t.id; filterInventory(); });
      invTabs.appendChild(btn);
      tabBtns.set(t.id, btn);
    }
  };

  const filterInventory = () => {
    const q = invSearch.value.trim().toLowerCase().replace(/\s+/g, '_');
    const words = q.split('_').filter(Boolean);
    let shown = 0;
    const shownIn = new Set<string>();
    for (const it of invItems) {
      const hay = it.text.replace(/\s+/g, '_');
      const ok = (invTab === 'all' || it.cat === invTab) && words.every((w) => hay.includes(w));
      it.el.hidden = !ok;
      if (ok) { shown++; shownIn.add(it.cat); }
    }
    // a csoportcímek csak az "All" fülön látszanak, és csak ha van találat alattuk
    for (const [cat, head] of invHeads) head.hidden = invTab !== 'all' || !shownIn.has(cat);
    for (const [id, btn] of tabBtns) btn.classList.toggle('active', id === invTab);
    invInfo.textContent = `${shown} ${shown === 1 ? 'entry' : 'entries'}` + (extraCount ? '' : ' (the full list appears once the texture pack is extracted, see the README)');
  };
  invSearch.addEventListener('input', filterInventory);

  const openPicker = () => {
    if (state !== 'playing') return;
    if (!invItems.length) buildInventory();
    state = 'inventory';
    input.enabled = false;
    input.reset();
    if (document.pointerLockElement) document.exitPointerLock();
    invSearch.value = '';
    filterInventory();
    invEl.hidden = false;
    if (!input.touch) invSearch.focus();
  };
  /** Túlélő módban az inventory és a munkapad (2x2 vagy 3x3 rács) */
  const openBag = (size: 2 | 3 | 'furnace' | 'chest' | 'book', furnace?: Furnace | Chest) => {
    if (state !== 'playing') return;
    state = 'inventory';
    input.enabled = false;
    input.reset();
    if (document.pointerLockElement) document.exitPointerLock();
    bag.open(size, furnace);
  };
  function closeUI(viaEsc = false) {
    if (state !== 'inventory') return;
    invEl.hidden = true;
    invSearch.blur();
    bag.close();
    dropFocus();
    state = 'playing';
    input.reset();
    input.enabled = true;
    if (viaEsc) {
      // Az Esc megnyomása közben kért kurzorzár azonnal felszabadulna, és megnyitná a menüt:
      // ezért az Esc felengedésekor zárjuk le, addig a felszabadulást nem vesszük figyelembe.
      input.ignoreUnlockUntil = performance.now() + 800;
      const relock = (e: KeyboardEvent) => {
        if (e.code !== 'Escape') return;
        document.removeEventListener('keyup', relock);
        if (state === 'playing') input.lock();
      };
      document.addEventListener('keyup', relock);
    } else input.lock();
  }
  bag.onClose = () => closeUI();
  input.onView = () => { if (state === 'playing') { viewMode = ((viewMode + 1) % 3) as 0 | 1 | 2; thirdPerson = viewMode > 0; } };
  input.onInventory = () => (state === 'inventory' ? closeUI() : mode === 'creative' ? openPicker() : openBag(2));
  $('inv-close').addEventListener('click', () => closeUI());
  document.addEventListener('keydown', (e) => {
    if (state !== 'inventory') return;
    if (e.code === 'Escape') { e.preventDefault(); closeUI(true); }
    else if (e.code === 'KeyE' && !(e.target instanceof HTMLInputElement)) closeUI();
    else if (e.code === 'KeyC' && !(e.target instanceof HTMLInputElement)) bag.toggleBook();
  });
  // C: receptkönyv (túlélőben, játék közben)
  document.addEventListener('keydown', (e) => {
    if (state === 'playing' && mode === 'survival' && e.code === 'KeyC' && !e.repeat && !(e.target instanceof HTMLInputElement)) openBag('book');
  });

  // ---------- halál és újraéledés ----------
  const deathEl = $('death');
  const die = () => {
    if (state === 'menu' || state === 'dead') return;
    if (state === 'inventory') closeUI();
    state = 'dead';
    input.enabled = false;
    input.reset();
    highlight.visible = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const cause = now() - lastMobHit < 1 ? `You were ${lastMobHitBy}.`
      : player.inLava ? 'You burned to death in lava.'
      : health.burn > 0 || player.inFire ? 'You burned to death.'
        : health.air <= 0 ? 'You drowned.'
          : performance.now() / 1000 - lastFallAt < 1 ? 'You fell from a high place.' : 'You died.';
    $('death-reason').textContent = cause;
    deathEl.hidden = false;
    updateVitals(health, false);
  };
  $('btn-respawn').addEventListener('click', () => {
    health.reset();
    let y = world.heightAt(spawn.x, spawn.z) + 1;
    while (world.getBlock(spawn.x, y, spawn.z) !== AIR || world.getBlock(spawn.x, y + 1, spawn.z) !== AIR) y++;
    player.pos = { x: spawn.x + 0.5, y, z: spawn.z + 0.5 };
    player.vel = { x: 0, y: 0, z: 0 };
    player.landing = 0;
    deathEl.hidden = true;
    play();
  });

  // a menüben az Enter folytatja a játékot (az Esc nem tudja visszaadni az egeret, az Enter igen: az már felhasználói gesztus)
  document.addEventListener('keydown', (e) => {
    if (state === 'menu' && e.code === 'Enter' && !btnContinue.hidden && document.activeElement?.tagName !== 'BUTTON') btnContinue.click();
  });
  // Esc a menüben: folytatás, mint az inventory bezárásánál. Az Esc nem felhasználói gesztus, ezért az egeret
  // az Esc felengedésekor zárjuk vissza (addig a kurzorzár felszabadulását nem vesszük figyelembe).
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || e.repeat || state !== 'menu' || !started || btnContinue.hidden) return;
    if (!settingsEl.hidden) { settingsEl.hidden = true; btnSettings.setAttribute('aria-expanded', 'false'); e.preventDefault(); return; }
    e.preventDefault();
    btnContinue.click();
    if (input.touch) return;
    input.ignoreUnlockUntil = performance.now() + 800;
    const relock = (k: KeyboardEvent) => {
      if (k.code !== 'Escape') return;
      document.removeEventListener('keyup', relock);
      if (state === 'playing') input.lock();
    };
    document.addEventListener('keyup', relock);
  });
  btnContinue.addEventListener('click', () => {
    if (!started) {
      const save = loadSave();
      if (save) startWorld(save.seed, save);
      started = true;
    }
    play();
  });
  const newWorld = (m: Mode) => {
    clearSave();
    startWorld((Math.random() * 2 ** 31) | 0, null, m);
    started = true;
    play();
  };
  btnNew.addEventListener('click', () => newWorld('survival'));
  $('btn-new-creative').addEventListener('click', () => newWorld('creative'));
  btnSettings.addEventListener('click', () => {
    settingsEl.hidden = !settingsEl.hidden;
    btnSettings.setAttribute('aria-expanded', String(!settingsEl.hidden));
  });
  distEl.value = String(settings.renderDistance);
  distVal.textContent = distEl.value;
  sensEl.value = String(settings.sensitivity);
  distEl.addEventListener('input', () => {
    settings.renderDistance = Number(distEl.value);
    distVal.textContent = distEl.value;
    applySettings();
    writeSettings(settings);
  });
  const mobsEl = $<HTMLSelectElement>('set-mobs');
  mobsEl.value = settings.mobs;
  mobsEl.addEventListener('change', () => {
    settings.mobs = mobsEl.value as typeof settings.mobs;
    writeSettings(settings);
    mobsEl.blur();
    // kikapcsoláskor eltűnnek a mobok (a békésnél csak a szörnyek)
    mobs.mobs = settings.mobs === 'off' ? [] : settings.mobs === 'peaceful' ? mobs.mobs.filter((m) => !m.def.hostile) : mobs.mobs;
  });
  sensEl.addEventListener('input', () => {
    settings.sensitivity = Number(sensEl.value);
    applySettings();
    writeSettings(settings);
  });

  $('controls').textContent = input.touch
    ? 'Move with the joystick on the left, look around by dragging on the right. Tap the screen to place a block, use what you hold or hit a mob; press and hold to mine (with food: eat, with a sword: block). The round button jumps, F5 changes the view, Items opens your inventory.'
    : 'WASD to move, Space to jump or swim, hold left click to mine, right click to place or use (crafting table, doors, bucket, flint and steel, apple), hold right click with a sword to block (half damage from the front), V to change the view, 1–9 or scroll to choose a slot, E for the inventory, C for recipes, Esc for the menu.';
  if (input.touch) $('bag-hint').textContent = 'Tap: pick up / place. Long press: take half / place one. Drag a stack to move it. Tap outside to close.';
  $('pack-note').hidden = atlas.usingPack;

  // ---------- indulás ----------
  const existing = loadSave();
  startWorld(existing ? existing.seed : 20260, null);
  applySettings();
  refreshMenu();

  setInterval(() => { if (state !== 'menu') saveGame(); }, 20000);
  window.addEventListener('beforeunload', saveGame);
  window.addEventListener('pagehide', saveGame);
  // telefonon az oldal háttérbe kerülésekor nem biztos, hogy a beforeunload lefut: itt is mentünk
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveGame(); });

  // ---------- fő ciklus ----------
  const dir = new THREE.Vector3();
  let last = performance.now();
  let angle = 0;
  let frame = 0;
  let simAcc = 0;
  const clockEl = $('clock');
  const resumeEl = $('resume-hint');
  let clockText = '';

  // ---------- blokkok bontása, lerakása, tárgyak használata ----------
  const mineEl = $('mine'), mineBar = $('mine-bar');
  const mine = { x: 0, y: 0, z: 0, t: 0, need: 0, active: false };

  /** Blokk átírása: újrameshelés és a folyadék/tűz szimuláció értesítése */
  const setBlockAt = (x: number, y: number, z: number, id: number): boolean => {
    const old = world.getBlock(x, y, z);
    if (!world.setBlock(x, y, z, id)) return false;
    markDirty(x, z);
    // a fény messzire elér: ha világító blokk vagy átlátszatlan blokk változott, a környező chunkok is újraszámolódnak
    // (ezek a sor végére kerülnek, így előbb a saját chunk épül újra, a többi fokozatosan)
    if (LIGHT[old] || LIGHT[id] || isOpaque(old) !== isOpaque(id)) {
      const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) dirty.add(World.key(cx + dx, cz + dz));
    }
    sim.notify(x, y, z);
    gravity.notify(x, y, z);
    return true;
  };

  /** A kibontott blokk a földre esik (a játékos felveszi, ha a közelébe ér) */
  const giveDrop = (id: number, x: number, y: number, z: number) => {
    const d = dropFor(id, held()?.id);
    if (d) drops.spawn(d.id, d.n, x + 0.5, y + 0.5, z + 0.5);
    const extra = bonusDrop(id);
    if (extra) drops.spawn(extra.id, extra.n, x + 0.5, y + 0.5, z + 0.5);
  };

  /**
   * A páncél csökkenti a sebzést (pontonként 4%, legfeljebb 80%), és kopik. Visszaadja a csökkentett sebzést.
   * Csak a mobok és a nyilak ütésére hívódik (az esés, a tűz, a fulladás kikerüli a páncélt).
   */
  const wearArmor = (dmg: number): number => {
    const pts = armorPoints(inv.armor.map((s) => s?.id));
    if (pts <= 0) return dmg;
    const wear = Math.max(1, Math.floor(dmg / 2));
    inv.armor.forEach((s, i) => {
      const a = s && ITEMS[s.id]?.armor;
      if (!s || !a) return;
      s.d = (s.d ?? 0) + wear;
      if (s.d >= a.durability) {
        inv.armor[i] = null;
        particles.burst(Math.floor(player.pos.x), Math.floor(player.pos.y) + 1, Math.floor(player.pos.z), B.PLANKS);
      }
    });
    return Math.max(1, Math.round(dmg * (1 - Math.min(0.8, pts * 0.04))));
  };

  /** A kézben tartott eszköz kopása (csak túlélőben): a törött eszköz eltűnik */
  const wearHeld = (amount: number) => {
    if (mode !== 'survival') return;
    const st = held();
    const t = toolOf(st?.id);
    if (!st || !t) return;
    st.d = (st.d ?? 0) + amount;
    if (st.d >= t.durability) {
      inv.slots[input.hotbar] = null;
      particles.burst(Math.floor(player.pos.x), Math.floor(player.pos.y) + 1, Math.floor(player.pos.z), B.PLANKS);
    }
    paintHotbar();
  };

  /**
   * Egy természetes fa összeomlása a (x, y, z) rönktől felfelé: a rönkök és a lomb kikerülnek a világból, a darabok
   * egyenként szétesnek és a földre hullanak (animáció), és földet éréskor tárgyak lesznek belőlük (túlélőben).
   */
  const collapseTree = (x: number, y: number, z: number): { logs: number } | null => {
    if (!isLogBlock(world.getBlock(x, y, z))) return null;
    const tree = findTree(world, x, y, z);
    if (!tree) return null;
    const cells = [...tree.logs, ...tree.leaves];
    for (const c of cells) setBlockAt(c.x, c.y, c.z, AIR);
    particles.burst(x, y, z, tree.logs[0].id);
    flushDirty(9);
    const tool = held()?.id;
    let leafBursts = 0;
    collapse.start(cells, { x, z }, (c, lx, ly, lz) => {
      const log = isLogBlock(c.id);
      if (log || ++leafBursts % 4 === 0) particles.burst(Math.floor(lx), Math.floor(ly), Math.floor(lz), c.id);
      if (mode !== 'survival') return;
      const d = dropFor(c.id, tool);
      if (d) drops.spawn(d.id, d.n, lx, ly, lz);
    });
    return { logs: tree.logs.length };
  };

  /** Fadöntés: egy természetes fa rönkjét kiütik (kézzel is, csak lassan): az egész fa összeomlik */
  const tryFell = (x: number, y: number, z: number): boolean => {
    const r = collapseTree(x, y, z);
    if (!r) return false;
    wearHeld(r.logs); // minden kidöntött rönk egy használat
    health.exhaust(0.005 * r.logs);
    return true;
  };

  const breakBlock = (x: number, y: number, z: number) => {
    if (tryFell(x, y, z)) return;
    const id = world.getBlock(x, y, z);
    if (!setBlockAt(x, y, z, AIR)) return;
    particles.burst(x, y, z, id);
    // a fa alól kivették a talajt: a fa magától összeomlik
    if (isLogBlock(world.getBlock(x, y + 1, z))) collapseTree(x, y + 1, z);
    // tűzhely: a tartalma a földre esik
    if (blockKey(id) === 'furnace') {
      const f = furnaces.get(fkey(x, y, z));
      if (f) {
        for (const s of f.contents()) drops.spawn(s.id, s.n, x + 0.5, y + 0.5, z + 0.5);
        furnaces.delete(fkey(x, y, z));
      }
    }
    // láda: a tartalma a földre esik
    if (blockKey(id) === 'chest') {
      const ch = chests.get(fkey(x, y, z));
      if (ch) {
        for (const s of ch.contents()) drops.spawn(s.id, s.n, x + 0.5, y + 0.5, z + 0.5);
        chests.delete(fkey(x, y, z));
      }
    }
    // ágy: a másik fele is eltűnik (egyetlen ágyat ad)
    const bedDef = BLOCKS[id]?.bed;
    if (bedDef) {
      const [bx, bz] = BED_DIR[bedDef.dir];
      const sgn = bedDef.half === 0 ? 1 : -1;
      const ox = x + bx * sgn, oz = z + bz * sgn;
      const ob = BLOCKS[world.getBlock(ox, y, oz)]?.bed;
      if (ob && ob.dir === bedDef.dir && ob.half !== bedDef.half) {
        const oid = world.getBlock(ox, y, oz);
        setBlockAt(ox, y, oz, AIR);
        particles.burst(ox, y, oz, oid);
      }
    }
    // ajtó: a másik fele is eltűnik (egyetlen ajtót ad)
    const door = BLOCKS[id]?.door;
    if (door) {
      const oy = door.half === 0 ? y + 1 : y - 1;
      const oid = world.getBlock(x, oy, z);
      if (BLOCKS[oid]?.door?.ids === door.ids) {
        setBlockAt(x, oy, z, AIR);
        particles.burst(x, oy, z, oid);
      }
    }
    if (mode === 'survival') {
      giveDrop(id, x, y, z);
      // a bontás kopasztja az eszközt (a kard kétszer annyira) és kimeríti a játékost; a pillanatok alatt törő dolgok (fű) nem
      if (breakRule(id).hardness > 0) {
        health.exhaust(0.04); // a bányászat fárasztó: kb. 100 blokk egy éhségpont
        wearHeld(toolOf(held()?.id)?.type === 'sword' ? 2 : 1);
      }
    }
    // a rajta álló növény, fáklya, tűz vele együtt leesik
    for (let yy = y + 1; yy < CH; yy++) {
      const up = world.getBlock(x, yy, z);
      if (up === AIR || !isReplaceable(up)) break;
      setBlockAt(x, yy, z, AIR);
      particles.burst(x, yy, z, up);
      if (mode === 'survival') giveDrop(up, x, yy, z);
    }
    // falra szerelt dolog (létra, fali fáklya): ha a fal eltűnt, leesik
    const sides: [number, number, number][] = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]]; // kelet, dél, nyugat, észak
    sides.forEach(([dx, , dz], dirIdx) => {
      const nx = x + dx, nz = z + dz;
      const nid = world.getBlock(nx, y, nz);
      const a = BLOCKS[nid]?.attach;
      // a szomszéd `attach` iránya arra mutat, ahol a fal van: ha onnan nézve rám mutat, én voltam a fal
      if (a !== undefined && (a + 2) % 4 === dirIdx) {
        setBlockAt(nx, y, nz, AIR);
        particles.burst(nx, y, nz, nid);
        if (mode === 'survival') giveDrop(nid, nx, y, nz);
      }
    });
    flushDirty(5);
  };

  /** A kézben lévő stack lecserélése egy másik dologra (üres vödör <-> teli vödör) */
  const swapHeld = (newId: number) => {
    const st = held();
    if (!st) return;
    if (st.n > 1) { st.n--; inv.add(newId, 1); } else inv.slots[input.hotbar] = { id: newId, n: 1 };
    paintHotbar();
  };

  const useItem = (hit: RayHit | null) => {
    const st = held();
    const p = camera.position;
    const id = st?.id ?? 0;

    // üres vödör: folyadék forrás felvétele
    if (id === I.BUCKET) {
      const fh = raycast(world, p.x, p.y, p.z, dir.x, dir.y, dir.z, 6, true);
      if (!fh) return;
      const fid = world.getBlock(fh.x, fh.y, fh.z);
      const kind = fluidKind(fid);
      if (kind && fluidLevel(fid) === 0 && setBlockAt(fh.x, fh.y, fh.z, AIR)) {
        if (mode === 'survival') swapHeld(kind === FLUID_WATER ? I.WATER_BUCKET : I.LAVA_BUCKET);
      }
      return;
    }
    // teli vödör: forrás lerakása
    if (id === I.WATER_BUCKET || id === I.LAVA_BUCKET) {
      if (!hit || hit.py < 0 || hit.py >= CH) return;
      const kind = id === I.WATER_BUCKET ? FLUID_WATER : FLUID_LAVA;
      if (setBlockAt(hit.px, hit.py, hit.pz, fluidId(kind, 0)) && mode === 'survival') swapHeld(I.BUCKET);
      return;
    }
    // kova és acél: tűz a megcélzott blokk mellé
    if (id === I.FLINT_AND_STEEL) {
      if (hit && hit.py >= 0 && hit.py < CH) {
        const cell = world.getBlock(hit.px, hit.py, hit.pz);
        if (cell === AIR || isReplaceable(cell)) setBlockAt(hit.px, hit.py, hit.pz, B.FIRE);
      }
      return;
    }
    // étel
    const food = ITEMS[id]?.food;
    // a krumpli és a murok vethető is: szántóföldre célozva elvetés (nem evés)
    const plantable = Object.keys(SEED_CROP).some((k) => EXTRA_ID[k] === id) && !!hit && isFarmland(world.getBlock(hit.x, hit.y, hit.z));
    if (food && !plantable) {
      // csak éhesen lehet enni (kreatívban nincs éhség)
      return; // az evés a jobb gomb nyomva tartásával megy (lásd az interact-ot)
    }
    if (!hit) return;
    // ásó: a föld felszántása (a fölötte lévő növény eltűnik); mag: elvetés a szántóföldre
    {
      const tid = world.getBlock(hit.x, hit.y, hit.z);
      const above = world.getBlock(hit.x, hit.y + 1, hit.z);
      if (toolOf(id)?.type === 'shovel' && isTillable(tid) && hit.ny >= 0 && (above === AIR || isReplaceable(above))) {
        if (above !== AIR) setBlockAt(hit.x, hit.y + 1, hit.z, AIR);
        const farm = blockId('farmland');
        if (farm !== undefined && setBlockAt(hit.x, hit.y, hit.z, farm)) {
          refresh(hit.x, hit.z);
          if (mode === 'survival') wearHeld(1);
        }
        return;
      }
      // kakaóbab: a jungle rönk oldalára ültetve hüvely nő belőle
      if (id === EXTRA_ID.cocoa_beans && /^jungle_(log|wood)$/.test(blockKey(tid)) && (hit.nx !== 0 || hit.nz !== 0)) {
        const there = world.getBlock(hit.px, hit.py, hit.pz);
        const dir = COCOA_LOG.findIndex(([lx, lz]) => hit.px + lx === hit.x && hit.pz + lz === hit.z);
        const stage0 = blockId('cocoa_stage0');
        const v = stage0 === undefined || dir < 0 ? undefined : BLOCKS[stage0].variants?.[dir];
        if ((there === AIR || isReplaceable(there)) && v !== undefined && setBlockAt(hit.px, hit.py, hit.pz, v)) {
          refresh(hit.px, hit.pz);
          if (mode === 'survival') { inv.takeOne(input.hotbar); paintHotbar(); }
        }
        return;
      }
      const crop = Object.entries(SEED_CROP).find(([k]) => EXTRA_ID[k] === id)?.[1];
      if (crop && isFarmland(tid) && hit.ny > 0 && (above === AIR || isReplaceable(above))) {
        const stage0 = blockId(`${crop}_stage0`);
        if (stage0 !== undefined && setBlockAt(hit.x, hit.y + 1, hit.z, stage0)) {
          refresh(hit.x, hit.z);
          if (mode === 'survival') { inv.takeOne(input.hotbar); paintHotbar(); }
        }
        return;
      }
    }
    // ágy: éjszaka átalszuk az estét
    if (BLOCKS[world.getBlock(hit.x, hit.y, hit.z)]?.bed) {
      sleep();
      return;
    }
    // ajtó: nyitás és csukás
    const hitDoor = BLOCKS[world.getBlock(hit.x, hit.y, hit.z)]?.door;
    if (hitDoor) {
      const flip = (cy: number, d: NonNullable<typeof hitDoor>) => setBlockAt(hit.x, cy, hit.z, d.ids[d.half * 8 + (1 - d.open) * 4 + d.dir]);
      flip(hit.y, hitDoor);
      const oy = hitDoor.half === 0 ? hit.y + 1 : hit.y - 1;
      const od = BLOCKS[world.getBlock(hit.x, oy, hit.z)]?.door;
      if (od && od.ids === hitDoor.ids) flip(oy, od);
      return;
    }
    // munkapad: megnyitja a 3x3-as barkácsrácsot
    if (blockKey(world.getBlock(hit.x, hit.y, hit.z)) === 'crafting_table') {
      openBag(3);
      return;
    }
    // láda: megnyitja a tárolót
    if (blockKey(world.getBlock(hit.x, hit.y, hit.z)) === 'chest') {
      const k = fkey(hit.x, hit.y, hit.z);
      let ch = chests.get(k);
      if (!ch) chests.set(k, (ch = new Chest()));
      openBag('chest', ch);
      return;
    }
    // tűzhely: megnyitja az olvasztó felületet
    if (blockKey(world.getBlock(hit.x, hit.y, hit.z)) === 'furnace') {
      const k = fkey(hit.x, hit.y, hit.z);
      let f = furnaces.get(k);
      if (!f) furnaces.set(k, (f = new Furnace()));
      openBag('furnace', f);
      return;
    }
    if (!st || isItem(id) || hit.py < 0 || hit.py >= CH) return;

    let placeId = id;
    const def = BLOCKS[id];
    // fáklya: oldalra falra kerül (a fal felé dől), felülről a földre áll, alulról nem lehet
    if (def?.wallVariants) {
      if (hit.ny < 0) return;
      if (hit.ny === 0) {
        const wallDir = hit.nx < 0 ? 0 : hit.nx > 0 ? 2 : hit.nz < 0 ? 1 : 3; // a fal a találati lappal szemben van
        const support = [[1, 0], [0, 1], [-1, 0], [0, -1]][wallDir];
        if (!isOpaque(world.getBlock(hit.px + support[0], hit.py, hit.pz + support[1]))) return;
        placeId = def.wallVariants[(wallDir - 2 + 4) % 4];
      } else if (!isOpaque(world.getBlock(hit.px, hit.py - 1, hit.pz))) return;
      if (setBlockAt(hit.px, hit.py, hit.pz, placeId)) {
        refresh(hit.px, hit.pz);
        if (mode === 'survival') { inv.takeOne(input.hotbar); paintHotbar(); }
      }
      return;
    }
    /** a játékos nézési iránya: 0 kelet, 1 dél, 2 nyugat, 3 észak */
    const fx0 = -Math.sin(player.yaw), fz0 = -Math.cos(player.yaw);
    const facing = Math.abs(fx0) > Math.abs(fz0) ? (fx0 > 0 ? 0 : 2) : fz0 > 0 ? 1 : 3;
    if (def?.bed) {
      // ágy: két blokk, a láb a célblokkon, a fej a játékos nézési irányában előtte
      const [bx, bz] = BED_DIR[facing];
      const hx = hit.px + bx, hz = hit.pz + bz;
      const there = world.getBlock(hx, hit.py, hz);
      if (!(there === AIR || isReplaceable(there))) return;
      if (player.intersectsBlock(hit.px, hit.py, hit.pz) || player.intersectsBlock(hx, hit.py, hz)) return;
      const headBase = blockId('bed_head');
      const footV = def.variants?.[facing], headV = headBase === undefined ? undefined : BLOCKS[headBase].variants?.[facing];
      if (footV === undefined || headV === undefined) return;
      if (setBlockAt(hit.px, hit.py, hit.pz, footV) && setBlockAt(hx, hit.py, hz, headV)) {
        refresh(hit.px, hit.pz);
        refresh(hx, hz);
        if (mode === 'survival') { inv.takeOne(input.hotbar); paintHotbar(); }
      }
      return;
    }
    if (def?.door) {
      // ajtó: két blokk magas, a játékos nézési irányába néz
      const above = world.getBlock(hit.px, hit.py + 1, hit.pz);
      if (hit.py + 1 >= CH || !(above === AIR || isReplaceable(above))) return;
      if (player.intersectsBlock(hit.px, hit.py, hit.pz) || player.intersectsBlock(hit.px, hit.py + 1, hit.pz)) return;
      if (setBlockAt(hit.px, hit.py, hit.pz, def.door.ids[facing]) && setBlockAt(hit.px, hit.py + 1, hit.pz, def.door.ids[8 + facing])) {
        refresh(hit.px, hit.pz);
        if (mode === 'survival') { inv.takeOne(input.hotbar); paintHotbar(); }
      }
      return;
    }
    // az átjárható blokkokat (növény, fáklya) a játékos testébe is le lehet rakni
    const blocking = !def?.parts || !!def.boxes?.length;
    if (blocking && player.intersectsBlock(hit.px, hit.py, hit.pz)) return;
    if (def?.variants) {
      // a blokk a játékos nézési irányába néz (a lépcső magas fele előre esik); a létra a megcélzott falra kerül
      let d = facing;
      if (blockKey(id) === 'chest') d = (facing + 1) % 4; // a láda eleje a játékos felé néz
      if (def.wall !== undefined && hit.ny === 0) {
        const wallDir = hit.nx < 0 ? 0 : hit.nx > 0 ? 2 : hit.nz < 0 ? 1 : 3; // a fal a találati lappal szemben van
        d = (wallDir - def.wall + 4) % 4;
      }
      // lap és lépcső: alulról vagy a lap felső felére építve fejjel lefelé kerül
      let flip = 0;
      if (def.variants.length > 4) flip = hit.ny < 0 || (hit.ny === 0 && hit.hy - hit.y > 0.5) ? 1 : 0;
      placeId = def.variants[flip * 4 + d] ?? id;
    }
    if (setBlockAt(hit.px, hit.py, hit.pz, placeId)) {
      refresh(hit.px, hit.pz);
      if (mode === 'survival') { inv.takeOne(input.hotbar); paintHotbar(); }
    }
  };

  // ---------- mobok: sebzés, halál, támadás ----------

  /** A mob halála: a dropok a földre esnek (túlélőben) */
  const onMobDie = (m: Mob) => {
    if (mode !== 'survival') return;
    for (const d of mobDrops(m.kind)) drops.spawn(d.id, d.n, m.x, m.y + 0.4, m.z);
  };

  const makeMobCtx = (sky: { elevation: number }): MobCtx => ({
    px: player.pos.x, py: player.pos.y, pz: player.pos.z,
    target: mode === 'survival' && !health.dead,
    day: sky.elevation > 0.15,
    hurtPlayer: (dmg, fx, fz) => {
      if (mode !== 'survival' || health.dead) return;
      // védekező kard (jobb gomb nyomva): az elölről érkező támadás sebzése és lökése a felére csökken
      const guard = blocking && (fx - player.pos.x) * -Math.sin(player.yaw) + (fz - player.pos.z) * -Math.cos(player.yaw) > 0 ? 0.5 : 1;
      health.damage(wearArmor(dmg * guard));
      lastMobHit = now(); lastMobHitBy = 'slain by a monster';
      const d = Math.hypot(player.pos.x - fx, player.pos.z - fz) || 1;
      player.knock.x += ((player.pos.x - fx) / d) * 5 * guard;
      player.knock.z += ((player.pos.z - fz) / d) * 5 * guard;
    },
    onDie: onMobDie,
  });

  let lastAttack = 0;
  /** A játékos ütése: a kézben tartott eszköz sebzése (kézzel 1), esés közben kritikus (1,5x); kreatívban egy ütés elég */
  const attackMob = (m: Mob) => {
    if (now() - lastAttack < 0.4) return;
    lastAttack = now();
    const tool = toolOf(held()?.id);
    let dmg = mode === 'creative' ? 999 : tool?.damage ?? 1;
    if (!player.onGround && player.vel.y < 0 && !player.inWater) dmg *= 1.5;
    if (m.hurt(dmg, player.pos.x, player.pos.z)) onMobDie(m);
    if (mode === 'survival') {
      health.exhaust(0.1);
      // a kard 1, a többi eszköz 2 kopást kap egy ütéstől
      if (tool) wearHeld(tool.type === 'sword' ? 1 : 2);
    }
  };

  /** az ütés/bontás/lerakás folyamatban (a kézben tartott tárgy lendítéséhez) */
  let handAct = false;
  /** a kard védekező tartásban van (jobb gomb / hosszú nyomás kardnál) */
  let blocking = false;
  let holdRepeat = 0.25; // érintő, kreatív: a következő bontásig hátralévő idő
  let eatT = -1; // az evés eddigi ideje (mp); negatív: nem eszik
  let eatId = 0;
  let eatLock = false; // megevett egy falatot: a jobb gombot el kell engedni a következőhöz
  const interact = (dt: number) => {
    // ütés-mozdulat: a bal gombra (bontás/ütés, a levegőbe is), a jobb gombra lerakáskor/használatkor; evéskor nincs
    const heldFood = ITEMS[held()?.id ?? 0]?.food;
    const isSword = toolOf(held()?.id)?.type === 'sword';
    // érintőn: a vásznon hosszan nyomva tartott ujj bont, ételnél eszik, kardnál védekezik
    if (input.touch) {
      const mineHold = input.holdTouch && !heldFood && !isSword;
      input.breakHeld = mineHold;
      input.placeHeld = input.holdTouch && (!!heldFood || isSword);
      // kreatívban a bontás kattintásra történik: a hosszú nyomás indulásakor egyet bont, tartva ismétel (mint a Pocket Editionben)
      holdRepeat = mineHold ? holdRepeat - dt : 0;
      if (mineHold && holdRepeat <= 0) { input.breakQueued = true; holdRepeat = 0.25; }
    }
    blocking = isSword && input.placeHeld && !health.dead;
    handAct = input.breakHeld || input.breakQueued || input.tapQueued || (input.placeQueued && !heldFood && !isSword);
    // evés: a jobb gombot nyomva kell tartani 1,6 mp-ig; félbehagyva nem fogy el az étel
    if (mode === 'survival' && heldFood && input.placeHeld && health.food < 20 && !eatLock) {
      const eid = held()!.id;
      if (eatId !== eid) { eatId = eid; eatT = 0; }
      eatT = Math.max(0, eatT) + dt;
      if (eatT >= EAT_TIME) {
        if (health.eat(heldFood.hunger, heldFood.sat)) { inv.takeOne(input.hotbar); paintHotbar(); }
        eatT = -1; eatLock = true;
      }
    } else eatT = -1;
    if (!input.placeHeld) eatLock = false;
    camera.getWorldDirection(dir);
    const p = camera.position;
    const blockHit: RayHit | null = raycast(world, p.x, p.y, p.z, dir.x, dir.y, dir.z, 6);
    // ha egy mob közelebb van, mint a megcélzott blokk, őt célozzuk
    const mobHit = settings.mobs === 'off' ? null : mobs.pick(p.x, p.y, p.z, dir.x, dir.y, dir.z, 3.6);
    const blockDist = blockHit ? Math.hypot(blockHit.hx - p.x, blockHit.hy - p.y, blockHit.hz - p.z) : Infinity;
    const mobFirst = !!mobHit && mobHit.t < blockDist;
    // célpont-keret: a keresztszálnál látható mob (nagyobb távolságból is), ha nem takarja blokk
    const lookHit = settings.mobs === 'off' ? null : mobs.pick(p.x, p.y, p.z, dir.x, dir.y, dir.z, 24);
    const farBlock = lookHit ? raycast(world, p.x, p.y, p.z, dir.x, dir.y, dir.z, 24) : null;
    const farDist = farBlock ? Math.hypot(farBlock.hx - p.x, farBlock.hy - p.y, farBlock.hz - p.z) : Infinity;
    const targeted = lookHit && lookHit.t < farDist ? lookHit.mob : null;
    if (settings.mobs === 'off') nameplates.update([], null, camera, innerWidth, innerHeight);
    else nameplates.update(mobs.mobs, targeted, camera, innerWidth, innerHeight);
    const hit: RayHit | null = mobFirst ? null : blockHit;
    if (mobFirst && (input.breakQueued || input.breakHeld || input.tapQueued)) attackMob(mobHit!.mob);
    else if (input.tapQueued) input.placeQueued = true; // koppintás: lerakás / használat (Pocket Edition)
    highlight.visible = !!hit;
    if (hit) {
      const [x0, y0, z0, x1, y1, z1] = hit.box;
      highlight.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      highlight.scale.set(x1 - x0 + 0.004, y1 - y0 + 0.004, z1 - z0 + 0.004);
    }

    // bontás: kreatívban egy kattintás, túlélőben a keménységtől függő ideig tart a nyomva tartás
    if (mode === 'creative') {
      if (input.breakQueued && hit && hit.y > 0) breakBlock(hit.x, hit.y, hit.z);
      mine.active = false;
    } else if (input.breakHeld && hit && hit.y > 0) {
      const id = world.getBlock(hit.x, hit.y, hit.z);
      if (!mine.active || mine.x !== hit.x || mine.y !== hit.y || mine.z !== hit.z) {
        Object.assign(mine, { x: hit.x, y: hit.y, z: hit.z, t: 0, need: breakTime(id, held()?.id, isLogBlock(world.getBlock(hit.x, hit.y + 1, hit.z))), active: true });
      }
      mine.t += dt;
      if (mine.t >= mine.need) {
        breakBlock(hit.x, hit.y, hit.z);
        mine.active = false;
      }
    } else mine.active = false;
    const showBar = mine.active && mine.need > 0.15 && isFinite(mine.need);
    mineEl.classList.toggle('on', showBar);
    if (showBar) mineBar.style.width = `${Math.min(100, (mine.t / mine.need) * 100)}%`;
    // repedések a bontott blokkon
    if (mine.active && hit && isFinite(mine.need) && mine.need > 0.05 && mine.t > 0) cracks.show(hit.box, mine.t / mine.need);
    else cracks.hide();

    if (input.placeQueued) {
      // üres vödör + tehén: tej
      if (mobFirst && mobHit!.mob.kind === 'cow' && held()?.id === I.BUCKET && EXTRA_ID['milk_bucket'] !== undefined) {
        if (mode === 'survival') swapHeld(EXTRA_ID['milk_bucket']);
        input.placeQueued = false;
      } else useItem(hit);
    }
    input.breakQueued = input.placeQueued = input.tapQueued = false;
  };

  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    frame++;
    atlas.anim.update(now / 1000);
    document.body.classList.toggle('ingame', state !== 'menu');

    let cx: number, cz: number;
    if (state !== 'menu') {
      player.yaw += input.dYaw;
      player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch + input.dPitch));
      input.dYaw = input.dPitch = 0;
      const { mx, mz } = input.getMove();
      const wasGround = player.onGround, px0 = player.pos.x, pz0 = player.pos.z;
      player.speedMul = blocking ? 0.8 : 1;
      player.update(dt, mx, mz, input.jump);
      if (mode === 'survival') {
        // a mozgás (méterenként) és az ugrás kimerít
        health.exhaust(Math.hypot(player.pos.x - px0, player.pos.z - pz0) * 0.025);
        if (wasGround && !player.onGround && player.vel.y > 0) health.exhaust(0.05);
      }

      // esés- és környezeti sebzés
      const fall = player.landing;
      player.landing = 0;
      if (fall > 3 && mode === 'survival') lastFallAt = now / 1000;
      if (mode === 'survival') health.fall(fall);
      health.update(dt, {
        inLava: player.inLava, inFire: player.inFire, inWater: player.inWater,
        headUnderwater: player.headUnderwater, creative: mode === 'creative',
      });
      updateVitals(health, true);
      fireEl.classList.toggle('on', health.burn > 0 && mode === 'survival');
      if (health.dead) die();

      camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
      camera.rotation.set(player.pitch, player.yaw, 0);
      if (state === 'playing') interact(dt);
      else { mine.active = false; mineEl.classList.remove('on'); }
      // harmadik személy: a kamera a játékos mögé kerül (az interakció a szemből történt, a fenti sor után)
      walkPhase += Math.hypot(player.pos.x - px0, player.pos.z - pz0);
      playerView.visible = thirdPerson && state === 'playing';
      if (playerView.visible) {
        const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw), cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
        const dist = 3.5;
        if (viewMode === 2) {
          // elölnézet: a kamera a játékos előtt van, és visszanéz rá
          camera.position.set(player.pos.x - sy * cp * dist, player.pos.y + EYE + sp * dist, player.pos.z - cy * cp * dist);
          camera.rotation.set(-player.pitch, player.yaw + Math.PI, 0);
        } else camera.position.set(player.pos.x + sy * cp * dist, player.pos.y + EYE - sp * dist, player.pos.z + cy * cp * dist);
        playerView.setHeld(held()?.id ?? 0);
        playerView.set(player.pos.x, player.pos.y, player.pos.z, player.yaw, walkPhase, Math.hypot(player.vel.x, player.vel.z) / 4, skyAt(timeOfDay, dayCount).light,
          { swing: hand?.swingP ?? 0, eat: hand?.eatP ?? 0, chewPhase: hand?.eatPhase ?? 0, block: blocking });
      }
      cx = player.pos.x;
      cz = player.pos.z;
    } else {
      // a menü mögött a világ lassan körbeforog
      angle += dt * 0.07;
      camera.position.set(spawn.x + Math.cos(angle) * 30, 52, spawn.z + Math.sin(angle) * 30);
      camera.lookAt(spawn.x, 28, spawn.z);
      cx = spawn.x;
      cz = spawn.z;
    }

    // ---------- nappal-éjszaka, ég, víz alatti köd ----------
    // az idő csak játék közben telik (a menüben megáll, a mögötte forgó világban is)
    if (state !== 'menu') {
      timeOfDay += dt / DAY_SECONDS;
      if (timeOfDay >= 1) { timeOfDay -= 1; dayCount++; }
    }
    const sky = skyAt(timeOfDay, dayCount);
    if (sky.moonPhase !== moonShown) { moonShown = sky.moonPhase; moonMat.map = moonTextures[moonShown]; moonMat.needsUpdate = true; }
    const clock = `Day ${dayCount} · ${formatClock(timeOfDay)}`;
    if (clock !== clockText) { clockText = clock; clockEl.textContent = clock; }
    const underwater = state !== 'menu' && player.headUnderwater;
    const inLavaView = state !== 'menu' && player.headInLava;
    const k = Math.pow((sky.light[0] + sky.light[1] + sky.light[2]) / 3, 0.45);
    const bg: RGB = inLavaView ? [0.75, 0.22, 0.04] : underwater ? [0.1 * k, 0.28 * k, 0.6 * k] : sky.sky;
    bgColor.setRGB(bg[0], bg[1], bg[2], THREE.SRGBColorSpace);
    fog.color.copy(bgColor);
    fog.near = inLavaView ? 0.05 : underwater ? 0.5 : fogFar * 0.55;
    fog.far = inLavaView ? 2.5 : underwater ? 24 : fogFar * 0.95;
    material.color.setRGB(sky.light[0], sky.light[1], sky.light[2]);
    chunkMaterial.color.copy(material.color);
    waterMaterial.color.copy(material.color);

    const cp = camera.position;
    const [sx, sy, sz] = sky.sunDir;
    sun.position.set(cp.x + sx * SKY_DIST, cp.y + sy * SKY_DIST, cp.z + sz * SKY_DIST);
    sun.lookAt(cp);
    sun.visible = sky.elevation > -0.2 && !underwater;
    moon.position.set(cp.x - sx * SKY_DIST, cp.y - sy * SKY_DIST, cp.z - sz * SKY_DIST);
    moon.lookAt(cp);
    moon.visible = sky.elevation < 0.2 && !underwater;
    stars.position.copy(cp);
    starMat.opacity = sky.stars;
    stars.visible = sky.stars > 0.01 && !underwater;

    // folyadékok és tűz: állandó 20 tick/másodperc lépésekben, a menü mögött is
    if (state !== 'menu') {
      for (let i = 0; i < world.dynamic.length; i += 3) sim.sched(world.dynamic[i], world.dynamic[i + 1], world.dynamic[i + 2], Math.floor(Math.random() * 10));
      world.dynamic.length = 0;
      simAcc = Math.min(simAcc + dt, 0.25);
      while (simAcc >= 0.05) { simAcc -= 0.05; sim.update(); gravity.update(); }
      if (state === 'playing' || state === 'inventory') crops.update(dt, player.pos.x, player.pos.z);
    }
    if (state !== 'menu') fallingView.update(gravity.fallers, simAcc / 0.05);
    flushDirty(3);
    resumeEl.hidden = !(state === 'playing' && !input.touch && !input.locked);
    if (state !== 'menu') {
      // a tűzhelyek folyamatosan dolgoznak (akkor is, ha épp nem nézed őket)
      for (const f of furnaces.values()) f.update(dt);
      collapse.update(dt);
      // mobok: a szimuláció csak játék közben fut; békés módban nincsenek szörnyek, kikapcsolva semmi
      if (settings.mobs !== 'off') {
        if (state !== 'dead') {
          const night = sky.elevation < -0.05;
          mobs.spawnTick(dt, player.pos.x, player.pos.y, player.pos.z, night, mode === 'survival' && settings.mobs === 'on');
        }
        mobs.update(dt, makeMobCtx(sky));
      }
      mobView.sync(mobs.mobs, sky.light, now / 1000);
      mobView.syncArrows(mobs.arrows);
      // a viselt páncél látszik a karakteren (harmadik személyű nézet)
      const armorSig = inv.armor.map((s) => s?.id ?? 0).join(',');
      if (armorSig !== shownArmor) { shownArmor = armorSig; playerView.setArmor(inv.armor.map((s) => s?.id ?? 0)); }
      hand?.update(dt, held()?.id ?? 0, state === 'playing' && !thirdPerson, Math.min(1, Math.hypot(player.vel.x, player.vel.z) / 4) * (player.onGround ? 1 : 0), handAct, sky.light, eatT, blocking);
      if (state === 'inventory') {
        bag.tick(dt);
        if (bag.isOpen) {
          invPreview ??= createInventoryPreview($<HTMLCanvasElement>('inv-preview'), atlas);
          invPreview.render(inv.armor.map((s) => s?.id ?? 0), held()?.id ?? 0, mouseX, mouseY);
        }
      }
      particles.update(dt);
      drops.update(dt, world, player.pos.x, player.pos.y, player.pos.z, (id, n) => {
        const left = inv.add(id, n);
        if (left < n) paintHotbar();
        return left;
      });
    }
    stream(cx, cz, settings.renderDistance, 4, 2);
    if (frame % 60 === 0) unload(cx, cz, settings.renderDistance);
    renderer.render(scene, camera);
    hand?.render(renderer, camera); // a kéz a világ után, külön (a víz nem takarja el)
  };
  // tesztkörnyezet (scripts/playtest): `?debug` esetén a játék belső állapota elérhető a böngészőből
  if (new URLSearchParams(location.search).has('debug')) {
    (window as unknown as { __voxoria: unknown }).__voxoria = {
      get world() { return world; },
      get player() { return player; },
      get mobs() { return mobs; },
      get state() { return state; },
      get mode() { return mode; },
      inv, input, camera, scene, BLOCKS, blockId,
      /** Új világ adott maggal, a menü kihagyásával (pointer lock nélkül is fut) */
      newGame: (seed: number, m: Mode = 'survival') => {
        clearSave();
        startWorld(seed, null, m);
        started = true;
        state = 'playing';
        menu.hidden = true;
        hud.hidden = false;
        input.reset();
        input.enabled = true;
      },
      teleport: (x: number, y: number, z: number) => { player.pos = { x, y, z }; stream(x, z, 2, Infinity, Infinity); },
      look: (yaw: number, pitch: number) => { player.yaw = yaw; player.pitch = pitch; },
      setBlock: (x: number, y: number, z: number, id: number) => setBlockAt(x, y, z, id),
      getTime: () => timeOfDay, setTime: (t: number) => { timeOfDay = t; }, getDay: () => dayCount,
      /** jobb klikk egy blokkon (használat/lerakás), mintha a játékos célozna rá */
      useAt: (x: number, y: number, z: number) => useItem({ x, y, z, px: x, py: y + 1, pz: z } as unknown as RayHit),
    };
  }

  requestAnimationFrame(loop);
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:1rem;color:#fff">Something went wrong while starting. Check the browser console.</p>');
});
