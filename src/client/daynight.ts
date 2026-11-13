import type { RGB } from '../shared/blocks';

/** Egy teljes nap hossza másodpercben (valós idő): 20 perc */
export const DAY_SECONDS = 1200;
/** Új világ kezdő napszaka: kora reggel, nem sokkal napkelte után */
export const START_TIME = 0.04;

/**
 * A napszak 0..1 között fut: 0 = napkelte, 0.31 = dél, 0.62 = napnyugta, 0.81 = éjfél.
 *
 * A Minecraftéhoz hasonló, de nem ugyanaz: a nap az idő 62%-ában (kb. 12 és fél perc) van fenn, az éjszaka
 * 38% (kb. 7 és fél perc). A nap íve nem egyenletes: napkelte és napnyugta lassan, elnyújtva telik, az éjszakát
 * pedig a hold fázisai változtatják: telihold idején világosabb, újholdkor sötétebb.
 */
export const DAY_FRACTION = 0.62;

/** A nap szöge: 0 = napkelte, PI = napnyugta, 2 PI = újra napkelte. A sin értéke a nap magassága. */
export function sunAngle(time: number): number {
  return time < DAY_FRACTION
    ? Math.PI * (time / DAY_FRACTION)
    : Math.PI + Math.PI * ((time - DAY_FRACTION) / (1 - DAY_FRACTION));
}

/** Éjszaka van-e (a nap a horizont alatt vagy épp csak felette): ilyenkor lehet aludni */
export const isNight = (time: number): boolean => Math.sin(sunAngle(time)) < 0.1;

/** Játékbeli óra: napkelte 6:00, dél 12:00, napnyugta 18:00, éjfél 0:00 */
export function clockHours(time: number): number {
  return (6 + (sunAngle(time) / (Math.PI * 2)) * 24) % 24;
}
export function formatClock(time: number): string {
  const h = clockHours(time);
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** A hold fázisa a nap sorszámából: 0 újhold, 1 növő sarló, 2 első negyed, 3 növő hold, 4 telihold, 5 fogyó hold, 6 utolsó negyed, 7 fogyó sarló */
export const moonPhaseOf = (day: number): number => (((day + 2) % 8) + 8) % 8;
/** A hold megvilágított része 0..1 */
export const moonBrightness = (phase: number): number => (1 - Math.cos((phase / 8) * Math.PI * 2)) / 2;

export interface SkyState {
  /** ég- és ködszín (sRGB, 0..1) */
  sky: RGB;
  /** az anyagok szorzója (lineáris, 0..1): ettől lesz sötét az éjszaka */
  light: RGB;
  /** a nap iránya (egységvektor); a hold ennek az ellentéte */
  sunDir: RGB;
  /** a nap magassága: 1 = zenit, −1 = nadir */
  elevation: number;
  /** csillagok láthatósága 0..1 */
  stars: number;
  /** a hold fázisa (lásd moonPhaseOf) */
  moonPhase: number;
}

const DAY_SKY: RGB = [0.56, 0.72, 1.0];
const NIGHT_SKY: RGB = [0.02, 0.03, 0.09];
const SUNRISE_GLOW: RGB = [1.0, 0.64, 0.52]; // rózsaszínes arany
const SUNSET_GLOW: RGB = [0.97, 0.42, 0.27]; // mély narancs
const TWILIGHT: RGB = [0.5, 0.26, 0.55]; // naplemente után lilába hajlik
const DAY_LIGHT: RGB = [1, 1, 1];
const NIGHT_LIGHT: RGB = [0.07, 0.09, 0.2];

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export function skyAt(time: number, day = 1): SkyState {
  const angle = sunAngle(time);
  const e = Math.sin(angle);
  const dayAmt = smoothstep(-0.1, 0.3, e);
  const phase = moonPhaseOf(day);
  const moon = 0.7 + 0.8 * moonBrightness(phase); // 0.7 újholdkor, 1.5 teliholdkor

  // hajnali és alkonyati pír: akkor a legerősebb, amikor a nap a horizonton jár; hajnalban rózsaszín, este narancs, majd lila
  const glow = Math.max(0, 1 - Math.abs(e - 0.02) / 0.34) * 0.6;
  const rising = Math.cos(angle) > 0;
  const glowColor = rising ? SUNRISE_GLOW : mix(SUNSET_GLOW, TWILIGHT, smoothstep(0.08, -0.2, e));
  const nightSky = NIGHT_SKY.map((v) => v * (0.8 + 0.4 * moonBrightness(phase))) as RGB;
  const sky = mix(mix(nightSky, DAY_SKY, dayAmt), glowColor, glow);

  const x = Math.cos(angle), z = 0.35;
  const len = Math.hypot(x, e, z);

  // a fény napkelte és napnyugta idején enyhén meleg árnyalatú
  const light = mix(NIGHT_LIGHT.map((v) => v * moon) as RGB, DAY_LIGHT, dayAmt);
  light[1] *= 1 - 0.18 * glow;
  light[2] *= 1 - 0.45 * glow;

  return {
    sky,
    light,
    sunDir: [x / len, e / len, z / len],
    elevation: e,
    stars: 1 - smoothstep(-0.25, 0.05, e),
    moonPhase: phase,
  };
}
