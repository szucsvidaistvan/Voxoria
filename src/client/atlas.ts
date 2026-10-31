import * as THREE from 'three';
import { BASE_TEXTURES, extraTextures, type TexName } from '../shared/blocks';

/** egy textúra felbontása (pixel) */
export const TILE = 64;
/** a csempék körüli perem: a mipmapelés és a sima szűrés miatt nem szivároghat át a szomszéd */
const PAD = 4;
const CELL = TILE + PAD * 2;
const MAX_COLS = 16;
/** true: közelről elmosódó, sima textúrák; false: éles pixelek (a textúracsomag eredeti kinézete) */
const SMOOTH = false;

// Ha a textúracsomag nincs kicsomagolva, ezekkel a színekkel indul a játék
const FALLBACK: Record<string, string> = {
  grass_top: '#8a8a8a', grass_side: '#6b5a3a', dirt: '#7a5636', stone: '#8d8d8d', sand: '#dbd0a0',
  log_side: '#6a4e2c', log_top: '#a98a55', planks: '#b08b52', leaves: '#9a9a9a', cobblestone: '#767676',
  water: '#3b68d4',
  bedrock: '#3a3a3a', gravel: '#837f7d', sandstone: '#d8cc98', sandstone_top: '#dbd0a0', sandstone_bottom: '#cfc28c',
  coal_ore: '#4a4a4a', iron_ore: '#b49a86', gold_ore: '#d4b84a', diamond_ore: '#5ac8c8',
};
const FALLBACK_EXTRA = '#8a8a8a';

/** Alap textúrák, amik a Dokucraftban 2x2-es lapok (pss_cube): csak a bal felső negyedük a látható kép */
const BASE_CROP: Record<string, string> = { diamond_ore: '0,0,8,8' };

/** A víz csempéjét mi rajzoljuk: kék alap, halvány, pixeles hullámokkal */
function drawWater(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = FALLBACK.water;
  ctx.fillRect(x, y, TILE, TILE);
  for (let py = 0; py < TILE; py += 2) {
    for (let px = 0; px < TILE; px += 2) {
      const n = Math.sin(px * 1.7 + py * 0.9) + Math.cos(py * 1.3 - px * 0.6);
      if (n > 1.1) {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(x + px, y + py, 2, 2);
      } else if (n < -1.1) {
        ctx.fillStyle = 'rgba(0,0,40,0.14)';
        ctx.fillRect(x + px, y + py, 2, 2);
      }
    }
  }
}

export interface Atlas {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  /** [u0, v0, u1, v1] */
  uv(name: TexName): [number, number, number, number];
  /** a csempe bal felső sarka a vásznon (pixel) */
  cell(name: TexName): [number, number];
  usingPack: boolean;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

/** Az atlasz az alap textúrákból és (ha regisztrálva vannak) a generált blokkok textúráiból áll */
export async function buildAtlas(): Promise<Atlas> {
  const names: TexName[] = [...BASE_TEXTURES, ...extraTextures];
  const isBase = new Set<TexName>(BASE_TEXTURES);
  const cols = Math.min(MAX_COLS, names.length);
  const rows = Math.ceil(names.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const index = new Map<TexName, number>();
  names.forEach((n, i) => index.set(n, i));

  let baseFound = 0;
  const base = import.meta.env.BASE_URL;
  await Promise.all(
    names.map(async (name, i) => {
      const x = (i % cols) * CELL + PAD, y = Math.floor(i / cols) * CELL + PAD;
      // "név@u0,v0,u1,v1": a modell lapja a textúrának csak egy részét használja (pl. a pss_cube a 2x2-es lap bal felső negyedét)
      const [file, crop = BASE_CROP[name]] = name.split('@');
      const url = isBase.has(name) ? `${base}textures/${file}.png` : `${base}textures/mc/${file}.png`;
      const img = await loadImage(url);
      if (img) {
        if (crop) {
          const [u0, v0, u1, v1] = crop.split(',').map(Number);
          const w = img.width;
          ctx.drawImage(img, (u0 / 16) * w, (v0 / 16) * w, ((u1 - u0) / 16) * w, ((v1 - v0) / 16) * w, x, y, TILE, TILE);
        } else {
          // felső négyzet: az animált csíkokat is kezeli, és más felbontásnál is jó
          ctx.drawImage(img, 0, 0, img.width, img.width, x, y, TILE, TILE);
        }
        if (isBase.has(name)) baseFound++;
      } else if (name === 'water') {
        drawWater(ctx, x, y);
      } else {
        ctx.fillStyle = FALLBACK[name] ?? FALLBACK_EXTRA;
        ctx.fillRect(x, y, TILE, TILE);
      }
      // perem: a csempe szélső pixelsorait kimásoljuk kifelé
      ctx.drawImage(canvas, x, y, TILE, 1, x, y - PAD, TILE, PAD);
      ctx.drawImage(canvas, x, y + TILE - 1, TILE, 1, x, y + TILE, TILE, PAD);
      ctx.drawImage(canvas, x, y - PAD, 1, TILE + PAD * 2, x - PAD, y - PAD, PAD, TILE + PAD * 2);
      ctx.drawImage(canvas, x + TILE - 1, y - PAD, 1, TILE + PAD * 2, x + TILE, y - PAD, PAD, TILE + PAD * 2);
    }),
  );

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = SMOOTH ? THREE.LinearFilter : THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;

  const W = canvas.width, H = canvas.height;
  const at = (n: TexName) => index.get(n) ?? 0;
  return {
    texture,
    canvas,
    usingPack: baseFound === BASE_TEXTURES.length,
    cell(name) {
      const i = at(name);
      return [(i % cols) * CELL + PAD, Math.floor(i / cols) * CELL + PAD];
    },
    uv(name) {
      const i = at(name);
      const x = (i % cols) * CELL + PAD, y = Math.floor(i / cols) * CELL + PAD;
      return [x / W, 1 - (y + TILE) / H, (x + TILE) / W, 1 - y / H];
    },
  };
}
