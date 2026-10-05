# v2.42 – Server-authoritative multiplayer alap

A v2.42 bevezeti a multiplayer szerveroldali játékalapot a single-player motor újraírása nélkül.

## Elkészült

- In-memory authoritative room modell, egyetlen szerveroldali szabályforrással.
- Aukció, fektetés, partnerhívás, bemondás, kontra és kijátszás szerveroldali validációja.
- Optimistic concurrency / stale-sequence védelem minden akció előtt.
- Eseményalapú public event bus; a WebSocket transport szándékosan a v2.43 része.
- Player-specific snapshot: csak a saját kéz, saját talonrész és saját skart látható; a másik játékos rejtett lapjai és a nyers talon nem kerülnek a kliensnézetbe.
- In-memory HTTP API (`server/main.mjs`) szobanyitással, snapshot-tal, event feeddel, connect/disconnecttal és action POST-tal.

## Tudatos határok

- A v2.42 még nem perzisztál meccset.
- A v2.42 még nem használ WebSocketot.
- A v2.42 jelenleg 4 aktív multiplayer játékost támogat; a forgó 5. játékosos mérkőzéslogika későbbi multiplayer réteg.
- Auth / accounts / rate-limit / abuse protection a v2.44 hardening része.
