# Patch 3.0.2 — Korábbi partik böngészője

## Új felület
- A multiplayer lobbyban és az aktív játék képernyőjén megjelent a **Korábbi partik** gomb.
- A felület a kiválasztott szobához tartozó, lezárt partik archívumát kéri le a már meglévő, tokennel védett API-n keresztül.
- A lista megjeleníti a parti sorszámát, időpontját, felvevőjét, szerződését, a teljesült és bukott bemondások számát, valamint az eredményt.
- Kliensoldali keresés használható a parti sorszámára, szerződésére, szobakódjára és játékosnevekre.
- Egy archivált parti a meglévő részletes visszanézőben nyílik meg; a régi játékosneveket az archívumból olvassa.
- Az archívum betöltése és az egyes partik lekérése hibajelzést ad, és nem változtat a játékmenet állapotán.

## Tárolás és biztonság
- Nem jött létre új adatbázis: a 3.0.1-ben bevezetett JSON-/PostgreSQL-archívum és végpontok használatban maradnak.
- A lista és a részletes rekord továbbra is csak az adott szoba egyik résztvevőjének érvényes tokenjével érhető el.
- A partiarchívum tanulóadatbázis-feldolgozása és az AI stratégiai tanítása továbbra is külön fejlesztési egység.

## Ellenőrzések
- `node --check src/ui/multiplayer.js` — sikeres.
- Archívum- és parti-visszanéző céltesztek: 7/7 sikeres.
- JavaScript tesztcsomag: 648 ellenőrzésből 635 sikeres, 13 korábbi licit-/UI-regressziós teszt továbbra is hibás.
- `npm run build` — sikeres.
- A Chromium-alapú végponttól végpontig tartó smoke teszt időtúllépés miatt nem tekinthető sikeresnek, ezért valós böngészős működést nem minősítek teljes körűen igazoltnak.
