# Voxoria

A játék felülete, a blokkok és a tárgyak nevei angolul vannak; ez a README magyarul.

Böngészős, Minecraft-szerű kockajáték. Gépen és telefonon is fut, később közös (co-op) játékkal.

**Technológia:** TypeScript, Three.js, Vite.

## Indítás

```bash
npm install
npm run dev
```

Nyisd meg a kiírt címet (általában http://localhost:5173). Telefonról ugyanazon a hálózaton a gép IP-címén éred el (`npm run dev -- --host`).

## Textúrák (Good Vibes)

A játék a **Good Vibes** textúracsomagot használja, amit **Acaitart** készített (CC BY 4.0 licenc, a készítő nevének feltüntetésével szabadon felhasználható). A licenc szövege és a készítő adatai a `public/textures/LICENSE-GoodVibes.txt` és `CREDITS-GoodVibes.txt` fájlban vannak, a játék főmenüjében pedig a készítő neve látszik. A csomag a VoxelAssets tárolóból való: https://github.com/Phyronnaz/VoxelAssets

A kicsomagolt textúrák a repóban vannak (`public/textures`, `public/generated`), így a GitHub Pages oldalon is működnek. Másik csomagra váltáshoz (gépen):

```bash
npm run textures -- /elérési/út/csomag.zip
npm run blocks -- /elérési/út/csomag.zip
```

Az első a 20 alap blokk-textúrát másolja a `public/textures` mappába, a második a csomag blokklistáját a `public/generated/blocks.json` fájlba és a használt textúrákat a `public/textures/mc` mappába. A szkriptek a zipben maguktól megkeresik a `textures/block` mappát (egy zipben több csomag is lehet). Ha a csomagban vannak `models` és `blockstates` fájlok (mint a Dokucraftnál), a blokkok alakját abból olvassák ki. Ha nincsenek (mint a Good Vibesnál), a kockákat a textúrák nevéből találják ki, a nem kocka alakú blokkokat (növények, fáklya, kerítés, üvegtábla, szőnyeg, lépcső, lap, fal stb.) pedig a szkriptbe épített modellek adják.

A blokkok az **E** billentyűvel (telefonon a **Blokkok** gombbal) megnyíló kereshető listában jelennek meg. Az azonosítók a blokkok névsorából jönnek (100-tól), ezért másik csomagnál a régi mentésekben lévő extra blokkok eltűnhetnek.

### Nem kocka alakú blokkok

A nem kocka alakú blokkok dobozait (`parts`) a `npm run blocks` a `blocks.json`-ba menti, a játék pedig ezekből rajzolja őket és számolja az ütközést. A lépcső, a lap és a többi blokk a játékos nézési irányába fordul, a lapot és a lépcsőt alulról vagy a blokk felső felére építve fejjel lefelé rakja le. A kézben tartott blokk neve a sávban való választáskor megjelenik.

### Saját blokklap (korábbi textúrák)

A korábbi, saját textúralapokból kivágott textúrákat a `scripts/slice-textures.py` és a `scripts/slice-sheet.py` állította elő. Ezek a Good Vibesra váltás előtt a repóban voltak.

## Irányítás

| | Gép | Telefon |
|---|---|---|
| Mozgás | WASD | bal oldali joystick |
| Nézelődés | egér | húzás a jobb oldalon |
| Ugrás | szóköz | Ugrás gomb |
| Bontás / építés | bal / jobb egérgomb | Bont / Épít gomb |
| Kiválasztás a sávban | 1–9, görgő | koppintás a hotbaron |
| Inventory (kreatívban blokklista) | E | Tárgyak gomb |
| Menü | Esc | Menü gomb |

## Telefon

A játék fekvő helyzetben játszható jól: álló helyzetben egy kérés jelenik meg a forgatásra (a „Mégis így játszom" gombbal eltüntethető). Androidon a játék indításakor teljes képernyőt és fekvő zárolást kér. iPhone-on a böngésző ezt nem engedi, de a Megosztás, Főképernyőhöz adás után a manifest alapján teljes képernyős appként indul.

## Játékmódok

Az **Új világ (túlélő)** és az **Új világ (kreatív)** gomb közül választasz; a mentés megjegyzi a módot.

- **Kreatív:** végtelen blokk, nincs sebzés, a bontás egy kattintás. Az **E** a kereshető blokk- és tárgyválasztót nyitja: fülekre bontva (Building Blocks, Natural Blocks, Stairs, Slabs & Walls, Doors, Fences & Ladders, Plants, Decoration, Functional, Fluids & Fire, Tools, Materials & Food), az „All” fülön csoportcímekkel. Itt minden blokk és minden tárgy (eszközök, vödör, kova és acél, alma ...) elérhető.
- **Túlélő:** üres kézzel indulsz. A bontás a blokk keménységétől és a kezedben lévő szerszámtól függ (tartsd nyomva), közben repedések jelennek meg a blokkon, a bontáskor törmelék repül szét, a blokk pedig a földre esik. Ha a közelébe érsz, a játékos felveszi (ha tele a tároló, a földön marad). Életerő (10 szív), esési sebzés, fulladás (buborékok), égés és láva sebzés, természetes gyógyulás. Halál után újraélesztés a kiinduló helyen, a tárgyaid megmaradnak.

### Inventory és barkácsolás

Az **E** (telefonon a **Tárgyak** gomb) 36 helyes tárolót nyit (alul a 9 helyes hotbar) és 2×2-es barkácsrácsot. A munkapadra (**jobb gomb**) 3×3-as rács nyílik. Egérrel: kattintás felvesz / lerak, jobb gomb a felét veszi fel vagy egyet rak le, Shift+kattintás gyorsmozgatás. Telefonon: koppintás felvesz / lerak, hosszan nyomva a stack fele (vagy egy darab), ujjal húzva a stack a másik helyre kerül; a sötét háttérre koppintva a panel bezárul. Az eredményen Shift+kattintás: amíg van alapanyag, készít.

Receptek (a rács alakja számít, a tükrözött is jó): rönk → 4 deszka, 2 deszka egymás fölött → 4 pálca, 2×2 deszka → munkapad, szén + pálca → 4 fáklya, 3 pálca + 2 pálca (létra, kerítés), lap, lépcső, csapóajtó, kő- és kavicslépcső, -lap, fal, kőtégla, homokkő, vödör (3 vasrúd V alakban), kova és acél (vasrúd + kova), valamint fa-, kő-, vas-, arany- és gyémántcsákány, -balta, -ásó és -kard. A vas- és aranyérc bontáskor rögtön rúdként esik (nincs kemence), a szénérc szenet, a gyémántérc gyémántot ad, a kavics néha kovát, a lomb néha csemetét vagy almát.

### Ajtók, kerítések, létra

- **Ajtó** (6 deszka 2×3-as alakban = 3 ajtó): két blokk magas, a nézési irányodba néz, jobb gombbal nyitható és csukható. A kerítések, falak és üvegtáblák a szomszédaik felé kinyúlnak (egymáshoz és tömör blokkokhoz), a kerítésen és falon nem lehet átugrani.
- **Létra:** a megcélzott falra kerül, rajta előre nézve vagy ugrással fel, hátra nézve le lehet mászni.

### Folyadékok és tűz

- **Víz:** 3 blokk távolságra folyik (a lávával megegyezően, 0,5 másodpercenként egy lépés), lefelé esik, két szomszédos forrás között új forrás keletkezik (végtelen víz), forrás nélkül elapad. A távolság és a sebesség a `src/shared/fluids.ts` elején állítható.
- **Láva:** lassan folyik (3 blokk távolságra), lassítja és sebzi a játékost, és meggyújtja a közeli éghető blokkokat.
- **Láva + víz:** a láva forrás obszidiánná, a folyó láva kaviccsá válik, a vízbe lefolyó láva kővé.
- **Tűz:** animált, átterjed a fára, lombra, gyapjúra és növényekre, majd kialszik. Kova és acéllal (jobb gomb) lehet gyújtani, vízzel el lehet oltani.
- **Vödör:** üres vödörrel (jobb gomb) vizet vagy lávát veszel fel, a teli vödörrel lerakod.

## Felépítés

```
src/
  shared/   világlogika: blokkok, chunkok, terepgenerálás, sugárkövetés,
            folyadék- és tűzszimuláció (fluids.ts), elemek, receptek, bontási szabályok
            (nincs benne three.js, a szerver is ezt használja majd)
  client/   renderelés, mesh-építés, mozgás, bemenet, menü, mentés,
            inventory és barkácsolás (inventory.ts), életerő (health.ts)
scripts/    textúra-kicsomagoló
```

A világ állapota és a megjelenítés külön van választva. Ez teszi lehetővé, hogy a co-op szerver később ugyanazt a világkódot futtassa.

## Terv

- [x] Chunk-alapú terep, fák, blokk lerakás és bontás
- [x] Főmenü, beállítások, mentés (localStorage)
- [x] Telefonos vezérlés
- [x] Nappal-éjszaka (8 perces nap, nap, hold, csillagok), víz (úszás, víz alatti köd)
- [x] Blokkregiszter (két bájtos azonosító), kereshető kreatív inventory
- [x] Nem kocka alakú blokkok (lépcső, lap, növény, fáklya, kerítés oszlop, üvegtábla)
- [x] Folyadékok (víz, láva), tűz, obszidián és kavics a láva és a víz találkozásából
- [x] Inventory, életerő, túlélő és kreatív mód, barkácsolás, szerszámok, vödör
- [ ] Összekapcsolódó kerítések, falak és üvegtáblák; ajtók, ágyak, kemence (olvasztás), láda
- [ ] Éhség, szörnyek, szerszám-kopás
- [ ] Mentés IndexedDB-be (nagy világokhoz)
- [ ] Szerver (Node.js + WebSocket), közös világ
- [ ] RPG-rendszerek (karakter, küldetések, NPC-k)
