import { boxGeom, type BoxGeom } from './boxuv';

/**
 * A mobok textúrázott modelljei (adat): a dobozok pixelméretei (1 blokk = 16 pixel) és a képen lévő helyük.
 * A koordináták pixelben: y felfelé a láb alatti talajtól, az előre a −z, a doboz a közepével van megadva.
 */
export type ArmorTex = `armor_${'leather' | 'iron' | 'golden' | 'diamond'}_${1 | 2}`;
export type TexName = 'pig' | 'cow' | 'sheep' | 'sheep_fur' | 'chicken' | 'player' | 'skeleton' | 'zombie' | 'wolf' | 'wolf_angry' | 'spider' | 'polarbear' | 'horse'
  | 'rabbit_brown' | 'cat_ocelot' | 'parrot_blue' | 'llama_brown' | 'donkey' | 'mule' | 'turtle' | 'bat' | 'squid' | 'husk' | 'drowned' | 'tarantula' | 'ghost' | 'slime' | 'fish_cod' | 'fish_salmon' | 'fish_puffer' | ArmorTex;

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
  /** a járás ezzel legyezi a részt (y körül); az előjele a láb járásfázisát adja (ellenkező előjel: ellentétes fázis) */
  wag?: number;
  /** járáskor ennyit emelkedik a rész a lendítés közben (z körül, radián); a pók lábához */
  lift?: number;
  /** az előző rész csomópontjához kapcsolódik (a forgáspontja az előző rész forgáspontjához képest van), így együtt mozognak: a pók lábának második szakasza */
  child?: boolean;
  /** célzáskor ez a dőlés az x tengely körül (a csontváz íjat tartó karja) */
  aim?: number;
}

/** A textúrák mérete pixelben */
export const TEX_SIZE = {
  pig: [64, 32], cow: [64, 32], sheep: [64, 32], sheep_fur: [64, 32], chicken: [64, 32], player: [64, 64], skeleton: [64, 32], zombie: [64, 64],
  wolf: [64, 32], wolf_angry: [64, 32], spider: [64, 32], polarbear: [128, 64], horse: [64, 64],
  rabbit_brown: [64, 32], cat_ocelot: [64, 32], parrot_blue: [32, 32], llama_brown: [128, 64], donkey: [64, 64], mule: [64, 64], turtle: [128, 64], bat: [64, 64], squid: [64, 32],
  fish_cod: [32, 32], fish_salmon: [32, 32], fish_puffer: [32, 32],
  husk: [64, 64], drowned: [64, 64], tarantula: [64, 32], ghost: [64, 64], slime: [64, 32],
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
  if (slot === 0) return [{ tex: t1, px: [8, 8, 8], uv: [0, 0], p: [0, 28, 0], pivot: [0, 24, 0], swing: 0, grow: 0.9 }];
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
  // az első szakasz a csípőn forog; a második az első csomópontjának gyereke (a térdén), így járás közben összeérnek.
  // A gyerek forgatása az első után értendő: a vízszintes helyzete -side*down, tehát a szülőhöz képest -side*(down+up).
  return [
    { tex: 'spider', px: [l1, 2, 2], uv: [18, 0], p: [px0 + side * l1 / 2, y0, z], pivot: [px0, y0, z], rz: side * up, ry: fan, wag, lift: 0.5 },
    { tex: 'spider', px: [l2, 2, 2], uv: [18, 0], p: [px0 + side * (l1 + l2 / 2), y0, z], pivot: [px0 + side * l1, y0, z], rz: -side * (down + up), child: true },
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
    // a fej a nyaknál (y 24) forog: a nézés irányát követi (fel-le, és a testhez képest oldalra is)
    { tex: 'player', px: [8, 8, 8], uv: [0, 0], p: [0, 28, 0], pivot: [0, 24, 0], swing: 0 },
    { tex: 'player', px: [8, 8, 8], uv: [32, 0], p: [0, 28, 0], pivot: [0, 24, 0], swing: 0, grow: 0.5 },
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
    // elöl a közepes (12), hátul a legnagyobb (14): fej < közepes < nagy. Mindkét törzs alja 8-on van: a láb textúrájának felső 2 px-e átlátszó, ezért a törzsnek pontosan ott kell kezdődnie
    { tex: 'polarbear', px: [12, 12, 10], uv: [39, 0], p: [0, 13, -4], rot: true },
    { tex: 'polarbear', px: [14, 14, 11], uv: [0, 19], p: [0, 13.5, 7.5], rot: true },
    { tex: 'polarbear', px: [4, 10, 4], uv: [50, 40], p: [-4.5, 5, 9], pivot: [-4.5, 10, 9], swing: 1 },
    { tex: 'polarbear', px: [4, 10, 4], uv: [50, 40], p: [4.5, 5, 9], pivot: [4.5, 10, 9], swing: -1 },
    { tex: 'polarbear', px: [4, 10, 6], uv: [50, 0], p: [-4.5, 5, -7], pivot: [-4.5, 10, -7], swing: -1 },
    { tex: 'polarbear', px: [4, 10, 6], uv: [50, 0], p: [4.5, 5, -7], pivot: [4.5, 10, -7], swing: 1 },
  ],
  // a ló (64x64): hosszú törzs, vastag, előre-felfelé dőlő nyak, lefelé hajló hosszú fej, két függőleges fül, rövid sörény
  horse: [
    { tex: 'horse', px: [10, 10, 24], uv: [0, 32], p: [0, 16.5, 0] },
    // a minecrafti ló modellje szerint (ModelHorse): nyak, fej, pofa, fülek és sörény egy közös forgáspont körül, 30°-ban előre dőlve
    { tex: 'horse', px: [4, 14, 8], uv: [0, 35], p: [0, 22.8, -10], pivot: [0, 20, -12], tilt: -0.5236 },
    { tex: 'horse', px: [2, 16, 4], uv: [56, 36], p: [0, 23, -5], pivot: [0, 20, -12], tilt: -0.5236 },
    { tex: 'horse', px: [6, 5, 7], uv: [0, 13], p: [0, 28.5, -10.5], pivot: [0, 20, -12], tilt: -0.5236 },
    { tex: 'horse', px: [4, 5, 5], uv: [0, 25], p: [0, 28.5, -16.5], pivot: [0, 20, -12], tilt: -0.5236 },
    { tex: 'horse', px: [2, 3, 1], uv: [19, 16], p: [-1.55, 31.5, -7.5], pivot: [0, 20, -12], tilt: -0.5236 },
    { tex: 'horse', px: [2, 3, 1], uv: [19, 16], p: [1.55, 31.5, -7.5], pivot: [0, 20, -12], tilt: -0.5236 },
    { tex: 'horse', px: [3, 14, 4], uv: [42, 36], p: [0, 14, 14], pivot: [0, 21, 12], tilt: -0.5236 },
    ...legs4('horse', [4, 11, 4], [48, 21], 3, 11, -9, 9),
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
  // a nyúl (64x32): kis test, hosszú fülek, a hátsó láb (comb + lábfej) egy csuklón lendül
  rabbit: [
    { tex: 'rabbit_brown', px: [6, 5, 10], uv: [0, 0], p: [0, 4.5, 3], pivot: [0, 5, 8], tilt: 0.35 },
    { tex: 'rabbit_brown', px: [5, 4, 5], uv: [32, 0], p: [0, 10, -3.5] },
    { tex: 'rabbit_brown', px: [1, 1, 1], uv: [32, 9], p: [0, 10, -6] },
    { tex: 'rabbit_brown', px: [2, 5, 1], uv: [58, 0], p: [-1.5, 14.5, -1.5] },
    { tex: 'rabbit_brown', px: [2, 5, 1], uv: [52, 0], p: [1.5, 14.5, -1.5] },
    { tex: 'rabbit_brown', px: [3, 3, 2], uv: [52, 6], p: [0, 4, 8], pivot: [0, 4, 7], tilt: 0.35 },
    { tex: 'rabbit_brown', px: [2, 7, 2], uv: [8, 15], p: [3, 3.5, -1], pivot: [3, 7, -1], tilt: 0.17, swing: 1 },
    { tex: 'rabbit_brown', px: [2, 7, 2], uv: [0, 15], p: [-3, 3.5, -1], pivot: [-3, 7, -1], tilt: 0.17, swing: -1 },
    { tex: 'rabbit_brown', px: [2, 4, 5], uv: [16, 15], p: [3, 4.5, 6.2], pivot: [3, 6.5, 3.7], tilt: 0.35, swing: -1 },
    { tex: 'rabbit_brown', px: [2, 1, 7], uv: [8, 24], p: [3, 0.5, 3.5], pivot: [3, 6.5, 3.7], swing: -1 },
    { tex: 'rabbit_brown', px: [2, 4, 5], uv: [30, 15], p: [-3, 4.5, 6.2], pivot: [-3, 6.5, 3.7], tilt: 0.35, swing: 1 },
    { tex: 'rabbit_brown', px: [2, 1, 7], uv: [26, 24], p: [-3, 0.5, 3.5], pivot: [-3, 6.5, 3.7], swing: 1 },
  ],
  // a macska (64x32): fekvő törzs, két részes farok
  cat: [
    { tex: 'cat_ocelot', px: [5, 4, 5], uv: [0, 0], p: [0, 9, -9.5] },
    { tex: 'cat_ocelot', px: [3, 2, 2], uv: [0, 24], p: [0, 8, -12] },
    { tex: 'cat_ocelot', px: [1, 1, 2], uv: [0, 10], p: [-1.5, 11.5, -8] },
    { tex: 'cat_ocelot', px: [1, 1, 2], uv: [6, 10], p: [1.5, 11.5, -8] },
    { tex: 'cat_ocelot', px: [4, 16, 6], uv: [20, 0], p: [0, 7, 1], rot: true },
    { tex: 'cat_ocelot', px: [1, 8, 1], uv: [0, 15], p: [0, 5, 8.5], pivot: [0, 9, 8], tilt: -0.9 },
    { tex: 'cat_ocelot', px: [1, 8, 1], uv: [4, 15], p: [0, 0, 14.3], pivot: [0, 4, 14.3], tilt: -1.3 },
    { tex: 'cat_ocelot', px: [2, 6, 2], uv: [8, 13], p: [1.1, 3, 7], pivot: [1.1, 6, 7], swing: 1 },
    { tex: 'cat_ocelot', px: [2, 6, 2], uv: [8, 13], p: [-1.1, 3, 7], pivot: [-1.1, 6, 7], swing: -1 },
    { tex: 'cat_ocelot', px: [2, 10, 2], uv: [40, 0], p: [1.2, 4.9, -4], pivot: [1.2, 9.9, -4], swing: -1 },
    { tex: 'cat_ocelot', px: [2, 10, 2], uv: [40, 0], p: [-1.2, 4.9, -4], pivot: [-1.2, 9.9, -4], swing: 1 },
  ],
  // a papagáj (32x32): kicsi, dőlt test, farok, két szárny, láb
  parrot: [
    { tex: 'parrot_blue', px: [3, 6, 3], uv: [2, 8], p: [0, 4.5, -3], pivot: [0, 7.5, -3], tilt: -0.4937 },
    { tex: 'parrot_blue', px: [3, 4, 1], uv: [22, 1], p: [0, 1.93, 0.66], pivot: [0, 2.93, 1.16], tilt: -1.015 },
    { tex: 'parrot_blue', px: [1, 5, 3], uv: [19, 8], p: [1.5, 4.56, -2.76], pivot: [1.5, 7.06, -2.76], flap: -1 },
    { tex: 'parrot_blue', px: [1, 5, 3], uv: [19, 8], p: [-1.5, 4.56, -2.76], pivot: [-1.5, 7.06, -2.76], flap: 1 },
    { tex: 'parrot_blue', px: [2, 3, 2], uv: [2, 2], p: [0, 8.31, -2.76] },
    { tex: 'parrot_blue', px: [2, 1, 4], uv: [10, 0], p: [0, 10.3, -3.76] },
    { tex: 'parrot_blue', px: [1, 2, 1], uv: [11, 7], p: [0, 8.8, -4.2] },
    { tex: 'parrot_blue', px: [1, 2, 1], uv: [16, 7], p: [0, 8.95, -5.2] },
    { tex: 'parrot_blue', px: [1, 2, 1], uv: [14, 18], p: [1, 0.5, -1], pivot: [1, 1, -1], swing: 1 },
    { tex: 'parrot_blue', px: [1, 2, 1], uv: [14, 18], p: [-1, 0.5, -1], pivot: [-1, 1, -1], swing: -1 },
  ],
  // a láma (128x64): hosszú nyak, kis fej, két fül, magas lábak
  llama: [
    { tex: 'llama_brown', px: [4, 4, 9], uv: [0, 0], p: [0, 29, -11.5] },
    { tex: 'llama_brown', px: [8, 18, 6], uv: [0, 14], p: [0, 24, -9] },
    { tex: 'llama_brown', px: [3, 3, 2], uv: [17, 0], p: [-2.5, 34.5, -9] },
    { tex: 'llama_brown', px: [3, 3, 2], uv: [17, 0], p: [2.5, 34.5, -9] },
    { tex: 'llama_brown', px: [12, 18, 10], uv: [29, 0], p: [0, 17, 1], rot: true },
    ...legs4('llama_brown', [4, 14, 4], [29, 29], 3.5, 14, -5, 6),
  ],
  // a teknős (128x64): lapos pajzs, hasi lemez, négy uszony
  turtle: [
    { tex: 'turtle', px: [6, 5, 6], uv: [3, 0], p: [0, 3.5, -10] },
    { tex: 'turtle', px: [19, 20, 6], uv: [7, 37], p: [0, 6, 3], rot: true },
    { tex: 'turtle', px: [11, 18, 3], uv: [31, 1], p: [0, 1.5, 2], rot: true },
    { tex: 'turtle', px: [4, 1, 10], uv: [1, 23], p: [-3.5, 1.5, 16] },
    { tex: 'turtle', px: [4, 1, 10], uv: [1, 12], p: [3.5, 1.5, 16] },
    { tex: 'turtle', px: [13, 1, 5], uv: [27, 30], p: [-11.5, 2.5, -3.5] },
    { tex: 'turtle', px: [13, 1, 5], uv: [27, 24], p: [11.5, 2.5, -3.5] },
  ],
  // a denevér (64x64): vízszintes törzs, két lapos szárny (a vállukon csapkodnak), a végük a szárny gyereke
  bat: [
    { tex: 'bat', px: [6, 12, 6], uv: [0, 16], p: [0, 8, 2], rot: true },
    { tex: 'bat', px: [6, 6, 6], uv: [0, 0], p: [0, 9, -6] },
    { tex: 'bat', px: [3, 4, 1], uv: [24, 0], p: [-2, 14, -7] },
    { tex: 'bat', px: [3, 4, 1], uv: [24, 0], p: [2, 14, -7] },
    { tex: 'bat', px: [10, 16, 1], uv: [42, 0], p: [8, 10, 2], pivot: [3, 10, 2], flap: 1, rot: true },
    { tex: 'bat', px: [8, 12, 1], uv: [24, 16], p: [17, 10, 3], pivot: [13, 10, 2], flap: 0.6, rot: true, child: true },
    { tex: 'bat', px: [10, 16, 1], uv: [42, 0], p: [-8, 10, 2], pivot: [-3, 10, 2], flap: -1, rot: true },
    { tex: 'bat', px: [8, 12, 1], uv: [24, 16], p: [-17, 10, 3], pivot: [-13, 10, 2], flap: -0.6, rot: true, child: true },
  ],
  // a tőkehal (32x32): test, kétrészes fej, hasi és hátúszó, két mellúszó, a farok csapkod
  cod: [
    { tex: 'fish_cod', px: [2, 4, 7], uv: [0, 0], p: [0, 2, -1] },
    { tex: 'fish_cod', px: [0.01, 1, 6], uv: [20, -6], p: [0, 4.5, -2.5] },
    { tex: 'fish_cod', px: [0.01, 1, 2], uv: [22, -1], p: [0, -0.5, -1.5] },
    { tex: 'fish_cod', px: [2, 3, 1], uv: [0, 0], p: [0, 2.5, -8] },
    { tex: 'fish_cod', px: [2, 4, 3], uv: [11, 0], p: [0, 2, -6] },
    { tex: 'fish_cod', px: [2, 1, 2], uv: [24, 4], p: [2, 0.5, -4.5], pivot: [1, 1, -5.5], rz: -0.61 },
    { tex: 'fish_cod', px: [2, 1, 2], uv: [24, 1], p: [-2, 0.5, -4.5], pivot: [-1, 1, -5.5], rz: 0.61 },
    { tex: 'fish_cod', px: [0.01, 4, 6], uv: [20, 1], p: [0, 2, 5.5], pivot: [0, 2, 2.5], wag: 0.7 },
  ],
  // a lazac (32x32): hosszú, kétrészes test (a hátsó fele és a farok csapkod), hátúszók, fej, mellúszók
  salmon: [
    { tex: 'fish_salmon', px: [3, 5, 8], uv: [0, 0], p: [0, 6, -5.5] },
    { tex: 'fish_salmon', px: [3, 5, 8], uv: [0, 13], p: [0, 6, 2.5], pivot: [0, 6, -1.5], wag: 0.3 },
    { tex: 'fish_salmon', px: [0.01, 5, 6], uv: [20, 10], p: [0, 6, 9.5], pivot: [0, 6, 6.5], wag: 0.5, child: true },
    { tex: 'fish_salmon', px: [0.01, 2, 2], uv: [4, 2], p: [0, 9.5, -2.5] },
    { tex: 'fish_salmon', px: [0.01, 2, 3], uv: [2, 3], p: [0, 9.5, 0] },
    { tex: 'fish_salmon', px: [2, 4, 3], uv: [22, 0], p: [0, 6.5, -11] },
    { tex: 'fish_salmon', px: [2, 0.01, 2], uv: [2, 0], p: [2, 4.2, -8.5], pivot: [1.5, 4.2, -8.5], rz: -0.6 },
    { tex: 'fish_salmon', px: [2, 0.01, 2], uv: [-2, 0], p: [-2, 4.2, -8.5], pivot: [-1.5, 4.2, -8.5], rz: 0.6 },
  ],
  // a gömbhal (32x32, kicsi alak): test, két szem, csapkodó farok és mellúszók
  pufferfish: [
    { tex: 'fish_puffer', px: [3, 2, 3], uv: [0, 27], p: [0, 1, 0] },
    { tex: 'fish_puffer', px: [1, 1, 1], uv: [24, 6], p: [1, 2.5, -1] },
    { tex: 'fish_puffer', px: [1, 1, 1], uv: [28, 6], p: [-1, 2.5, -1] },
    { tex: 'fish_puffer', px: [3, 0.01, 3], uv: [-3, 0], p: [0, 1, 3], pivot: [0, 1, 1.5], wag: 0.8 },
    { tex: 'fish_puffer', px: [1, 1, 2], uv: [25, 0], p: [2, 0.5, -0.5], pivot: [1.5, 0.5, -0.5], flap: 0.5 },
    { tex: 'fish_puffer', px: [1, 1, 2], uv: [25, 0], p: [-2, 0.5, -0.5], pivot: [-1.5, 0.5, -0.5], flap: -0.5 },
  ],
  // a polip/tintahal (64x32): álló test, nyolc csáp a gyűrűn, kis ellentétes lengéssel
  squid: [
    { tex: 'squid', px: [12, 16, 12], uv: [0, 0], p: [0, 26, 0] },
    ...Array.from({ length: 8 }, (_, i): TPart => {
      const a = (i / 8) * Math.PI * 2;
      return { tex: 'squid', px: [2, 18, 2], uv: [48, 0], p: [Math.cos(a) * 5, 9, Math.sin(a) * 5], pivot: [Math.cos(a) * 5, 18, Math.sin(a) * 5], swing: i % 2 ? 1.5 : -1.5 };
    }),
  ],
  // a szellem (64x64): lapos test, fej, két szárny (vállon csapkodnak, a végük a gyerekük), farok
  ghost: [
    { tex: 'ghost', px: [5, 3, 9], uv: [0, 8], p: [0, 8, -3.5] },
    { tex: 'ghost', px: [5, 3, 5], uv: [0, 0], p: [0, 8.5, -10.5] },
    { tex: 'ghost', px: [6, 2, 9], uv: [23, 12], p: [5.5, 9, -3.5], pivot: [2.5, 9, -3.5], flap: 0.7 },
    { tex: 'ghost', px: [13, 1, 9], uv: [16, 24], p: [14.5, 9, -3.5], pivot: [8, 9, -3.5], flap: 0.5, child: true },
    { tex: 'ghost', px: [6, 2, 9], uv: [23, 12], p: [-5.5, 9, -3.5], pivot: [-2.5, 9, -3.5], flap: -0.7 },
    { tex: 'ghost', px: [13, 1, 9], uv: [16, 24], p: [-14.5, 9, -3.5], pivot: [-8, 9, -3.5], flap: -0.5, child: true },
    { tex: 'ghost', px: [3, 2, 6], uv: [3, 20], p: [0, 8, 4] },
    { tex: 'ghost', px: [1, 1, 6], uv: [4, 29], p: [0, 8, 10] },
  ],
  // a nyálka (64x32): belső mag (a külső burok az áttetsző pixelek miatt itt tömör lenne), két szem, száj
  slime: [
    { tex: 'slime', px: [6, 6, 6], uv: [0, 16], p: [0, 4, 0] },
    { tex: 'slime', px: [2, 2, 2], uv: [32, 0], p: [-2.3, 3, -2.5] },
    { tex: 'slime', px: [2, 2, 2], uv: [32, 4], p: [2.3, 3, -2.5] },
    { tex: 'slime', px: [1, 1, 1], uv: [32, 8], p: [0.5, 5.5, -3] },
  ],
};
// a husk és a fulladt a zombi teste más skinnel; a tarantula a pók teste a barlangi pók skinjével; a kis nyálka a nyálka kicsiben
for (const t of ['husk', 'drowned'] as const) TEXTURED[t] = TEXTURED.zombie!.map((q) => ({ ...q, tex: t }));
TEXTURED.tarantula = TEXTURED.spider!.map((q) => ({ ...q, tex: 'tarantula' as TexName }));
TEXTURED.slimelet = TEXTURED.slime;
// a szamár és az öszvér: a ló testrészei, a saját skinjükkel, nagy fülekkel
const horseBody = (tex: TexName): TPart[] => TEXTURED.horse!
  .filter((q) => !(q.px[0] === 2 && q.px[1] === 3)) // a ló rövid fülei nem kellenek
  .map((q) => ({ ...q, tex }));
for (const t of ['donkey', 'mule'] as const) {
  TEXTURED[t] = [
    ...horseBody(t),
    { tex: t, px: [2, 7, 1], uv: [0, 12], p: [-1.9, 34, -7.5], pivot: [0, 20, -12], tilt: -0.5236 },
    { tex: t, px: [2, 7, 1], uv: [0, 12], p: [1.9, 34, -7.5], pivot: [0, 20, -12], tilt: -0.5236 },
  ];
}

/** A modell mérete a ló modelljéhez képest (a szamár és az öszvér kisebb) */
export const MODEL_SCALE: Partial<Record<string, number>> = { donkey: 0.88, mule: 0.94, bat: 0.3, squid: 0.5, ghost: 0.7, slime: 2.1, slimelet: 1.05, tarantula: 0.6, pufferfish: 1.6 };

/** Színezés: a szürke (színezésre szánt) skinek szorzószíne */
export const TINT: Partial<Record<string, number>> = { tarantula: 0x4fb0a8 };

/** Az azonos modell több skinje: a Mob.variant választ közülük (az első rész textúrája helyére kerül) */
export const VARIANT_SKINS: Partial<Record<string, string[]>> = {
  horse: ['horse', 'horse_brown', 'horse_chestnut', 'horse_creamy', 'horse_darkbrown', 'horse_gray', 'horse_black', 'horse_white'],
  rabbit: ['rabbit_brown', 'rabbit_white', 'rabbit_black', 'rabbit_gold', 'rabbit_salt', 'rabbit_white_splotched', 'rabbit_toast'],
  cat: ['cat_ocelot', 'cat_black', 'cat_red', 'cat_siamese'],
  parrot: ['parrot_blue', 'parrot_green', 'parrot_grey', 'parrot_red_blue', 'parrot_yellow_blue'],
  llama: ['llama_brown', 'llama_gray', 'llama_white'],
};

/** Egy rész geometriája (a doboz közepén a nullpont, blokk egységben) */
export function partGeom(part: TPart): BoxGeom {
  const k = 1 / 16;
  const g = part.grow ?? 0;
  const [w, h, d] = part.px;
  return boxGeom([(w + 2 * g) * k, (h + 2 * g) * k, (d + 2 * g) * k], part.px, part.uv, TEX_SIZE[part.tex], !!part.rot);
}
