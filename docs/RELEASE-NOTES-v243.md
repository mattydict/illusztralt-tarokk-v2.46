# Illusztrált Magyar Tarokk – v2.43

## Multiplayer lobby és real-time play

A v2.43 a v2.42 server-authoritative magjára épülve hozzáadja a használható online multiplayer első rétegét.

### Lobby
- 6 karakteres, jól megosztható szobakód.
- 4 fix ülés (`P1`–`P4`) és automatikus szabadhely-kiosztás.
- Játékosnév és jelenléti állapot.
- A játék csak 4 csatlakozott és online játékossal jelölhető késznek.

### Reconnect és hitelesítés
- Minden üléshez külön reconnect token tartozik.
- A private room snapshot / event / action HTTP endpointok token nélkül nem használhatók.
- A token birtokosa ugyanahhoz az üléshez újra csatlakozhat.
- WebSocket bontás után a kapcsolat automatikusan újraépíthető.

### WebSocket
- Standard browser WebSocket handshake.
- Text frame, ping/pong és close támogatás.
- Üzenetek: `hello`, `welcome`, `event`, `action`, `action-accepted`, `action-rejected`, `resync`, `lobby`, `error`.
- Minden játékos saját, rejtett-információt nem szivárogtató snapshotot kap.

### Online UI
Az `src/ui/multiplayer.html` oldalon elérhető a lobby és a játékablak. A kliens a szerver által megadott `legalActionHints` alapján jeleníti meg az adott fázisban releváns akciókat, de az authoritative szerver minden akciót újra validál.

## Validáció
- Multiplayer authority regresszió: 4/4 PASS.
- Lobby/WebSocket regresszió: 4/4 PASS.
- Teljes JavaScript regresszió: 439/439 PASS.
- TypeScript source check: 0 hiba.

## Következő mérföldkő
v2.44 – perzisztencia és production hardening.
