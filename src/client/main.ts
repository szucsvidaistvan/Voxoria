import './style.css';
import * as THREE from 'three';
import { B, BLOCKS, HOTBAR, placeableBlocks, type RGB } from '../shared/blocks';
import { raycast, type RayHit } from '../shared/raycast';
import { CH, CS, SEA_LEVEL, World } from '../shared/world';
import { buildAtlas } from './atlas';
import { DAY_SECONDS, START_TIME, skyAt } from './daynight';
import { Input } from './input';
import { buildChunkGeometry } from './mesher';
import { EYE, Player } from './player';
import { clearSave, loadSave, loadSettings, writeSave, writeSettings, type SaveData } from './save';

const SKY = 0x8fb8ff;
const TILE = 32;
const SKY_DIST = 300; // a nap, a hold és a csillagok távolsága (a kamera far értéke 400)

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function main(): Promise<void> {
  const atlas = buildAtlas();

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
  // a víz átlátszó, és alulról is látszik a felszíne
  const waterMaterial = new THREE.MeshBasicMaterial({
    map: atlas.texture, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide,
  });

  // ég: nap, hold, csillagok (a kamerával együtt mozognak)
  const sun = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, fog: false, side: THREE.DoubleSide }),
  );
  const moon = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshBasicMaterial({ color: 0xdfe6f5, fog: false, side: THREE.DoubleSide }),
  );
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
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
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
  const hotbar = [...HOTBAR];
  const input = new Input(canvas, hotbar.length);
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
  /** chunkonként két mesh: a szilárd blokkoké és a vízé */
  const meshes = new Map<string, THREE.Mesh[]>();
  const built = new Set<string>();
  let started = false;
  let timeOfDay = START_TIME;
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
    add(g.solid, material, 0);
    add(g.water, waterMaterial, 1);
    if (list.length) meshes.set(key, list);
    built.add(key);
  };

  const refresh = (x: number, z: number) => {
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const lx = x - cx * CS, lz = z - cz * CS;
    rebuild(cx, cz);
    if (lx === 0) rebuild(cx - 1, cz);
    if (lx === CS - 1) rebuild(cx + 1, cz);
    if (lz === 0) rebuild(cx, cz - 1);
    if (lz === CS - 1) rebuild(cx, cz + 1);
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

  const startWorld = (seed: number, save: SaveData | null) => {
    clearWorld();
    world = new World(seed);
    if (save) world.importEdits(save.edits);
    timeOfDay = save?.time ?? START_TIME;
    if (save?.hotbar && save.hotbar.length === hotbar.length) {
      // csak a most is ismert blokkokat állítjuk vissza (másik textúracsomagnál az azonosítók eltérhetnek)
      save.hotbar.forEach((id, i) => { if (BLOCKS[id]) hotbar[i] = id; });
      hotbar.forEach((_, i) => paintSlot(i));
    }
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
    writeSave({ seed: world.seed, edits: world.exportEdits(), pos: [p.x, p.y, p.z], yaw: player.yaw, pitch: player.pitch, time: timeOfDay, hotbar: [...hotbar] });
  };

  // ---------- hotbar ----------
  /** A blokk ikonja: az oldallap textúrája az atlaszból, színezéssel */
  const drawIcon = (c: HTMLCanvasElement, id: number) => {
    const def = BLOCKS[id];
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, TILE, TILE);
    if (!def) return;
    const [sx, sy] = atlas.cell(def.side);
    ctx.drawImage(atlas.canvas, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
    const tint = def.tint?.side;
    if (tint) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${tint.map((v) => Math.round(v * 255)).join(',')})`;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  const hotbarEl = $('hotbar');
  const slotEls: HTMLElement[] = [];
  const slotCanvases: HTMLCanvasElement[] = [];
  const paintSlot = (i: number) => {
    slotEls[i].title = BLOCKS[hotbar[i]]?.name ?? '';
    drawIcon(slotCanvases[i], hotbar[i]);
  };
  hotbar.forEach((_, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    const c = document.createElement('canvas');
    c.width = c.height = TILE;
    slot.appendChild(c);
    slot.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      input.hotbar = i;
      selectSlot(i);
    });
    hotbarEl.appendChild(slot);
    slotEls.push(slot);
    slotCanvases.push(c);
    paintSlot(i);
  });
  const selectSlot = (i: number) => slotEls.forEach((el, n) => el.classList.toggle('selected', n === i));
  input.onHotbar = selectSlot;
  selectSlot(0);

  // ---------- menü ----------
  type State = 'menu' | 'playing' | 'inventory';
  let state: State = 'menu';
  const menu = $('menu'), hud = $('hud');
  const btnContinue = $('btn-continue'), btnNew = $('btn-new'), btnSettings = $('btn-settings');
  const settingsEl = $('settings');
  const distEl = $<HTMLInputElement>('set-dist'), distVal = $('set-dist-val'), sensEl = $<HTMLInputElement>('set-sens');

  const refreshMenu = () => {
    btnContinue.hidden = !(started || loadSave());
  };

  const play = () => {
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

  // ---------- kreatív inventory ----------
  const invEl = $('inventory'), invGrid = $('inv-grid'), invInfo = $('inv-info');
  const invSearch = $<HTMLInputElement>('inv-search');
  type InvItem = { id: number; el: HTMLButtonElement; text: string };
  let invItems: InvItem[] = [];

  const buildInventory = () => {
    const frag = document.createDocumentFragment();
    invItems = placeableBlocks().map((id) => {
      const def = BLOCKS[id];
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'inv-item';
      el.title = def.name;
      el.setAttribute('aria-label', def.name);
      const c = document.createElement('canvas');
      c.width = c.height = TILE;
      drawIcon(c, id);
      el.appendChild(c);
      el.addEventListener('click', () => {
        hotbar[input.hotbar] = id;
        paintSlot(input.hotbar);
        closeInventory();
      });
      frag.appendChild(el);
      return { id, el, text: `${def.name} ${def.key ?? ''}`.toLowerCase() };
    });
    invGrid.replaceChildren(frag);
  };

  const filterInventory = () => {
    const q = invSearch.value.trim().toLowerCase().replace(/\s+/g, '_');
    const words = q.split('_').filter(Boolean);
    let shown = 0;
    for (const it of invItems) {
      const hay = it.text.replace(/\s+/g, '_');
      const ok = words.every((w) => hay.includes(w));
      it.el.hidden = !ok;
      if (ok) shown++;
    }
    invInfo.textContent = `${shown} blokk`;
  };
  invSearch.addEventListener('input', filterInventory);

  const openInventory = () => {
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
  function closeInventory() {
    if (state !== 'inventory') return;
    invEl.hidden = true;
    invSearch.blur();
    state = 'playing';
    input.reset();
    input.enabled = true;
    input.lock();
  }
  input.onInventory = () => (state === 'inventory' ? closeInventory() : openInventory());
  $('inv-close').addEventListener('click', closeInventory);
  document.addEventListener('keydown', (e) => {
    if (state !== 'inventory') return;
    if (e.code === 'Escape') closeInventory();
    else if (e.code === 'KeyE' && e.target !== invSearch) closeInventory();
  });

  btnContinue.addEventListener('click', () => {
    if (!started) {
      const save = loadSave();
      if (save) startWorld(save.seed, save);
      started = true;
    }
    play();
  });
  btnNew.addEventListener('click', () => {
    clearSave();
    startWorld((Math.random() * 2 ** 31) | 0, null);
    started = true;
    play();
  });
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
    ? 'Bal oldalon a joystick, a jobb oldalon húzással nézel körül. A gombokkal bontasz, építesz és ugrasz.'
    : 'WASD mozgás, szóköz ugrás, bal gomb bont, jobb gomb épít, 1–8 vagy görgő a blokkválasztáshoz, Esc a menühöz.';

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

  const interact = () => {
    camera.getWorldDirection(dir);
    const p = camera.position;
    const hit: RayHit | null = raycast(world, p.x, p.y, p.z, dir.x, dir.y, dir.z, 6);
    highlight.visible = !!hit;
    if (hit) highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);

    if (input.breakQueued && hit && hit.y > 0) {
      if (world.setBlock(hit.x, hit.y, hit.z, 0)) refresh(hit.x, hit.z);
    }
    if (input.placeQueued && hit && hit.py >= 0 && hit.py < CH && !player.intersectsBlock(hit.px, hit.py, hit.pz)) {
      if (world.setBlock(hit.px, hit.py, hit.pz, hotbar[input.hotbar] ?? B.DIRT)) refresh(hit.px, hit.pz);
    }
    input.breakQueued = input.placeQueued = false;
  };

  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    frame++;

    let cx: number, cz: number;
    if (state !== 'menu') {
      player.yaw += input.dYaw;
      player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch + input.dPitch));
      input.dYaw = input.dPitch = 0;
      const { mx, mz } = input.getMove();
      player.update(dt, mx, mz, input.jump);

      camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
      camera.rotation.set(player.pitch, player.yaw, 0);
      interact();
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
    timeOfDay = (timeOfDay + dt / DAY_SECONDS) % 1;
    const sky = skyAt(timeOfDay);
    const underwater = state !== 'menu' && player.headUnderwater;
    const k = Math.pow((sky.light[0] + sky.light[1] + sky.light[2]) / 3, 0.45);
    const bg: RGB = underwater ? [0.1 * k, 0.28 * k, 0.6 * k] : sky.sky;
    bgColor.setRGB(bg[0], bg[1], bg[2], THREE.SRGBColorSpace);
    fog.color.copy(bgColor);
    fog.near = underwater ? 0.5 : fogFar * 0.55;
    fog.far = underwater ? 24 : fogFar * 0.95;
    material.color.setRGB(sky.light[0], sky.light[1], sky.light[2]);
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

    stream(cx, cz, settings.renderDistance, 4, 2);
    if (frame % 60 === 0) unload(cx, cz, settings.renderDistance);
    renderer.render(scene, camera);
  };
  requestAnimationFrame(loop);
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:1rem;color:#fff">Hiba történt az indításkor. Nézd meg a böngésző konzolját.</p>');
});
