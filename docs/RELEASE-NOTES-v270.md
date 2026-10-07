# v2.70 — Single-player test / AI and UI alignment

## Single-player UI
- A multiplayer-aligned visual language is used for the single-player table and card hand.
- The event log is promoted to the top of the game view.
- AI bids, declarations, partner calls, skart decisions and card plays are logged explicitly.
- AI actions are deliberately paced so the human player can read and process the table state.

## State-flow alignment
- Single-player uses the multiplayer parallel skart state model.
- The taker does not receive a separate skart-tarokk announcement turn; public disclosure is handled by the round engine.
- Non-taker players who discarded tarokks use the shared skart-announcement subphase.
- Human declarations are never generated or executed automatically.

## AI partner call
- Without a fixed invite, XX is the default partner call.
- XIX is only selected automatically when the taker holds XX (or when an explicit XIX invite fixes it).
- The stale v2.35 partner-call regression expectations were updated accordingly.

## AI strategy calibration
- Added an opportunity-cost guard so marginal ordinary bids do not beat Passz by tiny score differences.
- The adjustment preserves strong literature-based conventions such as XXI defensive holding, Skíz pressure and genuine invites.
- The calibration is informed by the Illusztrált Tarokk rules and examples, including the distinction between ordinary XX calls, invites and XX-in-hand partner calls.

## Play convention
- When the opposition has a live Ultimó/Uhu, defensive AI prefers a colour lead instead of an automatic tarokk lead; for king figures it preferentially attacks the declared king's suit.
