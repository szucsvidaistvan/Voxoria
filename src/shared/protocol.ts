/**
 * Hálózati protokoll (co-op multiplayer, 1. lépés: csak a típusok, még nem használja semmi).
 * Lásd docs/MULTIPLAYER.md. Minden üzenet JSON-objektum egy `t` típusmezővel.
 */

/** A protokoll verziója: a szerver elutasítja a más verziójú klienst. Szerkezeti változáskor növeld. */
export const PROTOCOL_VERSION = 1;

/** Játékos azonosító a szerveren (a belépéskor kapja). */
export type PlayerId = number;

/** Egy játékos nyilvános állapota (amit a többiek látnak). */
export interface PlayerState {
  id: PlayerId;
  name: string;
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  /** a kézben tartott tárgy azonosítója (0: üres) */
  held: number;
  /** a viselt páncél: sisak, mellvért, nadrág, csizma (0: nincs) */
  armor: [number, number, number, number];
  /** animáció: sebesség (0..1,3), futás, ütés / evés / védekezés */
  speed: number; sprint: boolean; /** a lendítés fázisa 0..1 (0: nem üt) */
  swing: number; eating: boolean; blocking: boolean;
}

/** Egy mob pillanatképe (a szerver küldi, a kliens interpolálja). */
export interface MobState {
  id: number;
  kind: string;
  x: number; y: number; z: number;
  yaw: number;
  /** a járás fázisa és sebessége az animációhoz */
  walk: number; speed: number;
  hp: number;
  /** mobfüggő extra jelzők (pl. mászik, célzik, sebzés-villanás) */
  flags: number;
}

/** Egy blokk módosítása (a világ a seedből generálódik, csak a változások utaznak). */
export interface BlockEdit { x: number; y: number; z: number; id: number }

// ---------- kliens → szerver ----------

export type ClientMsg =
  | { t: 'hello'; version: number; name: string }
  /** a játékos saját állapota (~15 Hz) */
  | { t: 'state'; p: Omit<PlayerState, 'id' | 'name'> }
  /** blokk bontása / lerakása (a szerver ellenőrzi, és szétküldi mindenkinek) */
  | { t: 'edit'; edits: BlockEdit[] }
  /** mob megütése */
  | { t: 'attack'; mob: number; damage: number }
  | { t: 'chat'; text: string }
  /** a játékos lefeküdt / felkelt (alvás-szavazás) */
  | { t: 'sleep'; on: boolean }
  /** láda megnyitása / tartalmának módosítása */
  | { t: 'chest'; x: number; y: number; z: number; slots: ({ id: number; n: number } | null)[] }
  /** a vendég tárgyat ejtene a földre (kibányászott blokk stb.): a host hozza létre és küldi szét */
  | { t: 'dropReq'; item: number; n: number; x: number; y: number; z: number; d?: number; vx?: number; vy?: number; vz?: number; wait?: number }
  /** a vendég fel akarja venni a földön heverő tárgyat */
  | { t: 'pickup'; id: number };

/** egy földön heverő tárgy (a host a tulajdonosa, az azonosítója közös) */
export interface DropState { id: number; item: number; n: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; d?: number; wait?: number }

// ---------- szerver → kliens ----------

export type ServerMsg =
  | { t: 'welcome'; version: number; you: PlayerId; seed: number; time: number; day: number; players: PlayerState[] }
  | { t: 'reject'; reason: string }
  | { t: 'join'; player: PlayerState }
  | { t: 'leave'; id: PlayerId }
  /** a többiek állapota és a mobok pillanatképe (~10–15 Hz) */
  | { t: 'snapshot'; players: PlayerState[]; mobs: MobState[]; time: number; day: number }
  /** kötegelt blokkmódosítás (a belépéskor a teljes eltérés is így érkezik) */
  | { t: 'edits'; edits: BlockEdit[] }
  | { t: 'mobGone'; id: number }
  /** egy mob megsebezte a játékost (a kliens alkalmazza: páncél, lökés, életerő) */
  | { t: 'hurt'; dmg: number; fx: number; fz: number }
  | { t: 'dropAdd'; drops: DropState[] }
  | { t: 'dropDel'; id: number }
  /** a felvett tárgy a vendég tárolójába kerül */
  | { t: 'give'; item: number; n: number; d?: number }
  | { t: 'chat'; from: PlayerId; text: string }
  | { t: 'chest'; x: number; y: number; z: number; slots: ({ id: number; n: number } | null)[] }
  /** reggel lett (mindenki aludt): a kliens lejátssza az átmenetet */
  | { t: 'morning'; day: number };
