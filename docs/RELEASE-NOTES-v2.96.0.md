# Illusztrált Magyar Tarokk – 2.96.0

## Javítások

- A bemondott figurák nem kapnak automatikusan `silent` jelölést pusztán azért, mert egy lekötött figurával azonos ütésben teljesülnek. Ez megőrzi a bemondott Volát, Trull, Duplajáték és Négykirály állapotát az elszámolásban és a felületen.
- A multiplayer állapotképe a játék közben ténylegesen fogyó `game.players[].hand` listából számítja a kéz méretét és a saját lapokat; a kiosztáskori `round.players[].hand` csak a játék létrehozása előtt szolgál forrásként.
- A „Saját kéz” a megmaradt lapokat mutatja. A legális kijátszások kiemelése ettől külön működik: a kézben maradó, de éppen nem kijátszható lapok is látszanak.

## Ellenőrzés

- Célzott JavaScript regressziós tesztek: 47/47 sikeres.
- Release build: sikeres.
- A teljes JavaScript tesztfutás a környezeti futási időkorlát miatt nem fejeződött be.
- A teljes TypeScript-ellenőrzésben korábbról fennálló hibák maradtak más modulokban; ezért a teljes projekt típusellenőrzése nem tekinthető hibamentesnek.
