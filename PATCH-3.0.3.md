# Patch 3.0.3 — Stratégiai tanulóadatok és regressziójavítások

## Partiarchívumból tanulóadat-export
- Új `src/engine/dealLearningDataset.js` modul hoz létre felügyelt tanulási példákat archivált partikból.
- Döntési példákat készít a licitáláshoz, skartoláshoz, partnerhíváshoz, explicit bemondásokhoz és lapkijátszáshoz.
- A jellemzők csak az adott játékos számára a döntéskor elérhető információkat tartalmazzák; az ellenfelek rejtett lapjai és a későbbi kártyakijátszások nem szivárognak be a döntési bemenetekbe.
- A bemondás teljesülése, a leütött ütés eredménye és a parti végeredménye külön célcímkeként/eredményként tárolódik, nem döntési bemenetként.
- Új tokennel védett végpont: `GET /archives/:roomId/learning-export`. NDJSON-t ad vissza a megadott szobához archivált partik döntési példáiból.
- A „Korábbi partik” ablakban megjelent a **Tanulási adatok exportálása** gomb, amely `.jsonl` állományként tölti le az adatokat.

## Regressziós tesztek
- A 13 korábban sikertelen JavaScript regressziós ellenőrzés javítva.
- Az elavult verziószám- és UI-forrásrészlet-ellenőrzések a jelenlegi 3.0.3-as buildhez/modulfelosztáshoz igazítva.
- A licitregressziós tesztek figyelembe veszik a teljes, explicit licitkört; az XX-engedés kanonikus reprezentációja `Passz` `inviteTarget: 20` mezővel.
- Új tanulóadat-tesztek vizsgálják a döntési sorok készítését, az adatszivárgás elkerülését, a hibás rekordok tűrését és a tokennel védett exportot.

## Fontos korlátok
- Ez a verzió adat-előkészítést és exportot valósít meg, **nem végez automatikus modelltréninget**.
- A régi archív rekordokból nem rekonstruálhatók biztosan azok a bemondási körök, ahol a játékos csak passzolt; ezért csak a ténylegesen eltárolt explicit bemondásokból készül példa.
- A PostgreSQL/Neon export éles adatbázison történő ellenőrzéséhez a telepített szolgáltatásban futtatott próba is szükséges; helyi API-integrációs teszt van.
- További adatszivárgás-védelem: a tényleges partnerazonosító nem szerepel a döntési jellemzőkben, és csak a felvevő valódi, nem üres skartválasztásából készül skart-tanulópélda.
