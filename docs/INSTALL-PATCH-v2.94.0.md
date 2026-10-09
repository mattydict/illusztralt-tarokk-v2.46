# Installing the 2.94.0 patch

1. Make a backup of the current 2.93 project.
2. Extract this patch into the project root, preserving folder paths and allowing files to be overwritten.
3. Check that `package.json` reports `2.94.0` and that `src/ui/index.html` and `src/ui/multiplayer.html` use `v=2.94.0`.
4. Commit and push the updated files to GitHub. Render should rebuild the release from the repository.
5. After deployment, open the app and multiplayer page with Ctrl+F5. Check one silent-Volát hand and one declaration sequence before relying on scoring.

The patch contains only files changed or added relative to 2.93.0. It does not contain unchanged card artwork.
