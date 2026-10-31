# Kockavilág

Böngészős, Minecraft-szerű kockajáték (munkacím). Gépen és telefonon is fut, később közös (co-op) játékkal.

**Technológia:** TypeScript, Three.js, Vite.

## Indítás

```bash
npm install
npm run dev
```

Nyisd meg a kiírt címet (általában http://localhost:5173). Telefonról ugyanazon a hálózaton a gép IP-címén éred el (`npm run dev -- --host`).

## Textúrák és blokkok

A textúrák **nincsenek képfájlban**: a játék induláskor kóddal rajzolja ki őket (`src/client/procedural.ts`), a rajzolási receptek és a blokklista pedig a `src/shared/catalog.ts` fájlban vannak. Ezért nincs külső licenc, és a GitHub Pages alatt is minden ugyanúgy látszik, mint a saját gépeden. Jelenleg kb. 130 blokk van (kövek, ércek, fafajták, 16 színű gyapjú, beton és terrakotta, üveg, fémblokkok).

Új blokk felvétele: add meg a textúra receptjét (`tex(...)`) és a blokkot (`cube(...)` vagy `column(...)`) a `catalog.ts`-ben. A blokkok azonosítója a lista sorrendjéből jön (100-tól), ezért **új blokkot mindig a lista végére írj**, különben a régi mentések elcsúsznak.

A blokkokat az **E** billentyűvel (telefonon a **Blokkok** gombbal) nyíló kereshető listából választhatod ki. A választott blokk a hotbar aktív helyére kerül.

## Irányítás

| | Gép | Telefon |
|---|---|---|
| Mozgás | WASD | bal oldali joystick |
| Nézelődés | egér | húzás a jobb oldalon |
| Ugrás | szóköz | Ugrás gomb |
| Bontás / építés | bal / jobb egérgomb | Bont / Épít gomb |
| Blokkválasztás | 1–8, görgő | koppintás a hotbaron |
| Blokklista | E | Blokkok gomb |
| Menü | Esc | Menü gomb |

## Felépítés

```
src/
  shared/   világlogika: blokkok, chunkok, terepgenerálás, sugárkövetés
            (nincs benne three.js, a szerver is ezt használja majd)
  client/   renderelés, mesh-építés, mozgás, bemenet, menü, mentés
```

A világ állapota és a megjelenítés külön van választva. Ez teszi lehetővé, hogy a co-op szerver később ugyanazt a világkódot futtassa.

## Terv

- [x] Chunk-alapú terep, fák, blokk lerakás és bontás
- [x] Főmenü, beállítások, mentés (localStorage)
- [x] Telefonos vezérlés
- [x] Nappal-éjszaka (8 perces nap, nap, hold, csillagok), víz (úszás, víz alatti köd)
- [x] Blokkregiszter (két bájtos azonosító), kereshető kreatív inventory
- [x] Saját, kóddal rajzolt textúrák (licencmentes, Pages-en is működik)
- [ ] Nem kocka alakú blokkok (lépcső, lap, növény, kerítés, ajtó)
- [ ] Inventory, életerő, készítés
- [ ] Mentés IndexedDB-be (nagy világokhoz)
- [ ] Szerver (Node.js + WebSocket), közös világ
- [ ] RPG-rendszerek (karakter, küldetések, NPC-k)
