// A láda modellje a textúracsomag entity/chest/normal.png (64x64) képéből, mint a Minecraft ládamodellje:
// alsó doboz (14x10x14), fedél (14x5x14) és a zár (2x4x1). A láda eleje alapállásban dél (+z) felé néz.
export const CHEST_TEX = 'entity/chest/normal';

const px = (x0, y0, x1, y1) => [x0 / 4, y0 / 4, x1 / 4, y1 / 4]; // a kép pixelei -> a 0..16-os textúratér

/** egy doboz lapjai a kép kibontásából: (u, v) a doboz bal felső sarka, w x h x d a mérete */
function boxFaces(tex, u, v, w, h, d) {
  const f = (uv) => ({ uv: px(...uv), tex });
  return {
    up: f([u + d, v, u + d + w, v + d]),
    down: f([u + d + w, v, u + d + 2 * w, v + d]),
    west: f([u, v + d, u + d, v + d + h]),
    south: f([u + d, v + d, u + d + w, v + d + h]), // a kép "eleje" a világban dél felé néz
    east: f([u + d + w, v + d, u + 2 * d + w, v + d + h]),
    north: f([u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h]),
  };
}

export function chestBlock(tex) {
  return {
    name: 'chest',
    kind: 'shape',
    parts: [
      { from: [1, 0, 1], to: [15, 10, 15], faces: boxFaces(tex, 0, 19, 14, 10, 14) },
      { from: [1, 9, 1], to: [15, 14, 15], faces: boxFaces(tex, 0, 0, 14, 5, 14) },
      { from: [7, 8, 15], to: [9, 12, 16], faces: boxFaces(tex, 0, 0, 2, 4, 1) },
    ],
    rx: 0, ry: 0, tinted: false,
  };
}
