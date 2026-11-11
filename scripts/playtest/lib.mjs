// Játék-tesztkörnyezet: a lefordított játék (.playtest) futtatása headless Chrome-ban szoftveres WebGL-lel.
//   const t = await launch({ w: 1280, h: 720, touch: false });
//   await t.newGame(20260); await t.settle(); await t.shot('a.png'); await t.close();
import http from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const dir = resolve(root, '.playtest');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };

function serve() {
  return new Promise((ok) => {
    const srv = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const f = resolve(dir, '.' + (p === '/' ? '/index.html' : p));
      if (!f.startsWith(dir) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
      res.end(readFileSync(f));
    }).listen(0, '127.0.0.1', () => ok(srv));
  });
}

export async function launch({ w = 1280, h = 720, touch = false, query = '' } = {}) {
  const req = createRequire(import.meta.url);
  const pw = req(process.env.PLAYWRIGHT_PATH ?? (existsSync(resolve(root, 'node_modules/playwright')) ? 'playwright' : '/opt/npm-tools/node_modules/playwright'));
  const srv = await serve();
  const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html?debug${query}`);
  await page.waitForFunction('window.__voxoria', null, { timeout: 60000 });
  await page.addStyleTag({ content: '#resume-hint{display:none!important}' }); // headless: nincs pointer lock
  const g = (fn, arg) => page.evaluate(fn, arg);
  const t = {
    page, logs,
    /** új világ adott maggal (a menü kihagyásával) */
    newGame: (seed = 20260, mode = 'survival') => g(([s, m]) => { window.__voxoria.newGame(s, m); document.getElementById('resume-hint').hidden = true; }, [seed, mode]),
    /** az első cella felfelé, ami nem víz és nem vízi növény (a vízfelszín fölötti levegő) */
    surfaceAbove: (x, y, z) => g(([a, b, c]) => { const v = window.__voxoria; let yy = b; while (yy < 120) { const k = v.BLOCKS[v.world.getBlock(a, yy, c)]?.key; if (!k || !(k.includes('water') || k === 'seagrass')) return yy; yy++; } return yy; }, [x, y, z]),
    /** vár, amíg a játékos körül betöltődnek a chunkok és legyárt a geometria */
    settle: async (ms = 2500) => { await page.waitForTimeout(ms); },
    teleport: (x, y, z) => g(([a, b, c]) => window.__voxoria.teleport(a, b, c), [x, y, z]),
    look: (yaw, pitch = 0) => g(([a, b]) => window.__voxoria.look(a, b), [yaw, pitch]),
    setBlock: (x, y, z, name) => g(([a, b, c, n]) => window.__voxoria.setBlock(a, b, c, window.__voxoria.blockId(n)), [x, y, z, name]),
    getBlockName: (x, y, z) => g(([a, b, c]) => { const v = window.__voxoria; return v.BLOCKS[v.world.getBlock(a, b, c)]?.key ?? null; }, [x, y, z]),
    pos: () => g(() => { const p = window.__voxoria.player; return { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch }; }),
    /** a betöltött chunkokban megkeresi az adott nevű blokkokat (legfeljebb n db), a játékoshoz közelit előre */
    find: (name, n = 20) => g(([nm, max]) => {
      const v = window.__voxoria, id = v.blockId(nm), out = [];
      const p = v.player.pos;
      for (const c of v.world.chunks.values()) {
        for (let y = 0; y < 128; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
          if (c.get(x, y, z) === id) out.push([c.cx * 16 + x, y, c.cz * 16 + z]);
        }
      }
      out.sort((a, b) => Math.hypot(a[0] - p.x, a[2] - p.z) - Math.hypot(b[0] - p.x, b[2] - p.z));
      return out.slice(0, max);
    }, [name, n]),
    /** billentyű lenyomva tartása ms-ig (pl. 'KeyW', 'Space') */
    hold: async (code, ms = 500) => { await page.keyboard.down(code); await page.waitForTimeout(ms); await page.keyboard.up(code); },
    shot: (file) => page.screenshot({ path: file }),
    close: async () => { await browser.close(); srv.close(); },
  };
  return t;
}
