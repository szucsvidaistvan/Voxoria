<<<<<<<+HEAD
import './style.css';
import * as THREE from 'three';
import { B, BLOCKS, HOTBAR } from '../shared/blocks';
import { raycast, type RayHit } from '../shared/raycast';
import { CH, CS, World } from '../shared/world';
import { buildAtlas } from './atlas';
import { Input } from './input';
import { buildChunkGeometry } from './mesher';
import { EYE, Player } from './player';
import { clearSave, loadSave, loadSettings, writeSave, writeSettings, type SaveData } from './save';

const SKY = 0x8fb8ff;
const TILE = 32;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function main(): Promise<void> {
  const atlas = await buildAtlas();

  // ---------- renderelés ----------
  const canvas = $<HTMLCanvasElement>('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 400);
  camera.rotation.order = 'YXZ';
  const material = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.5 });

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
  const input = new Input(canvas, HOTBAR.length);
  if (input.touch) document.body.classList.add('touch');
  const settings = loadSettings({ renderDistance: input.touch ? 4 : 6, sensitivity: 1 });

  const applySettings = () => {
    input.sensitivity = settings.sensitivity;
    const far = settings.renderDistance * CS;
    scene.fog = new THREE.Fog(SKY, far * 0.55, far * 0.95);
  };

  // ---------- világ ----------
  let world: World;
  let player: Player;
  const meshes = new Map<string, THREE.Mesh>();
  const built = new Set<string>();
  let started = false;
  const spawn = { x: 8, z: 8 };

  const rebuild = (cx: number, cz: number) => {
    const chunk = world.getChunk(cx, cz);
    if (!chunk) return;
    const key = World.key(cx, cz);
    const old = meshes.get(key);
    if (old) {
      scene.remove(old);
      old.geometry.dispose();
      meshes.delete(key);
    }
    const g = buildChunkGeometry(world, chunk, atlas);
    if (g) {
      const m = new THREE.Mesh(g, material);
      m.position.set(cx * CS, 0, cz * CS);
      scene.add(m);
      meshes.set(key, m);
    }
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
      const m = meshes.get(key);
      if (m) {
        scene.remove(m);
        m.geometry.dispose();
        meshes.delete(key);
      }
      built.delete(key);
      world.chunks.delete(key); // a módosítások megmaradnak, újratöltéskor visszakerülnek
    }
  };

  const clearWorld = () => {
    for (const m of meshes.values()) {
      scene.remove(m);
      m.geometry.dispose();
    }
    meshes.clear();
    built.clear();
  };

  const startWorld = (seed: number, save: SaveData | null) => {
    clearWorld();
    world = new World(seed);
    if (save) world.importEdits(save.edits);
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
    writeSave({ seed: world.seed, edits: world.exportEdits(), pos: [p.x, p.y, p.z], yaw: player.yaw, pitch: player.pitch });
  };

  // ---------- hotbar ----------
  const hotbarEl = $('hotbar');
  const slotEls: HTMLElement[] = [];
  HOTBAR.forEach((id, i) => {
    const def = BLOCKS[id];
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.title = def.name;
    const c = document.createElement('canvas');
    c.width = c.height = TILE;
    const ctx = c.getContext('2d')!;
    const [sx, sy] = atlas.cell(def.side);
    ctx.drawImage(atlas.canvas, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
    const tint = def.tint?.side;
    if (tint) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${tint.map((v) => Math.round(v * 255)).join(',')})`;
      ctx.fillRect(0, 0, TILE, TILE);
    }
    slot.appendChild(c);
    slot.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      input.hotbar = i;
      selectSlot(i);
    });
    hotbarEl.appendChild(slot);
    slotEls.push(slot);
  });
  const selectSlot = (i: number) => slotEls.forEach((el, n) => el.classList.toggle('selected', n === i));
  input.onHotbar = selectSlot;
  selectSlot(0);

  // ---------- menü ----------
  type State = 'menu' | 'playing';
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
  $('pack-note').hidden = atlas.usingPack;

  // ---------- indulás ----------
  const existing = loadSave();
  startWorld(existing ? existing.seed : 20260, null);
  applySettings();
  refreshMenu();

  setInterval(() => { if (state === 'playing') saveGame(); }, 20000);
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
      if (world.setBlock(hit.px, hit.py, hit.pz, HOTBAR[input.hotbar] ?? B.DIRT)) refresh(hit.px, hit.pz);
    }
    input.breakQueued = input.placeQueued = false;
  };

  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    frame++;

    let cx: number, cz: number;
    if (state === 'playing') {
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
=======

>>>>>>> main
