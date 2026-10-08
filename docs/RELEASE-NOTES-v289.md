# Release v2.89

## Multiplayer 5-player lobby create fix

- Capture `playerCount` and `matchRounds` before any landing-page render.
- Prevent the create flow from re-rendering the form with the default 4-player selection before the POST body is constructed.
- Disable the create button while the request is in flight.
- 5-player room selection now posts `playerCount: 5` reliably and no longer visibly flashes back to 4.
