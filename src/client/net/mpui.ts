import { createInvite, joinWithCode, type Link } from './rtc';

/**
 * A "Play with a friend" ablak: két nagy választás (meghívás / csatlakozás), majd lépésről lépésre a kódok cseréje
 * (nincs szerver: a két játékos üzenetben küldi át egymásnak a kódot). A host nem kell, hogy előbb világban legyen:
 * a meghívás a mentett (vagy új) világát indítja el a háttérben.
 */
export interface MpUiHooks {
  /** a host világa készen áll-e (ha kell, elindítja); hamis, ha most nem hostolható (pl. vendégként vagyunk) */
  ensureWorld(): boolean;
  /** egy vendég csatlakozott a hosthoz */
  onGuestLink(link: Link): void;
  /** a vendég kapcsolata a hosthoz megnyílt */
  onJoinLink(link: Link, name: string): void;
  /** a "Start playing" gomb: a menü Continue-ja */
  play(): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export function initMpUi(hooks: MpUiHooks): { setStatus(text: string): void; name(): string; close(): void } {
  const panel = $('mp'), status = $('mp-status');
  const nameEl = $<HTMLInputElement>('mp-name');
  const chooseEl = $('mp-choose'), hostView = $('mp-host-view'), joinView = $('mp-join-view');
  const inviteEl = $<HTMLTextAreaElement>('mp-invite'), answerEl = $<HTMLTextAreaElement>('mp-answer');
  const joinCodeEl = $<HTMLTextAreaElement>('mp-join-code'), joinAnswerEl = $<HTMLTextAreaElement>('mp-join-answer');
  const playBtn = $('mp-play'), backBtn = $('mp-back');
  const setStatus = (t: string, kind: '' | 'ok' | 'err' = '') => { status.textContent = t; status.className = `mp-status ${kind}`; };

  try { nameEl.value = localStorage.getItem('voxoria.name') ?? ''; } catch { /* nincs tároló */ }
  if (!nameEl.value) nameEl.value = `Player${Math.floor(Math.random() * 900 + 100)}`;
  const name = () => {
    const n = nameEl.value.trim().slice(0, 16) || 'Player';
    try { localStorage.setItem('voxoria.name', n); } catch { /* nincs tároló */ }
    return n;
  };

  type View = 'choose' | 'host' | 'join';
  let hosting = false; // egy meghívó-kör folyamatban
  let joining = false;
  let epoch = 0; // a félbehagyott körök eredményét eldobjuk
  const show = (v: View) => {
    chooseEl.hidden = v !== 'choose';
    hostView.hidden = v !== 'host';
    joinView.hidden = v !== 'join';
    backBtn.hidden = v === 'choose';
    if (v === 'choose') { playBtn.hidden = true; setStatus(''); }
  };
  const open = () => { panel.hidden = false; show('choose'); };
  const close = () => { epoch++; hosting = joining = false; panel.hidden = true; };
  $('btn-mp').addEventListener('click', open);
  $('mp-close').addEventListener('click', close);
  backBtn.addEventListener('click', () => { epoch++; hosting = joining = false; show('choose'); });
  playBtn.addEventListener('click', () => { close(); hooks.play(); });

  const copy = async (el: HTMLTextAreaElement) => {
    if (!el.value) return;
    el.focus();
    el.select();
    try { await navigator.clipboard.writeText(el.value); setStatus('Copied! Now paste it into your chat app.', 'ok'); } catch { setStatus('Tap the code, select all and copy it.'); }
  };
  const paste = async (el: HTMLTextAreaElement) => {
    try {
      el.value = (await navigator.clipboard.readText()).trim();
      el.dispatchEvent(new Event('input'));
    } catch { el.focus(); setStatus('Paste is blocked here: press and hold in the box, then choose Paste.'); }
  };
  $('mp-copy-invite').addEventListener('click', () => copy(inviteEl));
  $('mp-copy-answer').addEventListener('click', () => copy(joinAnswerEl));
  $('mp-paste-answer').addEventListener('click', () => paste(answerEl));
  $('mp-paste-invite').addEventListener('click', () => paste(joinCodeEl));

  // ----- host -----
  let pending: { accept: (answer: string) => Promise<Link> } | null = null;
  const newInvite = async () => {
    const my = ++epoch;
    inviteEl.value = answerEl.value = '';
    pending = null;
    setStatus('Creating your invite…');
    try {
      const inv = await createInvite();
      if (my !== epoch) return;
      pending = inv;
      inviteEl.value = inv.code;
      setStatus('Copy the code and send it to your friend.');
    } catch (e) { if (my === epoch) setStatus(`Could not create the invite: ${(e as Error).message}`, 'err'); }
  };
  $('mp-pick-host').addEventListener('click', () => {
    if (!hooks.ensureWorld()) { setStatus('You are in someone else\'s game right now. Go back to the menu first.', 'err'); return; }
    name();
    hosting = true;
    show('host');
    void newInvite();
  });
  // a válaszkód beillesztésekor azonnal csatlakozunk (nincs külön gomb)
  answerEl.addEventListener('input', async () => {
    const code = answerEl.value.trim();
    if (!hosting || !pending || !code.startsWith('VXA2-')) return;
    const p = pending, my = epoch;
    pending = null;
    setStatus('Connecting…');
    try {
      const link = await p.accept(code);
      if (my !== epoch) { link.close(); return; }
      hooks.onGuestLink(link);
      playBtn.hidden = false;
      setStatus('Your friend is in! You can start playing, or send a new code to invite someone else.', 'ok');
      void newInvite().then(() => setStatus('Your friend is in! Start playing, or send the new code above to invite someone else.', 'ok'));
    } catch (e) {
      if (my === epoch) { setStatus(`Could not connect: ${(e as Error).message}. Try creating a new invite.`, 'err'); void newInvite(); }
    }
  });

  // ----- vendég -----
  $('mp-pick-join').addEventListener('click', () => {
    name();
    joining = false;
    joinCodeEl.value = joinAnswerEl.value = '';
    show('join');
    setStatus('Ask your friend for an invite code, then paste it above.');
  });
  joinCodeEl.addEventListener('input', async () => {
    const code = joinCodeEl.value.trim();
    if (joining || !code.startsWith('VXI2-')) return;
    joining = true;
    const my = ++epoch;
    setStatus('Preparing your reply code…');
    try {
      const j = await joinWithCode(code);
      if (my !== epoch) return;
      joinAnswerEl.value = j.answer;
      setStatus('Copy the reply code and send it to your friend. The game starts when they connect.');
      const link = await j.link;
      if (my !== epoch) { link.close(); return; }
      close();
      hooks.onJoinLink(link, name());
    } catch (e) {
      if (my === epoch) { joining = false; setStatus(`Could not join: ${(e as Error).message}`, 'err'); }
    }
  });

  return { setStatus: (t) => setStatus(t), name, close };
}
