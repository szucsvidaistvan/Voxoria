/** Determinisztikus zajfüggvények a világgeneráláshoz */

export const CS = 16; // chunk szélesség (X és Z)
export const CH = 384; // világ magassága: Minecraft-méret (y −64…319 → nálunk 0…383)
export const Y0 = 64; // eltolás: Minecraft Y + Y0 = a mi Y-unk
export const SEA_LEVEL = 63 + Y0; // 127: a terep kb. 17%-át önti el a víz
/** A korábbi (64 magas) világ magasságait vetíti át: a tengerszinthez képest HS-szeresére nyújtva */
export const HS = 2.4;
export const lvl = (old: number): number => Math.round(SEA_LEVEL + (old - 28) * HS);

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

/** 3D értékzaj (barlangokhoz) */
export function valueNoise3(x: number, y: number, z: number, s: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const fx = smooth(x - x0), fy = smooth(y - y0), fz = smooth(z - z0);
  const h = (dx: number, dy: number, dz: number) => hash2(x0 + dx, z0 + dz + Math.imul(y0 + dy, 7919), s);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(h(0, 0, 0), h(1, 0, 0), fx), l(h(0, 0, 1), h(1, 0, 1), fx), fz),
    l(l(h(0, 1, 0), h(1, 1, 0), fx), l(h(0, 1, 1), h(1, 1, 1), fx), fz),
    fy,
  );
}
