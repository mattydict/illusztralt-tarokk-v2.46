# Illusztrált Magyar Tarokk – 3.0.10

## Javítás

- Visszavontuk a 3.0.9-ben bevezetett kivételt, amely lehetővé tette, hogy az ismeretlen szerepű játékos a szükséges kontra/re-kontra előtt Négykirályt, XXI-fogást vagy Centrumot mondjon be.
- Amíg a játékos szerepe nem vált nyilvánossá, és a szabály szerinti jelzés még szükséges, a bemondási ablakban csak a Passz érhető el.
- A 3.0.9-ben bevezetett, multiplayerben alkalmazott bemondási lehetőségek megmaradnak az azonosított szerepű játékosok számára, beleértve a Négykirály, XXI-fogás és Centrum elérhetőségét a korábban kért esetekben.
- A single-player alapértelmezett viselkedését nem módosítottuk.

## Ellenőrzés

- Célzott tesztek: 22/22 sikeres (`declaration-public-signals-v294`, `declarationWindow`, `multiplayer-declaration-availability-v309`).
- Release build: sikeres.
- JavaScript szintaxisellenőrzés az érintett engine- és szerverfájlokra: sikeres.

A frissítés nincs automatikusan telepítve a Render szolgáltatásra; a ZIP a teljes projekt forrását tartalmazza.
