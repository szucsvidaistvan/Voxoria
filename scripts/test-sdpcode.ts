/** A rövid kapcsolat-kód kódolásának köre Node-ban: `npx tsx scripts/test-sdpcode.ts` */
import { compactSdp, expandSdp, fromCode, toCode } from '../src/client/net/sdpcode';
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.error('HIBA:', m); } else console.log('ok  ', m); };
const fp = Array.from({ length: 32 }, (_, i) => ((i * 37 + 11) & 255).toString(16).padStart(2, '0').toUpperCase()).join(':');
const sdp = [
  'v=0', 'o=- 4611731400430051336 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
  'a=candidate:1 1 udp 2122260223 192.168.1.23 54321 typ host generation 0',
  'a=candidate:2 1 udp 2122194687 5c1f2a3b-1111-4222-8333-444455556666.local 50000 typ host',
  'a=candidate:3 1 udp 1686052607 84.12.200.7 61000 typ srflx raddr 192.168.1.23 rport 54321',
  'a=candidate:4 1 udp 2122262783 2001:db8:abcd:12::1f 40000 typ host',
  'a=candidate:5 1 udp 2122262000 fe80::1 40001 typ host',
  'a=candidate:6 1 tcp 1518280447 192.168.1.23 9 typ host tcptype active',
  'a=ice-ufrag:AbCd', 'a=ice-pwd:0123456789abcdefghijkl', `a=fingerprint:sha-256 ${fp}`, 'a=setup:actpass', 'a=mid:0',
].join('\r\n') + '\r\n';
const b = compactSdp(sdp);
const code = toCode(b, 'VXI2-');
const back = expandSdp(fromCode(code, 'VXI2-', 'x'), 'offer');
ok(code.length < 200, `rövid kód (${code.length} karakter)`);
ok(back.includes('a=ice-ufrag:AbCd') && back.includes('a=ice-pwd:0123456789abcdefghijkl') && back.includes(`a=fingerprint:sha-256 ${fp}`), 'ICE adatok és ujjlenyomat megvan');
ok(back.includes('192.168.1.23 54321 typ host') && back.includes('84.12.200.7 61000 typ srflx'), 'IPv4 host és srflx jelölt');
ok(back.includes('5c1f2a3b-1111-4222-8333-444455556666.local 50000'), 'mDNS jelölt');
ok(back.includes('2001:db8:abcd:12:0:0:0:1f 40000') || back.includes('2001:db8:abcd:12::1f'), 'IPv6 jelölt');
ok(!back.includes('fe80') && !back.includes('tcp'), 'link-local és TCP jelölt kimarad');
ok(expandSdp(b, 'answer').includes('a=setup:active') && back.includes('a=setup:actpass'), 'szerepek (offer/answer)');
let err = '';
try { fromCode('VXA2-xyz', 'VXI2-', 'Ez nem meghívó kód'); } catch (e) { err = (e as Error).message; }
ok(err === 'Ez nem meghívó kód', 'rossz előtag hibát ad');
try { compactSdp('v=0'); err = ''; } catch (e) { err = (e as Error).message; }
ok(err !== '', 'hiányos SDP hibát ad');
console.log(fails ? `${fails} hiba` : 'minden teszt rendben');
process.exit(fails ? 1 : 0);
