# Illusztrált Magyar Tarokk – 3.0.11

## Javítás: Volát utáni, párhoz kötött bemondási korlátozás

- A Volát bemondása önmagában nem veszi el a Négy király és a Duplajáték lehetőségét ugyanattól a játékostól a még nyitott bemondási fordulóban. Egy játékos egy fordulóban több különböző figurát is bemondhat.
- Ha a Volátot bemondó játékos Passzal lezárja a fordulóját, a bemondás rögzül. Ettől kezdve a rendszer a Volátot bemondó pár másik tagjának sem ajánlja fel a Négy királyt és a Duplajátékot.
- A korlátozás kizárólag arra a párra vonatkozik, amelynek rögzült Volát-bemondása van. Az ellenfél párja továbbra is bemondhatja a Négy királyt és a Duplajátékot.
- A bemondások elérhetőségét a felület és a szerveroldali validáció is ellenőrzi; a szabály nem pusztán a gombok elrejtésére támaszkodik.
- Az előző verzióból megmarad a multiplayeres szerepazonosítási korlátozás, valamint a saját kéz kártyáin a pontérték-felirat eltávolítása és az asztali kártyák nagyobb mérete.

## Ellenőrzés

- Célzott JavaScript-tesztek: 37/37 sikeres.
- Release build: a csomagolás során ellenőrizve.
- A projekt teljes TypeScript-ellenőrzése továbbra is meglévő, ettől a javítástól független hibákat jelez; a célzott JavaScript-tesztek és a módosított futásidejű fájlok szintaxisellenőrzése sikeres.

A frissítés nincs automatikusan telepítve a Render szolgáltatásra.
