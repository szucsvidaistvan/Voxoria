// A teljes játék lefordítása tesztelésre (Vite nélkül): `node scripts/playtest/build.mjs`
// Kimenet: .playtest/ (index.html + bundle). Három lehetőség a three csomagra:
//   1) node_modules/three (npm install után), 2) THREE_PATH környezeti változó (a three.module.js útvonala).
// Az esbuild az `npm install` után a node_modules-ban van; különben az ESBUILD_PATH változóval adható meg.
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const out = resolve(root, '.playtest');
const req = createRequire(import.meta.url);
const esbuildPath = process.env.ESBUILD_PATH ?? (existsSync(resolve(root, 'node_modules/esbuild')) ? resolve(root, 'node_modules/esbuild') : '/opt/npm-tools/node_modules/esbuild');
const esbuild = req(esbuildPath);
const threePath = process.env.THREE_PATH ?? resolve(root, 'node_modules/three/build/three.module.js');
if (!existsSync(threePath)) throw new Error(`Nincs three: ${threePath} (npm install, vagy THREE_PATH=...)`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
await esbuild.build({
  entryPoints: [resolve(root, 'src/client/main.ts')],
  bundle: true, format: 'esm', outfile: resolve(out, 'bundle.js'), sourcemap: false,
  alias: { three: threePath },
  define: { 'import.meta.env.BASE_URL': '"./"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"test"' },
  loader: { '.png': 'dataurl', '.json': 'json' },
  logLevel: 'warning',
});
let html = readFileSync(resolve(root, 'index.html'), 'utf8');
html = html.replace('<script type="module" src="/src/client/main.ts"></script>', '<link rel="stylesheet" href="./bundle.css" />\n  <script type="module" src="./bundle.js"></script>');
writeFileSync(resolve(out, 'index.html'), html);
cpSync(resolve(root, 'public'), out, { recursive: true, dereference: true });
console.log('kész:', out);
