# Illusztrált Magyar Tarokk – 3.0.12

## Skartolási felület

- A saját kézben egy lap kijelölése vagy kijelölésének visszavonása többé nem rendereli újra a teljes oldalt.
- A kijelölés kerete és a kijelölt lapok száma közvetlenül frissül, így a nézet a kártyáknál marad ahelyett, hogy a talon-információhoz ugrana.
- Multiplayerben a Fektetés gomb engedélyezése és számlálója a kijelöléshez igazodik.

## Nyitott szobába lépés

- Minden nyitott szoba saját névmezőt kap közvetlenül a „Belépés” gomb mellett.
- A csatlakozás az adott sorban megadott nevet használja.
- A név megmarad a szobalista öt másodpercenkénti frissítése közben; a fókusz és a gépelési kurzor pozíciója is helyreáll.
- Mobilnézetben a névmező és a gomb egymás mellett, az adott szobakártyán belül jelenik meg.

## Ellenőrzés

- `npm run build`: sikeres.
- Célzott multiplayer / lobby / szinkronizációs regressziós tesztek: 20/20 sikeres.
- Új, 3.0.12-es felületi regressziós tesztek: 2/2 sikeres.
- `node --check` a módosított futásidejű JavaScript fájlokon: sikeres.
- A teljes TypeScript-ellenőrzés továbbra is meghiúsul a projektben található meglévő típusproblémák és hiányzó Node-típusok miatt (256 diagnosztika). A `src/ui/main.ts` más, korábban is meglévő részein vannak hibák; a most módosított skartkijelölési sorokhoz nem jelzett külön hibát.
- Böngészős vizuális teszt és éles deploy nem történt.

## Élő, Béla nevű szoba

A 3.0.12-es csomag nem zár le élő szobát, és nincs is benne adminisztratív szobatörlő végpont. Az éles példány kezeléséhez Render-, az adatbázisban tárolt szoba biztonságos eltávolításához pedig Neon-hozzáférés szükséges. Az élő szoba státuszát nem tudtam ellenőrizni, ezért nem állítom, hogy bezártam.
