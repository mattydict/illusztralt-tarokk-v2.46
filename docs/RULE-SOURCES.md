# Szabályforrások – v0.9

Elsődleges forrás: ITVB Illusztrált Tarokk Versenyszabályzat.
Kiegészítő háttér: Tarokk-Őr és részletes Illusztrált Tarokk anyagok.

## Most implementált szabálypontok
- 8.2: lekötött lapokat minden esetben a lekötés sorrendjében kell lehívni.
- 8.4: egy bemondás bukott, amikor a negyedik játékos is letette a lapját.
- 9. §: felvevő pár minimum 48, ellenpár legalább 47 ütésértéknél nyer.

## Források
- https://www.tarokk.hu/T_versenyszabalyzat.php
- https://tarokk.hu/T_tajekoztatok/Illusztralt_versenyszabalyzat.pdf
- https://tarokk.hu/T_dokumentumok/TAROKK_or.pdf

### Declaration restrictions added in v0.13

The declaration validator implements the following sourced restrictions:
- ITVB 7.2: after volát, tulétroá, four kings and double game cannot be declared.
- ITVB 7.3: an announced ultimo cannot be raised to uhu.
- ITVB 7.13: members of a pair may make only one declaration on the same trick.
- ITVB 7.14: a pair may not repeat an already declared figure.

## 2026-10-03 implementation note

The bidding engine explicitly models the honourless Three exception: if every other active player has passed, the final player may announce Three without an honour. The contract is valid only if the talon contains at least one honour; otherwise the deal is void and must be redealt. This is documented in TAROKK-ŐR and the Illusztrált Tarokk rules. The honourless bid is represented separately from an ordinary Three so the UI/AI can announce the exception explicitly.

## Communication-model notes added in v0.47

The communication engine distinguishes formal ITVB conventions from practical inference.

- Trull + four kings is a high-tarokk signal in the relevant declaration context whether the Trull was declared by the speaker or by the speaker's partner.
- The same combination also carries a strong-tarokk-strength implication. The normal inference is at least five tarokks; exceptionally, a very strong starter may communicate similarly with four tarokks. This is modeled probabilistically, not as a hard ownership rule.
- Four kings without a preceding Trull is treated as general encouragement rather than a fixed high-tarokk signal: good hand / invitation to consider further figures (especially ultimo/uhu or double game, only exceptionally XXI fogás).
- Omission is evidence, not proof. In particular, examples in Tarokk Akadémia and the illustrative game collections reason from not saying four kings, from whether a four-kings declaration was contradicted, and from the interaction of Centrum with the declaration sequence.

## Communication model update (v0.49)

- Trull + four kings is treated as a partner-level XIX communication in the implementation, regardless of which partner announced the Trull.
- Four kings without Trull is an encouragement signal, not a fixed-card signal.
- Trull + four kings also increases the inferred probability of a strong tarokk holding; the ordinary five-tarokk threshold is represented as convention/evidence rather than hard ownership. Rare four-tarokk starter cases remain possible.
- Later declarations (Centrum, double game, etc.) are modeled as additional evidence and are not allowed to erase the base communication event.

## Pair figures: Centrum / Kismadár / Nagymadár

The engine treats these as Trull-following pair figures. The official competition
rules define the objectives: Centrum requires the declaring side to take the first
five tricks and make the fifth with XX; Kismadár the first six with XXI; Nagymadár
the first seven with Skíz. The Tarokk Akadémia examples further show that these
figures depend on the distribution and seating of the high tarokks; rare "lyukas"
forms are therefore modeled as explicit positional exceptions rather than as the
AI's default assumption. The target card is owned by the declaring pair because
that pair must actually play it on the deadline trick.


## 2026-10-03 implementation note – v0.59

The round flow now has an explicit `partner-call` phase after fektetés when the auction did not already determine the called tarokk. This prevents the game from becoming stuck between skart and declarations. A fixed invited tarokk bypasses this phase and resolves the partner automatically when the post-skart hand makes the holder unambiguous.

The UI declaration context also derives the communication state from the actual declaration history: a previously announced Trull becomes shared context, while the rare taker-led XIX + intentional Trull omission path can expose Centrum without giving the player hidden access to the partner's hand.

## v1.08 implementation note — Uhu → silent Ultimo

The declaration lifecycle models ITVB 7.6 together with 8.3: when an Uhu's locked target card is played by the declarer on the final trick, that performance is recorded as a silent Ultimo; if the card is caught, the silent Ultimo is recorded as failed. A previously failed Uhu is not converted into a later silent Ultimo. The implementation currently recognizes this through the 8-trick final-trick case, preserving the rule distinction needed for the 3-player form.


## Communication-chain implementation notes

- v1.48: communication state reconstruction is chronological across Trull -> Four Kings -> Centrum/Kismadár/Nagymadár -> Double; later declarations no longer rewrite earlier Four Kings signals.
- v1.48: Kismadár/Nagymadár progression consumes the corresponding lower communication rung so subsequent Double signals continue downward rather than restarting.

### v1.74 – figura-szerkezet és lyukas figurák

- Az ITVB 4.3 szerint a Trull utáni Négykirály a nem ismert / más bemondással be nem jelenthető legnagyobb lapot jelenti; példaként az XX-hívás → XIX, invit → XX, illetve XIX tulétroá → XVII szerepel.
- Az ITVB 4.7–4.9 a Centrum/Kismadár/Nagymadár objektív ütésfeltételeit rögzíti: 5. ütés XX, 6. ütés XXI, 7. ütés Skíz.
- A Tarokk Akadémia és a Pagat példapartijai azt mutatják, hogy a klasszikus magas-tarokk szerkezet fontos konvencionális támpont, de különleges eloszlásban lyukas figura is megvalósulhat. A Pagat 6. példajátszmája kifejezetten „XIX-es és XVII-es nélkül megjátszott kismadár”.
### v1.86 – AI-fektetési stratégia

A fektetés továbbra is a szabályos `isForbiddenSkart`/`legalSkartCards` ellenőrzés alatt marad. Az AI erre épülő stratégiai rétege a lehetséges lapok között értékel: elsősorban a pontértékes, de kevésbé értékes kontrolllapokat választja, miközben óvja a tarokk-kontrollt és figyelembe veszi a skart előtti színhosszokat. Ez döntési konvenció, nem új szabályi korlátozás.

