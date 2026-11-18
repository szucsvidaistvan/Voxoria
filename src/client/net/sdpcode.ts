/**
 * Rövid kapcsolat-kód: az adatcsatornás WebRTC-kapcsolathoz a teljes SDP-ből csak a lényeg kell (ICE felhasználónév és
 * jelszó, tanúsítvány-ujjlenyomat, UDP jelöltek címe/portja), a többit a másik oldal újraépíti. Így a kód ~100-200
 * karakter az eddigi ~600-1000 helyett. Nem függ böngészős API-tól (Node-ban tesztelhető).
 */

const VERSION = 2;

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join(':');

function ip6ToBytes(a: string): Uint8Array | null {
  if (a.startsWith('fe80')) return null; // link-local: a másik gépről nem érhető el
  const [head, tail] = a.split('::');
  const h = head ? head.split(':') : [];
  const t = tail === undefined ? [] : tail ? tail.split(':') : [];
  const fill = tail === undefined ? 0 : 8 - h.length - t.length;
  const groups = [...h, ...Array(Math.max(0, fill)).fill('0'), ...t];
  if (groups.length !== 8) return null;
  const out = new Uint8Array(16);
  groups.forEach((g, i) => { const v = parseInt(g || '0', 16); out[i * 2] = v >> 8; out[i * 2 + 1] = v & 255; });
  return out;
}

const ip6ToText = (b: Uint8Array) => Array.from({ length: 8 }, (_, i) => ((b[i * 2] << 8) | b[i * 2 + 1]).toString(16)).join(':');

const UUID = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/i;

interface Cand { kind: 0 | 1 | 2; srflx: boolean; addr: Uint8Array; port: number }

/** Az SDP-ből a lényeget bájtokba csomagolja. Hibás/ismeretlen SDP-re kivételt dob. */
export function compactSdp(sdp: string): Uint8Array {
  const get = (re: RegExp) => sdp.match(re)?.[1]?.trim();
  const ufrag = get(/^a=ice-ufrag:(.+)$/m), pwd = get(/^a=ice-pwd:(.+)$/m), fp = get(/^a=fingerprint:sha-256 (.+)$/m);
  if (!ufrag || !pwd || !fp) throw new Error('Hiányos kapcsolat-adat');
  const fpBytes = Uint8Array.from(fp.split(':').map((h) => parseInt(h, 16)));
  if (fpBytes.length !== 32) throw new Error('Ismeretlen ujjlenyomat');
  const cands: Cand[] = [];
  for (const m of sdp.matchAll(/^a=candidate:\S+ 1 udp \d+ (\S+) (\d+) typ (host|srflx)/gm)) {
    const [, addr, port, typ] = m;
    let c: Cand | null = null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(addr)) c = { kind: 0, srflx: typ === 'srflx', addr: Uint8Array.from(addr.split('.').map(Number)), port: Number(port) };
    else if (addr.includes(':')) { const b = ip6ToBytes(addr); if (b) c = { kind: 1, srflx: typ === 'srflx', addr: b, port: Number(port) }; }
    else { const u = addr.match(UUID); if (u) c = { kind: 2, srflx: false, addr: Uint8Array.from((u.slice(1).join('')).match(/../g)!.map((h) => parseInt(h, 16))), port: Number(port) }; }
    if (c) cands.push(c);
  }
  const enc = new TextEncoder();
  const u = enc.encode(ufrag), p = enc.encode(pwd);
  const parts: number[] = [VERSION, u.length, ...u, p.length, ...p, ...fpBytes, Math.min(cands.length, 12)];
  for (const c of cands.slice(0, 12)) parts.push((c.kind) | (c.srflx ? 4 : 0), ...c.addr, c.port >> 8, c.port & 255);
  return Uint8Array.from(parts);
}

/** A csomagolt bájtokból újraépíti az SDP-t (`offer`: a hívó fél, `answer`: a válaszoló). */
export function expandSdp(b: Uint8Array, role: 'offer' | 'answer'): string {
  if (b[0] !== VERSION) throw new Error('Ismeretlen kód-verzió');
  const dec = new TextDecoder();
  let i = 1;
  const ul = b[i++]; const ufrag = dec.decode(b.slice(i, i + ul)); i += ul;
  const pl = b[i++]; const pwd = dec.decode(b.slice(i, i + pl)); i += pl;
  const fp = hex(b.slice(i, i + 32)); i += 32;
  const n = b[i++];
  const lines: string[] = [];
  for (let k = 0; k < n; k++) {
    const f = b[i++];
    const kind = f & 3, srflx = !!(f & 4);
    const len = kind === 0 ? 4 : 16;
    const a = b.slice(i, i + len); i += len;
    const port = (b[i] << 8) | b[i + 1]; i += 2;
    let addr: string;
    if (kind === 0) addr = [...a].join('.');
    else if (kind === 1) addr = ip6ToText(a);
    else { const h = [...a].map((x) => x.toString(16).padStart(2, '0')).join(''); addr = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}.local`; }
    const prio = (srflx ? 1686052607 : 2122260223) - k;
    lines.push(`a=candidate:${k + 1} 1 udp ${prio} ${addr} ${port} typ ${srflx ? 'srflx raddr 0.0.0.0 rport 0' : 'host'}`);
  }
  return [
    'v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${ufrag}`, `a=ice-pwd:${pwd}`, 'a=ice-options:trickle', `a=fingerprint:sha-256 ${fp}`,
    `a=setup:${role === 'offer' ? 'actpass' : 'active'}`, 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144',
    ...lines, 'a=end-of-candidates', '',
  ].join('\r\n');
}

export function toCode(bytes: Uint8Array, prefix: string): string {
  let bin = '';
  for (const x of bytes) bin += String.fromCharCode(x);
  return prefix + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromCode(code: string, prefix: string, errorText: string): Uint8Array {
  const c = code.trim().replace(/\s+/g, '');
  if (!c.startsWith(prefix)) throw new Error(errorText);
  try {
    const b64 = c.slice(prefix.length).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (ch) => ch.charCodeAt(0));
  } catch { throw new Error(errorText); }
}
