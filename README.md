# Kockavilág

Böngészős, Minecraft-szerű kockajáték (munkacím). Gépen és telefonon is fut, később közös (co-op) játékkal.

**Technológia:** TypeScript, Three.js, Vite.

## Indítás

```bash
npm install
npm run dev
```

Nyisd meg a kiírt címet (általában http://localhost:5173). Telefonról ugyanazon a hálózaton a gép IP-címén éred el (`npm run dev -- --host`).

## Textúrák (Dokucraft High)

A textúracsomag **nincs a git repóban**. A Dokucraft licence szerint nem szabad engedély nélkül tárolni vagy tükrözni, ezért a `public/textures/*.png` a `.gitignore`-ban van. Ha a repót GitHub Pages-re teszed, a textúrák sem kerülhetnek fel oda, az oldal egyszerű színekkel fut. Az engedélyt a [dokucraft.co.uk/license](https://dokucraft.co.uk/license) oldalon és a készítőknél tudod tisztázni.

A használt textúrákat a letöltött zipből másold ki a gépeden:

```bash
npm run textures -- /elérési/út/26.3-Dokucraft-High.zip
```

Ez a 20 alap blokk-textúrát (köztük a vizet, az érceket és a homokkövet) a `public/textures` mappába másolja. Ha nincsenek ott, a játék egyszerű színekkel indul.

### Az összes blokk

A csomag teljes blokklistáját (kb. 550 teljes kocka) ez állítja elő:

```bash
npm run blocks -- /elérési/út/26.3-Dokucraft-High.zip
```

A parancs a `public/generated/blocks.json` fájlt és a `public/textures/mc` mappát hozza létre (mindkettő a `.gitignore`-ban van). A játék induláskor betölti őket, és a blokkok az **E** billentyűvel (telefonon a **Blokkok** gombbal) megnyíló kereshető listában jelennek meg. A kiválasztott blokk a hotbar aktív helyére kerül. Az azonosítók a blokkok névsorából jönnek (100-tól), ezért ugyanazzal a csomaggal mindig ugyanazok. Másik csomagnál a régi mentésekben lévő extra blokkok eltűnhetnek.

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
scripts/    textúra-kicsomagoló
```

A világ állapota és a megjelenítés külön van választva. Ez teszi lehetővé, hogy a co-op szerver később ugyanazt a világkódot futtassa.

## Terv

- [x] Chunk-alapú terep, fák, blokk lerakás és bontás
- [x] Főmenü, beállítások, mentés (localStorage)
- [x] Telefonos vezérlés
- [x] Nappal-éjszaka (8 perces nap, nap, hold, csillagok), víz (úszás, víz alatti köd)
- [x] Blokkregiszter (két bájtos azonosító), kereshető kreatív inventory
- [ ] Nem kocka alakú blokkok (lépcső, lap, növény, kerítés, ajtó), almappás textúrák (deepslate, hó, tnt)
- [ ] Inventory, életerő, készítés
- [ ] Mentés IndexedDB-be (nagy világokhoz)
- [ ] Szerver (Node.js + WebSocket), közös világ
- [ ] RPG-rendszerek (karakter, küldetések, NPC-k)
