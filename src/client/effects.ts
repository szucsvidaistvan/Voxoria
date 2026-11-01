import * as THREE from 'three';
import { AIR, BLOCKS, FLUID_LAVA, fluidKind, isSolid } from '../shared/blocks';
import { isItem } from '../shared/items';
import type { World } from '../shared/world';
import { TILE, type Atlas } from './atlas';

// ---------- repedések a bontott blokkon ----------

/** 10 repedés-szakasz egy csíkon (16x16 pixel mindegyik), a közepéről kiinduló sugarakból */
function crackStrip(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rays = Array.from({ length: 14 }, () => ({ a: rnd() * Math.PI * 2, wob: rnd() * 0.5 - 0.25, len: 4 + rnd() * 5 }));
  for (let s = 0; s < 10; s++) {
    const count = 3 + Math.round((s / 9) * (rays.length - 3));
    const grow = 0.25 + (s / 9) * 0.75;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    for (let r = 0; r < count; r++) {
      const ray = rays[r];
      const len = ray.len * grow;
      for (let t = 0; t < len; t += 0.5) {
        const ang = ray.a + ray.wob * t * 0.3;
        const x = Math.round(7.5 + Math.cos(ang) * t), y = Math.round(7.5 + Math.sin(ang) * t);
        if (x >= 0 && x < 16 && y >= 0 && y < 16) ctx.fillRect(s * 16 + x, y, 1, 1);
      }
    }
  }
  return c;
}

export function createCracks(scene: THREE.Scene) {
  const tex = new THREE.CanvasTexture(crackStrip());
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.repeat.set(0.1, 1);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  mesh.visible = false;
  mesh.renderOrder = 2;
  scene.add(mesh);
  return {
    /** box: a bontott doboz (x0,y0,z0,x1,y1,z1), progress: 0..1 */
    show(box: readonly number[], progress: number) {
      const stage = Math.max(0, Math.min(9, Math.floor(progress * 10)));
      tex.offset.x = stage * 0.1;
      mesh.position.set((box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2);
      mesh.scale.set(box[3] - box[0] + 0.006, box[4] - box[1] + 0.006, box[5] - box[2] + 0.006);
      mesh.visible = true;
    },
    hide() {
      mesh.visible = false;
    },
  };
}

// ---------- törmelék ----------

/** Apró, színes négyzetek, amik a blokk textúrájából vett színekkel szétrepülnek és leesnek */
export function createParticles(scene: THREE.Scene, atlas: Atlas) {
  const N = 480;
  const pos = new Float32Array(N * 3).fill(-1000);
  const col = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.11, vertexColors: true, sizeAttenuation: true }));
  points.frustumCulled = false;
  scene.add(points);

  const pixels = new Map<string, Uint8ClampedArray>();
  const samples = (name: string): Uint8ClampedArray => {
    let p = pixels.get(name);
    if (!p) {
      const [sx, sy] = atlas.cell(name);
      p = atlas.canvas.getContext('2d')!.getImageData(sx, sy, TILE, TILE).data;
      pixels.set(name, p);
    }
    return p;
  };
  let next = 0;

  return {
    /** Szétrepülő darabok a blokk helyén (a blokk textúrájából) */
    burst(x: number, y: number, z: number, id: number) {
      const def = BLOCKS[id];
      if (!def) return;
      const names = [def.top, def.side, def.side, def.bottom];
      const tint = def.tint?.side;
      for (let k = 0; k < 18; k++) {
        const i = next++ % N;
        const px = samples(names[k % names.length]);
        let o = 0;
        for (let tries = 0; tries < 6; tries++) {
          o = Math.floor(Math.random() * TILE * TILE) * 4;
          if (px[o + 3] > 128) break;
        }
        col[i * 3] = (px[o] / 255) * (tint?.[0] ?? 1);
        col[i * 3 + 1] = (px[o + 1] / 255) * (tint?.[1] ?? 1);
        col[i * 3 + 2] = (px[o + 2] / 255) * (tint?.[2] ?? 1);
        pos[i * 3] = x + 0.5 + (Math.random() - 0.5) * 0.9;
        pos[i * 3 + 1] = y + 0.5 + (Math.random() - 0.5) * 0.9;
        pos[i * 3 + 2] = z + 0.5 + (Math.random() - 0.5) * 0.9;
        vel[i * 3] = (Math.random() - 0.5) * 3.2;
        vel[i * 3 + 1] = Math.random() * 3.5 + 0.5;
        vel[i * 3 + 2] = (Math.random() - 0.5) * 3.2;
        life[i] = 0.5 + Math.random() * 0.6;
      }
      geo.attributes.color.needsUpdate = true;
    },
    update(dt: number) {
      let any = false;
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) { pos[i * 3 + 1] = -1000; any = true; continue; }
        vel[i * 3 + 1] -= 14 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        any = true;
      }
      if (any) geo.attributes.position.needsUpdate = true;
    },
  };
}

// ---------- a földön heverő tárgyak ----------

interface Drop {
  id: number;
  n: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number;
  phase: number;
  landed: boolean;
  mesh: THREE.Object3D;
  /** ennyi másodpercig nem vehető fel (pl. visszadobott vagy tele a tároló) */
  wait: number;
}

/**
 * A kibontott blokkok és tárgyak a földre esnek, ott forognak és lebegnek, és a játékos felveszi őket,
 * ha a közelükbe ér. A tömör blokkok apró kockák, minden más (tárgy, növény, lap) kép.
 */
export function createDrops(
  scene: THREE.Scene,
  atlas: Atlas,
  material: THREE.Material,
  paint: (c: HTMLCanvasElement, id: number) => void,
) {
  const MAX = 140;
  const list: Drop[] = [];
  const geos = new Map<number, THREE.BufferGeometry>();
  const sprites = new Map<number, { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; mat: THREE.MeshBasicMaterial }>();
  const planeGeo = new THREE.PlaneGeometry(0.44, 0.44);

  const cubeGeo = (id: number): THREE.BufferGeometry => {
    let g = geos.get(id);
    if (g) return g;
    const def = BLOCKS[id];
    const h = 0.15;
    const faces: { v: number[][]; shade: number; name: string }[] = [
      { v: [[-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h]], shade: 1, name: def.top },
      { v: [[-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h]], shade: 0.5, name: def.bottom },
      { v: [[h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h]], shade: 0.8, name: def.side },
      { v: [[-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h]], shade: 0.8, name: def.side },
      { v: [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]], shade: 0.65, name: def.side },
      { v: [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]], shade: 0.65, name: def.side },
    ];
    const pos: number[] = [], uvs: number[] = [], cols: number[] = [], idx: number[] = [];
    const tint = def.tint?.side;
    for (const f of faces) {
      const [u0, v0, u1, v1] = atlas.uv(f.name);
      const base = pos.length / 3;
      for (const v of f.v) {
        pos.push(...v);
        cols.push(f.shade * (tint?.[0] ?? 1), f.shade * (tint?.[1] ?? 1), f.shade * (tint?.[2] ?? 1));
      }
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx);
    geos.set(id, g);
    return g;
  };

  const sprite = (id: number) => {
    let s = sprites.get(id);
    if (!s) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = TILE;
      paint(canvas, id);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      s = { canvas, tex, mat: new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide }) };
      sprites.set(id, s);
    }
    return s;
  };

  const makeMesh = (id: number): THREE.Object3D => {
    const def = BLOCKS[id];
    if (!isItem(id) && def && !def.parts) return new THREE.Mesh(cubeGeo(id), material);
    return new THREE.Mesh(planeGeo, sprite(id).mat);
  };

  /** a lyukas (átjárható) blokkokon a tárgyak átesnek */
  const blocking = (id: number) => id !== AIR && isSolid(id) && !(BLOCKS[id]?.boxes && BLOCKS[id].boxes!.length === 0);

  return {
    get count() {
      return list.length;
    },
    spawn(id: number, n: number, x: number, y: number, z: number) {
      if (list.length >= MAX) {
        const old = list.shift()!;
        scene.remove(old.mesh);
      }
      const mesh = makeMesh(id);
      scene.add(mesh);
      list.push({
        id, n, x: x + (Math.random() - 0.5) * 0.3, y, z: z + (Math.random() - 0.5) * 0.3,
        vx: (Math.random() - 0.5) * 2.2, vy: 2.5 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 2.2,
        age: 0, phase: Math.random() * 6.28, landed: false, mesh, wait: 0.5,
      });
    },
    /** A tárgyak ikonjának újrarajzolása (pl. amikor egy elem textúrája betöltődött) */
    refreshIcons() {
      for (const [id, s] of sprites) {
        s.canvas.getContext('2d')!.clearRect(0, 0, TILE, TILE);
        paint(s.canvas, id);
        s.tex.needsUpdate = true;
      }
    },
    clear() {
      for (const d of list) scene.remove(d.mesh);
      list.length = 0;
    },
    /**
     * @param giveToPlayer visszaadja, hány darab NEM fért el
     */
    update(dt: number, world: World, px: number, py: number, pz: number, giveToPlayer: (id: number, n: number) => number) {
      for (let i = list.length - 1; i >= 0; i--) {
        const d = list[i];
        d.age += dt;
        d.wait -= dt;
        if (!world.isLoaded(Math.floor(d.x), Math.floor(d.z))) continue;

        const cell = world.getBlock(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z));
        const kind = fluidKind(cell);
        if (kind === FLUID_LAVA || d.age > 300 || d.y < -10) {
          scene.remove(d.mesh);
          list.splice(i, 1);
          continue;
        }

        // vonzás és felvétel
        const dx = px - d.x, dy = py + 0.9 - d.y, dz = pz - d.z;
        const dist = Math.hypot(dx, dy, dz);
        if (d.wait <= 0 && dist < 2.6) {
          const sp = Math.min(7, 2 + (2.6 - dist) * 3);
          d.x += (dx / dist) * sp * dt;
          d.y += (dy / dist) * sp * dt;
          d.z += (dz / dist) * sp * dt;
          d.landed = false;
          d.vx = d.vz = 0;
          d.vy = 0;
          if (dist < 0.85) {
            const left = giveToPlayer(d.id, d.n);
            if (left <= 0) {
              scene.remove(d.mesh);
              list.splice(i, 1);
              continue;
            }
            d.n = left;
            d.wait = 1.5; // tele a tároló: később újra próbálkozik
          }
        } else {
          // mozgás: gravitáció, vízben lassabb, a tömör blokkok megállítják
          d.vy -= (kind ? 3 : 18) * dt;
          if (kind) { d.vy *= 0.92; d.vx *= 0.9; d.vz *= 0.9; }
          const nx = d.x + d.vx * dt, nz = d.z + d.vz * dt;
          if (!blocking(world.getBlock(Math.floor(nx), Math.floor(d.y), Math.floor(d.z)))) d.x = nx; else d.vx = 0;
          if (!blocking(world.getBlock(Math.floor(d.x), Math.floor(d.y), Math.floor(nz)))) d.z = nz; else d.vz = 0;
          const ny = d.y + d.vy * dt;
          const below = world.getBlock(Math.floor(d.x), Math.floor(ny - 0.15), Math.floor(d.z));
          if (d.vy <= 0 && blocking(below)) {
            d.y = Math.floor(ny - 0.15) + 1 + 0.15;
            d.vy = 0;
            d.vx *= 0.7;
            d.vz *= 0.7;
            d.landed = true;
          } else {
            d.y = ny;
            d.landed = false;
          }
        }

        const bob = d.landed ? Math.sin(d.age * 2.4 + d.phase) * 0.05 + 0.05 : 0;
        d.mesh.position.set(d.x, d.y + bob, d.z);
        d.mesh.rotation.y = d.age * 1.6 + d.phase;
      }
    },
  };
}
