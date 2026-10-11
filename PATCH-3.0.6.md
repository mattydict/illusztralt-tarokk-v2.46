# Illusztrált Magyar Tarokk 3.0.6 – UI, bemondási piszkozatok, nyitott szobák és szobachat

## Újdonságok

- A single player és multiplayer játékban a játékos a Saját Kéz kártyájára kattintva is kijátszhatja a lapot. A felület csak a szabályosan kijátszható lapokat engedélyezi; a multiplayer szerver továbbra is a végső szabályellenőrző.
- A királyos bemondások célkártyáinak színnevei magyarul jelennek meg: kőr, káró, treff és pikk.
- A bemondási körben a választott bemondások piszkozatként tárolódnak. A játékos a Passz előtt visszavonhatja őket; a véglegesítéskor a bemondásokat és a Passzt egyetlen kötegelt akció rögzíti. A piszkozat/előnézet nem módosítja a tartós partiállapotot és nem kerül a nyilvános eseménynaplóba. A 8/9 tarokk azonnali pontozása csak véglegesítéskor történik.
- Megjelent a nyitott szobák listája, amely csak a még várakozó, üres férőhellyel rendelkező szobákat mutatja. Megadott játékosnévvel szobakód nélkül lehet belépni. A lista időszakosan frissül.
- Elkészült az élő, szobán belüli chat. Az üzenetek csak az adott szoba élő tagjaihoz jutnak el, rövid hosszhatár és küldési korlát védi a szolgáltatást, és a chat nem kerül mentésre vagy a parti eseménynaplójába.

## Tesztelés

- `npm run build`: sikeres.
- Célzott regressziós tesztek: 24/24 sikeres, beleértve a nyitott szobákat, a nem perzisztens chatszállítást, a bemondási előnézetet és kötegelt véglegesítést, a magyar célkártya-neveket, a korábbi invit-szabályokat, a célkártya-kötelezettség és színkövetés kapcsolatát, valamint az archívumot.
- A teljes `npm run test:js` futtatás elindult, de a rendelkezésre álló futási időben a tesztcsomag nem fejeződött be (a futás körülbelül a 95. tesztnél időtúllépéssel leállt). A teljes tesztcsomagot ezért nem jelölöm teljesen sikeresnek.
- A böngészős vizuális ellenőrzés és az éles Render-telepítés nem történt meg.

## Megjegyzés

A chat csak élő kapcsolatok memóriájában létezik; a lap frissítése vagy a szobából való kilépés után nem állítható vissza. A nyitott szobalista a room ID-t, a játékosok megjelenített neveit és a szabad férőhelyek számát mutatja, belépési tokent nem publikál.
