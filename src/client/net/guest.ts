import type { Link } from './rtc';
import type { BlockEdit, ClientMsg, DropState, MobState, PlayerState, ServerMsg } from '../../shared/protocol';
import { PROTOCOL_VERSION } from '../../shared/protocol';

/** A vendég oldali protokoll-kezelő: üzeneteket küld a hostnak, és a beérkezőket eseményekre bontja. */
export interface GuestHandlers {
  welcome(w: Extract<ServerMsg, { t: 'welcome' }>): void;
  reject(reason: string): void;
  edits(edits: BlockEdit[]): void;
  snapshot(players: PlayerState[], mobs: MobState[], time: number, day: number): void;
  hurt(dmg: number, fx: number, fz: number): void;
  morning(day: number): void;
  chat(from: number, text: string): void;
  dropAdd(drops: DropState[]): void;
  dropDel(id: number): void;
  give(item: number, n: number): void;
  closed(): void;
}

export class GuestClient {
  id = -1;
  constructor(private link: Link, name: string, private h: GuestHandlers) {
    link.onMessage((raw) => this.receive(raw as ServerMsg));
    link.onClose(() => h.closed());
    this.send({ t: 'hello', version: PROTOCOL_VERSION, name });
  }

  private send(msg: ClientMsg, reliable = true): void {
    if (this.link.open) this.link.send(msg, reliable);
  }

  private receive(m: ServerMsg): void {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'welcome': this.id = m.you; this.h.welcome(m); break;
      case 'reject': this.h.reject(m.reason); break;
      case 'edits': this.h.edits(m.edits); break;
      case 'snapshot': this.h.snapshot(m.players, m.mobs, m.time, m.day); break;
      case 'hurt': this.h.hurt(m.dmg, m.fx, m.fz); break;
      case 'morning': this.h.morning(m.day); break;
      case 'chat': this.h.chat(m.from, m.text); break;
      case 'dropAdd': this.h.dropAdd(m.drops); break;
      case 'dropDel': this.h.dropDel(m.id); break;
      case 'give': this.h.give(m.item, m.n); break;
      default: break; // join / leave: a pillanatképből látszik
    }
  }

  sendState(p: Omit<PlayerState, 'id' | 'name'>): void { this.send({ t: 'state', p }, false); }
  sendEdit(x: number, y: number, z: number, id: number): void { this.send({ t: 'edit', edits: [{ x, y, z, id }] }); }
  sendAttack(mob: number, damage: number): void { this.send({ t: 'attack', mob, damage }); }
  sendSleep(on: boolean): void { this.send({ t: 'sleep', on }); }
  sendDropReq(item: number, n: number, x: number, y: number, z: number): void { this.send({ t: 'dropReq', item, n, x, y, z }); }
  sendPickup(id: number): void { this.send({ t: 'pickup', id }); }
  sendChat(text: string): void { this.send({ t: 'chat', text }); }
  close(): void { this.link.close(); }
}
