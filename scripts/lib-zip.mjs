// Kis, függőségmentes zip-olvasó (csak tárolt és deflate módszert kezel, zip64-et nem).
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

export function readZip(path) {
  const buf = readFileSync(path);
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Ez nem zip fájl');

  const count = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Sérült zip-könyvtár');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    entries.set(buf.toString('utf8', p + 46, p + 46 + nlen), { method, csize, off });
    p += 46 + nlen + elen + clen;
  }

  return {
    names: [...entries.keys()],
    has: (name) => entries.has(name),
    /** a fájl tartalma Bufferként, vagy null, ha nincs ilyen */
    read(name) {
      const en = entries.get(name);
      if (!en) return null;
      const n = buf.readUInt16LE(en.off + 26);
      const x = buf.readUInt16LE(en.off + 28);
      const start = en.off + 30 + n + x;
      const data = buf.subarray(start, start + en.csize);
      if (en.method === 0) return data;
      if (en.method === 8) return inflateRawSync(data);
      throw new Error(`Ismeretlen tömörítés (${en.method}): ${name}`);
    },
    json(name) {
      const d = this.read(name);
      if (!d) return null;
      try { return JSON.parse(d.toString('utf8')); } catch { return null; }
    },
  };
}
