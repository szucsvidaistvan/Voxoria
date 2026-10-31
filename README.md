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

A játék a Dokucraft High (v26.3) textúráit használja, a készítők jóváhagyásával (dokucraft.co.uk). A kicsomagolt textúrák a repóban vannak (`public/textures`, `public/generated`), így a GitHub Pages oldalon is működnek. Frissítés másik csomagverzióra (gépen):

```bash
npm run textures -- /elérési/út/csomag.zip
npm run blocks -- /elérési/út/csomag.zip
```

Az első a 20 alap blokk-textúrát másolja a `public/textures` mappába, a második a csomag teljes blokklistáját (kb. 660 teljes kocka és 340 egyéb alakú blokk) a `public/generated/blocks.json` fájlba és a `public/textures/mc` mappába. A blokkok az **E** billentyűvel (telefonon a **Blokkok** gombbal) megnyíló kereshető listában jelennek meg. Az azonosítók a blokkok névsorából jönnek (100-tól), ezért másik csomagnál a régi mentésekben lévő extra blokkok eltűnhetnek.

### Saját blokklap (korábbi textúrák)

A korábbi, saját textúralapokból kivágott textúrákat a `scripts/slice-textures.py` és a `scripts/slice-sheet.py` állította elő. Ezek a Dokucraft váltása előtt a repóban voltak.

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
