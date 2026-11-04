# Voxoria

A játék felülete, a blokkok és a tárgyak nevei angolul vannak; ez a README magyarul.

Böngészős kockajáték (voxel sandbox). Gépen és telefonon is fut, később közös (co-op) játékkal.

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

## Nappalok, fény, tűzhely

- **Nap-éjszaka:** egy teljes nap 20 perc (kb. 12,5 perc nappal, 7,5 perc éjszaka). A hajnal rózsaszín, az alkonyat narancs, majd lila; a hold 8 napos fázisokon megy át (telihold idején világosabb az éjszaka). A jobb felső sarokban a nap sorszáma és a játékbeli idő látszik.
- **Fény:** a fáklya (14), a láva, a tűz, az izzókő, a tengerlámpa és a tökfaragás világít, a fény blokkonként gyengül. A barlangok és a tető alatti terek sötétek, napfény az oldalról szivárog be. A fáklya a padlóra vagy a fal oldalára tehető (plafonra nem); ha a fal eltűnik, leesik.
- **Tűzhely:** 8 kőből barkácsolható (gyűrű alakban), jobb klikkel nyílik. Bemenet + üzemanyag (szén, faszén, fa, deszka, bot ...), 10 másodperc tárgyanként. A vas- és aranyérc most már érc blokkot ad, amit meg kell olvasztani. A rönk faszénné olvad, a homok üveggé, a macskakő kővé.
- **Fadöntés:** ha egy természetes fa rönkjét kiütik, az egész fa összeomlik: a rönkök és a lomb blokkonként szétesnek, pörögve-pattogva a földre hullanak (animáció), és földet érve tárgyak lesznek belőlük (fix mód, nincs beállítás). Ugyanez történik, ha a fa alól kiszedik a talajt (közvetlenül a törzs alatti blokkot). Kézzel is működik, de ~4x lassabb (kb. 12 mp), baltával fél másodperc. A fa gyökerei alatti földet (közvetlenül fölötte rönk) kézzel szintén ~4x nehezebb kiszedni, ásóval nem. Rönkházat és fa nélküli rönkoszlopot nem dönt ki.
- **Irányítás:** játék közben a böngésző Ctrl-gyorsbillentyűi le vannak tiltva (a Ctrl+W, Ctrl+T, Ctrl+N megnyomását a weboldalak nem tilthatják le, csak teljes képernyőn). Az Esc után bármelyik billentyű vagy kattintás visszaadja az irányítást, a menüben az Enter folytatja a játékot.
- **Bontás:** a bontási idők szándékosan hosszabbak (szorzó: `MINING_SCALE` a `survival.ts`-ben): pl. kézzel a föld ~1,1 mp, a rönk ~11 mp, vascsákánnyal a kő ~1 mp.
- **Kézben tartott tárgy:** első személyű nézetben jobb alsó sarokban látszik: üres kézzel a játékos karja (a saját skinnel), tömör blokknál 3D kocka, tárgyaknál a textúrából kihúzott, 1 pixel vastag modell. Járáskor billeg, bontáskor/ütéskor/lerakáskor lendül, evéskor a szájhoz emelkedik és rág.
- **Éhség:** 10 húscomb; a mozgás (kb. 160 méterenként egy éhségpont), az ugrás, a bontás (kb. 100 blokkonként egy pont) és a sebzés fokozatosan kimerít, a telítettség előbb fogy, mint az éhség. 18 éhség fölött az életerő magától töltődik, nulla éhségnél az életerő 1 pontig csökken. Étel jobb klikkre (csak éhesen): alma, nyers és sült hús, rothadt hús. A nyers húst a tűzhelyben lehet megsütni.
- **Szerszámok kopása:** fa 59, kő 131, vas 250, arany 32, gyémánt 1561 használat. Minden bontott blokk, kidöntött rönk és ütés kopasztja; a kard a harcban, a többi eszköz a bontásban bírja jobban. A kopás csíkként látszik az ikonon, és a mentésben megmarad.
- **Mobok:** disznó, tehén, birka, csirke (nyers húst, gyapjút adnak), zombi és csontváz (éjjel jönnek, napfényben égnek). Kard 4–7, balta 3–6, kéz 1 sebzés; esés közben kritikus. A beállításokban kikapcsolhatók, vagy békés módban csak az állatok maradnak.

## Irányítás

| | Gép | Telefon |
|---|---|---|
| Mozgás | WASD | bal oldali joystick |
| Nézelődés | egér | húzás a jobb oldalon |
| Ugrás | szóköz | Ugrás gomb |
| Bontás / építés | bal / jobb egérgomb | Bont / Épít gomb |
| Kiválasztás a sávban | 1–9, görgő | koppintás a hotbaron |
| Inventory (kreatívban blokklista) | E | Tárgyak gomb |
| Nézet váltása (első / harmadik személy) | V | – |
| Menü | Esc | Menü gomb |

## Telefon

A játék fekvő helyzetben játszható jól: álló helyzetben egy kérés jelenik meg a forgatásra (a „Mégis így játszom" gombbal eltüntethető). Androidon a játék indításakor teljes képernyőt és fekvő zárolást kér. iPhone-on a böngésző ezt nem engedi, de a Megosztás, Főképernyőhöz adás után a manifest alapján teljes képernyős appként indul.

## Játékmódok

Az **Új világ (túlélő)** és az **Új világ (kreatív)** gomb közül választasz; a mentés megjegyzi a módot.

- **Kreatív:** végtelen blokk, nincs sebzés, a bontás egy kattintás. Az **E** a kereshető blokk- és tárgyválasztót nyitja: fülekre bontva (Building Blocks, Natural Blocks, Stairs, Slabs & Walls, Doors, Fences & Ladders, Plants, Decoration, Functional, Fluids & Fire, Tools, Materials & Food), az „All” fülön csoportcímekkel. Itt minden blokk és minden tárgy (eszközök, vödör, kova és acél, alma ...) elérhető.
- **Túlélő:** üres kézzel indulsz. A bontás a blokk keménységétől és a kezedben lévő szerszámtól függ (tartsd nyomva), közben repedések jelennek meg a blokkon, a bontáskor törmelék repül szét, a blokk pedig a földre esik. Ha a közelébe érsz, a játékos felveszi (ha tele a tároló, a földön marad). Életerő (10 szív), esési sebzés, fulladás (buborékok), égés és láva sebzés, természetes gyógyulás. Halál után újraélesztés a kiinduló helyen, a tárgyaid megmaradnak.

### Inventory és barkácsolás

Az **E** (telefonon a **Tárgyak** gomb) 36 helyes tárolót nyit (alul a 9 helyes hotbar) és 2×2-es barkácsrácsot. A munkapadra (**jobb gomb**) 3×3-as rács nyílik. Egérrel: kattintás felvesz / lerak, jobb gomb a felét veszi fel vagy egyet rak le, Shift+kattintás gyorsmozgatás. **Szétosztás** (barkácsoláshoz): tele kézzel nyomva tartva és végighúzva több helyen a stack egyenlően szétoszlik a helyek között (jobb gombbal húzva helyenként egy darab). Telefonon: koppintás felvesz / lerak, hosszan nyomva a stack fele (vagy egy darab), üres kézzel húzva a stack a másik helyre kerül, tele kézzel húzva szétosztás (nincs külön Half gomb); a sötét háttérre koppintva a panel bezárul. Az eredményen Shift+kattintás: amíg van alapanyag, készít.

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
- [x] Éhség, szörnyek, szerszám-kopás
- [ ] Mentés IndexedDB-be (nagy világokhoz)
- [ ] Szerver (Node.js + WebSocket), közös világ
- [ ] RPG-rendszerek (karakter, küldetések, NPC-k)

## Tartalmi szabályok (szerzői jog / védjegy)

A játék nem használ olyan elemeket, amelyek egy másik játék saját, kitalált tartalmának számítanak.
A `scripts/content-policy.json` sorolja fel a kiszűrt blokkcsaládokat (Nether, End, purpur, prismarine,
shulker, redstone és a hozzá tartozó mechanikák, stb.); az `scripts/apply-content-policy.mjs` alkalmazza őket,
és a `build-blocks.mjs` is meghívja, így a blokklista újragenerálása sem hozza vissza őket.
A mobok (malac, tehén, birka, csirke, zombi) általános, folklór- vagy háziállat-alapúak, a modelljeik saját tervek.
A textúrák: Good Vibes by Acaitart, CC BY 4.0 (lásd `public/textures/CREDITS-GoodVibes.txt`).
Ez saját besorolás, nem jogi tanács.

### Tárgyak a Good Vibes csomagból

A tárgytextúrák besorolása a `scripts/item-policy.json` fájlban van: `import` (átvéve, `scripts/import-items.mjs`),
`later` (általános tárgy, de a játék még nem tud vele mit kezdeni: páncél, ajtó, hajó, íj stb.), `remove`
(Minecraft saját tárgyai: blaze, ender, nether, redstone, bájitalok, lemezek, totem stb.). A csomag
`biomesoplenty/` része egy mod saját tartalma, ezt nem használjuk.

### Lények és a játékos modellje

A háziállatok (malac, tehén, birka, csirke) a Good Vibes csomag lény-skinjeivel (`public/textures/entity/`) vannak textúrázva.
A modellek adata a `src/client/mobmodels.ts` fájlban van (a dobozok pixelmérete, helye és a képen lévő részük), a dobozok
UV-kiosztását a `src/client/boxuv.ts` végzi. A zombi (`zombie.png`) és a csontváz (`skeleton.png`) is a csomag skinjével van textúrázva (a bal végtagok a jobbak tükörképei a képen, ezért ugyanazt a részt használják). A csontváz távolról lő, nappal ég, csontot ejt: célzáskor megemeli az íjat tartó karját (a kezében a csomag `bow.png` tárgya), majd kilő egy valódi, ívben repülő **nyilat** (3 sebzés). A nyíl sebessége véges, ezért oldalra lépve kikerülhető; a blokkba állt nyíl pár másodpercig látszik.
A játékos modellje: az `entity/player.png` a projekt tulajdonosa által megadott skin (nem a Minecraft Steve/Alex karaktere); játék közben a **V** billentyűvel
látható (harmadik személyű nézet), és a későbbi co-op társak megjelenítésére is ez szolgál.

Megjegyzés: a `sheep_fur.png` egy módosított másolat (a törzs oldalain a pár átlátszó pixel ki van töltve, hogy ne lehessen belátni a gyapjúba), az eredeti szerzője Acaitart (CC BY 4.0).
