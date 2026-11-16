/** GuestClient ↔ GameServer teszt hamis (JSON-szerializáló) kapcsolattal: `npx tsx scripts/test-guest.ts` */
import { GameServer } from '../src/shared/gameserver';
import { MobManager } from '../src/shared/mobs';
import { Sim } from '../src/shared/sim';
import { World } from '../src/shared/world';
import { GuestClient } from '../src/client/net/guest';
import type { Link } from '../src/client/net/rtc';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.error('HIBA:', m); } else console.log('ok  ', m); };

const world = new World(77);
world.ensureChunk(0, 0);
world.setBlock(1, 70, 1, 5);
const sim = new Sim(world, { changed() {}, setBlock() {}, drop() {} });
const mobs = new MobManager(world);
const server = new GameServer(world, sim, mobs, {
  blockChanged() {}, attack() {}, hurtHost() {}, chest() {}, morning() {}, chat() {}, presence() {}, clock: () => ({ time: 0.5, day: 3 }),
  dropRequest() {}, pickup: () => null, drops: () => [],
});
server.setLocal({ x: 4, y: 70, z: 4 });

// összekötött link-pár (üzenetek JSON-on át, mint a valódi csatornán)
const mkPair = (): [Link, Link] => {
  const cbs: [((m: unknown) => void)[], ((m: unknown) => void)[]] = [[], []];
  const mk = (me: 0 | 1): Link => ({
    open: true,
    send: (m) => { const j = JSON.stringify(m); queueMicrotask(() => cbs[1 - me].forEach((f) => f(JSON.parse(j)))); },
    onMessage: (f) => { cbs[me].push(f); },
    onClose: () => {}, close: () => {},
  });
  return [mk(0), mk(1)];
};
const [hostSide, guestSide] = mkPair();
const id = server.connect({ send: (m, r) => hostSide.send(m, r) });
hostSide.onMessage((m) => server.receive(id, m as never));

const got = { welcome: null as null | { seed: number; day: number }, edits: [] as number[], snaps: 0, mobs: 0, players: 0, hurt: 0 };
const g = new GuestClient(guestSide, 'Vendég', {
  welcome: (w) => { got.welcome = { seed: w.seed, day: w.day }; },
  reject: () => {}, edits: (l) => got.edits.push(...l.map((e) => e.id)),
  snapshot: (p, m) => { got.snaps++; got.mobs = m.length; got.players = p.length; },
  hurt: () => { got.hurt++; }, dropAdd: () => {}, dropDel: () => {}, give: () => {}, morning: () => {}, chat: () => {}, closed: () => {},
});
const wait = () => new Promise((r) => setTimeout(r, 5));
await wait();
ok(got.welcome?.seed === 77 && got.welcome.day === 3 && g.id === id, 'vendég megkapja a welcome-ot');
ok(got.edits.includes(5), 'a meglévő módosítás megérkezik');
g.sendState({ x: 3, y: 70, z: 3, yaw: 0, pitch: 0, held: 0, armor: [0, 0, 0, 0], speed: 0, sprint: false, swing: 0, eating: false, blocking: false });
g.sendEdit(3, 71, 3, 9);
await wait();
ok(world.getBlock(3, 71, 3) === 9, 'a vendég blokk-módosítása a hostnál megjelenik');
world.setBlock(4, 71, 4, 8); // host oldali módosítás
server.tick(1);
await wait();
ok(got.edits.includes(8) && !got.edits.includes(9), 'host-módosítás megérkezik, a sajátja nem pattan vissza');
ok(got.snaps === 1 && got.players === 1, 'pillanatkép: a host látszik');
server.mobPlayers()[1].hurt(2, 0, 0);
await wait();
ok(got.hurt === 1, 'hurt üzenet megérkezik');
console.log(fails ? `${fails} hiba` : 'minden teszt rendben');
process.exit(fails ? 1 : 0);
