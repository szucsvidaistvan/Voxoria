import { boxGeom, type BoxGeom } from './boxuv';

/**
 * A mobok textúrázott modelljei (adat): a dobozok pixelméretei (1 blokk = 16 pixel) és a képen lévő helyük.
 * A koordináták pixelben: y felfelé a láb alatti talajtól, az előre a −z, a doboz a közepével van megadva.
 */
export type ArmorTex = `armor_${'leather' | 'iron' | 'golden' | 'diamond'}_${1 | 2}`;
export type TexName = 'pig' | 'cow' | 'sheep' | 'sheep_fur' | 'chicken' | 'player' | 'skeleton' | 'zombie' | 'wolf' | 'wolf_angry' | 'spider' | 'polarbear' | 'horse' | ArmorTex;

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
  /** állandó elforgatás a forgáspont körül (z: lefelé dőlés, y: legyezés), pl. a pók lábai */
  rz?: number;
  ry?: number;
  /** a járás ezzel legyezi a részt (y körül) */
  wag?: number;
  /** célzáskor ez a dőlés az x tengely körül (a csontváz íjat tartó karja) */
  aim?: number;
}

/** A textúrák mérete pixelben */
export const TEX_SIZE = {
  pig: [64, 32], cow: [64, 32], sheep: [64, 32], sheep_fur: [64, 32], chicken: [64, 32], player: [64, 64], skeleton: [64, 32], zombie: [64, 64],
  wolf: [64, 32], wolf_angry: [64, 32], spider: [64, 32], polarbear: [128, 64], horse: [64, 64],
} as Record<TexName, [number, number]>;
for (const m of ['leather', 'iron', 'golden', 'diamond']) for (const l of [1, 2]) TEX_SIZE[`armor_${m}_${l}` as ArmorTex] = [64, 32];

/**
 * A viselt páncél részei a játékos modelljén (a 64x32-es páncélrétegekkel; réteg 1: sisak, mellvért, csizma; réteg 2: nadrág).
 * @param material az anyag azonosítója (leather, iron, golden, diamond), @param slot 0 sisak, 1 mellvért, 2 nadrág, 3 csizma
 */
export function armorParts(material: string, slot: number): TPart[] {
  const t1 = `armor_${material}_1` as ArmorTex, t2 = `armor_${material}_2` as ArmorTex;
  const leg = (tex: ArmorTex, x: number, sw: number, grow: number): TPart => ({ tex, px: [4, 12, 4], uv: [0, 16], p: [x, 6, 0], pivot: [x, 12, 0], swing: sw, grow });
  const arm = (x: number, sw: number): TPart => ({ tex: t1, px: [4, 12, 4], uv: [40, 16], p: [x, 18, 0], pivot: [x, 24, 0], swing: sw, grow: 0.9 });
  if (slot === 0) return [{ tex: t1, px: [8, 8, 8], uv: [0, 0], p: [0, 28, 0], grow: 0.9 }];
  if (slot === 1) return [{ tex: t1, px: [8, 12, 4], uv: [16, 16], p: [0, 18, 0], grow: 0.9 }, arm(6, -1), arm(-6, 1)];
  if (slot === 2) return [{ tex: t2, px: [8, 12, 4], uv: [16, 16], p: [0, 18, 0], grow: 0.5 }, leg(t2, 2, 1, 0.5), leg(t2, -2, -1, 0.5)];
  return [leg(t1, 2, 1, 0.9), leg(t1, -2, -1, 0.9)];
}

const legs4 = (tex: TexName, px: [number, number, number], uv: [number, number], x: number, h: number, zF: number, zB: number, extra: Partial<TPart> = {}): TPart[] => {
  return [
    { tex, px, uv, p: [-x, h / 2, zF], pivot: [-x, h, zF], swing: 1, ...extra },
    { tex, px, uv, p: [x, h / 2, zF], pivot: [x, h, zF], swing: -1, ...extra },
    { tex, px, uv, p: [-x, h / 2, zB], pivot: [-x, h, zB], swing: -1, ...extra },
    { tex, px, uv, p: [x, h / 2, zB], pivot: [x, h, zB], swing: 1, ...extra },
  ];
};


/**
 * A pók egy lába két szakaszból: kifelé és enyhén felfelé, majd a térdtől lefelé a talajig.
 * A második szakasz forgáspontját a számított térd adja, így a két rész összeér; a `fan` a láb előre/hátra legyezése.
 */
function spiderLeg(side: 1 | -1, z: number, fan: number, wag: number): TPart[] {
  const y0 = 11, l1 = 8, l2 = 14, up = 0.3, down = 1.2;
  const px0 = side * 4;
  // a térd helye: a lefelé/felfelé dőlés (z körül), majd a legyezés (y körül)
  const dx = side * l1 * Math.cos(up), dy = l1 * Math.sin(up);
  const kx = px0 + dx * Math.cos(fan), kz = z - dx * Math.sin(fan), ky = y0 + dy;
  return [
    { tex: 'spider', px: [l1, 2, 2], uv: [18, 0], p: [px0 + side * l1 / 2, y0, z], pivot: [px0, y0, z], rz: side * up, ry: fan, wag },
    { tex: 'spider', px: [l2, 2, 2], uv: [18, 0], p: [kx + side * l2 / 2, ky, kz], pivot: [kx, ky, kz], rz: -side * down, ry: fan, wag },
  ];
}

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

  // a farkas (a csomag skinje; a test és a sörény fekvő doboz)
  wolf: [
    { tex: 'wolf', px: [6, 6, 4], uv: [0, 0], p: [0, 10.5, -7] },
    { tex: 'wolf', px: [3, 3, 4], uv: [0, 10], p: [0, 9, -10] },
    { tex: 'wolf', px: [2, 2, 1], uv: [16, 14], p: [-2, 14.5, -6.5] },
    { tex: 'wolf', px: [2, 2, 1], uv: [16, 14], p: [2, 14.5, -6.5] },
    { tex: 'wolf', px: [6, 9, 6], uv: [18, 14], p: [0, 10, 4.5], rot: true },
    { tex: 'wolf', px: [8, 6, 7], uv: [21, 0], p: [0, 10.5, -3], rot: true },
    ...legs4('wolf', [2, 8, 2], [0, 18], 2, 8, -4, 7),
    { tex: 'wolf', px: [2, 8, 2], uv: [9, 18], p: [0, 8.5, 9], pivot: [0, 12, 8], tilt: -0.8 },
  ],
  // a pók: lapos, hosszú potroh, szögletes fej, nyolc láb; a lábak kifelé és kicsit fel indulnak, majd a térdnél a földre lépnek
  spider: [
    { tex: 'spider', px: [8, 8, 8], uv: [32, 4], p: [0, 10, -10] },
    { tex: 'spider', px: [6, 6, 6], uv: [0, 0], p: [0, 11, -3] },
    { tex: 'spider', px: [10, 8, 12], uv: [0, 12], p: [0, 12, 8] },
    ...[[3, 0.55], [1, 0.2], [-1, -0.2], [-3, -0.55]].flatMap(([z, fan], i) => [-1, 1].flatMap((side) => spiderLeg(side as 1 | -1, z + 3, fan * side, (i % 2 ? 1 : -1) * side * 0.4))),
  ],
  // a jegesmedve (128x64): két tömb (alacsonyabb vállrész elöl, magasabb, keskenyebb hátsó rész), alacsonyan tartott fej
  polarbear: [
    { tex: 'polarbear', px: [7, 7, 7], uv: [0, 0], p: [0, 11.5, -13.5] },
    { tex: 'polarbear', px: [5, 3, 3], uv: [0, 44], p: [0, 9.5, -18.5] },
    { tex: 'polarbear', px: [2, 2, 1], uv: [26, 0], p: [-3.5, 15.5, -14] },
    { tex: 'polarbear', px: [2, 2, 1], uv: [26, 0], p: [3.5, 15.5, -14] },
    { tex: 'polarbear', px: [14, 14, 11], uv: [0, 19], p: [0, 13, -4], rot: true },
    { tex: 'polarbear', px: [12, 12, 10], uv: [39, 0], p: [0, 15.5, 8], rot: true },
    { tex: 'polarbear', px: [4, 10, 4], uv: [50, 40], p: [-4.5, 5, 9], pivot: [-4.5, 10, 9], swing: 1 },
    { tex: 'polarbear', px: [4, 10, 4], uv: [50, 40], p: [4.5, 5, 9], pivot: [4.5, 10, 9], swing: -1 },
    { tex: 'polarbear', px: [4, 10, 6], uv: [50, 0], p: [-4.5, 5, -7], pivot: [-4.5, 10, -7], swing: -1 },
    { tex: 'polarbear', px: [4, 10, 6], uv: [50, 0], p: [4.5, 5, -7], pivot: [4.5, 10, -7], swing: 1 },
  ],
  // a ló (64x64): hosszú törzs, vastag, előre-felfelé dőlő nyak, lefelé hajló hosszú fej, két függőleges fül, rövid sörény
  horse: [
    { tex: 'horse', px: [10, 10, 24], uv: [0, 32], p: [0, 18, 0] },
    { tex: 'horse', px: [4, 16, 6], uv: [26, 36], p: [0, 29, -11], pivot: [0, 21, -11], tilt: -0.75 },
    { tex: 'horse', px: [2, 14, 3], uv: [56, 36], p: [0, 30, -7], pivot: [0, 21, -11], tilt: -0.75 },
    { tex: 'horse', px: [6, 5, 7], uv: [0, 13], p: [0, 33, -24.5], pivot: [0, 33, -22], tilt: -0.7 },
    { tex: 'horse', px: [4, 4, 5], uv: [0, 13], p: [0, 32, -29.5], pivot: [0, 33, -22], tilt: -0.7 },
    { tex: 'horse', px: [2, 4, 1], uv: [2, 14], p: [-2, 36.5, -23], pivot: [0, 33, -22], tilt: -0.7 },
    { tex: 'horse', px: [2, 4, 1], uv: [2, 14], p: [2, 36.5, -23], pivot: [0, 33, -22], tilt: -0.7 },
    { tex: 'horse', px: [3, 4, 7], uv: [42, 36], p: [0, 20, 16], pivot: [0, 21, 12], tilt: 0.4 },
    ...legs4('horse', [4, 11, 4], [48, 21], 3, 14, -9, 9),
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
