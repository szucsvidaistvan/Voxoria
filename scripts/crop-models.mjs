// Növények (búza, murok, krumpli, cékla) fázisai és a nedves szántóföld a Good Vibes csomag blokktextúráiból.
// Keresztezett lapok, mint a virágoknál; a fázis a blokk nevében van (pl. wheat_stage3).
export const CROPS = { wheat: 8, carrots: 4, potatoes: 4, beetroots: 4 };

const FULL = [0, 0, 16, 16];
const rot = { o: [8, 8, 8], a: 'y', g: 45, s: 1 };
const f = (tex) => ({ uv: FULL, tex });

export function cropBlock(name, tex) {
  return {
    name, kind: 'shape', rx: 0, ry: 0, tinted: false,
    parts: [
      { from: [0.8, 0, 8], to: [15.2, 16, 8], rot, faces: { north: f(tex), south: f(tex) } },
      { from: [8, 0, 0.8], to: [8, 16, 15.2], rot, faces: { west: f(tex), east: f(tex) } },
    ],
  };
}

/** a hiányzó növény-blokkok; `hasTex(textúra)`: megvan-e a csomagban */
export function cropBlocks(blocks, hasTex) {
  const out = [];
  const have = new Set(blocks.map((b) => b.name));
  for (const [crop, stages] of Object.entries(CROPS)) {
    for (let s = 0; s < stages; s++) {
      const name = `${crop}_stage${s}`;
      if (!have.has(name) && hasTex(`block/${name}`)) out.push(cropBlock(name, `block/${name}`));
    }
  }
  const farm = blocks.find((b) => b.name === 'farmland');
  if (farm && !have.has('farmland_moist') && hasTex('block/farmland_moist')) {
    const moist = JSON.parse(JSON.stringify(farm));
    moist.name = 'farmland_moist';
    for (const p of moist.parts) for (const fc of Object.values(p.faces)) if (fc.tex === 'block/farmland' || fc.tex === 'block__farmland') fc.tex = fc.tex.replace('farmland', 'farmland_moist');
    out.push(moist);
  }
  return out;
}
