// A WebRTC meghívó-kód kapcsolat tesztje: két "böngésző-fél" ugyanabban az oldalban, kódcserével, adatcsatornán át.
// Futtatás: node scripts/playtest/rtc.mjs   (kell: playwright + esbuild, pl. a sandbox előtelepített példánya)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
let esbuild; try { esbuild = require('esbuild'); } catch { esbuild = require('/opt/npm-tools/node_modules/esbuild'); }

const out = await esbuild.build({ entryPoints: ['src/client/net/rtc.ts'], bundle: true, format: 'iife', globalName: 'rtc', write: false });
const browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: out.outputFiles[0].text });
const res = await page.evaluate(async () => {
  const opts = { iceServers: [], gatherTimeout: 3000 };
  const host = await rtc.createInvite(opts);
  const guestSide = await rtc.joinWithCode(host.code, opts);
  const hostLink = await host.accept(guestSide.answer);
  const guestLink = await guestSide.link;
  const got = { host: [], guest: [] };
  hostLink.onMessage((m) => got.host.push(m));
  guestLink.onMessage((m) => got.guest.push(m));
  guestLink.send({ t: 'hello', name: 'Anna' });
  hostLink.send({ t: 'welcome', seed: 5 });
  hostLink.send({ t: 'snapshot', n: 1 }, false);
  guestLink.send({ t: 'state', x: 1 }, false);
  await new Promise((r) => setTimeout(r, 500));
  let closed = false; guestLink.onClose(() => { closed = true; });
  const bad = await rtc.joinWithCode('rossz').then(() => 'no error', (e) => e.message);
  hostLink.close();
  await new Promise((r) => setTimeout(r, 800));
  return { got, codeLen: host.code.length, answerLen: guestSide.answer.length, open: [hostLink.open, guestLink.open], closed, bad };
});
await browser.close();
console.log(JSON.stringify(res));
const ok = res.got.host.length === 2 && res.got.guest.length === 2 && res.bad === 'Ez nem meghívó kód' && res.closed && !res.open[0];
console.log(ok ? 'OK' : 'HIBA');
process.exit(ok ? 0 : 1);
