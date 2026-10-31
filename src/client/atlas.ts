import * as THREE from 'three';
import { TEXTURE_NAMES, type TexName } from '../shared/blocks';
import { RECIPES } from '../shared/catalog';
import { drawTile } from './procedural';

const TILE = 32;
const MAX_COLS = 32;

export interface Atlas {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  /** [u0, v0, u1, v1] */
  uv(name: TexName): [number, number, number, number];
  /** a csempe bal felső sarka a vásznon (pixel) */
  cell(name: TexName): [number, number];
}

/** Az atlaszt a játék indulásakor kóddal rajzoljuk ki, nincs betöltendő képfájl */
export function buildAtlas(): Atlas {
  const names = TEXTURE_NAMES;
  const cols = Math.min(MAX_COLS, names.length);
  const rows = Math.ceil(names.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * TILE;
  canvas.height = rows * TILE;
  const ctx = canvas.getContext('2d')!;

  const index = new Map<TexName, number>();
  names.forEach((name, i) => {
    index.set(name, i);
    drawTile(ctx, (i % cols) * TILE, Math.floor(i / cols) * TILE, TILE, name, RECIPES[name]);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;

  const W = canvas.width, H = canvas.height;
  const at = (n: TexName) => index.get(n) ?? 0;
  return {
    texture,
    canvas,
    cell(name) {
      const i = at(name);
      return [(i % cols) * TILE, Math.floor(i / cols) * TILE];
    },
    uv(name) {
      const i = at(name);
      const x = (i % cols) * TILE, y = Math.floor(i / cols) * TILE;
      // fél pixeles behúzás, hogy ne szivárogjon át a szomszéd csempe
      return [(x + 0.5) / W, 1 - (y + TILE - 0.5) / H, (x + TILE - 0.5) / W, 1 - (y + 0.5) / H];
    },
  };
}
