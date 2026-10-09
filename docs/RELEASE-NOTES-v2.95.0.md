# Release notes — Illusztrált Magyar Tarokk 2.95.0

## Declaration targeting and public partnership signals

- Unifies the public declaration-flow view for the single-player UI, multiplayer UI, and authoritative server snapshot.
- Displays the current taker, most recent public announcement/contra signal, intended recipient while partnerships remain unclear, and the opposing pair once the partnership is public.
- Sends role-specific instructions only to the player whose turn it is; other players receive public information only.
- Enforces the speaking prerequisites: before a defence signal, a defender cannot make a figure or 8/9-tarokk declaration without first countering the game or an existing declaration; after a defence contra, the other defender may announce directly, while the hidden taker partner must publicly recontra first.
- Treats an 8/9-tarokk announcement as a public declaration signal.
- Adds rotated-seat regression tests and real legal-action tests for the contra/re-contra prerequisite and the C-pass/D-to-speak sequence.

## Verification

The targeted declaration, partnership visibility, declaration-window and multiplayer suites passed 46/46 tests. The release build was generated as 2.95.0. This release has not been deployed or browser-tested on Render; it should be verified there after upload.
