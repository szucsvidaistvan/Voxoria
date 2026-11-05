import * as THREE from 'three';

/** Tárgy-textúrák betöltése (gyorsítótárral); amíg nem töltődött be, null */
const images = new Map<string, HTMLImageElement | null>();
export function itemImage(base: string, name: string, onLoad?: () => void): HTMLImageElement | null {
  if (images.has(name)) return images.get(name) ?? null;
  images.set(name, null);
  const img = new Image();
  img.onload = () => { images.set(name, img); onLoad?.(); };
  img.src = `${base}textures/item/${name}.png`;
  return null;
}

const geos = new Map<string, THREE.BufferGeometry>();

/**
 * A tárgy textúrájából kihúzott, 1 pixel vastag modell (a közepén a nullpont, vertex-színekkel).
 * @param size a kép oldalhossza blokk egységben
 */
export function extrudeItem(img: HTMLImageElement, size: number): THREE.BufferGeometry {
  const key = `${img.src}|${size}`;
  const cached = geos.get(key);
  if (cached) return cached;
  const W = img.width;
  const c = document.createElement('canvas');
  c.width = c.height = W;
  const cx = c.getContext('2d')!;
  cx.drawImage(img, 0, 0, W, W, 0, 0, W, W);
  const px = cx.getImageData(0, 0, W, W).data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < W && px[(y * W + x) * 4 + 3] > 40;
  const s = size / W, d = s / 2;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const col3 = new THREE.Color();
  const quad = (v: number[][], r: number, g: number, b: number, shade: number) => {
    col3.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
    const n = pos.length / 3;
    for (const p of v) { pos.push(p[0], p[1], p[2]); col.push(col3.r * shade, col3.g * shade, col3.b * shade); }
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    if (!solid(x, y)) continue;
    const o = (y * W + x) * 4;
    const [r, g, b] = [px[o], px[o + 1], px[o + 2]];
    const x0 = (x - W / 2) * s, x1 = x0 + s, y1 = (W / 2 - y) * s, y0 = y1 - s;
    quad([[x0, y0, d], [x1, y0, d], [x1, y1, d], [x0, y1, d]], r, g, b, 1);
    quad([[x1, y0, -d], [x0, y0, -d], [x0, y1, -d], [x1, y1, -d]], r, g, b, 0.8);
    if (!solid(x - 1, y)) quad([[x0, y0, -d], [x0, y0, d], [x0, y1, d], [x0, y1, -d]], r, g, b, 0.7);
    if (!solid(x + 1, y)) quad([[x1, y0, d], [x1, y0, -d], [x1, y1, -d], [x1, y1, d]], r, g, b, 0.7);
    if (!solid(x, y - 1)) quad([[x0, y1, d], [x1, y1, d], [x1, y1, -d], [x0, y1, -d]], r, g, b, 0.9);
    if (!solid(x, y + 1)) quad([[x0, y0, -d], [x1, y0, -d], [x1, y0, d], [x0, y0, d]], r, g, b, 0.6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  geos.set(key, g);
  return g;
}
