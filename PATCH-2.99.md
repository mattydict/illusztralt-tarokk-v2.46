# Illusztrált Magyar Tarokk 2.99.0 — célkártyás Ultimó/Uhu javítás

## Szabálypontosítás

Az Ultimó és Uhu csak akkor teljesül, ha a konkrét célkártya (Pagát, Sas vagy a bemondott király) kijátszója nyeri meg a határütést. Nem elég, ha a játékos párja viszi el az ütést. Ha a célkártya tulajdonosának partnere nyer, a figura elbukik.

A 2.98.0-ban bekerült párszintű értékelést visszavontuk a csendes Pagát/Sas Ultimó esetében, és ugyanezt a célkártya-szintű feltételt alkalmazzuk a bemondott Ultimó/Uhu értékelésére is. A Centrum/Kismadár/Nagymadár és más párszintű figurák értékelése nem változott.

## Elszámolás

A csendes figurát a célkártya tényleges kijátszója azonosítja (`ownerId`), a `fulfilled`/`failed` státusz pedig a célkártyát kijátszó személy saját ütésgyőzelmétől függ. A regressziós tesztek azt is ellenőrzik, hogy a teljesült ellenpár-figura az ellenpárnak, a partner által elvitt célütés miatt elbukott figura pedig a felvevő párnak számolódik el.

## Eseménynapló

A 2.98.0-ban bevezetett, maximum 100 eseményt megtartó eseménynapló és a lapkijátszások adatainak elrejtése változatlanul megmarad.

## Ellenőrzés

Futtatott célzott tesztek: `v299-target-card-ultimo.test.js`, `v298-sas-eventlog.test.js`, `declarationLifecycle.test.js`, `settlement.test.js`, `settlement.v290.regression.test.js`, `v286-regressions.test.js`.
