import { BLOCKS, type ShapePart } from '../shared/blocks';
import { TILE, type Atlas } from './atlas';

/** Ezek a blokkok laposak vagy vékonyak: sima képként (nem kockaként) jelennek meg az ikonokon */
const FLAT = /(torch|sapling|rail|ladder|_pane$|^iron_bars$|carpet$|fence|_wall$|^fire$|lily_pad|button|pressure_plate|door|tulip|poppy|dandelion|allium|orchid|bluet|daisy|mushroom|^short_grass$|^fern$|dead_bush|sugar_cane|seagrass|cobweb|lever|tripwire)/;

// izometrikus vetítés: a blokk 16 egységes koordinátáiból pixel (64x64-es ikon). Az x kelet (jobbra le), a z dél (balra le).
const P = (x: number, y: number, z: number): [number, number] => [32 + (x - z) * 1.5, 30 + (x + z) * 0.75 - y * 1.625];

type Pt = [number, number];

/**
 * Blokk-ikonok: a tömör blokkok izometrikus kockaként (felső, bal és jobb lap), a nem kocka alakúak
 * (lap, lépcső ...) a dobozaikból összerakva, a növények és hasonlók sima képként.
 */
export function createBlockIcons(atlas: Atlas) {
  const tiles = new Map<string, HTMLCanvasElement>();

  /** Az atlasz egy csempéje, a színezéssel (az átlátszóságot megtartva) */
  const tile = (name: string, tint?: readonly number[]): HTMLCanvasElement => {
    const key = `${name}|${tint ? tint.join(',') : ''}`;
    let c = tiles.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = TILE;
    const ctx = c.getContext('2d')!;
    const [sx, sy] = atlas.cell(name);
    ctx.drawImage(atlas.canvas, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
    if (tint) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${tint.map((v) => Math.round(v * 255)).join(',')})`;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(atlas.canvas, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
      ctx.globalCompositeOperation = 'source-over';
    }
    tiles.set(key, c);
    return c;
  };

  /** Egy téglalap alakú kép ráfeszítése a (p0, p1, p2) által megadott paralelogrammára */
  const quad = (
    ctx: CanvasRenderingContext2D, src: HTMLCanvasElement,
    sx: number, sy: number, sw: number, sh: number,
    p0: Pt, p1: Pt, p2: Pt, shade: number,
  ) => {
    if (sw <= 0 || sh <= 0) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform((p1[0] - p0[0]) / sw, (p1[1] - p0[1]) / sw, (p2[0] - p0[0]) / sh, (p2[1] - p0[1]) / sh, p0[0], p0[1]);
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.restore();
    if (shade < 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(0,0,0,${1 - shade})`;
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.lineTo(p1[0] + p2[0] - p0[0], p1[1] + p2[1] - p0[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  };

  const flat = (ctx: CanvasRenderingContext2D, side: string, tint?: readonly number[]) => {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tile(side, tint), 0, 0, TILE, TILE, 0, 0, TILE, TILE);
  };

  const cube = (ctx: CanvasRenderingContext2D, top: string, side: string, tint?: { top?: readonly number[]; side?: readonly number[] }) => {
    const t = tile(top, tint?.top), s = tile(side, tint?.side);
    quad(ctx, t, 0, 0, TILE, TILE, P(0, 16, 0), P(16, 16, 0), P(0, 16, 16), 1);
    quad(ctx, s, 0, 0, TILE, TILE, P(0, 16, 16), P(16, 16, 16), P(0, 0, 16), 0.78);
    quad(ctx, s, 0, 0, TILE, TILE, P(16, 16, 16), P(16, 16, 0), P(16, 0, 16), 0.58);
  };

  /** A nem kocka alakú blokk dobozai: alulról felfelé, hátulról előre rajzolva */
  const boxes = (ctx: CanvasRenderingContext2D, parts: ShapePart[], tint?: readonly number[]) => {
    const order = [...parts].filter((p) => !p.rot).sort((a, b) => a.from[1] - b.from[1] || a.from[0] + a.from[2] - (b.from[0] + b.from[2]));
    for (const p of order) {
      const [x1, y1, z1] = p.from, [x2, y2, z2] = p.to;
      const draw = (face: ShapePart['faces'][keyof ShapePart['faces']], p0: Pt, p1: Pt, p2: Pt, shade: number) => {
        if (!face) return;
        const [a, b, c, d] = face.uv;
        const src = tile(face.tex, face.tint ? tint : undefined);
        quad(ctx, src, (a / 16) * TILE, (b / 16) * TILE, ((c - a) / 16) * TILE, ((d - b) / 16) * TILE, p0, p1, p2, shade);
      };
      draw(p.faces.up, P(x1, y2, z1), P(x2, y2, z1), P(x1, y2, z2), 1);
      draw(p.faces.south, P(x1, y2, z2), P(x2, y2, z2), P(x1, y1, z2), 0.78);
      draw(p.faces.east, P(x2, y2, z2), P(x2, y2, z1), P(x2, y1, z2), 0.58);
    }
  };

  return (c: HTMLCanvasElement, id: number): void => {
    const def = BLOCKS[id];
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (!def) return;
    const key = def.key ?? '';
    if (!def.parts) cube(ctx, def.top, def.side, def.tint);
    else if (FLAT.test(key) || def.parts.some((p) => p.rot) || def.boxes?.length === 0) flat(ctx, def.side, def.tint?.side);
    else boxes(ctx, def.parts, def.tint?.side);
  };
}
