/**
 * A játék "szervere": egy világ, a hozzá tartozó szimuláció és mobok, és a hozzájuk csatlakozó játékosok.
 * Átvitel-független (nem tud hálózatról, csak `Conn`-okról), nem függ a böngészőtől: a host böngészőjében
 * (WebRTC) és egy Node szerverben is ugyanez fut. Lásd docs/MULTIPLAYER.md, 5. lépés.
 *
 * A host saját játékosa is játékos (HOST_ID): a main ciklus `setLocal`-lal adja át az állapotát, és a
 * hookokon át kapja a világ eseményeit.
 */
import type { MobManager, MobPlayer, Mob } from './mobs';
import type { BlockEdit, ClientMsg, DropState, FellCell, MobState, PlayerId, PlayerState, ServerMsg } from './protocol';
import { PROTOCOL_VERSION } from './protocol';
import { CS } from './noise';
import type { Sim } from './sim';
import type { World } from './world';

/** A host saját játékosának azonosítója. */
export const HOST_ID: PlayerId = 0;
export const MAX_PLAYERS = 8;
/** pillanatkép / másodperc */
export const SNAPSHOT_HZ = 12;
/** a hely legfeljebb ennyi blokkra lehet a játékostól blokk-módosításkor / támadáskor (a szerver ellenőrzi) */
const REACH = 12;
/** egy üzenetbe legfeljebb ennyi blokk-módosítás kerül belépéskor */
const EDITS_PER_MSG = 1500;

/** A szerver oldali fogópont egy klienshez (a hálózati réteg valósítja meg). */
export interface Conn {
  send(msg: ServerMsg, reliable?: boolean): void;
}

export interface ServerHooks {
  /** a világ egy blokkja megváltozott távoli játékos miatt (a host újramesheli) */
  blockChanged(x: number, y: number, z: number, id: number, old: number): void;
  /** egy vendég fát döntött: a host is lejátssza az animációt (tárgyakat nem ad: azt a döntő vendég intézi) */
  fell(cells: FellCell[], ox: number, oz: number): void;
  /** egy távoli játékos megütött egy mobot (a host alkalmazza a sebzést és a lökést ugyanúgy, mint a sajátnál) */
  attack(mob: Mob, damage: number, from: PlayerState): void;
  /** a mob a host játékosát sebezte */
  hurtHost(dmg: number, fromX: number, fromZ: number): void;
  /** láda tartalma megváltozott távoli játékos miatt */
  chest(x: number, y: number, z: number, slots: ({ id: number; n: number } | null)[]): void;
  /** mindenki alszik: reggel lesz */
  morning(): void;
  /** csevegés (a hostnak megjelenítésre) */
  chat(from: string, text: string): void;
  /** belépett / kilépett valaki */
  presence(name: string, joined: boolean): void;
  /** egy vendég tárgyat ejt (a host létrehozza a földön; a szétküldés a `dropAdd`-on át megy) */
  dropRequest(item: number, n: number, x: number, y: number, z: number, opt: { d?: number; vx?: number; vy?: number; vz?: number; wait?: number }): void;
  /** egy vendég fel akarja venni a tárgyat: a host eltávolítja és visszaadja, mit kapott (vagy null) */
  pickup(from: PlayerState, id: number): { item: number; n: number; d?: number } | null;
  /** a földön heverő tárgyak (az újonnan belépőnek) */
  drops(): DropState[];
  /** az aktuális idő és nap (a pillanatképhez és a belépéshez) */
  clock(): { time: number; day: number };
}

interface Remote {
  conn: Conn;
  state: PlayerState;
  /** hello megjött */
  joined: boolean;
  sleeping: boolean;
}

const emptyState = (id: PlayerId, name: string): PlayerState => ({
  id, name, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, held: 0, armor: [0, 0, 0, 0], speed: 0, sprint: false, swing: 0, eating: false, blocking: false,
});

export class GameServer {
  private remotes = new Map<number, Remote>();
  private nextConn = 1;
  private snapT = 0;
  private local: PlayerState = emptyState(HOST_ID, 'Host');
  private localSleeping = false;
  /** a host játékosa támadható-e (túlélő mód) */
  localTarget = true;

  /** a tickig összegyűlt módosítások (a világ minden módosítása: host, folyadék, növény, vendég) */
  private pending: { e: BlockEdit; origin: number }[] = [];
  /** épp melyik vendég módosítását alkalmazzuk (őt nem értesítjük vissza); -1: nem vendég */
  private origin = -1;

  constructor(private world: World, private sim: Sim, private mobs: MobManager, private hooks: ServerHooks) {
    world.onEdit = (x, y, z, id) => { this.pending.push({ e: { x, y, z, id }, origin: this.origin }); };
  }

  /** Leállítás: a világ többé nem gyűjti a módosításokat. */
  close(): void {
    this.world.onEdit = undefined;
    this.pending = [];
    this.remotes.clear();
  }


  // ---------- a host saját játékosa ----------

  setLocalName(name: string): void { this.local.name = name; }

  /** A host játékosának állapota (a main ciklus hívja). */
  setLocal(s: Partial<Omit<PlayerState, 'id'>>): void { Object.assign(this.local, s); }

  setLocalSleeping(on: boolean): void { this.localSleeping = on; this.checkMorning(); }

  /** új tárgy a földön: mindenkinek */
  dropAdd(d: DropState): void { this.broadcast({ t: 'dropAdd', drops: [d] }); }
  /** a tárgy eltűnt (felvették, elégett, lejárt) */
  dropDel(id: number): void { this.broadcast({ t: 'dropDel', id }); }

  hostChat(text: string): void { this.broadcast({ t: 'chat', from: HOST_ID, text: text.slice(0, 200) }); }

  // ---------- kapcsolatok ----------

  /** Új kapcsolat: visszaadja a kapcsolat azonosítóját (a `receive`/`leave` ezt várja). */
  connect(conn: Conn): number {
    const id = this.nextConn++;
    this.remotes.set(id, { conn, state: emptyState(id, ''), joined: false, sleeping: false });
    return id;
  }

  leave(connId: number): void {
    const r = this.remotes.get(connId);
    if (!r) return;
    this.remotes.delete(connId);
    if (r.joined) {
      this.broadcast({ t: 'leave', id: connId });
      this.hooks.presence(r.state.name, false);
      this.checkMorning();
    }
  }

  get playerCount(): number { return 1 + [...this.remotes.values()].filter((r) => r.joined).length; }

  receive(connId: number, msg: ClientMsg): void {
    const r = this.remotes.get(connId);
    if (!r) return;
    if (msg.t === 'hello') { this.hello(connId, r, msg.version, msg.name); return; }
    if (!r.joined) return; // belépés előtt csak a hello érvényes
    switch (msg.t) {
      case 'state': {
        const s = msg.p;
        // értelmetlen értékek (NaN, végtelen, óriási) elutasítása
        if (![s.x, s.y, s.z, s.yaw, s.pitch].every(Number.isFinite) || Math.abs(s.x) > 3e7 || Math.abs(s.z) > 3e7) return;
        r.state = { ...r.state, ...s, id: connId, name: r.state.name };
        break;
      }
      case 'edit': this.edit(connId, r, msg.edits); break;
      case 'attack': this.attack(r, msg.mob, msg.damage); break;
      case 'interact': this.interact(r, msg.mob, msg.item); break;
      case 'chat': {
        const text = String(msg.text).slice(0, 200).trim();
        if (!text) break;
        this.broadcast({ t: 'chat', from: connId, text });
        this.hooks.chat(r.state.name, text);
        break;
      }
      case 'dropReq': {
        if (this.farFrom(r, msg.x, msg.y, msg.z) || !Number.isInteger(msg.item) || !Number.isInteger(msg.n) || msg.n < 1 || msg.n > 64) break;
        const lim = (v: unknown, m: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-m, Math.min(m, v)) : undefined);
        this.hooks.dropRequest(msg.item, msg.n, msg.x, msg.y, msg.z, {
          d: Number.isInteger(msg.d) && (msg.d as number) >= 0 ? msg.d : undefined,
          vx: lim(msg.vx, 12), vy: lim(msg.vy, 12), vz: lim(msg.vz, 12), wait: lim(msg.wait, 3),
        });
        break;
      }
      case 'pickup': {
        const got = this.hooks.pickup(r.state, msg.id);
        if (got) r.conn.send({ t: 'give', item: got.item, n: got.n, d: got.d });
        break;
      }
      case 'fell': {
        const cells = (Array.isArray(msg.cells) ? msg.cells : []).slice(0, 400).filter((c) => [c.x, c.y, c.z, c.id].every(Number.isInteger) && c.id >= 0 && c.id <= 0xffff);
        if (!cells.length || !Number.isFinite(msg.ox) || !Number.isFinite(msg.oz) || this.farFrom(r, msg.ox, r.state.y, msg.oz)) break;
        this.pendingFell.push({ cells, ox: msg.ox, oz: msg.oz, except: connId });
        this.hooks.fell(cells, msg.ox, msg.oz);
        break;
      }
      case 'sleep': r.sleeping = !!msg.on; this.checkMorning(); break;
      case 'chest': {
        if (this.farFrom(r, msg.x, msg.y, msg.z)) break;
        this.hooks.chest(msg.x, msg.y, msg.z, msg.slots);
        this.broadcast({ t: 'chest', x: msg.x, y: msg.y, z: msg.z, slots: msg.slots }, true, connId);
        break;
      }
    }
  }

  private hello(connId: number, r: Remote, version: number, name: string): void {
    if (r.joined) return;
    if (version !== PROTOCOL_VERSION) { r.conn.send({ t: 'reject', reason: 'Különböző játékverzió (frissítsd az oldalt)' }); return; }
    if (this.playerCount >= MAX_PLAYERS) { r.conn.send({ t: 'reject', reason: 'A szerver tele van' }); return; }
    const clean = String(name).replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || `Játékos${connId}`;
    r.state = { ...r.state, name: clean };
    r.joined = true;
    const clock = this.hooks.clock();
    r.conn.send({ t: 'welcome', version: PROTOCOL_VERSION, you: connId, seed: this.world.seed, time: clock.time, day: clock.day, players: this.allPlayers().filter((p) => p.id !== connId) });
    // a világ eddigi módosításai (a seedből a többi újragenerálódik)
    const flat = this.world.exportEdits();
    for (let i = 0; i < flat.length; i += 4 * EDITS_PER_MSG) {
      const edits: BlockEdit[] = [];
      for (let k = i; k < Math.min(flat.length, i + 4 * EDITS_PER_MSG); k += 4) edits.push({ x: flat[k], y: flat[k + 1], z: flat[k + 2], id: flat[k + 3] });
      r.conn.send({ t: 'edits', edits });
    }
    const ds = this.hooks.drops();
    for (let i = 0; i < ds.length; i += 100) r.conn.send({ t: 'dropAdd', drops: ds.slice(i, i + 100) });
    this.broadcast({ t: 'join', player: r.state }, true, connId);
    this.hooks.presence(clean, true);
  }

  private farFrom(r: Remote, x: number, y: number, z: number): boolean {
    return Math.hypot(x + 0.5 - r.state.x, y + 0.5 - (r.state.y + 1), z + 0.5 - r.state.z) > REACH;
  }

  private edit(connId: number, r: Remote, edits: BlockEdit[]): void {
    for (const e of edits.slice(0, 64)) {
      if (![e.x, e.y, e.z, e.id].every(Number.isInteger) || e.id < 0 || e.id > 0xffff) continue;
      if (this.farFrom(r, e.x, e.y, e.z)) {
        // túl messze: nem fogadjuk el, a kliensnek visszaküldjük a valódi blokkot
        r.conn.send({ t: 'edits', edits: [{ x: e.x, y: e.y, z: e.z, id: this.world.getBlock(e.x, e.y, e.z) }] });
        continue;
      }
      // a vendég környéke a hostnál még nem biztos, hogy be van töltve
      this.world.ensureChunk(Math.floor(e.x / CS), Math.floor(e.z / CS));
      this.origin = connId;
      const old = this.world.getBlock(e.x, e.y, e.z);
      const done = this.world.setBlock(e.x, e.y, e.z, e.id);
      this.origin = -1;
      if (!done) continue;
      this.sim.notify(e.x, e.y, e.z);
      this.hooks.blockChanged(e.x, e.y, e.z, e.id, old);
    }
  }

  /** A tickig összegyűlt módosítások szétküldése (egy üzenetben, vendégenként a saját módosításuk nélkül). */
  private flushEdits(): void {
    if (this.pending.length) {
      const list = this.pending;
      this.pending = [];
      for (const [id, r] of this.remotes) {
        if (!r.joined) continue;
        const mine = list.filter((p) => p.origin !== id).map((p) => p.e);
        for (let i = 0; i < mine.length; i += EDITS_PER_MSG) r.conn.send({ t: 'edits', edits: mine.slice(i, i + EDITS_PER_MSG) }, true);
      }
    }
    // az összeomlás-animáció a blokk-módosítások UTÁN megy, hogy ne látszódjon egyszerre a fa és a mozgó darabjai
    for (const f of this.pendingFell) this.broadcast({ t: 'fell', cells: f.cells, ox: f.ox, oz: f.oz }, true, f.except);
    this.pendingFell = [];
  }

  private pendingFell: { cells: FellCell[]; ox: number; oz: number; except: number }[] = [];

  /** A host kidöntött egy fát: mindenki látja az összeomlást. */
  fell(cells: FellCell[], ox: number, oz: number): void { this.pendingFell.push({ cells, ox, oz, except: -1 }); }

  /** Vendég rákattintott egy mobra (szelídítés, etetés, ültetés): a host dönt */
  private interact(r: Remote, mobId: number, item: string | null): void {
    const m = this.mobs.mobs.find((q) => q.id === mobId && !q.dead);
    if (!m || (item !== null && typeof item !== 'string')) return;
    if (Math.hypot(m.x - r.state.x, m.y - r.state.y, m.z - r.state.z) > 7) return;
    this.mobs.interact(m, item);
  }

  private attack(r: Remote, mobId: number, damage: number): void {
    const m = this.mobs.mobs.find((q) => q.id === mobId && !q.dead);
    if (!m || !Number.isFinite(damage)) return;
    if (Math.hypot(m.x - r.state.x, m.y - r.state.y, m.z - r.state.z) > 7) return;
    this.hooks.attack(m, Math.max(0, Math.min(damage, 12)), r.state);
  }

  // ---------- alvás ----------

  private checkMorning(): void {
    const joined = [...this.remotes.values()].filter((r) => r.joined);
    if (!this.localSleeping && !joined.length) return;
    if (!this.localSleeping || !joined.every((r) => r.sleeping)) return;
    for (const r of joined) r.sleeping = false;
    this.localSleeping = false;
    this.hooks.morning();
    this.broadcast({ t: 'morning', day: this.hooks.clock().day });
  }

  // ---------- mobok és pillanatképek ----------

  /** A mobok szemszögéből a játékosok: a host és a belépett vendégek. */
  mobPlayers(): MobPlayer[] {
    const out: MobPlayer[] = [{
      x: this.local.x, y: this.local.y, z: this.local.z, target: this.localTarget,
      hurt: (dmg, fx, fz) => this.hooks.hurtHost(dmg, fx, fz),
    }];
    for (const r of this.remotes.values()) {
      if (!r.joined) continue;
      out.push({
        x: r.state.x, y: r.state.y, z: r.state.z, target: true,
        hurt: (dmg, fx, fz) => r.conn.send({ t: 'hurt', dmg, fx, fz }),
      });
    }
    return out;
  }

  /** a belépett vendégek állapota (a host ezeket rajzolja) */
  remoteStates(): PlayerState[] { return [...this.remotes.values()].filter((r) => r.joined).map((r) => r.state); }

  private allPlayers(): PlayerState[] {
    return [this.local, ...[...this.remotes.values()].filter((r) => r.joined).map((r) => r.state)];
  }

  private mobState(m: Mob): MobState {
    return {
      id: m.id, kind: m.kind, x: m.x, y: m.y, z: m.z, yaw: m.yaw, walk: m.walk, speed: Math.hypot(m.vx, m.vz), hp: m.hp,
      flags: (m.hurtT > 0 ? 1 : 0) | (m.climb ? 2 : 0) | (m.dead ? 4 : 0) | (m.angry ? 8 : 0) | (m.inWater ? 16 : 0) | (m.tamed ? 32 : 0) | (m.sitting ? 64 : 0) | (m.variant << 8),
    };
  }

  /** A szerver órája (a main ciklus hívja a mobok léptetése után): `SNAPSHOT_HZ`-szel pillanatképet küld. */
  tick(dt: number): void {
    this.flushEdits();
    this.snapT += dt;
    if (this.snapT < 1 / SNAPSHOT_HZ) return;
    this.snapT = 0;
    if (![...this.remotes.values()].some((r) => r.joined)) return;
    const clock = this.hooks.clock();
    const players = this.allPlayers();
    // csak a játékosok körüli 112 blokkon belüli mobok mennek át (a messzi, mozdulatlan állatokat nem érdemes küldeni)
    const mobs = this.mobs.mobs.filter((m) => m.far <= 112).map((m) => this.mobState(m));
    for (const r of this.remotes.values()) {
      if (!r.joined) continue;
      // mindenki mást lát, magát nem (a vendég a saját helyét maga számolja)
      r.conn.send({ t: 'snapshot', players: players.filter((p) => p.id !== r.state.id), mobs, time: clock.time, day: clock.day }, false);
    }
  }

  private broadcast(msg: ServerMsg, reliable = true, except = -1): void {
    for (const [id, r] of this.remotes) if (r.joined && id !== except) r.conn.send(msg, reliable);
  }
}
