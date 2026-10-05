# Illusztrált Magyar Tarokk – fejlesztési roadmap

## Hol tartunk – v2.41

```text
SZABÁLYMOTOR ────────────────  ████████████████████  100%
LICIT / FEKTETÉS ────────────  ████████████████████  100%
BEMONDÁS / KONTRA ───────────  ████████████████████  100%
PARTNERKOMMUNIKÁCIÓ ─────────  ████████████████████  100%
CSENDES FIGURÁK ─────────────  ████████████████████  100%
STRATÉGIAI PLAY AI ──────────  ████████████████████  98%
AI MINŐSÉG-KALIBRÁCIÓ ───────  ████████████████████  99%
SINGLE-PLAYER TERMÉK ────────  ███████████████████░  92%
ONLINE AUTHORITY ─────────────  ████████░░░░░░░░░░░░  40%
LOBBY / REAL-TIME / RECONNECT  ░░░░░░░░░░░░░░░░░░░░    0%
```

## Elkészült mérföldkövek

### v2.36 – nyilvános kártyaszámolás és végjáték-kontroll ✅
- Observer-relative card memory.
- Magasabb tarokkok és színlapok nyilvános kizárása.
- Biztos kontroll felértékelése a végjátékban.

### v2.37 – expert szcenárió-kalibráció ✅
- 13 célzott benchmark-szcenárió.
- Jogszerű / stratégiailag elfogadható / expert-best szintek.
- 13/13 expert-best, 0 tiltott döntés.

### v2.38 – nagy mintás self-play / soak infrastruktúra ✅
- 100–1000 leosztásos determinisztikus benchmark API.
- Worker-alapú párhuzamos futtató és fejlesztői kisebb minta.
- Bemondás, csendes figura, partneri együttműködés, túlvezérlés és újraosztás metrikák.

### v2.39 – single-player release candidate ✅
- 4/5 játékos, 1–50 forduló, AI nehézség: Gyakorló / Normál / Expert.
- Szünet/folytatás, új osztás, új mérkőzés.
- Opcionális AI-indoklás.
- Biztonságos UI-hibaállapot.

### v2.40 – AI-kalibráció + soak + UX polish ✅
- Súlyozott expert benchmark kategóriák.
- AI deklarációs feasibility- és kockázati gate.
- 16-leosztásos fejlesztői soak: 16/16 teljes leosztás, 0 végső hiba.
- 428/428 JavaScript regresszió PASS.
- TypeScript source check: 0 hiba.
- Turnus-visszajelzés, progress, aria-live státusz, P/N billentyűvezérlés, fókuszpolírozás.

## Következő mérföldkövek

### v2.41 – utolsó AI/UX polish ✅
- Kismadár és ritka/csendes figurák advisory kalibrációja; a release-gate külön maradt.
- Gyorsított stress-soak profil és worker hardening.
- Mobil/keskeny kijelzős UX, 4/3 oszlopos kártyarács, érintési célpontok.
- Licit/bemondás affordance, aria progressbar, kártya accessibility attribútumok.
- 431/431 JavaScript regresszió PASS.

### v2.42 – server-authoritative multiplayer alap ✅
- Központi szerveroldali GameState / RoundState authority és szabályvalidáció.
- Eseményalapú akciótovábbítás public event busszal; WebSocket a v2.43-ban.
- Player-specific hidden-information snapshot, raw talon és ellenfél-kezek nélkül.
- Stale-sequence / optimistic concurrency védelem.
- In-memory HTTP authority API.

### v2.43 – lobby és real-time play ✅
- Szobakód-alapú lobby, 4 üléses szoba és automatikus helyosztás.
- Per-seat reconnect token; a token nélküli private room HTTP endpointok elutasítják a hozzáférést.
- Böngészőből használható WebSocket kapcsolat külső `ws` függőség nélkül.
- Player-specific welcome, event fan-out és resync a szerver sequence alapján.
- Lobby/presence frissítés push alapon.
- Automatikus kliens reconnect exponenciális visszalépéssel.
- Online multiplayer UI: szobanyitás, csatlakozás, saját kéz, szerveroldali akciók és élő állapot.
- 439/439 JavaScript regresszió PASS; TypeScript source check: 0 hiba.

### v2.44 – perzisztencia és production hardening ✅
- Authoritative room-state atomic JSON persistence; restart utáni state-resume sequence- és hidden-information megőrzéssel.
- Reconnect tokenek csak SHA-256 hash formában kerülnek lemezre.
- Atomic temp-file + rename mentés, mentési hiba esetén rollback.
- Inaktív room cleanup és aktív room-count limit.
- HTTP request body limit + 429 rate limiting.
- WebSocket message-size limit, hello timeout, egy játékoshoz egy aktív WebSocket session.
- Production-hardening negatív tesztek.

### v2.45 – multiplayer release
- End-to-end teszt.
- Terheléses próba.
- Release candidate és élesíthető webes verzió.


## Reális távolság

**Single-player AI:** release-candidate / jól kalibrált állapot. További AI-javítások már célzott regressziós feladatok, nem külön roadmap-körök.

**Multiplayer MVP:** kb. 4 további nagyobb technikai kör a v2.42–v2.45 sávban.

**Production-közeli multiplayer:** kb. 4 nagyobb kör a multiplayer indulásától.

## v2.42 validáció

- Authoritative server source check: **0 TypeScript hiba**.
- JavaScript regresszió: **435/435 PASS**.
- Multiplayer authority célzott tesztek: **4/4 PASS**.
- HTTP smoke: **PASS** (room create, player-specific snapshot, authoritative auction action).
- Rejtett információ ellenőrzés: másik játékos keze és nyers talon nem kerül a kliensnézetbe.
- Stale action protection: elavult sequence-szel érkező akció visszautasítva.


## v2.43 validáció

- TypeScript source check: **0 hiba**.
- Teljes JavaScript regresszió: **439/439 PASS**.
- Lobby / WebSocket / reconnect célzott tesztek: **4/4 PASS**.
- v2.42 authority regresszió: **4/4 PASS**.
- WebSocket action fan-out és sequence-alapú reconnect resync: **PASS**.
- Private room HTTP endpointok token nélküli hozzáférése: **elutasítva**.

## v2.44 validáció

- Teljes JavaScript regresszió: **447/447 PASS**.
- v2.44 persistence + hardening tesztek: **8/8 PASS**.
- TypeScript source check (`tsconfig.src.json`): **0 hiba**.
- Restart / state-resume: **PASS**; sequence és hidden-information state visszaáll.
- Token storage: **PASS**; csak SHA-256 hash kerül lemezre.
- Atomic rollback: **PASS**; mentési hiba esetén az action és sequence visszaáll.
- HTTP body limit / rate limit: **PASS**; 413 / 429 helyes válasz.
- Legacy API gate és Bearer auth: **PASS**.
- Duplicate WebSocket session hardening: **PASS**.
- Soft turn deadline metadata: **PASS**.
