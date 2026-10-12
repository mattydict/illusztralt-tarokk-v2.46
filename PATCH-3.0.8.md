# Illusztrált Magyar Tarokk 3.0.8 – bemondások, Trull-elszámolás és kontra

## Javítások

- Az XXI-fogás a kiadási JavaScript motor bemondási lehetőségei között is szerepel.
- A Négy király, az XXI-fogás és a Centrum felajánlását célzott regressziós tesztek ellenőrzik. A Centrum és a madárfigurák továbbra is csak a játékszabályok szerinti jelzési és bemondási feltételek mellett érhetők el.
- A bemondás oldala (`taker` / `defence`) a deklaráció pillanatában rögzített `pairId` alapján kerül az elszámolásba, így a rejtett partner állapotának későbbi nyilvánossá válása nem sorolhatja át a teljesített ellenpár-Trullt a felvevő oldalára.
- Az elszámolás sorai a pontot kapó oldalt és a bemondó játékost/oldalt is megjelenítik.
- A soron kívüli kontra lehetőségei is megjelennek a szerveres jogi akcióhintben. A soron kívüli kontra nem módosítja a következő játékos passz- vagy bemondási fordulóját, de az ellenpár szerepének nyilvános jelzését frissíti.
- A TypeScript szerverforrás és a futó JavaScript szerver egyaránt ugyanazokat a kontra-hinteket szolgáltatja.

## Ellenőrzés

- Célzott JavaScript tesztcsoport: 67/67 sikeres.
- A futó JavaScript fájlok szintaktikai ellenőrzése sikeres.
- A teljes történeti JavaScript tesztcsomag időigényes benchmarkjai miatt a teljes tesztcsomagot nem jelöltük sikeresnek; a releváns bemondás-, kontra-, elszámolási- és szobafunkciós teszteket külön futtattuk.
- A `tsc --noEmit` jelenleg a projekt több meglévő, ettől független típushibájával és hiányzó Node-típusdeklarációival leáll; a TypeScript ellenőrzés ezért nem tekinthető zöldnek.
- A Renderen történő telepítés és a valódi böngészős teljes parti még külön ellenőrzendő.
