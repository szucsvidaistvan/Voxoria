/**
 * Bemenet: billentyűzet + egér (pointer lock) gépen, joystick + érintés telefonon.
 * A játékot a main.ts hajtja, ez csak összegyűjti az eseményeket.
 */
const HOLD_MS = 300, TAP_SLOP = 12;

export class Input {
  /** a legutóbbi lekérdezés óta felgyűlt elfordulás (radián) */
  dYaw = 0;
  dPitch = 0;
  jump = false;
  breakQueued = false;
  /** a bontás gombja le van nyomva (túlélő módban a bontás tartásig tart) */
  breakHeld = false;
  placeQueued = false;
  /** a jobb gomb (vagy a Place gomb) nyomva van: az étel evéséhez kell */
  placeHeld = false;
  /** érintőképernyő: gyors koppintás (lerakás / használat / ütés) várakozik */
  tapQueued = false;
  /** érintőképernyő: hosszan nyomva tartott ujj a vásznon (bontás, vagy evés / védekezés) */
  holdTouch = false;
  hotbar = 0;
  sensitivity = 1;
  enabled = false;
  readonly touch: boolean;

  onHotbar: (i: number) => void = () => {};
  onPause: () => void = () => {};
  /** eddig az időpontig (performance.now) a kurzor felszabadulása nem nyitja meg a menüt */
  ignoreUnlockUntil = 0;
  onInventory: () => void = () => {};
  /** V: váltás az első és a harmadik személyű nézet között */
  onView: () => void = () => {};

  private keys = new Set<string>();
  private joy = { x: 0, y: 0 };
  private joyId: number | null = null;
  private lookId: number | null = null;
  private lookStart = { x: 0, y: 0, t: 0, moved: false };
  private holdTimer = 0;
  private lastX = 0;
  private lastY = 0;

  constructor(private canvas: HTMLCanvasElement, private slots: number) {
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.bindDesktop();
    this.bindTouch();
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  lock(): void {
    if (this.touch) return;
    try {
      // Chrome Promise-t ad vissza, és elutasíthatja (pl. ha nem volt felhasználói gesztus): ez nem hiba
      const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      r?.catch?.(() => {});
    } catch { /* nem támogatott */ }
    // teljes képernyőn a böngésző gyorsbillentyűi (Ctrl+W, Ctrl+T, Ctrl+N, Tab ...) is lefoglalhatók
    const kb = (navigator as Navigator & { keyboard?: { lock?: (keys?: string[]) => Promise<void> } }).keyboard;
    if (document.fullscreenElement) kb?.lock?.().catch(() => {});
  }

  getMove(): { mx: number; mz: number } {
    const k = this.keys;
    const mx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + this.joy.x;
    const mz = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + this.joy.y;
    return { mx, mz };
  }

  reset(): void {
    this.keys.clear();
    this.joy.x = this.joy.y = 0;
    this.joyId = this.lookId = null;
    this.jump = false;
    this.dYaw = this.dPitch = 0;
    this.breakQueued = this.placeQueued = this.breakHeld = this.placeHeld = this.tapQueued = this.holdTouch = false;
    const knob = document.getElementById('joy-knob');
    if (knob) knob.style.transform = '';
  }

  private select(i: number): void {
    this.hotbar = (i + this.slots) % this.slots;
    this.onHotbar(this.hotbar);
  }

  private bindDesktop(): void {
    document.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      // játék közben a böngésző Ctrl/Cmd gyorsbillentyűi (mentés, keresés, nyomtatás, nagyítás ...) nem működnek.
      // A Ctrl+W, Ctrl+T, Ctrl+N megnyomását a weboldalak nem tilthatják le (csak teljes képernyőn, lásd lock()).
      if (e.ctrlKey || e.metaKey) e.preventDefault();
      // az Esc nem számít felhasználói gesztusnak, ezért vele nem lehet visszazárni az egeret (inventory bezárása után).
      // Bármelyik másik billentyű viszont igen: az első leütés visszaadja az irányítást, külön kattintás nélkül.
      if (!this.touch && !this.locked && e.code !== 'Escape' && !e.repeat) this.lock();
      if (e.code === 'Space') { this.jump = true; e.preventDefault(); }
      if (e.code === 'KeyE') {
        // a main.ts záró kezelője ne kapja meg ugyanezt a leütést, különben azonnal bezárná az inventoryt
        e.stopImmediatePropagation();
        if (!e.repeat) this.onInventory();
        return;
      }
      if (e.code === 'KeyV' && !e.repeat) this.onView();
      const d = /^Digit([1-9])$/.exec(e.code);
      if (d && Number(d[1]) <= this.slots) this.select(Number(d[1]) - 1);
      this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.jump = false;
      this.keys.delete(e.code);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.locked) return;
      this.dYaw -= e.movementX * 0.0022 * this.sensitivity;
      this.dPitch -= e.movementY * 0.0022 * this.sensitivity;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || !this.locked) return;
      if (e.button === 0) { this.breakQueued = true; this.breakHeld = true; }
      if (e.button === 2) { this.placeQueued = true; this.placeHeld = true; }
    });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.breakHeld = false; if (e.button === 2) this.placeHeld = false; });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      if (e.ctrlKey) e.preventDefault(); // Ctrl + görgő: böngésző-nagyítás
      this.select(this.hotbar + (e.deltaY > 0 ? 1 : -1));
    }, { passive: false });
    // a gesztusos nagyítás (Ctrl+görgő, touchpad csípés) a játékon kívül is tiltva, amíg a játék fut
    window.addEventListener('wheel', (e) => { if (this.enabled && e.ctrlKey) e.preventDefault(); }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      if (!this.locked && this.enabled && !this.touch && performance.now() >= this.ignoreUnlockUntil) this.onPause();
    });
    window.addEventListener('blur', () => this.reset());
  }

  private bindTouch(): void {
    const $ = (id: string) => document.getElementById(id)!;
    const opts = { passive: false } as const;

    // joystick
    const joy = $('joy'), knob = $('joy-knob');
    const moveJoy = (t: Touch) => {
      const r = joy.getBoundingClientRect();
      const R = r.width / 2;
      let dx = (t.clientX - (r.left + R)) / R;
      let dy = (t.clientY - (r.top + R)) / R;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      this.joy.x = dx;
      this.joy.y = -dy;
      knob.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`;
    };
    joy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.joyId = t.identifier;
      moveJoy(t);
    }, opts);
    joy.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.joyId) moveJoy(t);
    }, opts);
    const endJoy = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyId) {
          this.joyId = null;
          this.joy.x = this.joy.y = 0;
          knob.style.transform = '';
        }
      }
    };
    joy.addEventListener('touchend', endJoy);
    joy.addEventListener('touchcancel', endJoy);

    // nézelődés: húzás a vásznon
    this.canvas.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const t = e.changedTouches[0];
      if (this.lookId === null) {
        this.lookId = t.identifier;
        this.lastX = t.clientX;
        this.lastY = t.clientY;
        // Pocket Edition: koppintás = lerakás / használat / ütés, hosszan nyomva = bontás (vagy evés / védekezés)
        this.lookStart = { x: t.clientX, y: t.clientY, t: performance.now(), moved: false };
        clearTimeout(this.holdTimer);
        this.holdTimer = window.setTimeout(() => { if (this.lookId !== null && !this.lookStart.moved) this.holdTouch = true; }, HOLD_MS);
      }
    }, opts);
    this.canvas.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.lookId) continue;
        this.dYaw -= (t.clientX - this.lastX) * 0.005 * this.sensitivity;
        this.dPitch -= (t.clientY - this.lastY) * 0.005 * this.sensitivity;
        this.lastX = t.clientX;
        this.lastY = t.clientY;
        if (Math.hypot(t.clientX - this.lookStart.x, t.clientY - this.lookStart.y) > TAP_SLOP) this.lookStart.moved = true;
      }
    }, opts);
    const endLook = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.lookId) continue;
        this.lookId = null;
        clearTimeout(this.holdTimer);
        if (!this.holdTouch && !this.lookStart.moved && performance.now() - this.lookStart.t < HOLD_MS && e.type === 'touchend') this.tapQueued = true;
        this.holdTouch = false;
      }
    };
    this.canvas.addEventListener('touchend', endLook);
    this.canvas.addEventListener('touchcancel', endLook);

    // gombok
    const press = (id: string, down: () => void, up?: () => void) => {
      const el = $(id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); down(); }, opts);
      if (up) {
        el.addEventListener('touchend', up);
        el.addEventListener('touchcancel', up);
      }
    };
    press('btn-jump', () => { this.jump = true; }, () => { this.jump = false; });
    press('btn-view', () => this.onView());
    press('btn-menu', () => this.onPause());
    press('btn-inv', () => this.onInventory());
  }
}
