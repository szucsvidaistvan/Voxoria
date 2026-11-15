/**
 * Szerver nélküli kapcsolat két böngésző között (WebRTC adatcsatorna), meghívó kóddal.
 * A jelzés kézzel megy: a host készít egy meghívó kódot, a vendég beilleszti és kap egy válasz kódot,
 * azt a host beilleszti, és a kapcsolat felépül. Nincs jelzőszerver és nincs külső csomag.
 * Lásd docs/MULTIPLAYER.md. Böngészős API-kat használ (RTCPeerConnection, CompressionStream).
 */

/** Két csatorna: megbízható (szerkezeti események: blokk, csevegés) és nem megbízható (állapot-pillanatképek). */
export interface Link {
  /** igaz, amíg a kapcsolat él */
  readonly open: boolean;
  send(msg: unknown, reliable?: boolean): void;
  onMessage(cb: (msg: unknown) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}

export interface RtcOptions {
  /** ICE szerverek (alapból egy nyilvános STUN: az interneten át kell hozzá). Üres lista: csak helyi hálózat / teszt. */
  iceServers?: RTCIceServer[];
  /** meddig várunk a jelölt-gyűjtésre (ms) */
  gatherTimeout?: number;
}

const PREFIX_INVITE = 'VXI1-';
const PREFIX_ANSWER = 'VXA1-';
const DEFAULT_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

// ---------- kód ----------

async function pack(text: string, prefix: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return prefix + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function unpack(code: string, prefix: string): Promise<string> {
  const c = code.trim().replace(/\s+/g, '');
  if (!c.startsWith(prefix)) throw new Error(prefix === PREFIX_INVITE ? 'Ez nem meghívó kód' : 'Ez nem válasz kód');
  const b64 = c.slice(prefix.length).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

// ---------- kapcsolat ----------

function waitGathered(pc: RTCPeerConnection, timeout: number): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const done = () => { pc.removeEventListener('icegatheringstatechange', onChange); clearTimeout(t); resolve(); };
    const onChange = () => { if (pc.iceGatheringState === 'complete') done(); };
    const t = setTimeout(done, timeout);
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

class RtcLink implements Link {
  private msgCbs: ((m: unknown) => void)[] = [];
  private closeCbs: (() => void)[] = [];
  private closed = false;
  private openCbs: (() => void)[] = [];
  rel: RTCDataChannel | null = null;
  unrel: RTCDataChannel | null = null;

  constructor(private pc: RTCPeerConnection) {
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') this.fireClose();
    });
  }

  get open(): boolean { return !this.closed && this.rel?.readyState === 'open'; }

  attach(ch: RTCDataChannel): void {
    if (ch.label === 'r') this.rel = ch; else this.unrel = ch;
    ch.addEventListener('message', (e) => {
      try { for (const cb of this.msgCbs) cb(JSON.parse(String(e.data))); } catch { /* hibás üzenet: eldobjuk */ }
    });
    ch.addEventListener('open', () => { for (const cb of this.openCbs) cb(); });
    ch.addEventListener('close', () => { if (ch === this.rel) this.fireClose(); });
  }

  send(msg: unknown, reliable = true): void {
    const ch = reliable ? this.rel : this.unrel ?? this.rel;
    if (ch && ch.readyState === 'open') ch.send(JSON.stringify(msg));
  }
  onMessage(cb: (m: unknown) => void): void { this.msgCbs.push(cb); }
  onClose(cb: () => void): void { this.closeCbs.push(cb); }
  close(): void { this.fireClose(); this.pc.close(); }

  private fireClose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const cb of this.closeCbs) cb();
  }

  /** megvárja, hogy mindkét csatorna nyitva legyen */
  ready(timeout = 15000): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('A kapcsolat nem jött létre (időtúllépés)')), timeout);
      const check = () => {
        if (this.rel?.readyState === 'open' && this.unrel?.readyState === 'open') { clearTimeout(t); resolve(); }
      };
      this.openCbs.push(check); // a csatornák (vendégnél) később érkezhetnek: minden megnyitáskor újra ellenőrzünk
      this.pc.addEventListener('connectionstatechange', () => {
        if (this.pc.connectionState === 'failed') { clearTimeout(t); reject(new Error('A kapcsolat meghiúsult')); }
      });
      check();
    });
  }

  /** a vendég oldalán a csatornák az ondatachannel-ből jönnek */
  waitChannels(): void {
    this.pc.addEventListener('datachannel', (e) => { this.attach(e.channel); });
  }
}

/** A host egy meghívást készít: a `code`-ot elküldi a vendégnek, a vendég válasz kódját az `accept`-nek adja. */
export async function createInvite(opts: RtcOptions = {}): Promise<{ code: string; accept: (answerCode: string) => Promise<Link> }> {
  const pc = new RTCPeerConnection({ iceServers: opts.iceServers ?? DEFAULT_ICE });
  const link = new RtcLink(pc);
  link.attach(pc.createDataChannel('r', { ordered: true }));
  link.attach(pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 }));
  await pc.setLocalDescription(await pc.createOffer());
  await waitGathered(pc, opts.gatherTimeout ?? 4000);
  const code = await pack(JSON.stringify({ sdp: pc.localDescription!.sdp }), PREFIX_INVITE);
  return {
    code,
    accept: async (answerCode: string) => {
      const { sdp } = JSON.parse(await unpack(answerCode, PREFIX_ANSWER)) as { sdp: string };
      await pc.setRemoteDescription({ type: 'answer', sdp });
      await link.ready();
      return link;
    },
  };
}

/** A vendég beilleszti a meghívó kódot; a `answer` kódot visszaadja a hostnak, a `link` a kapcsolat felépülésekor teljesül. */
export async function joinWithCode(inviteCode: string, opts: RtcOptions = {}): Promise<{ answer: string; link: Promise<Link> }> {
  const { sdp } = JSON.parse(await unpack(inviteCode, PREFIX_INVITE)) as { sdp: string };
  const pc = new RTCPeerConnection({ iceServers: opts.iceServers ?? DEFAULT_ICE });
  const link = new RtcLink(pc);
  link.waitChannels();
  await pc.setRemoteDescription({ type: 'offer', sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await waitGathered(pc, opts.gatherTimeout ?? 4000);
  const answer = await pack(JSON.stringify({ sdp: pc.localDescription!.sdp }), PREFIX_ANSWER);
  return { answer, link: link.ready().then(() => link) };
}
