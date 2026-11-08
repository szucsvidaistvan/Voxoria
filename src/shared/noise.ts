/** Determinisztikus zajfüggvények a világgeneráláshoz */

export const CS = 16; // chunk szélesség (X és Z)
export const CH = 64; // világ magassága
export const SEA_LEVEL = 28; // a terep kb. 17%-át önti el a víz

export function hash2(x: number, z: number, s: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const smooth = (t: number) => t * t * (3 - 2 * t);

export function valueNoise(x: number, z: number, s: number): number {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = smooth(x - x0), fz = smooth(z - z0);
  const a = hash2(x0, z0, s), b = hash2(x0 + 1, z0, s);
  const c = hash2(x0, z0 + 1, s), d = hash2(x0 + 1, z0 + 1, s);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export function fbm(x: number, z: number, s: number): number {
  let v = 0, amp = 1, freq = 1, sum = 0;
  for (let i = 0; i < 4; i++) {
    v += valueNoise(x * freq, z * freq, s + i) * amp;
    sum += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return v / sum;
}
