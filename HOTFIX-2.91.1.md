# Illusztrált Tarokk v2.91.1 — blank multiplayer page hotfix

This hotfix is intended for a project already updated to v2.91 (with the 42 illustrated card images installed).

## Fixes
- Fixes the blank multiplayer page when the browser has no valid saved player session. The landing renderer no longer reads game-only variables before drawing the lobby form.
- Fixes release cache-busting so generated asset URLs use the exact package version (for example `v=2.91.1`, not `v=2.91.1.1`).

## Apply
1. Make a backup of the current v2.91 repository.
2. Extract `illusztralt-tarokk-v2.91.1-hotfix.zip` over the root of the existing v2.91 project and allow the listed files to be replaced.
3. Commit and push the changes to GitHub so Render redeploys them.
4. After deployment, open `/multiplayer.html` and do a hard refresh (`Ctrl+F5`). The card-image files do not need to be uploaded again.

No game rules, bidding, scoring, or card assets were changed by this hotfix.
