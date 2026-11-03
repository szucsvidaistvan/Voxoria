/**
 * Textúrázott doboz a "dobozkibontós" UV-elrendezéssel (a szokásos 64x32 / 64x64 lényképek és játékos-skinek elrendezése):
 *   felül: (u+d, v) w×d | alul: (u+d+w, v) w×d
 *   jobb oldal: (u, v+d) d×h | elöl: (u+d, v+d) w×h | bal oldal: (u+d+w, v+d) d×h | hátul: (u+2d+w, v+d) w×h
 * A modell koordinátái: y felfelé, az előre a −z irány, a karakter jobb keze a +x.
 * A függvény tiszta (nem függ a three-től), így fejlesztői tesztben is kipróbálható.
 */
export interface BoxGeom {
  /** csúcsok (x,y,z)*, laponként 4 */
  pos: number[];
  /** textúra-koordináták (u,v)*, 0..1, a v lefelé nő (a képen), ezért a three flipY-os textúrájához 1−v kell */
  uv: number[];
  /** a lapokhoz tartozó csúcs-árnyalat (laponként 4 érték) */
  shade: number[];
  index: number[];
}

/** A hat lap: a négy csúcs (bal-alsó, jobb-alsó, jobb-felső, bal-felső, kívülről nézve) és a képrész */
export function boxGeom(
  size: [number, number, number], px: [number, number, number], uv: [number, number], tex: [number, number], rotX90 = false,
): BoxGeom {
  const [sx, sy, sz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const [w, h, d] = px;
  const [u, v] = uv;
  type F = { v: [number, number, number][]; r: [number, number, number, number]; shade: number };
  const faces: F[] = [
    // elöl (−z)
    { v: [[sx, -sy, -sz], [-sx, -sy, -sz], [-sx, sy, -sz], [sx, sy, -sz]], r: [u + d, v + d, w, h], shade: 0.65 },
    // hátul (+z)
    { v: [[-sx, -sy, sz], [sx, -sy, sz], [sx, sy, sz], [-sx, sy, sz]], r: [u + 2 * d + w, v + d, w, h], shade: 0.65 },
    // jobb (+x)
    { v: [[sx, -sy, sz], [sx, -sy, -sz], [sx, sy, -sz], [sx, sy, sz]], r: [u, v + d, d, h], shade: 0.8 },
    // bal (−x)
    { v: [[-sx, -sy, -sz], [-sx, -sy, sz], [-sx, sy, sz], [-sx, sy, -sz]], r: [u + d + w, v + d, d, h], shade: 0.8 },
    // felül (+y): a kép alsó éle az elülső
    { v: [[sx, sy, -sz], [-sx, sy, -sz], [-sx, sy, sz], [sx, sy, sz]], r: [u + d, v, w, d], shade: 1 },
    // alul (−y): a kép felső éle az elülső
    { v: [[sx, -sy, sz], [-sx, -sy, sz], [-sx, -sy, -sz], [sx, -sy, -sz]], r: [u + d + w, v, w, d], shade: 0.5 },
  ];
  const g: BoxGeom = { pos: [], uv: [], shade: [], index: [] };
  const [tw, th] = tex;
  faces.forEach((f, i) => {
    const [x, y, ww, hh] = f.r;
    // bal-alsó, jobb-alsó, jobb-felső, bal-felső a képen (a v lefelé nő)
    const c: [number, number][] = [[x, y + hh], [x + ww, y + hh], [x + ww, y], [x, y]];
    // az x tengely körüli −90°-os elforgatás (a lények törzse fekszik): (x, y, z) -> (x, z, −y); az árnyalat az új normálisból jön
    const vs = rotX90 ? f.v.map(([a, b, cc]) => [a, cc, -b] as [number, number, number]) : f.v;
    let shade = f.shade;
    if (rotX90) {
      const e1 = [vs[1][0] - vs[0][0], vs[1][1] - vs[0][1], vs[1][2] - vs[0][2]];
      const e2 = [vs[2][0] - vs[1][0], vs[2][1] - vs[1][1], vs[2][2] - vs[1][2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const ax = Math.abs(n[0]) > Math.abs(n[1]) && Math.abs(n[0]) > Math.abs(n[2]) ? 0 : Math.abs(n[1]) > Math.abs(n[2]) ? 1 : 2;
      shade = ax === 0 ? 0.8 : ax === 1 ? (n[1] > 0 ? 1 : 0.5) : 0.65;
    }
    for (let k = 0; k < 4; k++) {
      g.pos.push(...vs[k]);
      g.uv.push(c[k][0] / tw, c[k][1] / th);
      g.shade.push(shade);
    }
    const b = i * 4;
    g.index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return g;
}
