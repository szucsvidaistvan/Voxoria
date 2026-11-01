// A textúracsomag gyökerének megkeresése a zipben: az a mappa, amiben a textures/block van.
// (pl. "assets/minecraft/" egy szokásos csomagnál, "GoodVibes/minecraft/" a VoxelAssets tárolóban)
export function packRoot(zip) {
  const re = /^(.*?minecraft\/)textures\/block\/[^/]+\.png$/;
  const hits = zip.names.map((n) => n.match(re)).filter(Boolean);
  if (!hits.length) throw new Error('A zipben nincs textures/block mappa: ez nem Minecraft textúracsomag.');
  // ha több csomag is van a zipben, a legtöbb blokk-textúrát tartalmazó mappát választjuk
  const count = new Map();
  for (const h of hits) count.set(h[1], (count.get(h[1]) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
