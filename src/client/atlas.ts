import * as THREE from 'three';
import { TEXTURE_NAMES, type TexName } from '../shared/blocks';

const TILE = 32;
const COLS = 4;

// Ha a textúracsomag nincs kicsomagolva, ezekkel a színekkel indul a játék
const FALLBACK: Record<TexName, string> = {
  grass_top: '#8a8a8a', grass_side: '#6b5a3a', dirt: '#7a5636', stone: '#8d8d8d', sand: '#dbd0a0',
  log_side: '#6a4e2c', log_top: '#a98a55', planks: '#b08b52', leaves: '#9a9a9a', cobblestone: '#767676',
};

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

export async function buildAtlas(): Promise<Atlas> {
  const rows = Math.ceil(TEXTURE_NAMES.length / COLS);
  const canvas = document.createElement('canvas');
  canvas.width = COLS * TILE;
  canvas.height = rows * TILE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  let found = 0;
  await Promise.all(
    TEXTURE_NAMES.map(async (name, i) => {
      const x = (i % COLS) * TILE, y = Math.floor(i / COLS) * TILE;
      const img = await loadImage(`${import.meta.env.BASE_URL}textures/${name}.png`);
      if (img) {
        // felső négyzet: az animált csíkokat is kezeli, és más felbontásnál is jó
        ctx.drawImage(img, 0, 0, img.width, img.width, x, y, TILE, TILE);
        found++;
      } else {
        ctx.fillStyle = FALLBACK[name];
        ctx.fillRect(x, y, TILE, TILE);
      }
    }),
  );

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;

  const W = canvas.width, H = canvas.height;
  const idx = (n: TexName) => TEXTURE_NAMES.indexOf(n);
  return {
    texture,
    canvas,
    usingPack: found === TEXTURE_NAMES.length,
    cell(name) {
      const i = idx(name);
      return [(i % COLS) * TILE, Math.floor(i / COLS) * TILE];
    },
    uv(name) {
      const i = idx(name);
      const x = (i % COLS) * TILE, y = Math.floor(i / COLS) * TILE;
      // fél pixeles behúzás, hogy ne szivárogjon át a szomszéd csempe
      return [(x + 0.5) / W, 1 - (y + TILE - 0.5) / H, (x + TILE - 0.5) / W, 1 - (y + 0.5) / H];
    },
  };
}
