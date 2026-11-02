import './style.css';
import * as THREE from 'three';
import {
  AIR, B, BLOCKS, FLUID_LAVA, FLUID_WATER, HOTBAR, blockKey, fluidId, fluidKind, fluidLevel, placeableBlocks,
  registerGenerated, type GeneratedPack, type RGB,
} from '../shared/blocks';
import { FluidSim, isReplaceable } from '../shared/fluids';
import { I, ITEMS, isItem, itemName } from '../shared/items';
import { CATEGORIES, categoryOf } from '../shared/categories';
import { initRecipes } from '../shared/recipes';
import { Furnace, initSmelting } from '../shared/smelting';
import { LIGHT, isOpaque } from '../shared/blocks';
import { resetLightCache } from '../shared/light';
import { breakTime, dropFor } from '../shared/survival';
import { raycast, type RayHit } from '../shared/raycast';
import { CH, CS, SEA_LEVEL, World } from '../shared/world';
import { buildAtlas, TILE } from './atlas';
import { DAY_SECONDS, START_TIME, formatClock, skyAt } from './daynight';
import { createMoonTexture, createSunTexture } from './sky';
import { BagUI, HOTBAR_SIZE, Inventory, SlotView, createItemPainter } from './inventory';
import { Health, createVitals } from './health';
import { createCracks, createDrops, createParticles } from './effects';
import { createBlockIcons } from './icons';
import { Input } from './input';
import { buildChunkGeometry } from './mesher';
import { EYE, Player } from './player';
import { clearSave, loadSave, loadSettings, writeSave, writeSettings, type SaveData } from './save';

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
  const settings = loadSettings({ renderDistance: input.touch ? 4 : 6, sensitivity: 1 });

  let fogFar = 100;
  const applySettings = () => {
    input.sensitivity = settings.sensitivity;
    fogFar = settings.renderDistance * CS;
  };

  // ---------- világ ----------
  let world: World;
  let player: Player;
  let sim: FluidSim;
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
  /** a lerakott tűzhelyek állapota, a helyük szerint ("x,y,z") */
  const furnaces = new Map<string, Furnace>();
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
    dirty.clear();
    drops.clear();
    if (save) world.importEdits(save.edits);
    timeOfDay = save?.time ?? START_TIME;
    dayCount = save?.day ?? 1;
    furnaces.clear();
    for (const a of save?.furnaces ?? []) furnaces.set(fkey(a[0], a[1], a[2]), Furnace.fromFlat(a.slice(3)));

    // játékmód és tároló (a régi mentések kreatívak voltak, csak a hotbarjuk volt meg)
    mode = save ? save.mode ?? 'creative' : newMode;
    document.body.classList.toggle('creative', mode === 'creative');
    inv.slots.fill(null);
    if (save?.inv) inv.fromFlat(save.inv);
    else if (save?.hotbar) save.hotbar.forEach((id, i) => { if (BLOCKS[id] && i < HOTBAR_SIZE) inv.slots[i] = { id, n: 1 }; });
    else if (mode === 'creative') HOTBAR.forEach((id, i) => { inv.slots[i] = { id, n: 1 }; });
    paintHotbar();
    health.reset();
    if (save?.hp !== undefined) health.hp = Math.max(1, Math.min(health.max, save.hp));
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
      time: timeOfDay, day: dayCount, furnaces: [...furnaces].map(([k, f]) => [...k.split(',').map(Number), ...f.toFlat()]), mode, hp: health.hp, inv: inv.toFlat(),
    });
  };

  // ---------- hotbar ----------
  /** A blokk ikonja: izometrikus kocka (a nem kocka alakú blokkok dobozokból, a növények képként) */
  const drawIcon = createBlockIcons(atlas);

  /** Az elem textúrák betöltése után minden ikon újrarajzolódik */
  const itemPainter = createItemPainter(import.meta.env.BASE_URL, () => {
    hotViews.forEach((v) => v.invalidate());
    paintHotbar();
    bag.invalidate();
    drops.refreshIcons();
  });
  const paintStack = (c: HTMLCanvasElement, id: number) => (isItem(id) ? itemPainter(c, id) : drawIcon(c, id));

  const drops = createDrops(scene, atlas, material, paintStack);
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
  const updateVitals = createVitals($('hearts'), $('air'));
  const hurtEl = $('hurt'), fireEl = $('fire-overlay');
  health.onHurt = () => {
    hurtEl.classList.remove('flash');
    void hurtEl.offsetWidth; // az animáció újraindításához
    hurtEl.classList.add('flash');
  };
  let lastFallAt = -99;

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
  const play = () => {
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
  type InvItem = { id: number; cat: string; el: HTMLButtonElement; text: string };
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
        invItems.push({ id, cat: cat.id, el, text: `${name} ${blockKey(id)}`.toLowerCase() });
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
  const openBag = (size: 2 | 3 | 'furnace', furnace?: Furnace) => {
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
  input.onInventory = () => (state === 'inventory' ? closeUI() : mode === 'creative' ? openPicker() : openBag(2));
  $('inv-close').addEventListener('click', () => closeUI());
  document.addEventListener('keydown', (e) => {
    if (state !== 'inventory') return;
    if (e.code === 'Escape') { e.preventDefault(); closeUI(true); }
    else if (e.code === 'KeyE' && e.target !== invSearch) closeUI();
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
    const cause = player.inLava ? 'You burned to death in lava.'
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
  sensEl.addEventListener('input', () => {
    settings.sensitivity = Number(sensEl.value);
    applySettings();
    writeSettings(settings);
  });

  $('controls').textContent = input.touch
    ? 'Move with the joystick on the left, look around by dragging on the right. Hold Break to mine (in survival mining takes time), Place puts down a block or uses what you hold (crafting table, door, bucket, food). Items opens your inventory.'
    : 'WASD to move, Space to jump or swim, hold left click to mine, right click to place or use (crafting table, doors, bucket, flint and steel, apple), 1–9 or scroll to choose a slot, E for the inventory, Esc for the menu.';
  if (input.touch) $('bag-hint').textContent = 'Tap: pick up / place. Long press: take half / place one. Drag a stack to move it. Tap outside to close.';
  $('pack-note').hidden = atlas.usingPack;

  // ---------- indulás ----------
  const existing = loadSave();
  startWorld(existing ? existing.seed : 20260, null);
  applySettings();
  refreshMenu();

  setInterval(() => { if (state !== 'menu') saveGame(); }, 20000);
  window.addEventListener('beforeunload', saveGame);

  // ---------- fő ciklus ----------
  const dir = new THREE.Vector3();
  let last = performance.now();
  let angle = 0;
  let frame = 0;
  let simAcc = 0;
  const clockEl = $('clock');
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
    return true;
  };

  /** A kibontott blokk a földre esik (a játékos felveszi, ha a közelébe ér) */
  const giveDrop = (id: number, x: number, y: number, z: number) => {
    const d = dropFor(id, held()?.id);
    if (d) drops.spawn(d.id, d.n, x + 0.5, y + 0.5, z + 0.5);
  };

  const breakBlock = (x: number, y: number, z: number) => {
    const id = world.getBlock(x, y, z);
    if (!setBlockAt(x, y, z, AIR)) return;
    particles.burst(x, y, z, id);
    // tűzhely: a tartalma a földre esik
    if (blockKey(id) === 'furnace') {
      const f = furnaces.get(fkey(x, y, z));
      if (f) {
        for (const s of f.contents()) drops.spawn(s.id, s.n, x + 0.5, y + 0.5, z + 0.5);
        furnaces.delete(fkey(x, y, z));
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
    if (mode === 'survival') giveDrop(id, x, y, z);
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
    const heal = ITEMS[id]?.heal;
    if (heal) {
      if (health.hp < health.max) {
        health.heal(heal);
        if (mode === 'survival') { inv.takeOne(input.hotbar); paintHotbar(); }
      }
      return;
    }
    if (!hit) return;
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

  const interact = (dt: number) => {
    camera.getWorldDirection(dir);
    const p = camera.position;
    const hit: RayHit | null = raycast(world, p.x, p.y, p.z, dir.x, dir.y, dir.z, 6);
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
        Object.assign(mine, { x: hit.x, y: hit.y, z: hit.z, t: 0, need: breakTime(id, held()?.id), active: true });
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

    if (input.placeQueued) useItem(hit);
    input.breakQueued = input.placeQueued = false;
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
      player.update(dt, mx, mz, input.jump);

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
      while (simAcc >= 0.05) { simAcc -= 0.05; sim.update(); }
    }
    flushDirty(3);
    if (state !== 'menu') {
      // a tűzhelyek folyamatosan dolgoznak (akkor is, ha épp nem nézed őket)
      for (const f of furnaces.values()) f.update(dt);
      if (state === 'inventory') bag.tick();
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
  };
  requestAnimationFrame(loop);
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:1rem;color:#fff">Something went wrong while starting. Check the browser console.</p>');
});
