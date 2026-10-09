# Release notes — v2.91.2

## Multiplayer presence hotfix

- Player credentials are stored in `sessionStorage`, isolated per browser tab, rather than one shared `localStorage` key. This prevents multi-window testing from overwriting another player's session.
- The UI distinguishes an open WebSocket transport from a completed server-authenticated `welcome`/`resync`.
- Manual synchronization reopens an unauthenticated WebSocket, and late close events from replaced sockets are ignored.
- Server-side cleanup marks a seat offline only when no replacement authenticated socket remains for that seat.
- Failed hello/authentication handshakes are closed after the error response instead of remaining open but unregistered.

After deploying this version, start a **new test room** for multi-window testing; the earlier shared localStorage session is intentionally not migrated because it can only represent one of the tabs' players.
- Completed the table/seat/event-log render variables that were referenced by the 2.91.1 template but not defined; the UI now has concrete seat positions, current-trick label, dealer note, and a public-event list before the lobby transitions into gameplay.
