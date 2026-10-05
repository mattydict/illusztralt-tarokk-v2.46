# Illusztrált Magyar Tarokk v2.47

## Multiplayer javítások

- A kéz UI szín szerint csoportosítja a lapokat, színen belül csökkenő sorrendben, kontrasztos háttérrel.
- A multiplayer licitben teljes kéznél csak honőrrel lehet licitálni; honőr nélkül csak passz lehetséges, kivéve a szabály szerinti utolsó honőr nélküli Hármas-kivételt.
- Az invit csak a megfelelő cél-tarokk, legalább öt tarokk és XXI/Skíz nagyhonőr együttes feltételeivel adható.
- A Tartom-jog az első licitálónál marad; háromra Tartom nem adható. Ha a tartási jogosult passzol, a jog a következő licitálóhoz kerül.
- 3–2–Tartom után a második licitáló Egyesig léphet tovább; a Szóló nem jelenik meg tévesen.
- A fektetés multiplayerben párhuzamos: minden online játékos a saját talonjától függetlenül fektethet.
- Egy játékos offline állapota nem blokkolja a többiek fektetését.
- Minden fektetés után csak az adott játékos saját adatai maradnak privátak; a felvevő tarokkos fektetése csak mind a négy fektetés lezárása után kerül nyilvánosságra.
- A fektetés bemondása automatikusan elindul, amikor mind a négy játékos végzett.

## Ellenőrzés

- TypeScript: sikeres (`tsconfig.src.json`)
- JavaScript regressziós tesztek: 457/457 sikeres
- Release build: sikeres
- AI soak-fast futás: sikeres
