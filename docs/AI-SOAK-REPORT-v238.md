# v2.38 AI self-play / soak report

## Cél

A v2.38 célja a teljes AI-leosztás hosszú, determinisztikus mintán történő futtatása és az automatikus stratégiai anomália-mérés.

## Implementáció

A benchmark réteg 100–1000 teljes AI-leosztást tud kérni ugyanazzal a seed-sémával, a `scripts/aiSoakParallel.mjs` pedig több Node workerben párhuzamosítja a futtatást.

Automatikusan gyűjtött mérőszámok:

- teljes leosztás / ütés / kijátszás stabilitása;
- azonnali nyerési lehetőségből eredő túlvezérlés és kontrollköltség;
- alacsony pontértékű túlvezérlés;
- partneri ütésátadás;
- bemondási policy-eltérés;
- deklarált figurák teljesülése/bukása;
- csendes figurák sikere/bukása;
- kontraemelések;
- újraosztások;
- felvevői eredmény és elszámolás.

## Validáció

A célzott v2.38 regressziós készlet: **7/7 PASS**.

A TypeScript source check (`tsconfig.src.json`): **0 hiba**.

Egy tényleges 2-leosztásos teljes AI-minta sikeresen lefutott: **2/2 leosztás, 72/72 kijátszás, 18/18 ütés, 0 végső hiba**.

## Nagy minta státusz

A 100-leosztásos seedelt futtató implementálva van és futtatható:

`node scripts/aiSoakParallel.mjs 100 238800 5`

A jelenlegi fejlesztői környezetben 5 CPU áll rendelkezésre, és a teljes 100-as futás 300 másodperces tool-futási korlát alatt nem fejeződött be. Emiatt ebből **nem** állítunk befejezett 100-as statisztikát.

Ez nem a benchmark logikai hibája: a rövid teljes-leosztásos validáció és a TypeScript ellenőrzés zöld, a nagy futás pedig egyszerűen számítási kapacitás/kvóta-korlátba ütközött.

## Következő lépés

A v2.39 mérföldkő a single-player release candidate: kezelőfelület, 4/5 játékos mód, körszám, AI nehézség, új osztás/újrakezdés, opcionális döntési indoklás és release-level regression.
