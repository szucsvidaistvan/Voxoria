// Kis, függőségmentes PNG-olvasó: csak az átlátszó pixelek arányát számolja ki egy téglalapban.
// (nem átlapolt PNG, 1-16 bites paletta / szürke / RGB / RGBA)
import { inflateSync } from 'node:zlib';

export function readPng(buf) {
  let p = 8;
  let ihdr = null, plte = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), bd: data[8], ct: data[9], il: data[12] };
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (!ihdr || ihdr.il !== 0) return null;
  const { w, h, bd, ct } = ihdr;
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  if (!ch) return null;
  const bits = ch * bd;
  const bpp = Math.max(1, bits >> 3);
  const stride = (w * bits + 7) >> 3;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[dst + i - bpp] : 0;
      const b = y > 0 ? out[dst - stride + i] : 0;
      const c = i >= bpp && y > 0 ? out[dst - stride + i - bpp] : 0;
      let v = raw[src + i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[dst + i] = v & 255;
    }
  }
  const alpha = (x, y) => {
    const row = y * stride;
    if (ct === 6) return out[row + x * bpp + (bd >> 3) * 3];
    if (ct === 4) return out[row + x * bpp + (bd >> 3)];
    if (ct === 3) {
      const bitPos = x * bd;
      const idx = (out[row + (bitPos >> 3)] >> (8 - bd - (bitPos & 7))) & ((1 << bd) - 1);
      return trns && idx < trns.length ? trns[idx] : 255;
    }
    return 255;
  };
  return { w, h, alpha };
}

/** Az átlátszó (alpha < 128) pixelek aránya a [x0,y0,x1,y1) téglalapban */
export function transparentFraction(buf, x0, y0, x1, y1) {
  let png;
  try { png = readPng(buf); } catch { return 0; }
  if (!png) return 0;
  x1 = Math.min(x1, png.w); y1 = Math.min(y1, png.h);
  let n = 0, t = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { n++; if (png.alpha(x, y) < 128) t++; }
  return n ? t / n : 0;
}
