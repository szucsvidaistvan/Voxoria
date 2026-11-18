/** GameServer teszt Node-ban (hamis kapcsolatokkal): `npx tsx scripts/test-gameserver.ts` */
import { GameServer, HOST_ID, type Conn } from '../src/shared/gameserver';
import { MobManager, Mob } from '../src/shared/mobs';
import { PROTOCOL_VERSION, type ServerMsg, type ClientMsg } from '../src/shared/protocol';
import { Sim } from '../src/shared/sim';
import { World } from '../src/shared/world';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.error('HIBA:', m); } else console.log('ok  ', m); };

const world = new World(1234);
const sim = new Sim(world, { changed() {}, setBlock() {}, drop() {} });
const mobs = new MobManager(world);
const log = { changed: 0, attacks: [] as number[], hostHurt: 0, morning: 0, chat: [] as string[], presence: [] as string[], drops: [] as string[] };
const server = new GameServer(world, sim, mobs, {
  blockChanged: () => { log.changed++; },
  attack: (_m, d) => { log.attacks.push(d); },
  hurtHost: () => { log.hostHurt++; },
  chest: () => {},
  morning: () => { log.morning++; },
  chat: (f, t) => { log.chat.push(`${f}: ${t}`); },
  presence: (n, j) => { log.presence.push(`${j ? '+' : '-'}${n}`); },
  clock: () => ({ time: 0.3, day: 2 }),
  dropRequest: (item, n, _x, _y, _z, o) => { log.drops.push(`${item}x${n}`); log.dropOpt = o; },
  pickup: (_from, id) => (id === 7 ? { item: 3, n: 2 } : null),
  drops: () => [{ id: 7, item: 3, n: 2, x: 0, y: 70, z: 0, vx: 0, vy: 0, vz: 0 }],
});

const mk = () => {
  const got: ServerMsg[] = [];
  const conn: Conn = { send: (m) => { got.push(m); } };
  const id = server.connect(conn);
  return { id, got, send: (m: ClientMsg) => server.receive(id, m) };
};
const of = <T extends ServerMsg['t']>(g: ServerMsg[], t: T) => g.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];

server.setLocal({ x: 0, y: 70, z: 0 });
world.ensureChunk(0, 0); world.setBlock(3, 70, 3, 5); // meglévő módosítás a belépéshez
const a = mk();
a.send({ t: 'state', p: { x: 1, y: 70, z: 1 } as never }); // belépés előtt figyelmen kívül marad
ok(of(a.got, 'welcome').length === 0, 'hello előtt nincs welcome');
a.send({ t: 'hello', version: PROTOCOL_VERSION + 1, name: 'x' });
ok(of(a.got, 'reject').length === 1, 'rossz verzió elutasítva');
a.send({ t: 'hello', version: PROTOCOL_VERSION, name: 'Aladár<script>' });
const w = of(a.got, 'welcome')[0];
ok(!!w && w.seed === 1234 && w.you === a.id && w.day === 2, 'welcome: seed, id, nap');
ok(w.players.some((p) => p.id === HOST_ID), 'welcome tartalmazza a hostot');
ok(of(a.got, 'edits').flatMap((e) => e.edits).some((e) => e.x === 3 && e.y === 70 && e.z === 3 && e.id === 5), 'meglévő módosítások elküldve');
ok(log.presence[0] === '+Aladárscript', 'név megtisztítva');

const b = mk();
b.send({ t: 'hello', version: PROTOCOL_VERSION, name: 'Béla' });
ok(of(a.got, 'join').length === 1, 'A értesül B belépéséről');
a.send({ t: 'state', p: { id: 99, name: 'hamis', x: 2, y: 70, z: 2, yaw: 1, pitch: 0, held: 3, armor: [0, 0, 0, 0], speed: 0, sprint: false, swing: 0, eating: false, blocking: false } });
b.send({ t: 'state', p: { x: 5, y: 70, z: 5, yaw: 0, pitch: 0 } as never });
server.tick(1);
const snap = of(b.got, 'snapshot').pop()!;
ok(!!snap && snap.players.length === 2 && !snap.players.some((p) => p.id === b.id), 'snapshot: másokat lát, magát nem');
const pa = snap.players.find((p) => p.id === a.id)!;
ok(pa.name === 'Aladárscript' && pa.x === 2, 'az állapot átvéve, id/név nem hamisítható');

// blokk
a.send({ t: 'edit', edits: [{ x: 3, y: 71, z: 3, id: 7 }] });
server.tick(0.01);
ok(of(a.got, 'edits').every((e) => !e.edits.some((x) => x.id === 7)), 'a szerkesztő nem kap vissza saját módosítást');
ok(world.getBlock(3, 71, 3) === 7 && of(b.got, 'edits').some((e) => e.edits.some((x) => x.id === 7)) && log.changed === 1, 'közeli szerkesztés alkalmazva és szétküldve');
const aEdits = of(a.got, 'edits').length;
a.send({ t: 'edit', edits: [{ x: 500, y: 71, z: 500, id: 7 }] });
ok(world.getBlock(500, 71, 500) !== 7 && of(a.got, 'edits').length === aEdits + 1, 'távoli szerkesztés elutasítva, kliens javítva');
a.send({ t: 'edit', edits: [{ x: 2, y: 71, z: 2, id: NaN }] });
ok(log.changed === 1, 'érvénytelen id eldobva');

// a host / folyadék módosításai is szétmennek (egy üzenetben)
world.setBlock(2, 72, 2, 9); world.setBlock(2, 73, 2, 9);
server.tick(0.01);
ok(of(a.got, 'edits').pop()!.edits.length === 2 && of(b.got, 'edits').pop()!.edits.length === 2, 'host-módosítások kötegelve mindenkinek');

// támadás
const m = new Mob('zombie' as never, 2, 70, 2);
mobs.mobs.push(m);
a.send({ t: 'attack', mob: m.id, damage: 999 });
ok(log.attacks.length === 1 && log.attacks[0] === 12, 'támadás: sebzés korlátozva 12-re');
m.x = 50;
a.send({ t: 'attack', mob: m.id, damage: 3 });
ok(log.attacks.length === 1, 'messzi mob nem támadható');

// mob sebzi a játékost
const ps = server.mobPlayers();
ok(ps.length === 3, 'mobPlayers: host + 2 vendég');
ps[0].hurt(2, 0, 0); ps[1].hurt(3, 1, 1);
ok(log.hostHurt === 1 && of(a.got, 'hurt').length === 1 && of(b.got, 'hurt').length === 0, 'hurt a megfelelő félhez');

// tárgyak
ok(of(b.got, 'dropAdd').length === 1 && of(b.got, 'dropAdd')[0].drops[0].id === 7, 'belépéskor megkapja a földön lévő tárgyakat');
a.send({ t: 'dropReq', item: 4, n: 3, x: 3, y: 71, z: 3 });
a.send({ t: 'dropReq', item: 4, n: 999, x: 3, y: 71, z: 3 });
a.send({ t: 'dropReq', item: 4, n: 1, x: 900, y: 71, z: 900 });
ok(log.drops.length === 1 && log.drops[0] === '4x3', 'dropReq: csak az érvényes és közeli jut át');
a.send({ t: 'dropReq', item: 5, n: 1, x: 3, y: 71, z: 3, vx: 99, wait: 99, d: 7 });
ok(log.dropOpt.vx === 12 && log.dropOpt.wait === 3 && log.dropOpt.d === 7, 'dropReq: sebesség és késleltetés korlátozva, kopás átmegy');
a.send({ t: 'pickup', id: 7 });
a.send({ t: 'pickup', id: 8 });
ok(of(a.got, 'give').length === 1 && of(a.got, 'give')[0].n === 2, 'pickup: a felvett tárgy a vendégé');
server.dropAdd({ id: 9, item: 1, n: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
server.dropDel(9);
ok(of(b.got, 'dropAdd').length === 2 && of(b.got, 'dropDel').length === 1, 'drop új / eltűnt szétküldve');

// chat
b.send({ t: 'chat', text: 'szia' });
ok(of(a.got, 'chat').some((c) => c.text === 'szia' && c.from === b.id) && log.chat[0] === 'Béla: szia', 'chat szétküldve');

// alvás
server.setLocalSleeping(true);
a.send({ t: 'sleep', on: true });
ok(log.morning === 0, 'nem mindenki alszik még');
b.send({ t: 'sleep', on: true });
ok(log.morning === 1 && of(a.got, 'morning').length === 1, 'mindenki alszik → reggel');

// kilépés → ha a maradék alszik, reggel
server.setLocalSleeping(true);
a.send({ t: 'sleep', on: true });
server.leave(b.id);
ok(of(a.got, 'leave').length === 1 && log.morning === 2, 'kilépés: leave + reggel a maradéknak');

// tele
for (let i = 0; i < 9; i++) { const c = mk(); c.send({ t: 'hello', version: PROTOCOL_VERSION, name: 'n' + i }); if (i === 8) ok(of(c.got, 'reject').length === 1, 'telt ház elutasít'); }
console.log(fails ? `${fails} hiba` : 'minden teszt rendben');
process.exit(fails ? 1 : 0);
