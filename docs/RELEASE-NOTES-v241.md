# Illusztrált Magyar Tarokk – v2.41

## Cél
v2.41 lezárja a multiplayer előtti AI/UX finomítási szakaszt. A fókusz a ritka figurák kalibrációja, a soak futtatás hardeningje és a keskeny/mobil felület használhatósága.

## AI
- A 13 esetből álló release-gate benchmark változatlan maradt: 13/13 expert-best.
- 4 ritka/csendes figurás advisory szcenárió került külön katalógusba, így ezek nem lazítják a release-kaput.
- A Pagát/Sas Ultimó saját célkártyájának korai elhasználása erősebb negatív jelzést kap, amikor az még nem szükséges.

## Soak
- Opcionális rollout-budget paraméterezés került a teljes leosztás-szimulátorba.
- A párhuzamos runner `--fast` profilt kapott nagyobb stabilitási mintákhoz.
- 8-leosztásos gyorsított stress-soak: 8/8 teljes leosztás, 0 végső hiba, 0 policy mismatch.
- 4 teljes-strength leosztás: 4/4, 144 kijátszás, 36 ütés, 0 policy mismatch.
- 32+ teljes-strength soak a jelenlegi fejlesztői 300 mp-es korlát miatt nem zárható le ezen a környezeten.

## UX
- Mobilon kártyarács és nagyobb touch targetek.
- Sticky toolbar.
- Több accessibility attribútum a kártyákon és a progress indikátoron.
- Játékosszám és fordulószám megőrzése localStorage-ban.
- Egyértelműbb „Te jössz” visszajelzés.

## Validáció
- 431/431 JavaScript regresszió PASS.
- 13/13 release benchmark expert-best.
- 4/4 advisory scenarió stratégiailag elfogadható.
- 2/2 új v2.41 célzott teszt PASS.
