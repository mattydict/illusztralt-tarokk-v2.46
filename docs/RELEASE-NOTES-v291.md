# Release notes — v2.91.0

- Added the 42 supplied illustrated card faces as optimized WebP assets in `src/ui/cards/` and the release bundle at `dist/cards/`.
- Replaced text-only face rendering with card images in the hand, current trick, last completed trick, revealed taker skart and multiplayer talon/skart displays.
- Kept game-engine card IDs and rules unchanged. The UI displays the illustrated deck's low red-suit cards as Aces while mapping their existing internal IDs to the Ace images.
- Added a regression test checking that all 42 engine cards map to one unique available image.
- Card assets are copied independently during release build so ordinary rules/AI updates do not require recompression or remapping.
