import { BLOCKS, type ShapePart } from '../shared/blocks';
import { TILE, type Atlas } from './atlas';

/** Ezek a blokkok laposak vagy vékonyak: sima képként (nem kockaként) jelennek meg az ikonokon (a kerítés, szőnyeg, fal, ajtó és csapóajtó dobozokból épített alakot kap) */
const FLAT = /(torch|sapling|rail|ladder|_pane$|^iron_bars$|^fire$|lily_pad|button|pressure_plate|tulip|poppy|dandelion|allium|orchid|bluet|daisy|mushroom|^short_grass$|^fern$|dead_bush|sugar_cane|seagrass|cobweb|lever|tripwire)/;

type Pt = [number, number];
type Proj = (x: number, y: number, z: number) => Pt;

// izometrikus vetítés: a blokk 16 egységes koordinátáiból pixel (64x64-es ikon). Az x kelet (jobbra le), a z dél (balra le).
const P: Proj = (x, y, z) => [32 + (x - z) * 1.5, 30 + (x + z) * 0.75 - y * 1.625];
/** Kisebbített vetítés a két blokk magas dolgokhoz (az ajtóhoz): az ikon közepe (ox, oy), a lépték s */
const scaled = (s: number, ox: number, oy: number): Proj => (x, y, z) => [ox + (x - z) * 1.5 * s, oy + (x + z) * 0.75 * s - y * 1.625 * s];

/** Egy doboz a megadott lapok textúrájával (a kerítés és a fal ikonjának karjaihoz) */
const arm = (from: [number, number, number], to: [number, number, number], tex: string): ShapePart => {
  const [x1, y1, z1] = from, [x2, y2, z2] = to;
  return {
    from, to,
    faces: {
      up: { uv: [x1, z1, x2, z2], tex },
      south: { uv: [x1, 16 - y2, x2, 16 - y1], tex },
      east: { uv: [z1, 16 - y2, z2, 16 - y1], tex },
    },
  } as ShapePart;
};

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
  const defaultP = P;
  const boxes = (ctx: CanvasRenderingContext2D, parts: ShapePart[], tint?: readonly number[], P: Proj = defaultP) => {
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

  /** A kerítés/fal ikonja: a tartóoszlop és két kar (kelet és dél felé), hogy kerítésnek látsszon */
  const withArms = (key: string, parts: ShapePart[]): ShapePart[] => {
    const post = parts[0];
    const tex = post?.faces.south?.tex ?? post?.faces.up?.tex;
    if (!post || !tex) return parts;
    if (/_fence$/.test(key)) {
      return [...parts, arm([10, 6, 7], [16, 9, 9], tex), arm([10, 12, 7], [16, 15, 9], tex), arm([7, 6, 10], [9, 9, 16], tex), arm([7, 12, 10], [9, 15, 16], tex)];
    }
    if (/_wall$/.test(key)) return [...parts, arm([11, 0, 5], [16, 14, 11], tex), arm([5, 0, 11], [11, 14, 16], tex)];
    return parts;
  };

  /** Az ajtó ikonja: az alsó és a felső fél egymás fölött (két blokk magas) */
  const doorIcon = (ctx: CanvasRenderingContext2D, parts: ShapePart[]) => {
    const lower = parts[0];
    const tex = lower?.faces.east?.tex ?? lower?.faces.south?.tex ?? '';
    const upTex = tex.replace(/_bottom$/, '_top');
    const up = (p: ShapePart, y: number, t: string): ShapePart => ({
      ...p, from: [p.from[0], p.from[1] + y, p.from[2]], to: [p.to[0], p.to[1] + y, p.to[2]],
      faces: Object.fromEntries(Object.entries(p.faces).map(([k, f]) => [k, f ? { ...f, tex: t } : f])),
    });
    const pr = scaled(0.72, 25, 42);
    boxes(ctx, [lower], undefined, pr);
    boxes(ctx, [up(lower, 16, upTex)], undefined, pr);
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
    else if (def.door) doorIcon(ctx, def.parts);
    else boxes(ctx, withArms(key, def.parts), def.tint?.side);
  };
}
