# Illusztrált Magyar Tarokk – v2.44

v2.44 a multiplayer szerver tartósságát és production hardeningjét zárja le.

## Persistence
- A teljes authoritative room-state JSON formában perzisztálható.
- A szerver újraindítása után a leosztás és sequence visszaáll, a hálózati kapcsolatok viszont szándékosan offline állapotból indulnak.
- A reconnect tokenekből csak SHA-256 hash kerül lemezre.
- A mentés atomic temp-file + rename művelet.
- Ha egy action mentése hibázik, a room állapota visszagördül a commit előtti állapotra.

## Hardening
- HTTP request body limit (alapérték 64 KiB).
- HTTP rate limiting (alapérték 240 kérés/perc/kliens).
- WebSocket message-size limit (32 KiB).
- Hello handshake timeout.
- Egy játékoshoz egyidejűleg csak egy WebSocket session tartható.
- Inaktív room cleanup és aktív room limit.

## Validáció
- Persistence / restart / atomic rollback tesztek.
- HTTP 413 body-limit teszt.
- HTTP 429 rate-limit teszt.
- Duplicate WebSocket session teszt.
