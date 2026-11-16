import { createInvite, joinWithCode, type Link } from './rtc';

/**
 * A főmenü "Multiplayer" paneljének működése: meghívó- és válaszkód cseréje (nincs szerver, a két játékos
 * üzenetben küldi át egymásnak a kódot), majd a kapcsolat átadása a játéknak.
 */
export interface MpUiHooks {
  /** a host játéka el van-e indítva (hostolni csak futó világot lehet) */
  canHost(): boolean;
  /** egy vendég csatlakozott a hosthoz */
  onGuestLink(link: Link): void;
  /** a vendég kapcsolata a hosthoz megnyílt */
  onJoinLink(link: Link, name: string): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export function initMpUi(hooks: MpUiHooks): { setStatus(text: string): void; name(): string; close(): void } {
  const panel = $('mp'), btn = $('btn-mp'), status = $('mp-status');
  const nameEl = $<HTMLInputElement>('mp-name');
  const inviteEl = $<HTMLTextAreaElement>('mp-invite'), answerEl = $<HTMLTextAreaElement>('mp-answer');
  const joinCodeEl = $<HTMLTextAreaElement>('mp-join-code'), joinAnswerEl = $<HTMLTextAreaElement>('mp-join-answer');
  const setStatus = (t: string) => { status.textContent = t; };

  try { nameEl.value = localStorage.getItem('voxoria.name') ?? ''; } catch { /* nincs tároló */ }
  if (!nameEl.value) nameEl.value = `Player${Math.floor(Math.random() * 900 + 100)}`;
  const name = () => {
    const n = nameEl.value.trim().slice(0, 16) || 'Player';
    try { localStorage.setItem('voxoria.name', n); } catch { /* nincs tároló */ }
    return n;
  };

  btn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    btn.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) setStatus(hooks.canHost() ? '' : 'To host, first continue or start a world. Joining works any time.');
  });

  const copy = async (el: HTMLTextAreaElement) => {
    el.focus();
    el.select();
    try { await navigator.clipboard.writeText(el.value); setStatus('Copied.'); } catch { setStatus('Select the text and copy it by hand.'); }
  };
  $('mp-copy-invite').addEventListener('click', () => copy(inviteEl));
  $('mp-copy-answer').addEventListener('click', () => copy(joinAnswerEl));

  // ----- host: meghívó létrehozása, a válasz beillesztése -----
  let pending: { accept: (answer: string) => Promise<Link> } | null = null;
  $('mp-host').addEventListener('click', async () => {
    if (!hooks.canHost()) { setStatus('First continue or start a world, then open this menu again.'); return; }
    setStatus('Creating invite…');
    inviteEl.value = answerEl.value = '';
    try {
      const inv = await createInvite();
      pending = inv;
      inviteEl.value = inv.code;
      setStatus('Send this invite code to your friend, then paste their answer code below and press Connect.');
    } catch (e) { setStatus(`Could not create the invite: ${(e as Error).message}`); }
  });
  $('mp-accept').addEventListener('click', async () => {
    if (!pending) { setStatus('Create an invite first.'); return; }
    const code = answerEl.value.trim();
    if (!code) { setStatus('Paste your friend\'s answer code first.'); return; }
    setStatus('Connecting…');
    try {
      const link = await pending.accept(code);
      pending = null;
      inviteEl.value = answerEl.value = '';
      setStatus('Connected! You can invite another friend, or press Continue.');
      hooks.onGuestLink(link);
    } catch (e) { setStatus(`Could not connect: ${(e as Error).message}`); }
  });

  // ----- vendég: meghívó beillesztése, a válasz visszaküldése -----
  $('mp-join').addEventListener('click', async () => {
    const code = joinCodeEl.value.trim();
    if (!code) { setStatus('Paste the invite code first.'); return; }
    setStatus('Preparing the answer…');
    joinAnswerEl.value = '';
    try {
      const j = await joinWithCode(code);
      joinAnswerEl.value = j.answer;
      setStatus('Send this answer code to the host. The game starts when they press Connect.');
      const link = await j.link;
      hooks.onJoinLink(link, name());
    } catch (e) { setStatus(`Could not join: ${(e as Error).message}`); }
  });

  return { setStatus, name, close: () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); } };
}
