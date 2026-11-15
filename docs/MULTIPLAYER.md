# Multiplayer (co-op) – előkészítés

Cél: **co-op**, 2–8 játékos közös világban (nem verseny): közös építés, közös mobok, közös nap-éjszaka. Az irány (dedikált szerver vagy böngészős host/P2P) még nyitott; az alábbi lépések 1–4 mindkettőhöz kellenek.

## Mi van már kész (újrahasznosítható)
- `src/shared` nem függ a three-től és a böngészőtől: `World` (seed-ből determinisztikus generálás), `MobManager`, folyadékok, gravitáció (hulló blokkok), növénynövés, ércek, receptek. Ez **Node-ban is futtatható** (a headless tesztek így futnak).
- A `World` a seedből újragenerálható, így a hálón csak a **változásokat** (játékos által módosított blokkok) kell küldeni, nem a teljes világot.
- A távoli játékosok kirajzolására a `createPlayerView` (fej, kéz, evés, ütés, páncél) már használható.

## Ami még akadály
1. `src/client/main.ts` (~1550 sor) összekeveri a bemenetet, a játékállapotot és a szimulációt (`sim.update`, `gravity.update`, `crops.update`, `mobs.update` a rajzoló ciklusból hívódik). A szimulációt le kell választani egy `GameServer`/`Sim` osztályba, amit a böngésző (egyjátékos) és a Node (szerver) is hívhat.
2. A `MobManager` egyetlen játékoshoz igazodik (spawn, célpont, despawn a játékos körül) – több játékosnál minden játékos körül kell spawnolni, és a legközelebbit kell célozni.
3. A játékos fizikája (`src/client/player.ts`) csak a `World`-öt használja, de a kliensben él: a szerver-oldali ellenőrzéshez (co-op-ban elég egy laza ellenőrzés) át kell tenni a `shared`-be.
4. Állapot, ami csak a kliensben él: leltár, életerő/éhség, láda-tartalom, mentés (IndexedDB). A ládát és a világ-módosításokat a szervernek kell tárolnia.
5. A `Math.random` a szimulációban (mobok, növények, folyadék): szerver-hitelesnél ez rendben van (egy helyen fut), de a kliens ne jósolja meg ugyanazt külön.

## Javasolt modell
- **Szerver-hiteles világ**: blokk-módosítás, mobok, növények, folyadék, hulló blokkok, tárgyak a földön, nap/éjszaka, alvás (mindenki lefekszik → reggel).
- **Játékos mozgása kliens-hiteles** (co-op, bizalom): a kliens küldi a helyét ~15 Hz-en, a szerver csak elfogadhatóságot néz (sebesség, fal); a többiek interpolálva látják.
- **Kapcsolat**: WebSocket, JSON üzenetek a fejlesztéshez (később bináris a chunk-diffekhez). Tick: 20 Hz a szimuláció, 10–15 Hz a pillanatkép.
- **Belépés**: `hello{version,name}` → `welcome{seed, time, day, players, chunkDiff...}`; a világ a seedből generálódik, a szerver a módosításokat küldi chunkonként.
- **Mentés**: a szerver tárolja (fájl vagy KV): blokk-diff, ládák, idő, játékosonkénti leltár/életerő név szerint.

## Lépések (mindegyik külön PR, kis kockázat)
1. **Protokoll** – `src/shared/protocol.ts`: üzenettípusok és verzió (ez a PR).
2. **Szimuláció szétválasztása** – a `sim/gravity/crops/mobs` tick a `main.ts`-ből egy `Sim` osztályba; az egyjátékos mód ugyanezt hívja helyben. Viselkedés nem változik.
3. **Többjátékosos mobok** – spawn/célpont/despawn az összes játékos körül (`MobManager` a játékoslistával).
4. **Játékos-állapot a shared-be** – `Player` fizika és az állapot-szerializáció (leltár, hp) a `src/shared`-be, hogy Node-ban is fusson.
5. **Szerver (Node + `ws`)** – `server/`: a `Sim` futtatása, a protokoll kiszolgálása, blokk-diff és ládák mentése.
6. **Kliens hálózati réteg** – kapcsolódás, a világ-események alkalmazása, a távoli játékosok és mobok interpolált megjelenítése, csevegés, névtáblák.
7. **Co-op részletek** – alvás-szavazás, halál és újraéledés, közös spawn, kick/ban egyszerűen, szerverlista vagy meghívó-link.

## Döntés, ami még a tiéd
- **Dedikált szerver** (ajánlott): stabil, bárki bármikor csatlakozhat, de kell hosting (Fly.io/Render/saját gép). A kliens marad a GitHub Pages-en.
- **Host a böngészőben (WebRTC)**: nincs szerver, de a host kilépésével vége a játéknak, és kell egy jelzőszerver; a szimuláció a host böngészőjében fut.
Az 1–4. lépés ettől független.
