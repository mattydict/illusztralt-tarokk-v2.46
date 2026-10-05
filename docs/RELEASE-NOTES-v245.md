# Illusztrált Magyar Tarokk – v2.45

## Multiplayer release
- End-to-end 4-player lifecycle test: lobby → WebSocket → auction → skart → partner call → declarations → 9 tricks → scoring.
- Player-specific snapshots remain hidden-information safe throughout the full lifecycle.
- Static production web build in `dist/`, served by the same Node authority server.
- `npm run build` produces a self-contained browser build without requiring Vite at runtime.
- `/health` reports 2.45 and the server serves `/`, `/index.html`, `/multiplayer.html`, JS modules and `version.json` when launched directly.

## Release hardening
- Multiplayer skart hints now reuse the same `legalSkartCards()` rule source as the authoritative action path.
- Release e2e regression covers the previously exposed illegal-skart hint mismatch.
- Load smoke: 50 rooms, 250 HTTP operations, 50/50 ready rooms, ~357 operations/sec in the development environment.

## Validation
- v2.45 release tests: 3/3 PASS.
- Multiplayer v2.42–v2.44 suite: 16/16 PASS.
- Static build smoke: PASS.
- HTTP production-entry smoke: PASS.
- TypeScript package test-suite was not rerun in this environment because npm dependency installation timed out; changed production JavaScript sources pass `node --check`.
- The broad JavaScript suite contains long-running AI tests and did not complete within the environment execution ceiling; this is recorded rather than represented as a false release-gate success.
