# Illusztrált Magyar Tarokk – v2.39

v2.39 a single-player release candidate mérföldköve. A szabálymotor és a stratégiai AI változatlan authoritative rétegére épül, a böngészős felhasználói életciklus és a játékos számára látható AI-beállítások kerültek most közelebb a kiadható állapothoz.

## Újdonságok

- 4 vagy 5 játékosos mérkőzés, 1–50 forduló.
- AI mód: Gyakorló / Normál / Expert. Expert a teljes stratégiai politikát használja; az alacsonyabb módok jogszerű alacsonyabb rangú stratégiai jelöltet választhatnak.
- AI szünet / folytatás a lejátszásban, aszinkron lépésközökkel.
- Új osztás az aktuális mérkőzés állapotának megtartásával.
- Új mérkőzés / restart.
- Biztonságos UI hibakezelés és explicit hibakártya.
- Opcionális legutóbbi AI-indoklás.
- UI beállítások LocalStorage-ban.

## Validáció

- JavaScript regresszió: **423/423 PASS**.
- v2.39 difficulty tesztek: **3/3 PASS**.
- TypeScript source check (`tsconfig.src.json`): **0 hiba**.
- Böngésző entry TypeScript-emittálása és JS syntax check: **PASS**.

A teljes TypeScript teszt-suite jelen fejlesztői környezetben nem tekinthető megbízható release gate-nek, mert a csomagfüggőségek telepítése nem fejeződött be; a futás hibái között hiányzó `node:test`/Node típusdefiníciók és korábbról meglévő strictness-ütközések szerepelnek.

## Következő mérföldkő

v2.40 az online multiplayer server-authoritative alap: a kliens jelenlegi közös motorállapota mögé központi GameState és szerveroldali szabályvalidáció kerül.
