# Patch 3.0.1 — Parti-visszanéző és tartós partiarchívum

## Parti-visszanéző
- A parti összefoglalója tartalmazza a felvevőt, a felvevő partnerét és az ellenpárt.
- Rögzíti a licit-/partnerhívási lépések sorrendjét és a lépést tevő játékost.
- Megjeleníti a bemondásokat, azok tulajdonosát, kontraállapotát, teljesülését vagy bukását, valamint a rögzített csendes figurákat.
- A visszanéző az elszámolás tételeit és a kilenc ütést is megőrzi.

## Tartós archívum
- A lezárt partik a szoba aktuális állapotától független tárolóba kerülnek.
- PostgreSQL esetén a `tarokk_deal_archive` tábla tárolja őket; JSON-alapú helyi tárolásnál az `archive` alkönyvtár.
- A szoba takarítása nem törli a lezárt partik archívumát.
- Az archívum rekordjai idempotensen mentődnek a szobaazonosító és a parti sorszáma alapján.
- Új API-végpontok: `GET /archives?roomId=...&playerId=...&limit=100` (összesített lista) és `GET /archives/:roomId/:dealNumber?playerId=...` (részletes rekord). Mindkettőhöz az adott szoba egyik résztvevőjének érvényes tokenje szükséges; a token hash-e az archívummal együtt tárolódik, a nyers token nem.

## Megjegyzés
A jelenlegi kiadás rögzíti és lekérhetővé teszi az adatokat; az archív partikat böngésző UI és a single player AI tanulási/elemzési folyamata külön következő fejlesztési egység.
