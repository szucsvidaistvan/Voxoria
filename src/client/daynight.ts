import type { RGB } from '../shared/blocks';

/** Egy teljes nap hossza másodpercben (valós idő) */
export const DAY_SECONDS = 480;
/** Új világ kezdő napszaka: kora reggel */
export const START_TIME = 0.2;

/**
 * A napszak 0..1 között fut:
 *   0 = napkelte, 0.25 = dél, 0.5 = napnyugta, 0.75 = éjfél.
 */
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
}

const DAY_SKY: RGB = [0.56, 0.72, 1.0];
const NIGHT_SKY: RGB = [0.02, 0.03, 0.09];
const DUSK_SKY: RGB = [0.95, 0.5, 0.3];
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

export function skyAt(time: number): SkyState {
  const angle = time * Math.PI * 2;
  const e = Math.sin(angle);
  const day = smoothstep(-0.1, 0.3, e);

  // hajnali és alkonyati pír: akkor a legerősebb, amikor a nap a horizonton jár
  const glow = Math.max(0, 1 - Math.abs(e) / 0.3) * 0.55;
  const sky = mix(mix(NIGHT_SKY, DAY_SKY, day), DUSK_SKY, glow);

  const x = Math.cos(angle), z = 0.35;
  const len = Math.hypot(x, e, z);

  return {
    sky,
    light: mix(NIGHT_LIGHT, DAY_LIGHT, day),
    sunDir: [x / len, e / len, z / len],
    elevation: e,
    stars: 1 - smoothstep(-0.25, 0.05, e),
  };
}
