## v2.61 – bemondási kör és csendes ultimó pontosítás

# Illusztrált Magyar Tarokk – v2.46

v2.44 – **persistent + hardened multiplayer build**. A single-player motor lezárt állapotára építve a multiplayer szerveroldali authority rétege mostantól a licit–fektetés–partnerhívás–bemondás–kontra–lejátszás folyamatot is validálja. A v2.39 single-player release candidate állapotára építve a stratégiai AI most már súlyozott expert benchmarkkal, deklarációs kockázati kapukkal és nagy mintás self-play diagnosztikával is ellenőrizhető.

## v2.41 – AI quality + soak hardening + single-player polish

### AI-kalibráció
- 13 kézzel összeállított expert szcenárió, külön jogszerű / stratégiailag elfogadható / expert-best szintekkel.
- Súlyozott kategóriaértékelés, különösen a partnerkommunikáció, figuramegőrzés és csendes figurák kiemelésével.
- AI-only deklarációs feasibility gate és kockázati gate a túlzottan spekulatív bemondások ellen.
- XXI-fogás csak Skíz birtokában, a fő madárfigurákhoz erősebb kézminta szükséges.
- A kommunikációs láncok kontrolláltan enyhíthetik a kockázati küszöböt.
- Ritka/csendes figurákhoz külön advisory expert-szcenáriók tartoznak; ezek nem lazítják a release-gate-et.

### Soak / self-play
- 100–1000 leosztásra alkalmas determinisztikus soak runner.
- Worker-alapú párhuzamos futtatás; fejlesztői `--dev` mód kisebb mintákhoz.
- Automatikus mérés a bemondásokról, csendes figurákról, partneri ütésátadásról, túlvezérlésről, policy-eltérésről és újraosztásokról.
- A runner a worker befejezését explicit lezárja, így a benchmark nem marad nyitva az eredmény elküldése után.
- `--fast` profil nagyobb stabilitási mintákhoz csökkentett rollout-budgettel; ez stresszteszt, nem expert-quality gate.

### UX
- Erősebb kör/turn visszajelzés.
- Lejátszási progress és `aria-live` státusz.
- Billentyűs P (szünet/folytatás) és N (új osztás) vezérlés.
- Fókuszállapotok és tisztább státuszok.
- Mobilon 4/3 oszlopos kártyarács, nagyobb érintési célpontok, sticky toolbar.
- Kártya `aria-label`, `aria-disabled`, progressbar és mentett játékosszám/fordulószám.
- Az AI-indoklások opcionálisak.
- Biztonságos UI-hibaállapot és új osztás / új mérkőzés életciklus.

## Indítás

A fejlesztői mód Node + Vite alapú. A kiadható webverzió viszont önálló `dist/` build, ezért futáskor nincs szükség Vite-ra.

`npm run dev`

Nagy soak:

`npm run soak`

Gyorsított stress-soak (nem expert quality gate):

`npm run soak-fast`

Fejlesztői kisebb soak:

`node scripts/aiSoakParallel.mjs 16 20261005 1 --dev`

## v2.41 validáció

- Teljes JavaScript regresszió: **431/431 PASS**.
- v2.41 kalibrációs tesztek: **2/2 PASS**.
- Expert release benchmark: **13/13 jogszerű, 13/13 stratégiailag elfogadható, 13/13 expert-best, 0 tiltott**.
- Advisory ritka/csendes figurás szcenáriók: **4/4 jogszerű, 4/4 stratégiailag elfogadható, 0 tiltott**.
- 4 teljes-strength AI-leosztás: **4/4, 144/144 kijátszás, 36/36 ütés, 0 policy mismatch**.
- 8-leosztásos gyorsított stress-soak: **8/8 teljes leosztás, 288 kijátszás, 72 ütés, 0 policy mismatch**, 5 újraosztás.
- A 32+ teljes-strength soak továbbra is a jelenlegi fejlesztői végrehajtási plafonba ütközik; ezt nem tekintjük lezárt nagy benchmarknak.
- TypeScript source check: **0 új v2.41-es hiba**; a teljes strict projektben csak korábbi, exactOptionalPropertyTypes-hoz kötődő diagnosztikák maradtak.

## v2.45 – multiplayer release

- Teljes 4 játékosos end-to-end lifecycle teszt.
- `dist/` self-contained browser build; a Node authority szerver közvetlenül kiszolgálja.
- 50-szobás load smoke: 250 HTTP művelet, 50/50 kész szoba, ~357 művelet/s fejlesztői környezetben.
- Multiplayer skart-hintek az authoritative `legalSkartCards()` szabályforrást használják.
- `npm run build`, `npm run server`, `START-RELEASE.bat`.
- v2.45 release tesztek: 3/3 PASS.

## v2.43 – lobby + real-time multiplayer

- 6 karakteres szobakód és 4 üléses lobby.
- Ülésenkénti reconnect token.
- Server-authoritative HTTP action path.
- Browser WebSocket, public event fan-out és sequence-alapú resync.
- Presence/lobby frissítés push alapon.
- Automatikus kliens reconnect.
- Online UI a `src/ui/multiplayer.html` oldalon: lobby, saját kéz, licit, fektetés, partnerhívás, bemondás, kontra és kijátszás.

Indítás fejlesztői módban: `npm run server` és külön `npm run dev`, majd `http://localhost:5173/multiplayer.html`. Windows alatt a `START-MULTIPLAYER.bat` ezt a két folyamatot együtt indítja.

## v2.42 – server-authoritative multiplayer alap

- A szerver a központi authoritative állapotot kezeli; a kliens nem írhat közvetlenül GameState-et.
- A lehetséges akciók a meglévő szabálymotoron mennek keresztül.
- Minden elfogadott akció monoton sequence számot növel; stale state esetén az akció visszautasításra kerül.
- A public snapshot player-specific: csak a saját rejtett információ látható.
- A v2.42 HTTP action API-t és public event bus-t ad; a WebSocket transport a v2.43 mérföldkő.

Indítás: `npm run server` (alapértelmezett port: 8787).

### v2.42 validáció
- JavaScript regresszió: **435/435 PASS**.
- Multiplayer authority tesztek: **4/4 PASS**.
- TypeScript source check (`tsconfig.src.json`): **0 hiba**.
- HTTP smoke: **PASS**.


## v2.43 validáció

- Teljes JavaScript regresszió: **439/439 PASS**.
- v2.43 lobby/WebSocket/reconnect tesztek: **4/4 PASS**.
- v2.42 authority regresszió: **4/4 PASS**.
- TypeScript source check (`tsconfig.src.json`): **0 hiba**.
- Private room HTTP token-gate: **PASS**.
- Player-specific WebSocket snapshot: **PASS**.
- Action fan-out és sequence-alapú reconnect resync: **PASS**.

## v2.44 – persistence + production hardening ✅

- Atomic authoritative room-state persistence; restart után a sequence és a teljes leosztási állapot visszaáll.
- Reconnect tokenekből csak SHA-256 hash kerül lemezre.
- Mentési hiba esetén tranzakciós rollback.
- Inaktív room cleanup, aktív room limit, request body limit és rate limiting.
- WebSocket message-size limit, hello timeout és single-session seat lock.
- Bearer Authorization támogatás a private room HTTP endpointokon.
- A snapshot a fázisnak megfelelő soft turn-deadline-t is tartalmazza.

### v2.44 validáció

- JavaScript regresszió: **447/447 PASS**.
- v2.44 persistence + hardening tesztek: **8/8 PASS**.
- TypeScript source check (`tsconfig.src.json`): **0 hiba**.

## Roadmap státusz

- v2.45 multiplayer release: **elkészült / release candidate**.
- Következő munka már nem új roadmap-kör, hanem éles telepítéshez szükséges környezeti konfiguráció, megfigyelhetőség és valódi többfelhasználós próba.


## v2.46 – Render + Neon deployment adaptation

- `DATABASE_URL` jelenlétében a lobby Neon PostgreSQL-backed room store-t használ.
- A server action path aszinkron commitot vár a durable persistence garantálásához.
- A Node szerver startup előtt megvárja a persistence restore-t; hibás adatbázis-kapcsolat esetén nem indul félkész állapottal.
- `/health` ellenőrzi a PostgreSQL storage elérhetőségét.
- A multiplayer kliens productionben ugyanazt a hostot használja HTTP-hez és WebSockethez; a `?server=` fejlesztői override megmaradt.
- `render.yaml`, `.env.example`, `.gitignore` és `DEPLOY-RENDER-NEON.md` bekerült.

## Deployment

Render + Neon lépései: `DEPLOY-RENDER-NEON.md`.
- Render free health check: `/health`; kézi adatbázis-ellenőrzés: `/health/db`.
