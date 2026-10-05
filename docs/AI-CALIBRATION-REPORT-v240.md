# AI Calibration Report – v2.40

## Cél

A v2.37 expert benchmarkot a v2.40 súlyozott calibration layerrel egészítettük ki. A cél nem pusztán a jogszerűség mérése, hanem annak ellenőrzése, hogy a fontosabb stratégiai kategóriákban az AI következetesen az elvárt szakértői döntést adja.

## Kapuk

- Jog­szerűség: 100% kötelező.
- Stratégiai elfogadhatóság: legalább 90%.
- Tiltott döntés: 0.
- Súlyozott expert score: legalább 90%.
- Gyenge kategória: 90% alatti expert-best rate nem elfogadható a release gate-ben.

A fő súlyozott kategóriák között nagyobb súlyt kapott a partnerkommunikáció, a figuramegőrzés, a csendes figurák és az ellenfél madárfiguráinak kezelése.

## v2.40 eredmény

**13/13 jogszerű**

**13/13 stratégiailag elfogadható**

**13/13 expert-best**

**0 tiltott döntés**

A súlyozott expert score 100% volt a benchmark 13 szcenárióján.

## Deklarációs kalibráció

Az AI deklarációs réteg külön feasibility gate-et és kockázati gate-et kapott. Ennek célja, hogy az AI ne válasszon formálisan engedélyezett, de túl gyenge esélyű figurát csak azért, mert az adott helyzetben pontértéket ígér.

Kiemelt szabályok:

- XXI-fogás: csak Skíz birtokában.
- Centrum: erősebb tarokk- és nagyhonőr-minta szükséges.
- Kismadár: magasabb tarokkszám vagy megfelelő kommunikációs lánc szükséges.
- Nagymadár: még erősebb kézminta szükséges.
- Pagát/Sas/King Ultimo/Uhu: a releváns saját lap birtoklása szükséges.
- Kommunikációs láncok korlátozottan csökkenthetik a kockázati küszöböt.

Ez a kapu kizárólag az AI döntését szigorítja; a játékos számára a formálisan elérhető bemondások továbbra sem kerülnek elrejtésre.
