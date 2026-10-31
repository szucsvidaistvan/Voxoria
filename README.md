# Voxoria

Böngészős, Minecraft-szerű kockajáték. Gépen és telefonon is fut, később közös (co-op) játékkal.

**Technológia:** TypeScript, Three.js, Vite.

## Indítás

```bash
npm install
npm run dev
```

Nyisd meg a kiírt címet (általában http://localhost:5173). Telefonról ugyanazon a hálózaton a gép IP-címén éred el (`npm run dev -- --host`).

## Textúrák (Dokucraft High)

A játék a [Dokucraft High](https://dokucraft.co.uk/resource-packs/high) textúracsomagot használja (v26.3, 32×32). A használatára a készítők engedélyét kaptuk, ezért a kinyert textúrák a repóban vannak (`public/textures`, `public/generated`), és a GitHub Pages oldalon is működnek. Dokucraft © a készítői, az engedélyt a [dokucraft.co.uk/license](https://dokucraft.co.uk/license) oldal írja le. A textúrák csak ebben a játékban használhatók, ne tedd fel őket máshová.

Újragenerálás a letöltött zipből (Node 18 vagy újabb, külön csomag nem kell):

```bash
node scripts/extract-textures.mjs /elérési/út/26.3-Dokucraft-High.zip   # a 20 alap textúra
node scripts/build-blocks.mjs /elérési/út/26.3-Dokucraft-High.zip       # a többi blokk és a blocks.json
```

A második parancs a csomag blokkállapotaiból és textúráiból összeállítja a kocka alakú blokkok listáját (kb. 460 blokk), a nem kocka alakúakat (lépcső, növény, fáklya, sín) egyelőre kihagyja. A `--shapes` kapcsoló ezek adatait is kiírja a későbbi rendereléshez.

A blokkok az **E** billentyűvel (telefonon a **Blokkok** gombbal) megnyíló kereshető listában jelennek meg, a választott blokk a hotbar aktív helyére kerül. Az azonosítók a blokkok névsorából jönnek (100-tól), ezért ugyanazzal a csomaggal mindig ugyanazok, de ha a lista változik (új csomag, szűrő), a régi mentésekben lévő extra blokkok elcsúszhatnak.

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
scripts/    textúra- és blokklista-generátor (a Dokucraft zipből)
```

A világ állapota és a megjelenítés külön van választva. Ez teszi lehetővé, hogy a co-op szerver később ugyanazt a világkódot futtassa.

## Terv

- [x] Chunk-alapú terep, fák, blokk lerakás és bontás
- [x] Főmenü, beállítások, mentés (localStorage)
- [x] Telefonos vezérlés
- [x] Nappal-éjszaka (8 perces nap, nap, hold, csillagok), víz (úszás, víz alatti köd)
- [x] Blokkregiszter (két bájtos azonosító), kereshető kreatív inventory
- [x] Dokucraft High textúrák, kb. 460 kocka alakú blokk
- [ ] Nem kocka alakú blokkok (lépcső, lap, növény, kerítés, ajtó)
- [ ] Inventory, életerő, készítés
- [ ] Mentés IndexedDB-be (nagy világokhoz)
- [ ] Szerver (Node.js + WebSocket), közös világ
- [ ] RPG-rendszerek (karakter, küldetések, NPC-k)
