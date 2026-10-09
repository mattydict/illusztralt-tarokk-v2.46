# Release notes — Illusztrált Magyar Tarokk 2.94.0

## Silent-figure settlement
- Silent Trull, Four Kings, Double Game, Volát, XXI-catch, Pagát Ultimo and Sas Ultimo may be scored when completed without a declaration.
- King Ultimo, Sas Uhu, Pagát Uhu, King Uhu, Centrum, Kismadár and Nagymadár require an explicit declaration and are not scored as silent figures.
- A silent Volát suppresses only silent Double Game and silent Four Kings. Other independent silent figures, including Trull, remain payable.
- Where no silent Volát was achieved, game contra and silent Double Game are settled as separate lines, and silent Four Kings is settled alongside them when completed.
- Where a silent Volát was achieved, the game-contra line and silent Volát are settled; silent Double Game and silent Four Kings are not added separately.

## Terminology
- The user-facing label for the figure internally identified as `tuletroa` is now **Trull** in single-player and multiplayer UI.

## Declaration flow and public partnership visibility
- The taker is shown after the auction; the partner and defenders are shown only after public information identifies the partnership.
- Public signals include an invitation outcome, a non-taker's first declaration or 8/9-tarokk announcement before any defence signal, a defence contra, and a partner's recontra when required.
- Before pair identities are public, the declaration UI identifies the latest public announcement/contra and indicates whom the next announcement is addressed to.
- An unidentified defender must first signal defence with a contra. Once a defence signal exists, the second defender can declare to that player; the hidden taker's partner must recontra before making an independent declaration.

## Cache/release version
- Bumped the UI query-string version to `2.94.0` to avoid loading stale JavaScript after deployment.

## Validation
- Focused silent-figure, settlement, declaration-window, public-partnership and UI tests: 63 passed.
- Release web build succeeded.
- Full JavaScript suite still has 7 older failing tests, chiefly older auction/invit assumptions and a legacy UI/phase expectation. These are not represented as passing and remain separate follow-up work.
