import { boxGeom, type BoxGeom } from './boxuv';

/**
 * A mobok textúrázott modelljei (adat): a dobozok pixelméretei (1 blokk = 16 pixel) és a képen lévő helyük.
 * A koordináták pixelben: y felfelé a láb alatti talajtól, az előre a −z, a doboz a közepével van megadva.
 */
export type TexName = 'pig' | 'cow' | 'sheep' | 'sheep_fur' | 'chicken' | 'player' | 'skeleton' | 'zombie';

export interface TPart {
  tex: TexName;
  /** a doboz mérete pixelben (szélesség, magasság, mélység); ez a képen is a lapok mérete */
  px: [number, number, number];
  /** a doboz képe a textúrán (bal-felső sarok) */
  uv: [number, number];
  /** a doboz közepe */
  p: [number, number, number];
  /** a doboz felfújása pixelben (a gyapjúréteghez) */
  grow?: number;
  /** a fekvő törzs: a doboz x körül −90°-kal elfordítva áll */
  rot?: boolean;
  /** forgáspont (pixel): a láb csípője, a szárny töve */
  pivot?: [number, number, number];
  swing?: number;
  tilt?: number;
  flap?: number;
  /** célzáskor ez a dőlés az x tengely körül (a csontváz íjat tartó karja) */
  aim?: number;
}

/** A textúrák mérete pixelben */
export const TEX_SIZE: Record<TexName, [number, number]> = {
  pig: [64, 32], cow: [64, 32], sheep: [64, 32], sheep_fur: [64, 32], chicken: [64, 32], player: [64, 64], skeleton: [64, 32], zombie: [64, 64],
};

const legs4 = (tex: TexName, px: [number, number, number], uv: [number, number], x: number, h: number, zF: number, zB: number, extra: Partial<TPart> = {}): TPart[] => {
  return [
    { tex, px, uv, p: [-x, h / 2, zF], pivot: [-x, h, zF], swing: 1, ...extra },
    { tex, px, uv, p: [x, h / 2, zF], pivot: [x, h, zF], swing: -1, ...extra },
    { tex, px, uv, p: [-x, h / 2, zB], pivot: [-x, h, zB], swing: -1, ...extra },
    { tex, px, uv, p: [x, h / 2, zB], pivot: [x, h, zB], swing: 1, ...extra },
  ];
};

export const TEXTURED: Partial<Record<string, TPart[]>> = {
  pig: [
    { tex: 'pig', px: [8, 8, 8], uv: [0, 0], p: [0, 12, -10] },
    { tex: 'pig', px: [4, 3, 1], uv: [16, 16], p: [0, 10.5, -14.5] },
    { tex: 'pig', px: [10, 16, 8], uv: [28, 8], p: [0, 10, 0], rot: true },
    ...legs4('pig', [4, 6, 4], [0, 16], 3, 6, -5, 7),
  ],
  cow: [
    { tex: 'cow', px: [8, 8, 6], uv: [0, 0], p: [0, 20, -11] },
    { tex: 'cow', px: [1, 3, 1], uv: [22, 0], p: [-4.5, 23.5, -11.5] },
    { tex: 'cow', px: [1, 3, 1], uv: [22, 0], p: [4.5, 23.5, -11.5] },
    { tex: 'cow', px: [12, 18, 10], uv: [18, 4], p: [0, 17, 1], rot: true },
    ...legs4('cow', [4, 12, 4], [0, 16], 4, 12, -6, 7),
  ],
  sheep: [
    { tex: 'sheep', px: [6, 6, 8], uv: [0, 0], p: [0, 19, -10] },
    { tex: 'sheep', px: [8, 16, 6], uv: [28, 8], p: [0, 15, 0], rot: true },
    ...legs4('sheep', [4, 12, 4], [0, 16], 3, 12, -5, 7),
    // gyapjú: a fej, a törzs és a lábak felső fele, kissé felfújva
    { tex: 'sheep_fur', px: [6, 6, 6], uv: [0, 0], p: [0, 19, -9], grow: 0.6 },
    { tex: 'sheep_fur', px: [8, 16, 6], uv: [28, 8], p: [0, 15, 0], rot: true, grow: 1.75 },
    ...legs4('sheep_fur', [4, 6, 4], [0, 16], 3, 12, -5, 7, { grow: 0.5 }).map((l) => ({ ...l, p: [l.p[0], 9, l.p[2]] as [number, number, number] })),
  ],
  // a játékos: 64x64-es skin (saját terv); a karakter jobb keze a +x oldalon van
  player: [
    { tex: 'player', px: [8, 8, 8], uv: [0, 0], p: [0, 28, 0] },
    { tex: 'player', px: [8, 8, 8], uv: [32, 0], p: [0, 28, 0], grow: 0.5 },
    { tex: 'player', px: [8, 12, 4], uv: [16, 16], p: [0, 18, 0] },
    { tex: 'player', px: [8, 12, 4], uv: [16, 32], p: [0, 18, 0], grow: 0.25 },
    // jobb kar (+x) és ujja, bal kar (−x) és ujja
    { tex: 'player', px: [4, 12, 4], uv: [40, 16], p: [6, 18, 0], pivot: [6, 24, 0], swing: -1 },
    { tex: 'player', px: [4, 12, 4], uv: [40, 32], p: [6, 18, 0], pivot: [6, 24, 0], swing: -1, grow: 0.25 },
    { tex: 'player', px: [4, 12, 4], uv: [32, 48], p: [-6, 18, 0], pivot: [-6, 24, 0], swing: 1 },
    { tex: 'player', px: [4, 12, 4], uv: [48, 48], p: [-6, 18, 0], pivot: [-6, 24, 0], swing: 1, grow: 0.25 },
    // jobb láb és nadrágja, bal láb és nadrágja
    { tex: 'player', px: [4, 12, 4], uv: [0, 16], p: [2, 6, 0], pivot: [2, 12, 0], swing: 1 },
    { tex: 'player', px: [4, 12, 4], uv: [0, 32], p: [2, 6, 0], pivot: [2, 12, 0], swing: 1, grow: 0.25 },
    { tex: 'player', px: [4, 12, 4], uv: [16, 48], p: [-2, 6, 0], pivot: [-2, 12, 0], swing: -1 },
    { tex: 'player', px: [4, 12, 4], uv: [0, 48], p: [-2, 6, 0], pivot: [-2, 12, 0], swing: -1, grow: 0.25 },
  ],
  // a csontváz: vékony (2 pixeles) végtagok; a jobb (+x) kar tartja az íjat, célzáskor előreemelkedik
  skeleton: [
    { tex: 'skeleton', px: [8, 8, 8], uv: [0, 0], p: [0, 28, 0] },
    { tex: 'skeleton', px: [8, 12, 4], uv: [16, 16], p: [0, 18, 0] },
    { tex: 'skeleton', px: [2, 12, 2], uv: [40, 16], p: [-5, 18, 0], pivot: [-5, 23, 0], tilt: 0.25, swing: 0.15, aim: 1.2 },
    { tex: 'skeleton', px: [2, 12, 2], uv: [40, 16], p: [5, 18, 0], pivot: [5, 23, 0], tilt: 0.45, swing: -0.15, aim: 1.55 },
    { tex: 'skeleton', px: [2, 12, 2], uv: [0, 16], p: [-2, 6, 0], pivot: [-2, 12, 0], swing: 1 },
    { tex: 'skeleton', px: [2, 12, 2], uv: [0, 16], p: [2, 6, 0], pivot: [2, 12, 0], swing: -1 },
  ],
  // a zombi: a csomag skinje (a bal végtagok a jobbak tükörképei a képen, ezért ugyanazt a részt használják)
  zombie: [
    { tex: 'zombie', px: [8, 8, 8], uv: [0, 0], p: [0, 28, 0] },
    { tex: 'zombie', px: [8, 12, 4], uv: [16, 16], p: [0, 18, 0] },
    { tex: 'zombie', px: [4, 12, 4], uv: [40, 16], p: [-6, 18, 0], pivot: [-6, 24, 0], tilt: 1.45, swing: 0.12 },
    { tex: 'zombie', px: [4, 12, 4], uv: [40, 16], p: [6, 18, 0], pivot: [6, 24, 0], tilt: 1.45, swing: -0.12 },
    { tex: 'zombie', px: [4, 12, 4], uv: [0, 16], p: [-2, 6, 0], pivot: [-2, 12, 0], swing: 1 },
    { tex: 'zombie', px: [4, 12, 4], uv: [0, 16], p: [2, 6, 0], pivot: [2, 12, 0], swing: -1 },
  ],
  chicken: [
    { tex: 'chicken', px: [4, 6, 3], uv: [0, 0], p: [0, 12, -4.5] },
    { tex: 'chicken', px: [4, 2, 2], uv: [14, 0], p: [0, 12, -7] },
    { tex: 'chicken', px: [2, 2, 2], uv: [14, 4], p: [0, 10, -6] },
    { tex: 'chicken', px: [6, 8, 6], uv: [0, 9], p: [0, 8, 0], rot: true },
    { tex: 'chicken', px: [3, 5, 3], uv: [26, 0], p: [-1.5, 2.5, -0.5], pivot: [-1.5, 5, -0.5], swing: 1 },
    { tex: 'chicken', px: [3, 5, 3], uv: [26, 0], p: [1.5, 2.5, -0.5], pivot: [1.5, 5, -0.5], swing: -1 },
    { tex: 'chicken', px: [1, 4, 6], uv: [24, 13], p: [-3.5, 9, 0], pivot: [-3.5, 11, 0], flap: 1 },
    { tex: 'chicken', px: [1, 4, 6], uv: [24, 13], p: [3.5, 9, 0], pivot: [3.5, 11, 0], flap: -1 },
  ],
};

/** Egy rész geometriája (a doboz közepén a nullpont, blokk egységben) */
export function partGeom(part: TPart): BoxGeom {
  const k = 1 / 16;
  const g = part.grow ?? 0;
  const [w, h, d] = part.px;
  return boxGeom([(w + 2 * g) * k, (h + 2 * g) * k, (d + 2 * g) * k], part.px, part.uv, TEX_SIZE[part.tex], !!part.rot);
}
