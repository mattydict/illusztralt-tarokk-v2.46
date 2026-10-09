# Illusztrált Magyar Tarokk – 2.93.0 invit- és licitfrissítés

Ez a javítócsomag a korábban átadott 2.91.2-es projekt frissítésére készült. Tartalmazza az azóta beépített 2.92-es bemondási/elszámolási módosításokat is, majd a 2.93-as invit- és licitjavításokat.

## Változások

- Implementálja és regressziós tesztekkel lefedi mind a 13 megadott XX/XIX/XVIII invitfelállást.
- Az XX-invit a Három–Kettő–Engedés/Passz mintát használja, a XX, a nagyhonőr és a legalább öt tarokk feltételével.
- Jelöli a nyitó Kettő/XIX és Egy/XVIII invitjelzéseket, a tartásos/licitbeli invitfogadást és a folyamatban lévő XIX-invitben elhangzó Szólót.
- A licit UI magyar felirata külön jelzi az invit típusát, a partnerhívó Engedést és az invit fogadását.
- Az AI invitértelmezése az XX-engedést is partnerhívó akcióként ismeri fel.
- Az ülésrend nincs A/B/C betűkhöz kötve; a licitmenetek az aktuális játékossorrend szerint futnak.
- Tartalmazza a korábbi 2.92-es csendesfigura- és bemondási javításokat, hogy a patch közvetlenül a 2.91.2-es változatról is használható legyen.

## Telepítés GitHub + Render esetén

1. Készíts biztonsági másolatot a projektedről.
2. Csomagold ki a patch teljes tartalmát a projekt gyökérkönyvtárába, engedélyezve a fájlok felülírását.
3. Töltsd fel/commitold a módosított fájlokat a GitHubra.
4. Várd meg a Render build és deploy sikeres lefutását.
5. Nyisd meg újra a multiplayer oldalt, és használd a Ctrl+F5 gyorsítótár-frissítést.

A Render build újragenerálja a `dist/` mappát a `package.json` 2.93.0 verziója alapján. A patch nem tartalmazza a `dist/` könyvtárat, és a 2.91.2-ben már meglévő, változatlan `src/ui/cards/` kártyaképeket sem; ezek a teljes 2.91.2-es projektben már megtalálhatók.

## Ellenőrzés

A célzott invit-, licit-, AI-, csendesfigura- és elszámolási tesztek 107/107 eredménnyel sikeresek. A release web build és a releváns JavaScript szintaktikai ellenőrzések sikeresek. A teljes TypeScript-ellenőrzés a projekt több, ettől függetlenül fennálló típushibája miatt továbbra sem sikeres; a Renderen végzett élő tesztet ez a csomag nem tartalmazza.
